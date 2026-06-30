// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Webhook Tests
 *
 * Tests for webhook signature verification, payload parsing,
 * WebhookRouter event dispatch, middleware, replay prevention,
 * and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  verifyWebhookSignature,
  parseWebhookPayload,
  WebhookRouter,
} from '../webhooks.js';
import type { WebhookEvent, WebhookEventType } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_SECRET = 'whsec_test_secret_key_12345';

function makeWebhookEvent(overrides: Partial<WebhookEvent> = {}): WebhookEvent {
  return {
    id: 'evt-001',
    type: 'trust.score_changed',
    entityId: 'agent-400',
    payload: { oldScore: 700, newScore: 720 },
    timestamp: new Date('2025-09-01T12:00:00Z'),
    signature: 'placeholder',
    ...overrides,
  };
}

/**
 * Compute a real HMAC-SHA256 signature for testing.
 */
async function computeSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('verifyWebhookSignature', () => {
  it('returns true for a valid signature', async () => {
    const payload = '{"test": true}';
    const sig = await computeSignature(payload, TEST_SECRET);

    const valid = await verifyWebhookSignature(payload, sig, TEST_SECRET);
    expect(valid).toBe(true);
  });

  it('returns false for an invalid signature', async () => {
    const payload = '{"test": true}';
    const badSig = 'deadbeef'.repeat(8); // 64 hex chars like SHA-256

    const valid = await verifyWebhookSignature(payload, badSig, TEST_SECRET);
    expect(valid).toBe(false);
  });

  it('returns false when payload has been tampered with', async () => {
    const original = '{"amount": 100}';
    const sig = await computeSignature(original, TEST_SECRET);

    const tampered = '{"amount": 999}';
    const valid = await verifyWebhookSignature(tampered, sig, TEST_SECRET);
    expect(valid).toBe(false);
  });

  it('returns false when using the wrong secret', async () => {
    const payload = '{"test": true}';
    const sig = await computeSignature(payload, TEST_SECRET);

    const valid = await verifyWebhookSignature(payload, sig, 'wrong_secret');
    expect(valid).toBe(false);
  });

  it('returns false for empty signature', async () => {
    const payload = '{"test": true}';
    const valid = await verifyWebhookSignature(payload, '', TEST_SECRET);
    expect(valid).toBe(false);
  });

  it('handles empty payload', async () => {
    const sig = await computeSignature('', TEST_SECRET);
    const valid = await verifyWebhookSignature('', sig, TEST_SECRET);
    expect(valid).toBe(true);
  });
});

describe('parseWebhookPayload', () => {
  it('parses a valid signed payload into WebhookEvent', async () => {
    const event = makeWebhookEvent();
    const body = JSON.stringify(event);
    const sig = await computeSignature(body, TEST_SECRET);

    const parsed = await parseWebhookPayload(body, sig, TEST_SECRET);
    expect(parsed.id).toBe('evt-001');
    expect(parsed.type).toBe('trust.score_changed');
    expect(parsed.entityId).toBe('agent-400');
  });

  it('converts timestamp to Date object', async () => {
    const event = makeWebhookEvent();
    const body = JSON.stringify(event);
    const sig = await computeSignature(body, TEST_SECRET);

    const parsed = await parseWebhookPayload(body, sig, TEST_SECRET);
    expect(parsed.timestamp).toBeInstanceOf(Date);
  });

  it('throws for invalid signature', async () => {
    const body = JSON.stringify(makeWebhookEvent());
    await expect(parseWebhookPayload(body, 'invalid_sig', TEST_SECRET))
      .rejects.toThrow('Invalid webhook signature');
  });

  it('throws for invalid JSON body even with valid signature', async () => {
    const badBody = '{not-valid-json';
    const sig = await computeSignature(badBody, TEST_SECRET);

    await expect(parseWebhookPayload(badBody, sig, TEST_SECRET))
      .rejects.toThrow('Invalid webhook payload');
  });
});

describe('WebhookRouter', () => {
  describe('event dispatch', () => {
    it('dispatches event to matching type handler', async () => {
      const router = new WebhookRouter();
      const handler = vi.fn();
      router.on('trust.score_changed', handler);

      await router.handle(makeWebhookEvent({ type: 'trust.score_changed' }));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('does not dispatch to non-matching type handler', async () => {
      const router = new WebhookRouter();
      const handler = vi.fn();
      router.on('agent.created', handler);

      await router.handle(makeWebhookEvent({ type: 'trust.score_changed' }));
      expect(handler).not.toHaveBeenCalled();
    });

    it('dispatches to wildcard handler for all events', async () => {
      const router = new WebhookRouter();
      const handler = vi.fn();
      router.onAll(handler);

      await router.handle(makeWebhookEvent({ type: 'trust.score_changed' }));
      await router.handle(makeWebhookEvent({ type: 'agent.created' }));
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('dispatches to both specific and wildcard handlers', async () => {
      const router = new WebhookRouter();
      const specificHandler = vi.fn();
      const allHandler = vi.fn();
      router.on('governance.decision', specificHandler);
      router.onAll(allHandler);

      await router.handle(makeWebhookEvent({ type: 'governance.decision' }));
      expect(specificHandler).toHaveBeenCalledTimes(1);
      expect(allHandler).toHaveBeenCalledTimes(1);
    });

    it('supports multiple handlers for the same event type', async () => {
      const router = new WebhookRouter();
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      router.on('proof.recorded', handler1);
      router.on('proof.recorded', handler2);

      await router.handle(makeWebhookEvent({ type: 'proof.recorded' }));
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('handles all webhook event types without error', async () => {
      const router = new WebhookRouter();
      const handler = vi.fn();
      router.onAll(handler);

      const types: WebhookEventType[] = [
        'agent.created', 'agent.updated', 'agent.deleted', 'agent.status_changed',
        'trust.score_changed', 'trust.tier_changed',
        'governance.decision', 'proof.recorded', 'alert.triggered',
      ];

      for (const type of types) {
        await router.handle(makeWebhookEvent({ type }));
      }
      expect(handler).toHaveBeenCalledTimes(types.length);
    });

    it('passes the event object to the handler', async () => {
      const router = new WebhookRouter();
      const handler = vi.fn();
      router.on('trust.tier_changed', handler);

      const event = makeWebhookEvent({ type: 'trust.tier_changed', payload: { oldTier: 3, newTier: 4 } });
      await router.handle(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('handles no registered handlers gracefully', async () => {
      const router = new WebhookRouter();
      // No handlers registered - should not throw
      await expect(router.handle(makeWebhookEvent())).resolves.toBeUndefined();
    });
  });

  describe('on() chaining', () => {
    it('returns this for fluent chaining', () => {
      const router = new WebhookRouter();
      const result = router
        .on('agent.created', vi.fn())
        .on('trust.score_changed', vi.fn())
        .onAll(vi.fn());

      expect(result).toBeInstanceOf(WebhookRouter);
    });
  });

  describe('middleware', () => {
    it('returns a function', () => {
      const router = new WebhookRouter();
      const mw = router.middleware(TEST_SECRET);
      expect(typeof mw).toBe('function');
    });

    it('responds 400 when signature is missing/invalid', async () => {
      const router = new WebhookRouter();
      const mw = router.middleware(TEST_SECRET);

      const jsonFn = vi.fn();
      const req = { headers: { 'x-cognigate-signature': 'bad_sig' }, body: '{}' };
      const res = { status: vi.fn().mockReturnValue({ json: jsonFn }) };

      await mw(req as any, res as any);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 200 for valid signed request', async () => {
      const router = new WebhookRouter();
      const mw = router.middleware(TEST_SECRET);

      const event = makeWebhookEvent();
      const body = JSON.stringify(event);
      const sig = await computeSignature(body, TEST_SECRET);

      const jsonFn = vi.fn();
      const req = { headers: { 'x-cognigate-signature': sig }, body };
      const res = { status: vi.fn().mockReturnValue({ json: jsonFn }) };

      await mw(req as any, res as any);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(jsonFn).toHaveBeenCalledWith({ received: true });
    });
  });
});
