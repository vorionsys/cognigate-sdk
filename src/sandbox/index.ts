// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Cognigate Sandbox Module
 *
 * Provides isolated execution of agent code using Node.js worker threads.
 * Enforces resource limits (memory, timeout) and restricts global access
 * for safe constrained execution within the Cognigate governance framework.
 *
 * @packageDocumentation
 */

export { WorkerSandbox } from './worker-sandbox.js';
export type { SandboxContext, SandboxResult } from './worker-sandbox.js';
