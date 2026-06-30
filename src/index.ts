// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Cognigate TypeScript SDK
 *
 * Official SDK for the Cognigate AI Governance API
 *
 * @packageDocumentation
 * @module @vorionsys/cognigate
 *
 * @example
 * ```typescript
 * import { Cognigate } from '@vorionsys/cognigate';
 *
 * const client = new Cognigate({ apiKey: 'your-api-key' });
 *
 * // Get trust status for an agent
 * const status = await client.trust.getStatus('agent-123');
 * console.log(`Trust Score: ${status.trustScore}, Tier: ${status.tierName}`);
 *
 * // Evaluate an action through governance
 * const { intent, result } = await client.governance.evaluate(
 *   'agent-123',
 *   'Read customer data from database'
 * );
 *
 * if (result.decision === 'ALLOW') {
 *   // Proceed with action
 * } else {
 *   console.log('Blocked:', result.reasoning);
 * }
 * ```
 */

// Main client
export { Cognigate, CognigateError } from './client.js';
export type { AgentsClient, TrustClient, GovernanceClient, ProofsClient } from './client.js';

// Types
export {
  TrustTier,
  TIER_THRESHOLDS,
  type GovernanceDecision,
  type GovernanceResult,
  type Intent,
  type IntentParseResult,
  type TrustStatus,
  type ProofRecord,
  type ProofChainStats,
  type Agent,
  type CreateAgentRequest,
  type UpdateAgentRequest,
  type ApiResponse,
  type ApiError,
  type PaginatedResponse,
  type WebhookEvent,
  type WebhookEventType,
  type CognigateConfig,
} from './types.js';

// Schemas for runtime validation
export {
  TrustStatusSchema,
  GovernanceResultSchema,
  ProofRecordSchema,
  AgentSchema,
} from './types.js';

// Webhooks
export {
  verifyWebhookSignature,
  parseWebhookPayload,
  WebhookRouter,
  type WebhookHandler,
} from './webhooks.js';

// Proof bridge
export {
  createProofBridge,
  type ProofPlaneEmitter,
  type ProofBridgeConfig,
  type ProofBridgeHandle,
} from './proof-bridge.js';

// Sandbox (worker-thread-based isolated execution)
export {
  WorkerSandbox,
  type SandboxContext,
  type SandboxResult,
} from './sandbox/index.js';

// Re-export zod for convenience
export { z } from 'zod';
