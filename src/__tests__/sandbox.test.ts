// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * WorkerSandbox Tests
 *
 * Tests for the worker-thread-based sandbox execution environment.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { WorkerSandbox } from '../sandbox/worker-sandbox.js';
import type { SandboxContext } from '../sandbox/worker-sandbox.js';

/**
 * Helper to create a default SandboxContext with optional overrides.
 */
function makeContext(overrides: Partial<SandboxContext> = {}): SandboxContext {
  return {
    tenantId: 'tenant-test',
    agentId: 'agent-test',
    trustLevel: 3,
    allowedModules: [],
    timeout: 5000,
    memoryLimitMb: 64,
    ...overrides,
  };
}

describe('WorkerSandbox', () => {
  let sandbox: WorkerSandbox;

  afterEach(async () => {
    if (sandbox) {
      await sandbox.shutdown();
    }
  });

  // ===========================================================================
  // Basic execution
  // ===========================================================================

  describe('basic execution', () => {
    it('executes simple code and returns the result', async () => {
      sandbox = new WorkerSandbox();
      const result = await sandbox.execute('return 2 + 2;', makeContext());

      expect(result.success).toBe(true);
      expect(result.output).toBe(4);
      expect(result.durationMs).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();
    });

    it('executes code that returns a string', async () => {
      sandbox = new WorkerSandbox();
      const result = await sandbox.execute('return "hello world";', makeContext());

      expect(result.success).toBe(true);
      expect(result.output).toBe('hello world');
    });

    it('executes code that returns an object', async () => {
      sandbox = new WorkerSandbox();
      const result = await sandbox.execute(
        'return { name: "test", value: 42 };',
        makeContext()
      );

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ name: 'test', value: 42 });
    });

    it('executes code that returns an array', async () => {
      sandbox = new WorkerSandbox();
      const result = await sandbox.execute(
        'return [1, 2, 3].map(x => x * 2);',
        makeContext()
      );

      expect(result.success).toBe(true);
      expect(result.output).toEqual([2, 4, 6]);
    });

    it('returns undefined when code has no explicit return', async () => {
      sandbox = new WorkerSandbox();
      const result = await sandbox.execute('const x = 5;', makeContext());

      expect(result.success).toBe(true);
      expect(result.output).toBeUndefined();
    });

    it('supports async code with await', async () => {
      sandbox = new WorkerSandbox();
      const result = await sandbox.execute(
        `
        const delay = (ms) => new Promise(r => setTimeout(r, ms));
        await delay(50);
        return "done";
        `,
        makeContext()
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe('done');
    });
  });

  // ===========================================================================
  // Timeout enforcement
  // ===========================================================================

  describe('timeout enforcement', () => {
    it('kills execution that exceeds the timeout', async () => {
      sandbox = new WorkerSandbox();
      const result = await sandbox.execute(
        'while(true) {}',
        makeContext({ timeout: 500 })
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      // Could be either the vm timeout or our setTimeout-based timeout
      expect(
        result.error!.includes('timed out') ||
        result.error!.includes('Script execution timed out')
      ).toBe(true);
    });

    it('completes within a generous timeout', async () => {
      sandbox = new WorkerSandbox();
      const result = await sandbox.execute(
        'return 42;',
        makeContext({ timeout: 10000 })
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe(42);
    });
  });

  // ===========================================================================
  // Error handling
  // ===========================================================================

  describe('error handling', () => {
    it('returns error when code throws', async () => {
      sandbox = new WorkerSandbox();
      const result = await sandbox.execute(
        'throw new Error("intentional failure");',
        makeContext()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('intentional failure');
      expect(result.durationMs).toBeGreaterThan(0);
    });

    it('returns error for syntax errors in code', async () => {
      sandbox = new WorkerSandbox();
      const result = await sandbox.execute(
        'const x = {{{;',
        makeContext()
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns error when accessing undefined variable', async () => {
      sandbox = new WorkerSandbox();
      const result = await sandbox.execute(
        'return undefinedVariable.property;',
        makeContext()
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns error when rejected promise is not caught', async () => {
      sandbox = new WorkerSandbox();
      const result = await sandbox.execute(
        'await Promise.reject(new Error("async failure"));',
        makeContext()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('async failure');
    });
  });

  // ===========================================================================
  // Memory limits
  // ===========================================================================

  describe('memory limits', () => {
    it('kills worker that exceeds memory limit', async () => {
      sandbox = new WorkerSandbox();
      // Attempt to allocate more memory than the limit allows
      const result = await sandbox.execute(
        `
        const arrays = [];
        for (let i = 0; i < 100000; i++) {
          arrays.push(new Array(10000).fill("x".repeat(100)));
        }
        return arrays.length;
        `,
        makeContext({ memoryLimitMb: 8, timeout: 10000 })
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('succeeds with small allocations within limits', async () => {
      sandbox = new WorkerSandbox();
      const result = await sandbox.execute(
        `
        const arr = new Array(100).fill("hello");
        return arr.length;
        `,
        makeContext({ memoryLimitMb: 64 })
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe(100);
    });
  });

  // ===========================================================================
  // Sandbox globals isolation
  // ===========================================================================

  describe('sandbox isolation', () => {
    it('does not expose process global', async () => {
      sandbox = new WorkerSandbox();
      const result = await sandbox.execute(
        'return typeof process;',
        makeContext()
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe('undefined');
    });

    it('does not expose require by default', async () => {
      sandbox = new WorkerSandbox();
      const result = await sandbox.execute(
        'return typeof require;',
        makeContext({ allowedModules: [] })
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe('undefined');
    });

    it('provides safe console object', async () => {
      sandbox = new WorkerSandbox();
      const result = await sandbox.execute(
        `
        console.log("test");
        console.warn("warn");
        console.error("error");
        return "logged";
        `,
        makeContext()
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe('logged');
    });

    it('provides JSON, Math, and Date', async () => {
      sandbox = new WorkerSandbox();
      const result = await sandbox.execute(
        `
        const obj = JSON.parse('{"a":1}');
        const rounded = Math.round(3.7);
        const d = new Date(0).toISOString();
        return { obj, rounded, date: d };
        `,
        makeContext()
      );

      expect(result.success).toBe(true);
      expect(result.output).toEqual({
        obj: { a: 1 },
        rounded: 4,
        date: '1970-01-01T00:00:00.000Z',
      });
    });
  });

  // ===========================================================================
  // Tenant context isolation
  // ===========================================================================

  describe('tenant context isolation', () => {
    it('executes with different tenant contexts independently', async () => {
      sandbox = new WorkerSandbox();

      const result1 = await sandbox.execute(
        'return "tenant-a-result";',
        makeContext({ tenantId: 'tenant-a', agentId: 'agent-1' })
      );

      const result2 = await sandbox.execute(
        'return "tenant-b-result";',
        makeContext({ tenantId: 'tenant-b', agentId: 'agent-2' })
      );

      expect(result1.success).toBe(true);
      expect(result1.output).toBe('tenant-a-result');
      expect(result2.success).toBe(true);
      expect(result2.output).toBe('tenant-b-result');
    });

    it('does not leak state between executions', async () => {
      sandbox = new WorkerSandbox();

      // First execution sets a variable
      await sandbox.execute(
        'globalThis.leaked = "secret";',
        makeContext({ tenantId: 'tenant-a' })
      );

      // Second execution should not see it (fresh worker + fresh vm context)
      const result = await sandbox.execute(
        'return typeof leaked;',
        makeContext({ tenantId: 'tenant-b' })
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe('undefined');
    });
  });

  // ===========================================================================
  // Clean shutdown
  // ===========================================================================

  describe('shutdown', () => {
    it('prevents further executions after shutdown', async () => {
      sandbox = new WorkerSandbox();

      // Execute once successfully
      const result1 = await sandbox.execute('return 1;', makeContext());
      expect(result1.success).toBe(true);

      // Shut down
      await sandbox.shutdown();

      // Subsequent execution should fail gracefully
      const result2 = await sandbox.execute('return 2;', makeContext());
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('shut down');
    });

    it('reports terminated state after shutdown', async () => {
      sandbox = new WorkerSandbox();
      expect(sandbox.terminated).toBe(false);

      await sandbox.shutdown();
      expect(sandbox.terminated).toBe(true);
    });

    it('can be shut down multiple times without error', async () => {
      sandbox = new WorkerSandbox();
      await sandbox.shutdown();
      await sandbox.shutdown();
      expect(sandbox.terminated).toBe(true);
    });
  });

  // ===========================================================================
  // Result structure
  // ===========================================================================

  describe('result structure', () => {
    it('always includes durationMs and memoryUsedBytes', async () => {
      sandbox = new WorkerSandbox();
      const result = await sandbox.execute('return null;', makeContext());

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('output');
      expect(result).toHaveProperty('durationMs');
      expect(result).toHaveProperty('memoryUsedBytes');
      expect(typeof result.durationMs).toBe('number');
      expect(typeof result.memoryUsedBytes).toBe('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.memoryUsedBytes).toBeGreaterThanOrEqual(0);
    });

    it('includes error field only on failure', async () => {
      sandbox = new WorkerSandbox();

      const success = await sandbox.execute('return true;', makeContext());
      expect(success.error).toBeUndefined();

      const failure = await sandbox.execute('throw new Error("fail");', makeContext());
      expect(failure.error).toBeDefined();
    });
  });
});
