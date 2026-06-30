// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Cognigate TypeScript SDK - Type Definitions
 *
 * Core types for the Cognigate AI governance API
 */

import { z } from 'zod';

import {
  TrustTier,
  TIER_THRESHOLDS,
  scoreToTier,
  getTierName,
  getTierColor,
  type TierThreshold,
} from '@vorionsys/shared-constants';

// =============================================================================
// TRUST TIERS (from @vorionsys/shared-constants)
// =============================================================================

// Re-export from shared-constants for SDK consumers
// This ensures all Vorion products use the same tier definitions
export {
  TrustTier,
  TIER_THRESHOLDS,
  scoreToTier,
  getTierName,
  getTierColor,
  type TierThreshold,
};

// =============================================================================
// GOVERNANCE DECISIONS
// =============================================================================

export type GovernanceDecision = 'ALLOW' | 'DENY' | 'ESCALATE' | 'DEGRADE';

export interface GovernanceResult {
  decision: GovernanceDecision;
  trustScore: number;
  trustTier: TrustTier;
  grantedCapabilities: string[];
  deniedCapabilities: string[];
  reasoning: string;
  constraints?: Record<string, unknown>;
  proofId?: string;
  timestamp: Date;
}

// =============================================================================
// INTENT PARSING
// =============================================================================

export interface Intent {
  id: string;
  entityId: string;
  rawInput: string;
  parsedAction: string;
  parameters: Record<string, unknown>;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  requiredCapabilities: string[];
  timestamp: Date;
}

export interface IntentParseResult {
  intent: Intent;
  confidence: number;
  alternativeInterpretations?: Intent[];
}

// =============================================================================
// TRUST STATUS
// =============================================================================

export interface TrustStatus {
  entityId: string;
  trustScore: number;
  trustTier: TrustTier;
  tierName: string;
  capabilities: string[];
  factorScores: Record<string, number>;
  lastEvaluated: Date;
  compliant: boolean;
  warnings: string[];
}

// =============================================================================
// PROOF RECORDS (Immutable Audit Trail)
// =============================================================================

export interface ProofRecord {
  id: string;
  entityId: string;
  intentId: string;
  decision: GovernanceDecision;
  action: string;
  outcome: 'SUCCESS' | 'FAILURE' | 'PARTIAL' | 'PENDING';
  trustScoreBefore: number;
  trustScoreAfter: number;
  timestamp: Date;
  hash: string;
  previousHash: string;
  metadata?: Record<string, unknown>;
}

export interface ProofChainStats {
  totalRecords: number;
  successRate: number;
  averageTrustScore: number;
  chainIntegrity: boolean;
  lastVerified: Date;
}

// =============================================================================
// AGENTS
// =============================================================================

export interface Agent {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  trustScore: number;
  trustTier: TrustTier;
  status: 'ACTIVE' | 'PAUSED' | 'SUSPENDED' | 'TERMINATED';
  capabilities: string[];
  executions: number;
  successRate: number;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface CreateAgentRequest {
  name: string;
  description?: string;
  template?: string;
  initialCapabilities?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateAgentRequest {
  name?: string;
  description?: string;
  status?: 'ACTIVE' | 'PAUSED';
  metadata?: Record<string, unknown>;
}

// =============================================================================
// API RESPONSES
// =============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  requestId: string;
  timestamp: Date;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// =============================================================================
// WEBHOOKS
// =============================================================================

export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  entityId: string;
  payload: Record<string, unknown>;
  timestamp: Date;
  signature: string;
}

export type WebhookEventType =
  | 'agent.created'
  | 'agent.updated'
  | 'agent.deleted'
  | 'agent.status_changed'
  | 'trust.score_changed'
  | 'trust.tier_changed'
  | 'governance.decision'
  | 'proof.recorded'
  | 'alert.triggered';

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface CognigateConfig {
  apiKey: string;
  /**
   * Base URL for the Cognigate API.
   * Override this to route to a regional endpoint:
   *   - US (default):  https://cognigate.dev/v1
   *   - EU:            https://eu.cognigate.dev/v1
   *   - APAC:          https://apac.cognigate.dev/v1
   *
   * For large consumers (>500 evaluations/day) or SLA <50ms p95, always set
   * baseUrl to the nearest regional endpoint. Cross-region calls from EU or
   * APAC to the default US endpoint add 90–170ms RTT per request.
   * See apps/cognigate-api/DEPLOYMENT.md for the full regional architecture.
   */
  baseUrl?: string;
  /**
   * Logical region identifier forwarded as `X-Cognigate-Region` on every request.
   * Used for observability and per-region latency dashboards.
   * Should match the Fly.io region code of your nearest cognigate-api instance.
   * Examples: 'iad' (US East, default), 'lhr' (EU), 'nrt' (APAC), 'sjc' (US West)
   */
  region?: string;
  timeout?: number;
  retries?: number;
  debug?: boolean;
  webhookSecret?: string;
}

// =============================================================================
// ZOD SCHEMAS (for runtime validation)
// =============================================================================

export const TrustStatusSchema = z.object({
  entityId: z.string(),
  trustScore: z.number().min(0).max(1000),
  trustTier: z.nativeEnum(TrustTier),
  tierName: z.string(),
  capabilities: z.array(z.string()),
  factorScores: z.record(z.string(), z.number()),
  lastEvaluated: z.coerce.date(),
  compliant: z.boolean(),
  warnings: z.array(z.string()),
});

export const GovernanceResultSchema = z.object({
  decision: z.enum(['ALLOW', 'DENY', 'ESCALATE', 'DEGRADE']),
  trustScore: z.number(),
  trustTier: z.nativeEnum(TrustTier),
  grantedCapabilities: z.array(z.string()),
  deniedCapabilities: z.array(z.string()),
  reasoning: z.string(),
  constraints: z.record(z.string(), z.unknown()).optional(),
  proofId: z.string().optional(),
  timestamp: z.coerce.date(),
});

export const ProofRecordSchema = z.object({
  id: z.string(),
  entityId: z.string(),
  intentId: z.string(),
  decision: z.enum(['ALLOW', 'DENY', 'ESCALATE', 'DEGRADE']),
  action: z.string(),
  outcome: z.enum(['SUCCESS', 'FAILURE', 'PARTIAL', 'PENDING']),
  trustScoreBefore: z.number(),
  trustScoreAfter: z.number(),
  timestamp: z.coerce.date(),
  hash: z.string(),
  previousHash: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  ownerId: z.string(),
  trustScore: z.number(),
  trustTier: z.nativeEnum(TrustTier),
  status: z.enum(['ACTIVE', 'PAUSED', 'SUSPENDED', 'TERMINATED']),
  capabilities: z.array(z.string()),
  executions: z.number(),
  successRate: z.number(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
