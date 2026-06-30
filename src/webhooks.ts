// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Cognigate TypeScript SDK - Webhook Utilities
 *
 * Helpers for handling Cognigate webhooks
 */

import { WebhookEvent, WebhookEventType } from './types.js';

/**
 * Verify webhook signature
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, data);
  const expectedSignature = bufferToHex(signatureBuffer);

  return timingSafeEqual(signature, expectedSignature);
}

/**
 * Parse and validate a webhook payload
 */
export async function parseWebhookPayload(
  body: string,
  signature: string,
  secret: string
): Promise<WebhookEvent> {
  const isValid = await verifyWebhookSignature(body, signature, secret);

  if (!isValid) {
    throw new Error('Invalid webhook signature');
  }

  try {
    const event = JSON.parse(body) as WebhookEvent;
    event.timestamp = new Date(event.timestamp);
    return event;
  } catch {
    throw new Error('Invalid webhook payload');
  }
}

/**
 * Webhook handler type
 */
export type WebhookHandler<T extends WebhookEventType = WebhookEventType> = (
  event: WebhookEvent & { type: T }
) => void | Promise<void>;

/**
 * Webhook router for handling different event types
 */
export class WebhookRouter {
  private handlers: Map<WebhookEventType | '*', WebhookHandler[]> = new Map();

  /**
   * Register a handler for a specific event type
   */
  on<T extends WebhookEventType>(type: T, handler: WebhookHandler<T>): this {
    const existing = this.handlers.get(type) || [];
    existing.push(handler as WebhookHandler);
    this.handlers.set(type, existing);
    return this;
  }

  /**
   * Register a handler for all events
   */
  onAll(handler: WebhookHandler): this {
    const existing = this.handlers.get('*') || [];
    existing.push(handler);
    this.handlers.set('*', existing);
    return this;
  }

  /**
   * Handle a webhook event
   */
  async handle(event: WebhookEvent): Promise<void> {
    const typeHandlers = this.handlers.get(event.type) || [];
    const allHandlers = this.handlers.get('*') || [];

    const handlers = [...typeHandlers, ...allHandlers];

    for (const handler of handlers) {
      await handler(event);
    }
  }

  /**
   * Create an Express/Connect compatible middleware
   */
  middleware(secret: string) {
    return async (req: { headers: Record<string, string>; body: unknown }, res: { status: (code: number) => { json: (data: unknown) => void } }) => {
      try {
        const signature = req.headers['x-cognigate-signature'];
        const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

        const event = await parseWebhookPayload(body, signature, secret);
        await this.handle(event);

        res.status(200).json({ received: true });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    };
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
