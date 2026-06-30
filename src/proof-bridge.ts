// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Cognigate Proof Bridge
 *
 * Bridges Cognigate webhook events to the Proof Plane for immutable audit trails.
 * Listens for `governance.decision` events and emits `DECISION_MADE` proof events.
 *
 * @packageDocumentation
 */

import type { WebhookEvent } from './types.js';
import type { WebhookRouter } from './webhooks.js';

/**
 * Structural type for proof-plane integration (avoids hard dependency on @vorionsys/proof-plane)
 */
export interface ProofPlaneEmitter {
  logDecisionMade(decision: {
    decisionId: string;
    intentId: string;
    agentId: string;
    correlationId: string;
    permitted: boolean;
    trustBand: number;
    trustScore: number;
    reasoning: string[];
    decidedAt: Date;
    expiresAt: Date;
    latencyMs: number;
    version: number;
  }, correlationId?: string): Promise<unknown>;
}

/**
 * Configuration for the proof bridge
 */
export interface ProofBridgeConfig {
  /** Proof plane emitter instance */
  proofPlane: ProofPlaneEmitter;
  /** Webhook router to subscribe to */
  webhookRouter: WebhookRouter;
}

/**
 * Handle for disconnecting the proof bridge
 */
export interface ProofBridgeHandle {
  /** Disconnect the bridge (stops forwarding events) */
  disconnect: () => void;
}

/**
 * Create a proof bridge that forwards Cognigate governance.decision webhooks
 * to the Proof Plane as DECISION_MADE events.
 *
 * @example
 * ```typescript
 * import { WebhookRouter } from '@vorionsys/cognigate';
 * import { createProofBridge } from '@vorionsys/cognigate/proof-bridge';
 * import { ProofPlane } from '@vorionsys/proof-plane';
 *
 * const router = new WebhookRouter();
 * const proofPlane = new ProofPlane({ storage: memoryStore() });
 *
 * const bridge = createProofBridge({ proofPlane, webhookRouter: router });
 * // governance.decision events now automatically emit DECISION_MADE proofs
 *
 * bridge.disconnect(); // stop forwarding
 * ```
 */
export function createProofBridge(config: ProofBridgeConfig): ProofBridgeHandle {
  const { proofPlane, webhookRouter } = config;
  let connected = true;

  const handler = async (event: WebhookEvent & { type: 'governance.decision' }) => {
    if (!connected) return;

    const payload = event.payload;
    const now = new Date();

    const decision = {
      decisionId: (payload.decisionId as string) ?? event.id,
      intentId: (payload.intentId as string) ?? '',
      agentId: (payload.agentId as string) ?? event.entityId,
      correlationId: (payload.correlationId as string) ?? event.id,
      permitted: (payload.permitted as boolean) ?? payload.decision === 'ALLOW',
      trustBand: (payload.trustBand as number) ?? 4,
      trustScore: (payload.trustScore as number) ?? 0,
      reasoning: Array.isArray(payload.reasoning)
        ? (payload.reasoning as string[])
        : typeof payload.reasoning === 'string'
          ? [payload.reasoning]
          : [],
      decidedAt: payload.decidedAt ? new Date(payload.decidedAt as string) : now,
      expiresAt: payload.expiresAt
        ? new Date(payload.expiresAt as string)
        : new Date(now.getTime() + 24 * 60 * 60 * 1000),
      latencyMs: (payload.latencyMs as number) ?? 0,
      version: (payload.version as number) ?? 1,
    };

    await proofPlane.logDecisionMade(decision, decision.correlationId);
  };

  webhookRouter.on('governance.decision', handler);

  return {
    disconnect: () => {
      connected = false;
    },
  };
}
