# @vorionsys/cognigate

TypeScript client SDK for the [Cognigate](https://cognigate.dev) AI governance gateway API.

[![npm version](https://img.shields.io/npm/v/@vorionsys/cognigate)](https://www.npmjs.com/package/@vorionsys/cognigate)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

---

## Installation

```bash
npm install @vorionsys/cognigate
```

## What is Cognigate?

**Cognigate** is Vorion's real-time AI governance gateway. It sits between your AI agents and the actions they want to perform, evaluating every request against trust scores, capability policies, and risk levels before granting or denying permission. Every decision is recorded as an immutable proof record, creating a tamper-evident audit trail.

> **Note:** This package (`@vorionsys/cognigate`) is the **TypeScript client SDK** for consuming the Cognigate API. The gateway itself is a Python/FastAPI service (see `apps/cognigate-api/` in the monorepo or [github.com/vorionsys/cognigate](https://github.com/vorionsys/cognigate)).

Cognigate implements the trust-tier model defined by the **BASIS** (Baseline Authority for Safe & Interoperable Systems) specification. BASIS defines eight trust tiers (T0 through T7) that govern what an AI agent is allowed to do based on its demonstrated track record. As agents prove reliability, they earn higher trust scores and unlock broader capabilities -- all enforced automatically by Cognigate.

### Core concepts

| Concept | Description |
|---|---|
| **Trust Score** | A 0--1000 numeric score reflecting an agent's reliability. Computed from outcomes, compliance, and behavioral signals. |
| **Trust Tier** | One of eight BASIS tiers (T0 Sandbox through T7 Autonomous) derived from the trust score. Each tier grants a specific set of capabilities. |
| **Governance Decision** | The verdict for a requested action: `ALLOW`, `DENY`, `ESCALATE` (requires human approval), or `DEGRADE` (partial access). |
| **Intent** | A structured representation of what an agent wants to do, parsed from natural-language input. |
| **Proof Record** | An immutable, hash-chained audit entry recording each governance decision and its outcome. |
| **Proof Bridge** | Optional integration that forwards Cognigate decisions to the Vorion Proof Plane for cross-system audit trails. |

---

## Quick start

```typescript
import { Cognigate } from '@vorionsys/cognigate';

const client = new Cognigate({
  apiKey: process.env.COGNIGATE_API_KEY!,
});

// 1. Register an agent
const agent = await client.agents.create({
  name: 'DataProcessor',
  description: 'ETL pipeline agent',
  initialCapabilities: ['read_database', 'write_s3'],
});

// 2. Check trust status
const status = await client.trust.getStatus(agent.id);
console.log(`Trust Score: ${status.trustScore}`);
console.log(`Tier: ${status.tierName}`);
console.log(`Capabilities: ${status.capabilities.join(', ')}`);

// 3. Evaluate a governance request (parse intent + enforce)
const { intent, result } = await client.governance.evaluate(
  agent.id,
  'Read customer data from the sales database'
);

if (result.decision === 'ALLOW') {
  console.log('Proceeding -- granted:', result.grantedCapabilities);
} else if (result.decision === 'ESCALATE') {
  console.log('Needs human approval:', result.reasoning);
} else {
  console.log('Blocked:', result.reasoning);
}
```

---

## Usage examples

### Creating and managing agents

```typescript
import { Cognigate } from '@vorionsys/cognigate';

const client = new Cognigate({ apiKey: process.env.COGNIGATE_API_KEY! });

// List all active agents
const agents = await client.agents.list({ status: 'ACTIVE' });
console.log(`Found ${agents.total} active agents`);

// Get a specific agent
const agent = await client.agents.get('agent-123');

// Create an agent
const newAgent = await client.agents.create({
  name: 'DataProcessor',
  description: 'Processes data pipelines',
  template: 'data-processor',
  initialCapabilities: ['read_database'],
});

// Update an agent
await client.agents.update('agent-123', { name: 'RenamedAgent' });

// Pause / Resume
await client.agents.pause('agent-123');
await client.agents.resume('agent-123');

// Delete an agent
await client.agents.delete('agent-123');
```

### Querying trust status and history

```typescript
// Get current trust status
const status = await client.trust.getStatus('agent-123');
// Returns: { trustScore, trustTier, tierName, capabilities, factorScores, compliant, warnings, ... }

// Get trust history over a time range
const history = await client.trust.getHistory('agent-123', {
  from: new Date('2026-01-01'),
  limit: 100,
});

// Submit an outcome to update the trust score
const updated = await client.trust.submitOutcome('agent-123', 'proof-456', {
  success: true,
  metrics: { latency: 234, accuracy: 0.98 },
  notes: 'Completed ETL run without errors',
});
```

### Submitting governance requests and checking decisions

```typescript
// Option A: Parse intent, then enforce separately
const parsed = await client.governance.parseIntent(
  'agent-123',
  'Read customer data from the sales database'
);
console.log(`Parsed action: ${parsed.intent.parsedAction}`);
console.log(`Risk level: ${parsed.intent.riskLevel}`);
console.log(`Confidence: ${parsed.confidence}`);

const result = await client.governance.enforce(parsed.intent);
// result.decision is 'ALLOW' | 'DENY' | 'ESCALATE' | 'DEGRADE'

// Option B: Combined parse + enforce in one call
const { intent, result: govResult } = await client.governance.evaluate(
  'agent-123',
  'Send email to customer'
);

if (govResult.decision === 'ALLOW') {
  // Proceed -- action is permitted
} else if (govResult.decision === 'ESCALATE') {
  // Request human approval
} else if (govResult.decision === 'DEGRADE') {
  // Partial access: check govResult.grantedCapabilities
} else {
  // DENY
  console.log('Denied:', govResult.reasoning);
}

// Quick capability check (no proof record created)
const check = await client.governance.canPerform(
  'agent-123',
  'write_file',
  ['file_write', 'approved_directories']
);
console.log(check.allowed, check.reason);
```

### Querying the proof chain

```typescript
// Get a specific proof record
const proof = await client.proofs.get('proof-123');

// List proofs for an entity
const proofs = await client.proofs.list('agent-123', {
  from: new Date('2026-01-01'),
  outcome: 'SUCCESS',
  pageSize: 50,
});

// Get chain statistics
const stats = await client.proofs.getStats('agent-123');
// Returns: { totalRecords, successRate, averageTrustScore, chainIntegrity }

// Verify proof chain integrity (hash-chain validation)
const verification = await client.proofs.verify('agent-123');
console.log('Chain valid:', verification.valid);
if (verification.errors.length > 0) {
  console.error('Integrity errors:', verification.errors);
}
```

### Handling webhooks

```typescript
import { WebhookRouter, parseWebhookPayload } from '@vorionsys/cognigate';

const router = new WebhookRouter();

// Handle specific event types
router.on('trust.tier_changed', async (event) => {
  console.log(`Agent ${event.entityId} tier changed:`, event.payload);
});

router.on('governance.decision', async (event) => {
  if (event.payload.decision === 'ESCALATE') {
    // Alert a human reviewer
  }
});

// Handle all events (logging, analytics, etc.)
router.onAll(async (event) => {
  await logEvent(event);
});

// Express middleware (signature verification included)
app.post('/webhooks/cognigate', router.middleware(process.env.WEBHOOK_SECRET!));

// Or verify manually
app.post('/webhooks/cognigate', async (req, res) => {
  try {
    const event = await parseWebhookPayload(
      req.body,
      req.headers['x-cognigate-signature'] as string,
      process.env.WEBHOOK_SECRET!
    );
    await router.handle(event);
    res.json({ received: true });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});
```

### Proof Bridge (Proof Plane integration)

The proof bridge forwards Cognigate `governance.decision` webhook events to the Vorion Proof Plane, creating cross-system `DECISION_MADE` audit records.

```typescript
import { WebhookRouter } from '@vorionsys/cognigate';
import { createProofBridge } from '@vorionsys/cognigate/proof-bridge';
import { ProofPlane, memoryStore } from '@vorionsys/proof-plane';

const router = new WebhookRouter();
const proofPlane = new ProofPlane({ storage: memoryStore() });

const bridge = createProofBridge({
  proofPlane,
  webhookRouter: router,
});

// governance.decision events now automatically emit DECISION_MADE proofs

// Later, disconnect the bridge:
bridge.disconnect();
```

### Trust tiers (BASIS specification)

```typescript
import { Cognigate, TrustTier, TIER_THRESHOLDS } from '@vorionsys/cognigate';

// Derive tier from score
const tier = Cognigate.getTierFromScore(750);
// Returns: TrustTier.T4_STANDARD

// Get human-readable tier name
const name = Cognigate.getTierName(TrustTier.T5_TRUSTED);
// Returns: "Trusted"

// Get score thresholds for a tier
const thresholds = Cognigate.getTierThresholds(TrustTier.T4_STANDARD);
// Returns: { min: 650, max: 799, name: "Standard" }
```

The eight BASIS trust tiers:

| Tier | Score range | Name | Description |
|---|---|---|---|
| T0 | 0--199 | Sandbox | Isolated, no external access |
| T1 | 200--349 | Observed | Read-only, monitored |
| T2 | 350--499 | Provisional | Basic operations, supervised |
| T3 | 500--649 | Monitored | Standard operations with monitoring |
| T4 | 650--799 | Standard | External API access, policy-governed |
| T5 | 800--875 | Trusted | Cross-agent communication |
| T6 | 876--950 | Certified | Admin tasks, minimal oversight |
| T7 | 951--1000 | Autonomous | Full autonomy, self-governance |

### Error handling

```typescript
import { Cognigate, CognigateError } from '@vorionsys/cognigate';

try {
  const status = await client.trust.getStatus('invalid-id');
} catch (error) {
  if (error instanceof CognigateError) {
    console.log('Code:', error.code);       // e.g. 'NOT_FOUND'
    console.log('Message:', error.message);  // e.g. 'Entity not found'
    console.log('Status:', error.status);    // e.g. 404
    console.log('Details:', error.details);  // additional context
  }
}
```

The client automatically retries server errors (5xx) with exponential backoff. Client errors (4xx) are thrown immediately.

---

## API reference

### Main export: `@vorionsys/cognigate`

#### Classes

| Export | Description |
|---|---|
| `Cognigate` | Main SDK client. Instantiate with `CognigateConfig` to access all sub-clients. |
| `CognigateError` | Error class with `code`, `status`, and `details` properties. |
| `WebhookRouter` | Event router for Cognigate webhooks with Express middleware support. |

#### Sub-clients (accessed via `Cognigate` instance)

| Property | Type | Description |
|---|---|---|
| `client.agents` | `AgentsClient` | CRUD operations for agents: `list`, `get`, `create`, `update`, `delete`, `pause`, `resume`. |
| `client.trust` | `TrustClient` | Trust score queries: `getStatus`, `getHistory`, `submitOutcome`. |
| `client.governance` | `GovernanceClient` | Governance enforcement: `parseIntent`, `enforce`, `evaluate`, `canPerform`. |
| `client.proofs` | `ProofsClient` | Proof chain access: `get`, `list`, `getStats`, `verify`. |

#### Static methods on `Cognigate`

| Method | Description |
|---|---|
| `Cognigate.getTierFromScore(score)` | Convert a 0--1000 score to a `TrustTier` enum value. |
| `Cognigate.getTierName(tier)` | Get the human-readable name of a tier. |
| `Cognigate.getTierThresholds(tier)` | Get `{ min, max, name }` for a tier. |

#### Enums and constants

| Export | Description |
|---|---|
| `TrustTier` | Enum: `T0_SANDBOX` through `T7_AUTONOMOUS`. |
| `TIER_THRESHOLDS` | Mapping from `TrustTier` to `{ min, max, name }`. |

#### Types

| Type | Description |
|---|---|
| `CognigateConfig` | Client configuration: `apiKey`, `baseUrl?`, `timeout?`, `retries?`, `debug?`, `webhookSecret?`. |
| `Agent` | Registered agent record. |
| `CreateAgentRequest` | Payload for creating an agent. |
| `UpdateAgentRequest` | Payload for updating an agent. |
| `TrustStatus` | Trust score, tier, capabilities, factor scores, compliance status. |
| `GovernanceDecision` | Union: `'ALLOW' \| 'DENY' \| 'ESCALATE' \| 'DEGRADE'`. |
| `GovernanceResult` | Full decision result with reasoning, capabilities, constraints, and proof ID. |
| `Intent` | Structured representation of a parsed action request. |
| `IntentParseResult` | Parse result with confidence score and alternative interpretations. |
| `ProofRecord` | Immutable hash-chained audit record for a single decision. |
| `ProofChainStats` | Aggregate stats: total records, success rate, average score, chain integrity. |
| `WebhookEvent` | Webhook payload with type, entity ID, and signature. |
| `WebhookEventType` | Union of all supported event types (e.g. `'trust.tier_changed'`). |
| `ApiResponse<T>` | Standard API response wrapper. |
| `ApiError` | API error structure. |
| `PaginatedResponse<T>` | Paginated list with `items`, `total`, `page`, `pageSize`, `hasMore`. |
| `AgentsClient` | Type of the agents sub-client. |
| `TrustClient` | Type of the trust sub-client. |
| `GovernanceClient` | Type of the governance sub-client. |
| `ProofsClient` | Type of the proofs sub-client. |

#### Zod schemas (runtime validation)

| Export | Validates |
|---|---|
| `TrustStatusSchema` | `TrustStatus` objects |
| `GovernanceResultSchema` | `GovernanceResult` objects |
| `ProofRecordSchema` | `ProofRecord` objects |
| `AgentSchema` | `Agent` objects |

#### Webhook utilities

| Export | Description |
|---|---|
| `verifyWebhookSignature(payload, signature, secret)` | HMAC-SHA256 signature verification with timing-safe comparison. |
| `parseWebhookPayload(body, signature, secret)` | Verify signature and parse the webhook body into a `WebhookEvent`. |
| `WebhookRouter` | Event router: `on(type, handler)`, `onAll(handler)`, `handle(event)`, `middleware(secret)`. |

### Sub-export: `@vorionsys/cognigate/proof-bridge`

| Export | Description |
|---|---|
| `createProofBridge(config)` | Create a bridge forwarding `governance.decision` webhooks to the Proof Plane. Returns a `ProofBridgeHandle`. |
| `ProofPlaneEmitter` | Structural interface for Proof Plane integration (avoids hard dependency on `@vorionsys/proof-plane`). |
| `ProofBridgeConfig` | Config: `{ proofPlane, webhookRouter }`. |
| `ProofBridgeHandle` | Handle with `disconnect()` method to stop forwarding. |

---

## Webhook event types

| Event type | Fired when |
|---|---|
| `agent.created` | A new agent is registered |
| `agent.updated` | An agent's configuration changes |
| `agent.deleted` | An agent is deleted |
| `agent.status_changed` | An agent's status changes (active/paused/suspended) |
| `trust.score_changed` | An agent's trust score is updated |
| `trust.tier_changed` | An agent's trust tier changes |
| `governance.decision` | A governance decision is rendered |
| `proof.recorded` | A proof record is committed to the chain |
| `alert.triggered` | A system or compliance alert fires |

---

## Configuration reference

```typescript
interface CognigateConfig {
  /** API key (required). */
  apiKey: string;
  /** Base URL for the Cognigate API. Default: https://cognigate.dev/v1 */
  baseUrl?: string;
  /** Request timeout in milliseconds. Default: 30000 */
  timeout?: number;
  /** Number of retries for server errors. Default: 3 */
  retries?: number;
  /** Enable debug logging. Default: false */
  debug?: boolean;
  /** Webhook signing secret for signature verification. */
  webhookSecret?: string;
}
```

---

## Requirements

- Node.js >= 18.0.0
- TypeScript >= 5.0.0 (peer dependency)

---

## License

[Apache-2.0](./LICENSE)

---

## Contributing

This package is part of the [Vorion monorepo](https://github.com/vorionsys/vorion). See the root `CONTRIBUTING.md` for guidelines.

## Links

- [Cognigate API Documentation](https://cognigate.dev)
- [Vorion Monorepo](https://github.com/vorionsys/vorion)
- [npm: @vorionsys/cognigate](https://www.npmjs.com/package/@vorionsys/cognigate)
