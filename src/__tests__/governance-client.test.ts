// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * GovernanceClient Tests
 *
 * Tests for governance evaluation, intent parsing, enforcement,
 * decision types, constraints, and error handling via mocked HTTP.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Cognigate, CognigateError } from '../client.js';
import { TrustTier } from '../types.js';
import type { Intent, GovernanceResult, IntentParseResult } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIntent(overrides: Partial<Intent> = {}): Intent {
  return {
    id: 'intent-001',
    entityId: 'agent-200',
    rawInput: 'Read customer data from database',
    parsedAction: 'database.read',
    parameters: { table: 'customers' },
    riskLevel: 'LOW',
    requiredCapabilities: ['read'],
    timestamp: new Date('2025-09-01T12:00:00Z'),
    ...overrides,
  };
}

function makeGovernanceResult(overrides: Partial<GovernanceResult> = {}): GovernanceResult {
  return {
    decision: 'ALLOW',
    trustScore: 750,
    trustTier: TrustTier.T4_STANDARD,
    grantedCapabilities: ['read'],
    deniedCapabilities: [],
    reasoning: 'Agent has sufficient trust to perform read operation',
    timestamp: new Date('2025-09-01T12:00:01Z'),
    ...overrides,
  };
}

function makeParseResult(overrides: Partial<IntentParseResult> = {}): IntentParseResult {
  return {
    intent: makeIntent(),
    confidence: 0.95,
    ...overrides,
  };
}

function mockFetchOk(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  });
}

function mockFetchError(status: number, body: Record<string, unknown> = {}) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => body,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GovernanceClient', () => {
  let client: Cognigate;

  beforeEach(() => {
    client = new Cognigate({ apiKey: 'test-key-gov', retries: 1 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // parseIntent
  // =========================================================================

  describe('parseIntent', () => {
    it('parses raw input into a structured intent', async () => {
      vi.stubGlobal('fetch', mockFetchOk(makeParseResult()));

      const result = await client.governance.parseIntent('agent-200', 'Read customer data');
      expect(result.intent.parsedAction).toBe('database.read');
      expect(result.confidence).toBe(0.95);
    });

    it('sends entityId and rawInput in request body', async () => {
      const fetchMock = mockFetchOk(makeParseResult());
      vi.stubGlobal('fetch', fetchMock);

      await client.governance.parseIntent('agent-200', 'Delete old records');

      const opts = fetchMock.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(opts.body as string);
      expect(body.entityId).toBe('agent-200');
      expect(body.rawInput).toBe('Delete old records');
    });

    it('posts to /governance/parse', async () => {
      const fetchMock = mockFetchOk(makeParseResult());
      vi.stubGlobal('fetch', fetchMock);

      await client.governance.parseIntent('agent-200', 'test');

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('/governance/parse');
      const opts = fetchMock.mock.calls[0][1] as RequestInit;
      expect(opts.method).toBe('POST');
    });

    it('returns alternative interpretations when present', async () => {
      const alt = makeIntent({ parsedAction: 'database.query', riskLevel: 'MEDIUM' });
      vi.stubGlobal('fetch', mockFetchOk(makeParseResult({ alternativeInterpretations: [alt] })));

      const result = await client.governance.parseIntent('agent-200', 'access data');
      expect(result.alternativeInterpretations).toHaveLength(1);
      expect(result.alternativeInterpretations![0].parsedAction).toBe('database.query');
    });
  });

  // =========================================================================
  // enforce
  // =========================================================================

  describe('enforce', () => {
    it('returns ALLOW decision for permitted action', async () => {
      vi.stubGlobal('fetch', mockFetchOk(makeGovernanceResult({ decision: 'ALLOW' })));

      const result = await client.governance.enforce(makeIntent());
      expect(result.decision).toBe('ALLOW');
      expect(result.grantedCapabilities).toContain('read');
    });

    it('returns DENY decision for forbidden action', async () => {
      const denied = makeGovernanceResult({
        decision: 'DENY',
        grantedCapabilities: [],
        deniedCapabilities: ['admin.delete'],
        reasoning: 'Insufficient trust tier for admin operations',
      });
      vi.stubGlobal('fetch', mockFetchOk(denied));

      const result = await client.governance.enforce(makeIntent({ parsedAction: 'admin.delete' }));
      expect(result.decision).toBe('DENY');
      expect(result.deniedCapabilities).toContain('admin.delete');
      expect(result.reasoning).toContain('Insufficient trust');
    });

    it('returns ESCALATE decision for high-risk actions', async () => {
      const escalated = makeGovernanceResult({
        decision: 'ESCALATE',
        reasoning: 'Critical action requires human approval',
      });
      vi.stubGlobal('fetch', mockFetchOk(escalated));

      const result = await client.governance.enforce(makeIntent({ riskLevel: 'CRITICAL' }));
      expect(result.decision).toBe('ESCALATE');
    });

    it('returns DEGRADE decision with reduced capabilities', async () => {
      const degraded = makeGovernanceResult({
        decision: 'DEGRADE',
        grantedCapabilities: ['read'],
        deniedCapabilities: ['write', 'delete'],
        reasoning: 'Agent trust below threshold; read-only access granted',
      });
      vi.stubGlobal('fetch', mockFetchOk(degraded));

      const result = await client.governance.enforce(makeIntent());
      expect(result.decision).toBe('DEGRADE');
      expect(result.grantedCapabilities).toEqual(['read']);
      expect(result.deniedCapabilities).toEqual(['write', 'delete']);
    });

    it('returns constraints when present', async () => {
      const constrained = makeGovernanceResult({
        decision: 'ALLOW',
        constraints: { maxRows: 100, rateLimit: '10/min', region: 'us-east' },
      });
      vi.stubGlobal('fetch', mockFetchOk(constrained));

      const result = await client.governance.enforce(makeIntent());
      expect(result.constraints).toBeDefined();
      expect(result.constraints!.maxRows).toBe(100);
      expect(result.constraints!.rateLimit).toBe('10/min');
    });

    it('includes proofId when enforcement creates a proof record', async () => {
      vi.stubGlobal('fetch', mockFetchOk(makeGovernanceResult({ proofId: 'proof-gov-001' })));

      const result = await client.governance.enforce(makeIntent());
      expect(result.proofId).toBe('proof-gov-001');
    });

    it('parses timestamp as Date via schema', async () => {
      vi.stubGlobal('fetch', mockFetchOk(makeGovernanceResult()));

      const result = await client.governance.enforce(makeIntent());
      expect(result.timestamp).toBeInstanceOf(Date);
    });
  });

  // =========================================================================
  // evaluate (convenience: parse + enforce)
  // =========================================================================

  describe('evaluate', () => {
    it('returns both intent and governance result', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeParseResult() })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeGovernanceResult() });
      vi.stubGlobal('fetch', fetchMock);

      const { intent, result } = await client.governance.evaluate('agent-200', 'Read data');
      expect(intent.parsedAction).toBe('database.read');
      expect(result.decision).toBe('ALLOW');
    });

    it('makes two HTTP calls (parse then enforce)', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeParseResult() })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeGovernanceResult() });
      vi.stubGlobal('fetch', fetchMock);

      await client.governance.evaluate('agent-200', 'test');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('propagates error if parse fails', async () => {
      vi.stubGlobal('fetch', mockFetchError(400, { message: 'Cannot parse input', code: 'PARSE_ERROR' }));

      await expect(client.governance.evaluate('agent-200', '')).rejects.toThrow(CognigateError);
    });
  });

  // =========================================================================
  // canPerform
  // =========================================================================

  describe('canPerform', () => {
    it('returns allowed: true for a permitted action', async () => {
      vi.stubGlobal('fetch', mockFetchOk({ allowed: true, reason: 'Meets tier requirement' }));

      const check = await client.governance.canPerform('agent-200', 'read_data', ['read']);
      expect(check.allowed).toBe(true);
      expect(check.reason).toContain('Meets tier');
    });

    it('returns allowed: false for a denied action', async () => {
      vi.stubGlobal('fetch', mockFetchOk({ allowed: false, reason: 'Requires T5 or higher' }));

      const check = await client.governance.canPerform('agent-200', 'spawn_agent', ['admin']);
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('Requires T5');
    });

    it('sends capabilities in request body', async () => {
      const fetchMock = mockFetchOk({ allowed: true, reason: 'ok' });
      vi.stubGlobal('fetch', fetchMock);

      await client.governance.canPerform('agent-200', 'write_data', ['read', 'write']);

      const opts = fetchMock.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(opts.body as string);
      expect(body.capabilities).toEqual(['read', 'write']);
      expect(body.action).toBe('write_data');
    });

    it('throws CognigateError for 403 unauthorized action', async () => {
      vi.stubGlobal('fetch', mockFetchError(403, { message: 'Forbidden', code: 'FORBIDDEN' }));

      await expect(client.governance.canPerform('agent-200', 'admin.nuke', ['admin'])).rejects.toThrow(CognigateError);
    });
  });
});
