// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Worker Sandbox
 *
 * Provides isolated code execution for agents using Node.js worker_threads.
 * Enforces resource limits (memory, CPU time), timeout enforcement, and
 * message-based communication for safe agent code execution within Cognigate.
 *
 * @packageDocumentation
 */

import { Worker } from 'node:worker_threads';

// =============================================================================
// Types
// =============================================================================

/**
 * Context provided to the sandbox for each execution.
 * Determines isolation constraints and identity.
 */
export interface SandboxContext {
  /** Tenant that owns this agent */
  tenantId: string;
  /** Agent being sandboxed */
  agentId: string;
  /** Numeric trust level (0-7, maps to TrustTier) */
  trustLevel: number;
  /** List of module names the agent is permitted to require */
  allowedModules: string[];
  /** Maximum execution time in milliseconds */
  timeout: number;
  /** Maximum heap memory in megabytes for the worker */
  memoryLimitMb: number;
}

/**
 * Result returned from a sandbox execution.
 */
export interface SandboxResult {
  /** Whether execution completed without errors */
  success: boolean;
  /** The return value from the executed code */
  output: unknown;
  /** Error message if execution failed */
  error?: string;
  /** Wall-clock execution duration in milliseconds */
  durationMs: number;
  /** Approximate memory used during execution in bytes */
  memoryUsedBytes: number;
}

/** Internal message from worker containing execution result */
interface WorkerResultMessage {
  type: 'result' | 'error';
  output?: unknown;
  error?: string;
  durationMs: number;
  memoryUsedBytes: number;
}

// =============================================================================
// Default configuration
// =============================================================================

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MEMORY_LIMIT_MB = 64;

// =============================================================================
// Worker script (inline)
// =============================================================================

/**
 * The worker thread script is inlined as a string to avoid file-resolution
 * issues across TypeScript (vitest) and compiled JavaScript (production).
 *
 * The worker:
 * 1. Receives { code, context } from the main thread via workerData
 * 2. Builds a restricted vm context (no process, require, fs, etc.)
 * 3. Executes the code in that context with a vm-level timeout
 * 4. Reports results back via parentPort.postMessage()
 */
const WORKER_SCRIPT = `
  const { parentPort, workerData } = require('node:worker_threads');
  const vm = require('node:vm');

  const { code, context } = workerData;
  const startTime = performance.now();
  const memBefore = process.memoryUsage().heapUsed;

  // Build restricted globals for the vm context
  const safeGlobals = {
    console: {
      log: function() {},
      warn: function() {},
      error: function() {},
      info: function() {},
    },
    JSON: JSON,
    Math: Math,
    Date: Date,
    Array: Array,
    Object: Object,
    String: String,
    Number: Number,
    Boolean: Boolean,
    Map: Map,
    Set: Set,
    WeakMap: WeakMap,
    WeakSet: WeakSet,
    Promise: Promise,
    Symbol: Symbol,
    RegExp: RegExp,
    Error: Error,
    TypeError: TypeError,
    RangeError: RangeError,
    SyntaxError: SyntaxError,
    URIError: URIError,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    isFinite: isFinite,
    encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent,
    encodeURI: encodeURI,
    decodeURI: decodeURI,
    undefined: undefined,
    NaN: NaN,
    Infinity: Infinity,
    setTimeout: function(fn, ms) { return setTimeout(fn, Math.min(ms, 5000)); },
    clearTimeout: clearTimeout,
  };

  const vmContext = vm.createContext(safeGlobals);

  // Wrap code in an async IIFE to support await and return
  const wrappedCode = '(async () => { ' + code + ' })()';

  async function run() {
    try {
      const script = new vm.Script(wrappedCode, {
        filename: 'sandbox-' + context.agentId + '.js',
      });

      const result = await script.runInContext(vmContext, {
        timeout: context.timeout,
      });

      const durationMs = performance.now() - startTime;
      const memAfter = process.memoryUsage().heapUsed;

      parentPort.postMessage({
        type: 'result',
        output: result,
        durationMs: durationMs,
        memoryUsedBytes: Math.max(0, memAfter - memBefore),
      });
    } catch (err) {
      const durationMs = performance.now() - startTime;
      const memAfter = process.memoryUsage().heapUsed;

      parentPort.postMessage({
        type: 'error',
        error: err && err.message ? err.message : String(err),
        durationMs: durationMs,
        memoryUsedBytes: Math.max(0, memAfter - memBefore),
      });
    }
  }

  run();
`;

// =============================================================================
// WorkerSandbox
// =============================================================================

/**
 * Executes agent code in an isolated worker thread with resource limits.
 *
 * Each call to execute() spawns a fresh worker with V8 memory limits,
 * runs the code in a vm context with restricted globals, and enforces
 * a timeout from the main thread. Workers are terminated after each
 * execution to ensure complete isolation between runs.
 *
 * @example
 * ```typescript
 * const sandbox = new WorkerSandbox();
 *
 * const result = await sandbox.execute('return 2 + 2;', {
 *   tenantId: 'tenant-1',
 *   agentId: 'agent-42',
 *   trustLevel: 3,
 *   allowedModules: [],
 *   timeout: 5000,
 *   memoryLimitMb: 32,
 * });
 *
 * console.log(result.output); // 4
 *
 * await sandbox.shutdown();
 * ```
 */
export class WorkerSandbox {
  private worker: Worker | null = null;
  private isShutdown = false;

  /**
   * Execute code in an isolated worker thread.
   *
   * Spawns a new worker for each execution to ensure full isolation.
   * The worker has memory limits enforced by V8 via `resourceLimits`,
   * a vm-level timeout for synchronous code, and a main-thread timeout
   * as a fallback for async code or hangs.
   *
   * @param code - JavaScript code string to execute inside the sandbox.
   *   The code is wrapped in an async IIFE, so `return` and `await` are valid.
   * @param context - Execution context with identity and resource constraints
   * @returns Promise resolving to a SandboxResult
   */
  async execute(code: string, context: SandboxContext): Promise<SandboxResult> {
    if (this.isShutdown) {
      return {
        success: false,
        output: undefined,
        error: 'Sandbox has been shut down',
        durationMs: 0,
        memoryUsedBytes: 0,
      };
    }

    const timeout = context.timeout || DEFAULT_TIMEOUT;
    const memoryLimitMb = context.memoryLimitMb || DEFAULT_MEMORY_LIMIT_MB;
    const startTime = performance.now();

    return new Promise<SandboxResult>((resolve) => {
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const settle = (result: SandboxResult) => {
        if (settled) return;
        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        resolve(result);
      };

      try {
        // Spawn a fresh worker for each execution using inline script.
        // workerData carries the code and context into the worker.
        const worker = new Worker(WORKER_SCRIPT, {
          eval: true,
          workerData: {
            code,
            context: {
              tenantId: context.tenantId,
              agentId: context.agentId,
              trustLevel: context.trustLevel ?? 0,
              allowedModules: context.allowedModules ?? [],
              timeout,
              memoryLimitMb,
            },
          },
          resourceLimits: {
            maxOldGenerationSizeMb: memoryLimitMb,
            maxYoungGenerationSizeMb: Math.max(1, Math.floor(memoryLimitMb / 4)),
            codeRangeSizeMb: Math.max(1, Math.floor(memoryLimitMb / 8)),
          },
        });

        this.worker = worker;

        // Set up main-thread timeout enforcement as a fallback.
        // The vm inside the worker also has its own timeout, but this
        // catches cases where the vm timeout is somehow bypassed.
        timeoutId = setTimeout(() => {
          const durationMs = performance.now() - startTime;
          worker.terminate().catch((err) => {
            console.warn('Worker termination failed:', err instanceof Error ? err.message : String(err));
          });
          settle({
            success: false,
            output: undefined,
            error: `Execution timed out after ${timeout}ms`,
            durationMs,
            memoryUsedBytes: 0,
          });
        }, timeout + 500); // slightly longer than vm timeout to let vm handle it first

        // Handle result messages from the worker
        worker.on('message', (message: WorkerResultMessage) => {
          if (message.type === 'result') {
            settle({
              success: true,
              output: message.output,
              durationMs: message.durationMs,
              memoryUsedBytes: message.memoryUsedBytes,
            });
          } else if (message.type === 'error') {
            settle({
              success: false,
              output: undefined,
              error: message.error,
              durationMs: message.durationMs,
              memoryUsedBytes: message.memoryUsedBytes,
            });
          }

          // Terminate worker after receiving result
          worker.terminate().catch((err) => {
            console.warn('Worker termination failed:', err instanceof Error ? err.message : String(err));
          });
        });

        // Handle worker-level errors (e.g., out-of-memory kills by V8)
        worker.on('error', (error: Error) => {
          const durationMs = performance.now() - startTime;
          settle({
            success: false,
            output: undefined,
            error: error.message || 'Worker error',
            durationMs,
            memoryUsedBytes: 0,
          });
        });

        // Handle unexpected worker exit (non-zero exit code from OOM, etc.)
        worker.on('exit', (exitCode: number) => {
          if (exitCode !== 0) {
            const durationMs = performance.now() - startTime;
            settle({
              success: false,
              output: undefined,
              error: `Worker exited with code ${exitCode} (possible memory limit exceeded)`,
              durationMs,
              memoryUsedBytes: 0,
            });
          }
          this.worker = null;
        });
      } catch (err) {
        const durationMs = performance.now() - startTime;
        const errorMessage = err instanceof Error ? err.message : String(err);
        settle({
          success: false,
          output: undefined,
          error: `Failed to spawn worker: ${errorMessage}`,
          durationMs,
          memoryUsedBytes: 0,
        });
      }
    });
  }

  /**
   * Gracefully shut down the sandbox.
   * Terminates any running worker and prevents future executions.
   */
  async shutdown(): Promise<void> {
    this.isShutdown = true;
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }

  /**
   * Check whether the sandbox has been shut down.
   */
  get terminated(): boolean {
    return this.isShutdown;
  }
}
