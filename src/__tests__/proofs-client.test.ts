// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * ProofsClient Tests
 *
 * Tests for proof retrieval, listing, verification, chain statistics,
 * filtering, and error handling via mocked HTTP layer.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Cognigate, CognigateError } from '../client.js';
import { TrustTier } from '../types.js';
import type { ProofRecord, ProofChainStats, PaginatedResponse } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProof(overrides: Partial<ProofRecord> = {}): ProofRecord {
  return {
    id: 'proof-001',
    entityId: 'agent-300',
    intentId: 'intent-abc',
    decision: 'ALLOW',
    action: 'database.read',
    outcome: 'SUCCESS',
    trustScoreBefore: 700,
    trustScoreAfter: 710,
    timestamp: new Date('2025-09-01T12:00:00Z'),
    hash: 'a1b2c3d4e5f6',
    previousHash: '000000000000',
    ...overrides,
  } as ProofRecord;
}

function makeChainStats(overrides: Partial<ProofChainStats> = {}): ProofChainStats {
  return {
    totalRecords: 150,
    successRate: 0.92,
    averageTrustScore: 720,
    chainIntegrity: true,
    lastVerified: new Date('2025-09-01T15:00:00Z'),
    ...overrides,
  } as ProofChainStats;
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

describe('ProofsClient', () => {
  let client: Cognigate;

  beforeEach(() => {
    client = new Cognigate({ apiKey: 'test-key-proofs', retries: 1 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // get
  // =========================================================================

  describe('get', () => {
    it('retrieves a proof by ID', async () => {
      vi.stubGlobal('fetch', mockFetchOk(makeProof()));

      const proof = await client.proofs.get('proof-001');
      expect(proof.id).toBe('proof-001');
      expect(proof.decision).toBe('ALLOW');
      expect(proof.outcome).toBe('SUCCESS');
    });

    it('sends GET to /proofs/{proofId}', async () => {
      const fetchMock = mockFetchOk(makeProof({ id: 'proof-xyz' }));
      vi.stubGlobal('fetch', fetchMock);

      await client.proofs.get('proof-xyz');

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('/proofs/proof-xyz');
      const opts = fetchMock.mock.calls[0][1] as RequestInit;
      expect(opts.method).toBe('GET');
    });

    it('parses timestamp as Date', async () => {
      vi.stubGlobal('fetch', mockFetchOk(makeProof()));

      const proof = await client.proofs.get('proof-001');
      expect(proof.timestamp).toBeInstanceOf(Date);
    });

    it('throws CognigateError for 404 proof not found', async () => {
      vi.stubGlobal('fetch', mockFetchError(404, { message: 'Proof not found', code: 'NOT_FOUND' }));

      await expect(client.proofs.get('nonexistent')).rejects.toThrow(CognigateError);
      await expect(client.proofs.get('nonexistent')).rejects.toThrow('Proof not found');
    });

    it('validates proof schema rejects tampered data (missing hash)', async () => {
      const tampered = { ...makeProof(), hash: undefined };
      vi.stubGlobal('fetch', mockFetchOk(tampered));

      await expect(client.proofs.get('proof-001')).rejects.toThrow();
    });

    it('includes optional metadata when present', async () => {
      vi.stubGlobal('fetch', mockFetchOk(makeProof({ metadata: { region: 'us-east', latencyMs: 42 } })));

      const proof = await client.proofs.get('proof-001');
      expect(proof.metadata).toBeDefined();
      expect(proof.metadata!.region).toBe('us-east');
    });
  });

  // =========================================================================
  // list
  // =========================================================================

  describe('list', () => {
    it('lists proofs for an entity', async () => {
      const page: PaginatedResponse<ProofRecord> = {
        items: [makeProof(), makeProof({ id: 'proof-002', outcome: 'FAILURE' })],
        total: 2,
        page: 1,
        pageSize: 20,
        hasMore: false,
      };
      vi.stubGlobal('fetch', mockFetchOk(page));

      const result = await client.proofs.list('agent-300');
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.hasMore).toBe(false);
    });

    it('passes pagination and filter params as query string', async () => {
      const fetchMock = mockFetchOk({ items: [], total: 0, page: 2, pageSize: 10, hasMore: false });
      vi.stubGlobal('fetch', fetchMock);

      await client.proofs.list('agent-300', {
        page: 2,
        pageSize: 10,
        outcome: 'SUCCESS',
        from: new Date('2025-01-01'),
        to: new Date('2025-06-01'),
      });

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('entityId=agent-300');
      expect(url).toContain('page=2');
      expect(url).toContain('pageSize=10');
      expect(url).toContain('outcome=SUCCESS');
      expect(url).toContain('from=');
      expect(url).toContain('to=');
    });

    it('works with only required entityId param', async () => {
      const fetchMock = mockFetchOk({ items: [], total: 0, page: 1, pageSize: 20, hasMore: false });
      vi.stubGlobal('fetch', fetchMock);

      await client.proofs.list('agent-300');

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('entityId=agent-300');
    });
  });

  // =========================================================================
  // getStats
  // =========================================================================

  describe('getStats', () => {
    it('returns chain statistics for an entity', async () => {
      vi.stubGlobal('fetch', mockFetchOk(makeChainStats()));

      const stats = await client.proofs.getStats('agent-300');
      expect(stats.totalRecords).toBe(150);
      expect(stats.successRate).toBe(0.92);
      expect(stats.chainIntegrity).toBe(true);
    });

    it('sends GET to /proofs/stats/{entityId}', async () => {
      const fetchMock = mockFetchOk(makeChainStats());
      vi.stubGlobal('fetch', fetchMock);

      await client.proofs.getStats('agent-300');

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('/proofs/stats/agent-300');
    });
  });

  // =========================================================================
  // verify
  // =========================================================================

  describe('verify', () => {
    it('returns valid: true for intact chain', async () => {
      vi.stubGlobal('fetch', mockFetchOk({ valid: true, errors: [], lastVerified: '2025-09-01T15:00:00Z' }));

      const result = await client.proofs.verify('agent-300');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns valid: false with errors for tampered chain', async () => {
      vi.stubGlobal('fetch', mockFetchOk({
        valid: false,
        errors: ['Hash mismatch at record proof-042', 'Gap detected between proof-041 and proof-043'],
        lastVerified: '2025-09-01T15:00:00Z',
      }));

      const result = await client.proofs.verify('agent-300');
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toContain('Hash mismatch');
    });

    it('posts to /proofs/verify/{entityId}', async () => {
      const fetchMock = mockFetchOk({ valid: true, errors: [], lastVerified: '2025-09-01T00:00:00Z' });
      vi.stubGlobal('fetch', fetchMock);

      await client.proofs.verify('agent-300');

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('/proofs/verify/agent-300');
      const opts = fetchMock.mock.calls[0][1] as RequestInit;
      expect(opts.method).toBe('POST');
    });
  });
});
