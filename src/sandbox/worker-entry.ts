// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Worker Entry - Reference Implementation
 *
 * This file documents the worker thread code that runs inside the sandbox.
 * The actual worker script is inlined in worker-sandbox.ts as a string
 * (using `new Worker(code, { eval: true })`) to avoid file-resolution
 * issues across TypeScript and compiled JavaScript environments.
 *
 * The worker:
 * 1. Receives { code, context } via workerData
 * 2. Creates a restricted vm context with safe globals only
 * 3. Wraps user code in an async IIFE for return/await support
 * 4. Executes via vm.Script.runInContext with a timeout
 * 5. Reports { type, output, error, durationMs, memoryUsedBytes } back
 *
 * Restricted globals provided to sandboxed code:
 * - console (no-op implementations)
 * - JSON, Math, Date
 * - Standard constructors: Array, Object, String, Number, Boolean,
 *   Map, Set, WeakMap, WeakSet, Promise, Symbol, RegExp
 * - Error types: Error, TypeError, RangeError, SyntaxError, URIError
 * - Utilities: parseInt, parseFloat, isNaN, isFinite
 * - URI functions: encodeURIComponent, decodeURIComponent, encodeURI, decodeURI
 * - Limited timers: setTimeout (capped at 5s), clearTimeout
 *
 * NOT provided (blocked by design):
 * - process, require, import
 * - fs, path, child_process, net, http
 * - global, globalThis (of the worker)
 * - eval, Function constructor (inside the vm context)
 *
 * @packageDocumentation
 */

// This file is intentionally a reference only.
// See WORKER_SCRIPT in worker-sandbox.ts for the actual implementation.
export {};
