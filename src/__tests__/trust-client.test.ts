// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * TrustClient Tests
 *
 * Tests for trust status retrieval, outcome submission, history queries,
 * error handling, and score bounds validation via mocked HTTP layer.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Cognigate, CognigateError } from '../client.js';
import { TrustTier } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrustStatus(overrides: Record<string, unknown> = {}) {
  return {
    entityId: 'agent-100',
    trustScore: 720,
    trustTier: TrustTier.T4_STANDARD,
    tierName: 'Standard',
    capabilities: ['read', 'write'],
    factorScores: { reliability: 0.88, compliance: 0.92 },
    lastEvaluated: '2025-09-01T12:00:00Z',
    compliant: true,
    warnings: [],
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

describe('TrustClient', () => {
  let client: Cognigate;

  beforeEach(() => {
    client = new Cognigate({ apiKey: 'test-key-trust', retries: 1 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // getStatus
  // =========================================================================

  describe('getStatus', () => {
    it('retrieves trust status for a valid agent', async () => {
      const payload = makeTrustStatus();
      vi.stubGlobal('fetch', mockFetchOk(payload));

      const status = await client.trust.getStatus('agent-100');
      expect(status.entityId).toBe('agent-100');
      expect(status.trustScore).toBe(720);
      expect(status.trustTier).toBe(TrustTier.T4_STANDARD);
      expect(status.compliant).toBe(true);
    });

    it('sends correct path for the entity', async () => {
      const fetchMock = mockFetchOk(makeTrustStatus({ entityId: 'agent-xyz' }));
      vi.stubGlobal('fetch', fetchMock);

      await client.trust.getStatus('agent-xyz');

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('/trust/agent-xyz');
    });

    it('includes authorization header', async () => {
      const fetchMock = mockFetchOk(makeTrustStatus());
      vi.stubGlobal('fetch', fetchMock);

      await client.trust.getStatus('agent-100');

      const opts = fetchMock.mock.calls[0][1] as RequestInit;
      expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer test-key-trust');
    });

    it('parses lastEvaluated as Date via Zod coerce', async () => {
      vi.stubGlobal('fetch', mockFetchOk(makeTrustStatus()));
      const status = await client.trust.getStatus('agent-100');
      expect(status.lastEvaluated).toBeInstanceOf(Date);
    });

    it('throws CognigateError for 404 unknown agent', async () => {
      vi.stubGlobal('fetch', mockFetchError(404, { message: 'Agent not found', code: 'NOT_FOUND' }));

      await expect(client.trust.getStatus('nonexistent')).rejects.toThrow(CognigateError);
      await expect(client.trust.getStatus('nonexistent')).rejects.toThrow('Agent not found');
    });

    it('throws CognigateError for 401 unauthorized', async () => {
      vi.stubGlobal('fetch', mockFetchError(401, { message: 'Unauthorized', code: 'UNAUTHORIZED' }));

      await expect(client.trust.getStatus('agent-100')).rejects.toThrow(CognigateError);
    });

    it('validates trust score is within 0-1000 via schema', async () => {
      vi.stubGlobal('fetch', mockFetchOk(makeTrustStatus({ trustScore: 1500 })));

      await expect(client.trust.getStatus('agent-100')).rejects.toThrow();
    });

    it('validates trust score is not negative via schema', async () => {
      vi.stubGlobal('fetch', mockFetchOk(makeTrustStatus({ trustScore: -5 })));

      await expect(client.trust.getStatus('agent-100')).rejects.toThrow();
    });

    it('returns capabilities array', async () => {
      vi.stubGlobal('fetch', mockFetchOk(makeTrustStatus({ capabilities: ['read', 'execute', 'spawn'] })));

      const status = await client.trust.getStatus('agent-100');
      expect(status.capabilities).toEqual(['read', 'execute', 'spawn']);
      expect(status.capabilities).toHaveLength(3);
    });

    it('returns warnings when present', async () => {
      vi.stubGlobal('fetch', mockFetchOk(makeTrustStatus({ warnings: ['rate limit approaching', 'compliance review due'] })));

      const status = await client.trust.getStatus('agent-100');
      expect(status.warnings).toHaveLength(2);
      expect(status.warnings).toContain('rate limit approaching');
    });
  });

  // =========================================================================
  // getHistory
  // =========================================================================

  describe('getHistory', () => {
    it('retrieves history for an entity', async () => {
      const history = [
        { score: 700, tier: TrustTier.T4_STANDARD, timestamp: '2025-08-01T00:00:00Z' },
        { score: 720, tier: TrustTier.T4_STANDARD, timestamp: '2025-09-01T00:00:00Z' },
      ];
      vi.stubGlobal('fetch', mockFetchOk(history));

      const result = await client.trust.getHistory('agent-100');
      expect(result).toHaveLength(2);
      expect(result[0].score).toBe(700);
      expect(result[1].score).toBe(720);
    });

    it('passes date range as query params', async () => {
      const fetchMock = mockFetchOk([]);
      vi.stubGlobal('fetch', fetchMock);

      const from = new Date('2025-01-01');
      const to = new Date('2025-06-01');
      await client.trust.getHistory('agent-100', { from, to, limit: 50 });

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('from=');
      expect(url).toContain('to=');
      expect(url).toContain('limit=50');
    });

    it('works without optional params', async () => {
      const fetchMock = mockFetchOk([]);
      vi.stubGlobal('fetch', fetchMock);

      await client.trust.getHistory('agent-100');

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('/trust/agent-100/history');
      expect(url).not.toContain('?');
    });
  });

  // =========================================================================
  // submitOutcome
  // =========================================================================

  describe('submitOutcome', () => {
    it('submits a successful outcome and returns updated status', async () => {
      const updated = makeTrustStatus({ trustScore: 730 });
      vi.stubGlobal('fetch', mockFetchOk(updated));

      const result = await client.trust.submitOutcome('agent-100', 'proof-abc', {
        success: true,
        notes: 'Completed data export',
      });

      expect(result.trustScore).toBe(730);
    });

    it('submits a failure outcome', async () => {
      const updated = makeTrustStatus({ trustScore: 700 });
      vi.stubGlobal('fetch', mockFetchOk(updated));

      const result = await client.trust.submitOutcome('agent-100', 'proof-def', {
        success: false,
        notes: 'Task failed due to timeout',
      });

      expect(result.trustScore).toBe(700);
    });

    it('sends proofId and metrics in request body', async () => {
      const fetchMock = mockFetchOk(makeTrustStatus());
      vi.stubGlobal('fetch', fetchMock);

      await client.trust.submitOutcome('agent-100', 'proof-123', {
        success: true,
        metrics: { latencyMs: 150, tokensUsed: 2400 },
      });

      const opts = fetchMock.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(opts.body as string);
      expect(body.proofId).toBe('proof-123');
      expect(body.success).toBe(true);
      expect(body.metrics).toEqual({ latencyMs: 150, tokensUsed: 2400 });
    });

    it('posts to /trust/{entityId}/outcome', async () => {
      const fetchMock = mockFetchOk(makeTrustStatus());
      vi.stubGlobal('fetch', fetchMock);

      await client.trust.submitOutcome('agent-100', 'proof-x', { success: true });

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('/trust/agent-100/outcome');
      const opts = fetchMock.mock.calls[0][1] as RequestInit;
      expect(opts.method).toBe('POST');
    });
  });
});
