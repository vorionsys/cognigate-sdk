// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Cognigate SDK Tests
 */

import { describe, it, expect } from 'vitest';
import { Cognigate, CognigateError, AgentsClient, TrustClient, GovernanceClient, ProofsClient } from '../client.js';
import {
  TrustTier,
  TIER_THRESHOLDS,
  TrustStatusSchema,
  GovernanceResultSchema,
  ProofRecordSchema,
  AgentSchema,
} from '../types.js';

describe('Cognigate', () => {
  describe('constructor', () => {
    it('throws error when API key is missing', () => {
      expect(() => new Cognigate({ apiKey: '' })).toThrow(CognigateError);
      expect(() => new Cognigate({ apiKey: '' })).toThrow('API key is required');
    });

    it('creates client with valid API key', () => {
      const client = new Cognigate({ apiKey: 'test-key' });
      expect(client).toBeInstanceOf(Cognigate);
      expect(client.agents).toBeDefined();
      expect(client.trust).toBeDefined();
      expect(client.governance).toBeDefined();
      expect(client.proofs).toBeDefined();
    });

    it('uses default config values', () => {
      const client = new Cognigate({ apiKey: 'test-key' });
      // Check that sub-clients are properly initialized
      expect(client.agents).toBeDefined();
    });

    it('accepts custom config values', () => {
      const client = new Cognigate({
        apiKey: 'test-key',
        baseUrl: 'https://custom.api.com',
        timeout: 60000,
        retries: 5,
        debug: true,
      });
      expect(client).toBeInstanceOf(Cognigate);
    });
  });

  describe('getTierFromScore', () => {
    it('returns T0_SANDBOX for scores 0-199', () => {
      expect(Cognigate.getTierFromScore(0)).toBe(TrustTier.T0_SANDBOX);
      expect(Cognigate.getTierFromScore(100)).toBe(TrustTier.T0_SANDBOX);
      expect(Cognigate.getTierFromScore(199)).toBe(TrustTier.T0_SANDBOX);
    });

    it('returns T1_OBSERVED for scores 200-349', () => {
      expect(Cognigate.getTierFromScore(200)).toBe(TrustTier.T1_OBSERVED);
      expect(Cognigate.getTierFromScore(275)).toBe(TrustTier.T1_OBSERVED);
      expect(Cognigate.getTierFromScore(349)).toBe(TrustTier.T1_OBSERVED);
    });

    it('returns T2_PROVISIONAL for scores 350-499', () => {
      expect(Cognigate.getTierFromScore(350)).toBe(TrustTier.T2_PROVISIONAL);
      expect(Cognigate.getTierFromScore(425)).toBe(TrustTier.T2_PROVISIONAL);
      expect(Cognigate.getTierFromScore(499)).toBe(TrustTier.T2_PROVISIONAL);
    });

    it('returns T3_MONITORED for scores 500-649', () => {
      expect(Cognigate.getTierFromScore(500)).toBe(TrustTier.T3_MONITORED);
      expect(Cognigate.getTierFromScore(575)).toBe(TrustTier.T3_MONITORED);
      expect(Cognigate.getTierFromScore(649)).toBe(TrustTier.T3_MONITORED);
    });

    it('returns T4_STANDARD for scores 650-799', () => {
      expect(Cognigate.getTierFromScore(650)).toBe(TrustTier.T4_STANDARD);
      expect(Cognigate.getTierFromScore(725)).toBe(TrustTier.T4_STANDARD);
      expect(Cognigate.getTierFromScore(799)).toBe(TrustTier.T4_STANDARD);
    });

    it('returns T5_TRUSTED for scores 800-875', () => {
      expect(Cognigate.getTierFromScore(800)).toBe(TrustTier.T5_TRUSTED);
      expect(Cognigate.getTierFromScore(837)).toBe(TrustTier.T5_TRUSTED);
      expect(Cognigate.getTierFromScore(875)).toBe(TrustTier.T5_TRUSTED);
    });

    it('returns T6_CERTIFIED for scores 876-950', () => {
      expect(Cognigate.getTierFromScore(876)).toBe(TrustTier.T6_CERTIFIED);
      expect(Cognigate.getTierFromScore(912)).toBe(TrustTier.T6_CERTIFIED);
      expect(Cognigate.getTierFromScore(950)).toBe(TrustTier.T6_CERTIFIED);
    });

    it('returns T7_AUTONOMOUS for scores 951-1000', () => {
      expect(Cognigate.getTierFromScore(951)).toBe(TrustTier.T7_AUTONOMOUS);
      expect(Cognigate.getTierFromScore(975)).toBe(TrustTier.T7_AUTONOMOUS);
      expect(Cognigate.getTierFromScore(1000)).toBe(TrustTier.T7_AUTONOMOUS);
    });
  });

  describe('getTierName', () => {
    it('returns correct tier names', () => {
      expect(Cognigate.getTierName(TrustTier.T0_SANDBOX)).toBe('Sandbox');
      expect(Cognigate.getTierName(TrustTier.T1_OBSERVED)).toBe('Observed');
      expect(Cognigate.getTierName(TrustTier.T2_PROVISIONAL)).toBe('Provisional');
      expect(Cognigate.getTierName(TrustTier.T3_MONITORED)).toBe('Monitored');
      expect(Cognigate.getTierName(TrustTier.T4_STANDARD)).toBe('Standard');
      expect(Cognigate.getTierName(TrustTier.T5_TRUSTED)).toBe('Trusted');
      expect(Cognigate.getTierName(TrustTier.T6_CERTIFIED)).toBe('Certified');
      expect(Cognigate.getTierName(TrustTier.T7_AUTONOMOUS)).toBe('Autonomous');
    });
  });

  describe('getTierThresholds', () => {
    it('returns correct thresholds', () => {
      const t4 = Cognigate.getTierThresholds(TrustTier.T4_STANDARD);
      expect(t4.min).toBe(650);
      expect(t4.max).toBe(799);
      expect(t4.name).toBe('Standard');
    });
  });
});

describe('TIER_THRESHOLDS', () => {
  it('has all 8 tiers defined', () => {
    expect(Object.keys(TIER_THRESHOLDS)).toHaveLength(8);
  });

  it('tiers are contiguous (no gaps)', () => {
    const tiers = [
      TrustTier.T0_SANDBOX,
      TrustTier.T1_OBSERVED,
      TrustTier.T2_PROVISIONAL,
      TrustTier.T3_MONITORED,
      TrustTier.T4_STANDARD,
      TrustTier.T5_TRUSTED,
      TrustTier.T6_CERTIFIED,
      TrustTier.T7_AUTONOMOUS,
    ];

    for (let i = 0; i < tiers.length - 1; i++) {
      const current = TIER_THRESHOLDS[tiers[i]];
      const next = TIER_THRESHOLDS[tiers[i + 1]];
      expect(current.max + 1).toBe(next.min);
    }
  });

  it('covers full 0-1000 range', () => {
    expect(TIER_THRESHOLDS[TrustTier.T0_SANDBOX].min).toBe(0);
    expect(TIER_THRESHOLDS[TrustTier.T7_AUTONOMOUS].max).toBe(1000);
  });
});

describe('CognigateError', () => {
  it('creates error with all properties', () => {
    const error = new CognigateError('Test error', 'TEST_CODE', 400, { foo: 'bar' });

    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.status).toBe(400);
    expect(error.details).toEqual({ foo: 'bar' });
    expect(error.name).toBe('CognigateError');
  });

  it('is instanceof Error', () => {
    const error = new CognigateError('Test', 'CODE');
    expect(error instanceof Error).toBe(true);
    expect(error instanceof CognigateError).toBe(true);
  });
});

// =============================================================================
// NEW TESTS: Client construction and sub-clients
// =============================================================================

describe('Cognigate client construction with base URL', () => {
  it('constructs with custom base URL', () => {
    const client = new Cognigate({
      apiKey: 'test-key',
      baseUrl: 'https://api.custom-domain.com/v1',
    });
    expect(client).toBeInstanceOf(Cognigate);
  });

  it('constructs with default base URL when not specified', () => {
    const client = new Cognigate({ apiKey: 'test-key' });
    expect(client).toBeInstanceOf(Cognigate);
  });

  it('constructs with all optional config fields', () => {
    const client = new Cognigate({
      apiKey: 'test-key',
      baseUrl: 'https://api.example.com',
      timeout: 5000,
      retries: 1,
      debug: true,
      webhookSecret: 'whsec_test',
    });
    expect(client).toBeInstanceOf(Cognigate);
  });
});

describe('Cognigate sub-clients', () => {
  const client = new Cognigate({ apiKey: 'test-key' });

  it('has agents sub-client', () => {
    expect(client.agents).toBeDefined();
    expect(client.agents).toBeInstanceOf(AgentsClient);
  });

  it('has trust sub-client', () => {
    expect(client.trust).toBeDefined();
    expect(client.trust).toBeInstanceOf(TrustClient);
  });

  it('has governance sub-client', () => {
    expect(client.governance).toBeDefined();
    expect(client.governance).toBeInstanceOf(GovernanceClient);
  });

  it('has proofs sub-client', () => {
    expect(client.proofs).toBeDefined();
    expect(client.proofs).toBeInstanceOf(ProofsClient);
  });
});

describe('Sub-client methods exist', () => {
  const client = new Cognigate({ apiKey: 'test-key' });

  it('agents has list, get, create, update, delete, pause, resume', () => {
    expect(typeof client.agents.list).toBe('function');
    expect(typeof client.agents.get).toBe('function');
    expect(typeof client.agents.create).toBe('function');
    expect(typeof client.agents.update).toBe('function');
    expect(typeof client.agents.delete).toBe('function');
    expect(typeof client.agents.pause).toBe('function');
    expect(typeof client.agents.resume).toBe('function');
  });

  it('trust has getStatus, getHistory, submitOutcome', () => {
    expect(typeof client.trust.getStatus).toBe('function');
    expect(typeof client.trust.getHistory).toBe('function');
    expect(typeof client.trust.submitOutcome).toBe('function');
  });

  it('governance has parseIntent, enforce, evaluate, canPerform', () => {
    expect(typeof client.governance.parseIntent).toBe('function');
    expect(typeof client.governance.enforce).toBe('function');
    expect(typeof client.governance.evaluate).toBe('function');
    expect(typeof client.governance.canPerform).toBe('function');
  });

  it('proofs has get, list, getStats, verify', () => {
    expect(typeof client.proofs.get).toBe('function');
    expect(typeof client.proofs.list).toBe('function');
    expect(typeof client.proofs.getStats).toBe('function');
    expect(typeof client.proofs.verify).toBe('function');
  });

  it('client has health method', () => {
    expect(typeof client.health).toBe('function');
  });
});

// =============================================================================
// NEW TESTS: Zod schema validation
// =============================================================================

describe('TrustStatusSchema validation', () => {
  it('accepts valid TrustStatus data', () => {
    const valid = {
      entityId: 'agent-123',
      trustScore: 750,
      trustTier: TrustTier.T4_STANDARD,
      tierName: 'Standard',
      capabilities: ['read', 'write'],
      factorScores: { reliability: 0.9, compliance: 0.85 },
      lastEvaluated: '2025-01-01T00:00:00Z',
      compliant: true,
      warnings: [],
    };
    const result = TrustStatusSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects TrustStatus with missing entityId', () => {
    const invalid = {
      trustScore: 750,
      trustTier: TrustTier.T4_STANDARD,
      tierName: 'Standard',
      capabilities: [],
      factorScores: {},
      lastEvaluated: '2025-01-01T00:00:00Z',
      compliant: true,
      warnings: [],
    };
    const result = TrustStatusSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects TrustStatus with score out of range', () => {
    const tooHigh = {
      entityId: 'agent-123',
      trustScore: 1500,
      trustTier: TrustTier.T4_STANDARD,
      tierName: 'Standard',
      capabilities: [],
      factorScores: {},
      lastEvaluated: '2025-01-01T00:00:00Z',
      compliant: true,
      warnings: [],
    };
    const result = TrustStatusSchema.safeParse(tooHigh);
    expect(result.success).toBe(false);
  });

  it('rejects TrustStatus with negative score', () => {
    const negative = {
      entityId: 'agent-123',
      trustScore: -10,
      trustTier: TrustTier.T0_SANDBOX,
      tierName: 'Sandbox',
      capabilities: [],
      factorScores: {},
      lastEvaluated: '2025-01-01T00:00:00Z',
      compliant: true,
      warnings: [],
    };
    const result = TrustStatusSchema.safeParse(negative);
    expect(result.success).toBe(false);
  });

  it('rejects TrustStatus with invalid tier enum', () => {
    const invalidTier = {
      entityId: 'agent-123',
      trustScore: 500,
      trustTier: 'INVALID_TIER',
      tierName: 'Invalid',
      capabilities: [],
      factorScores: {},
      lastEvaluated: '2025-01-01T00:00:00Z',
      compliant: true,
      warnings: [],
    };
    const result = TrustStatusSchema.safeParse(invalidTier);
    expect(result.success).toBe(false);
  });
});

describe('GovernanceResultSchema validation', () => {
  it('accepts valid GovernanceResult data', () => {
    const valid = {
      decision: 'ALLOW',
      trustScore: 800,
      trustTier: TrustTier.T5_TRUSTED,
      grantedCapabilities: ['read', 'write'],
      deniedCapabilities: [],
      reasoning: 'Agent meets trust threshold',
      timestamp: '2025-01-01T00:00:00Z',
    };
    const result = GovernanceResultSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('accepts all valid decision values', () => {
    const decisions = ['ALLOW', 'DENY', 'ESCALATE', 'DEGRADE'] as const;
    for (const decision of decisions) {
      const data = {
        decision,
        trustScore: 500,
        trustTier: TrustTier.T3_MONITORED,
        grantedCapabilities: [],
        deniedCapabilities: [],
        reasoning: 'test',
        timestamp: '2025-01-01T00:00:00Z',
      };
      const result = GovernanceResultSchema.safeParse(data);
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid decision value', () => {
    const invalid = {
      decision: 'MAYBE',
      trustScore: 500,
      trustTier: TrustTier.T3_MONITORED,
      grantedCapabilities: [],
      deniedCapabilities: [],
      reasoning: 'test',
      timestamp: '2025-01-01T00:00:00Z',
    };
    const result = GovernanceResultSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects GovernanceResult with missing reasoning', () => {
    const invalid = {
      decision: 'ALLOW',
      trustScore: 800,
      trustTier: TrustTier.T5_TRUSTED,
      grantedCapabilities: [],
      deniedCapabilities: [],
      timestamp: '2025-01-01T00:00:00Z',
    };
    const result = GovernanceResultSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('ProofRecordSchema validation', () => {
  it('accepts valid ProofRecord data', () => {
    const valid = {
      id: 'proof-001',
      entityId: 'agent-123',
      intentId: 'intent-456',
      decision: 'ALLOW',
      action: 'read_data',
      outcome: 'SUCCESS',
      trustScoreBefore: 700,
      trustScoreAfter: 710,
      timestamp: '2025-01-01T00:00:00Z',
      hash: 'abc123',
      previousHash: 'def456',
    };
    const result = ProofRecordSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('accepts ProofRecord with optional metadata', () => {
    const valid = {
      id: 'proof-001',
      entityId: 'agent-123',
      intentId: 'intent-456',
      decision: 'DENY',
      action: 'delete_data',
      outcome: 'FAILURE',
      trustScoreBefore: 700,
      trustScoreAfter: 680,
      timestamp: '2025-01-01T00:00:00Z',
      hash: 'abc123',
      previousHash: 'def456',
      metadata: { reason: 'insufficient trust level' },
    };
    const result = ProofRecordSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects ProofRecord with invalid outcome', () => {
    const invalid = {
      id: 'proof-001',
      entityId: 'agent-123',
      intentId: 'intent-456',
      decision: 'ALLOW',
      action: 'read_data',
      outcome: 'UNKNOWN',
      trustScoreBefore: 700,
      trustScoreAfter: 710,
      timestamp: '2025-01-01T00:00:00Z',
      hash: 'abc123',
      previousHash: 'def456',
    };
    const result = ProofRecordSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects ProofRecord with missing hash', () => {
    const invalid = {
      id: 'proof-001',
      entityId: 'agent-123',
      intentId: 'intent-456',
      decision: 'ALLOW',
      action: 'read_data',
      outcome: 'SUCCESS',
      trustScoreBefore: 700,
      trustScoreAfter: 710,
      timestamp: '2025-01-01T00:00:00Z',
      previousHash: 'def456',
    };
    const result = ProofRecordSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('AgentSchema validation', () => {
  it('accepts valid Agent data', () => {
    const valid = {
      id: 'agent-123',
      name: 'TestAgent',
      description: 'A test agent',
      ownerId: 'user-001',
      trustScore: 650,
      trustTier: TrustTier.T4_STANDARD,
      status: 'ACTIVE',
      capabilities: ['read', 'execute'],
      executions: 100,
      successRate: 0.95,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-06-01T00:00:00Z',
    };
    const result = AgentSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects Agent with invalid status', () => {
    const invalid = {
      id: 'agent-123',
      name: 'TestAgent',
      description: 'A test agent',
      ownerId: 'user-001',
      trustScore: 650,
      trustTier: TrustTier.T4_STANDARD,
      status: 'RUNNING',
      capabilities: [],
      executions: 0,
      successRate: 0,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    };
    const result = AgentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('accepts all valid Agent status values', () => {
    const statuses = ['ACTIVE', 'PAUSED', 'SUSPENDED', 'TERMINATED'] as const;
    for (const status of statuses) {
      const data = {
        id: 'agent-123',
        name: 'TestAgent',
        description: 'A test agent',
        ownerId: 'user-001',
        trustScore: 500,
        trustTier: TrustTier.T3_MONITORED,
        status,
        capabilities: [],
        executions: 0,
        successRate: 0,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      };
      const result = AgentSchema.safeParse(data);
      expect(result.success).toBe(true);
    }
  });

  it('rejects Agent with missing required fields', () => {
    const invalid = {
      id: 'agent-123',
      name: 'TestAgent',
      // missing description, ownerId, etc.
    };
    const result = AgentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
