// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Cognigate TypeScript SDK - Client
 *
 * Main client class for interacting with the Cognigate API
 */

import {
  CognigateConfig,
  TrustStatus,
  GovernanceResult,
  Intent,
  IntentParseResult,
  ProofRecord,
  ProofChainStats,
  Agent,
  CreateAgentRequest,
  UpdateAgentRequest,
  PaginatedResponse,
  TrustTier,
  TIER_THRESHOLDS,
  TrustStatusSchema,
  GovernanceResultSchema,
  ProofRecordSchema,
  AgentSchema,
} from './types.js';

const DEFAULT_BASE_URL = 'https://cognigate.dev/v1';
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_RETRIES = 3;

export class CognigateError extends Error {
  constructor(
    message: string,
    public code: string,
    public status?: number,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CognigateError';
  }
}

export class Cognigate {
  private readonly config: Required<Omit<CognigateConfig, 'webhookSecret' | 'region'>> & { webhookSecret?: string; region?: string };
  public readonly agents: AgentsClient;
  public readonly trust: TrustClient;
  public readonly governance: GovernanceClient;
  public readonly proofs: ProofsClient;

  constructor(config: CognigateConfig) {
    if (!config.apiKey) {
      throw new CognigateError('API key is required', 'MISSING_API_KEY');
    }

    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || DEFAULT_BASE_URL,
      timeout: config.timeout || DEFAULT_TIMEOUT,
      retries: config.retries || DEFAULT_RETRIES,
      debug: config.debug || false,
      webhookSecret: config.webhookSecret,
      region: config.region,
    };

    // Initialize sub-clients
    this.agents = new AgentsClient(this);
    this.trust = new TrustClient(this);
    this.governance = new GovernanceClient(this);
    this.proofs = new ProofsClient(this);
  }

  /**
   * Make an authenticated request to the Cognigate API
   */
  async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
      'X-SDK-Version': '1.0.0',
      'X-SDK-Language': 'typescript',
      ...(this.config.region ? { 'X-Cognigate-Region': this.config.region } : {}),
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (this.config.debug) {
          console.debug(`[cognigate-client] ${method} ${path} -> ${response.status}`);
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({})) as Record<string, unknown>;
          throw new CognigateError(
            (errorData.message as string) || `Request failed with status ${response.status}`,
            (errorData.code as string) || 'REQUEST_FAILED',
            response.status,
            errorData.details as Record<string, unknown> | undefined
          );
        }

        const data = await response.json();
        return data as T;
      } catch (error) {
        lastError = error as Error;

        if (error instanceof CognigateError && error.status && error.status < 500) {
          throw error; // Don't retry client errors
        }

        if (attempt < this.config.retries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new CognigateError('Request failed', 'UNKNOWN_ERROR');
  }

  /**
   * Check API health
   */
  async health(): Promise<{ status: string; version: string; timestamp: Date }> {
    return this.request('GET', '/health');
  }

  /**
   * Get tier from trust score
   */
  static getTierFromScore(score: number): TrustTier {
    if (score >= 951) return TrustTier.T7_AUTONOMOUS;
    if (score >= 876) return TrustTier.T6_CERTIFIED;
    if (score >= 800) return TrustTier.T5_TRUSTED;
    if (score >= 650) return TrustTier.T4_STANDARD;
    if (score >= 500) return TrustTier.T3_MONITORED;
    if (score >= 350) return TrustTier.T2_PROVISIONAL;
    if (score >= 200) return TrustTier.T1_OBSERVED;
    return TrustTier.T0_SANDBOX;
  }

  /**
   * Get tier name
   */
  static getTierName(tier: TrustTier): string {
    return TIER_THRESHOLDS[tier].name;
  }

  /**
   * Get tier thresholds
   */
  static getTierThresholds(tier: TrustTier): { min: number; max: number; name: string } {
    return TIER_THRESHOLDS[tier];
  }
}

// =============================================================================
// AGENTS CLIENT
// =============================================================================

class AgentsClient {
  constructor(private client: Cognigate) {}

  /**
   * List all agents
   */
  async list(params?: {
    page?: number;
    pageSize?: number;
    status?: 'ACTIVE' | 'PAUSED' | 'SUSPENDED';
  }): Promise<PaginatedResponse<Agent>> {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', params.page.toString());
    if (params?.pageSize) query.set('pageSize', params.pageSize.toString());
    if (params?.status) query.set('status', params.status);

    const queryString = query.toString();
    const path = `/agents${queryString ? `?${queryString}` : ''}`;

    return this.client.request('GET', path);
  }

  /**
   * Get a specific agent
   */
  async get(agentId: string): Promise<Agent> {
    const response = await this.client.request<Agent>('GET', `/agents/${agentId}`);
    return AgentSchema.parse(response) as Agent;
  }

  /**
   * Create a new agent
   */
  async create(data: CreateAgentRequest): Promise<Agent> {
    const response = await this.client.request<Agent>('POST', '/agents', data);
    return AgentSchema.parse(response) as Agent;
  }

  /**
   * Update an agent
   */
  async update(agentId: string, data: UpdateAgentRequest): Promise<Agent> {
    const response = await this.client.request<Agent>('PATCH', `/agents/${agentId}`, data);
    return AgentSchema.parse(response) as Agent;
  }

  /**
   * Delete an agent
   */
  async delete(agentId: string): Promise<void> {
    await this.client.request('DELETE', `/agents/${agentId}`);
  }

  /**
   * Pause an agent
   */
  async pause(agentId: string): Promise<Agent> {
    return this.update(agentId, { status: 'PAUSED' });
  }

  /**
   * Resume an agent
   */
  async resume(agentId: string): Promise<Agent> {
    return this.update(agentId, { status: 'ACTIVE' });
  }
}

// =============================================================================
// TRUST CLIENT
// =============================================================================

class TrustClient {
  constructor(private client: Cognigate) {}

  /**
   * Get trust status for an entity
   */
  async getStatus(entityId: string): Promise<TrustStatus> {
    const response = await this.client.request<TrustStatus>('GET', `/trust/${entityId}`);
    return TrustStatusSchema.parse(response) as TrustStatus;
  }

  /**
   * Get trust history
   */
  async getHistory(
    entityId: string,
    params?: { from?: Date; to?: Date; limit?: number }
  ): Promise<Array<{ score: number; tier: TrustTier; timestamp: Date }>> {
    const query = new URLSearchParams();
    if (params?.from) query.set('from', params.from.toISOString());
    if (params?.to) query.set('to', params.to.toISOString());
    if (params?.limit) query.set('limit', params.limit.toString());

    const queryString = query.toString();
    const path = `/trust/${entityId}/history${queryString ? `?${queryString}` : ''}`;

    return this.client.request('GET', path);
  }

  /**
   * Submit an outcome to update trust score
   */
  async submitOutcome(
    entityId: string,
    proofId: string,
    outcome: {
      success: boolean;
      metrics?: Record<string, number>;
      notes?: string;
    }
  ): Promise<TrustStatus> {
    const response = await this.client.request<TrustStatus>(
      'POST',
      `/trust/${entityId}/outcome`,
      { proofId, ...outcome }
    );
    return TrustStatusSchema.parse(response) as TrustStatus;
  }
}

// =============================================================================
// GOVERNANCE CLIENT
// =============================================================================

class GovernanceClient {
  constructor(private client: Cognigate) {}

  /**
   * Parse user intent into structured format
   */
  async parseIntent(entityId: string, rawInput: string): Promise<IntentParseResult> {
    return this.client.request('POST', '/governance/parse', {
      entityId,
      rawInput,
    });
  }

  /**
   * Enforce governance rules on an intent
   */
  async enforce(intent: Intent): Promise<GovernanceResult> {
    const response = await this.client.request<GovernanceResult>(
      'POST',
      '/governance/enforce',
      intent
    );
    return GovernanceResultSchema.parse(response) as GovernanceResult;
  }

  /**
   * Convenience method: parse and enforce in one call
   */
  async evaluate(entityId: string, rawInput: string): Promise<{
    intent: Intent;
    result: GovernanceResult;
  }> {
    const parseResult = await this.parseIntent(entityId, rawInput);
    const result = await this.enforce(parseResult.intent);
    return {
      intent: parseResult.intent,
      result,
    };
  }

  /**
   * Check if an action is allowed without creating a proof record
   */
  async canPerform(
    entityId: string,
    action: string,
    capabilities: string[]
  ): Promise<{ allowed: boolean; reason: string }> {
    return this.client.request('POST', '/governance/check', {
      entityId,
      action,
      capabilities,
    });
  }
}

// =============================================================================
// PROOFS CLIENT
// =============================================================================

class ProofsClient {
  constructor(private client: Cognigate) {}

  /**
   * Get a specific proof record
   */
  async get(proofId: string): Promise<ProofRecord> {
    const response = await this.client.request<ProofRecord>('GET', `/proofs/${proofId}`);
    return ProofRecordSchema.parse(response) as ProofRecord;
  }

  /**
   * List proof records for an entity
   */
  async list(
    entityId: string,
    params?: {
      page?: number;
      pageSize?: number;
      from?: Date;
      to?: Date;
      outcome?: 'SUCCESS' | 'FAILURE' | 'PARTIAL';
    }
  ): Promise<PaginatedResponse<ProofRecord>> {
    const query = new URLSearchParams();
    query.set('entityId', entityId);
    if (params?.page) query.set('page', params.page.toString());
    if (params?.pageSize) query.set('pageSize', params.pageSize.toString());
    if (params?.from) query.set('from', params.from.toISOString());
    if (params?.to) query.set('to', params.to.toISOString());
    if (params?.outcome) query.set('outcome', params.outcome);

    return this.client.request('GET', `/proofs?${query.toString()}`);
  }

  /**
   * Get proof chain statistics
   */
  async getStats(entityId: string): Promise<ProofChainStats> {
    return this.client.request('GET', `/proofs/stats/${entityId}`);
  }

  /**
   * Verify proof chain integrity
   */
  async verify(entityId: string): Promise<{
    valid: boolean;
    errors: string[];
    lastVerified: Date;
  }> {
    return this.client.request('POST', `/proofs/verify/${entityId}`);
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export { AgentsClient, TrustClient, GovernanceClient, ProofsClient };
