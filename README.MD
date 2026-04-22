# Proca Queue

This package provides a **robust RabbitMQ consumer** for processing Proca **action** and **event** messages with strict retry, dead-letter, and crash semantics.

For behavior details, see:

- **[docs/workflow.md](docs/workflow.md)**
- **[docs/diagram.md](docs/diagram.md)**

---

## Supported Message Types

The consumer handles **two schemas**:

### Actions

- `proca:action:2`

### Events

- `proca:event:2`

Supported events:

- `email_status`
- `campaign_updated`
- `confirm_created`

The consumer passes messages to the handler/syncer.

---

## Usage

```ts
import { syncQueue, ActionMessage, Event } from '@proca/queue';

const handler = async (msg: ActionMessage | Event) => {
  console.log('Received message:', msg);
  return true; // ACK
};

await syncQueue(
  'amqps://user:pass@api.proca.app/proca_live',
  'your-queue-name',
  handler,
  { concurrency: 5 }
);
```

## Consumer API

### `syncQueue`

```ts
syncQueue(
  queueUrl: string,
  queueName: string,
  syncer: SyncCallback,
  opts?: ConsumerOpts
): Promise<{ close: () => Promise<void> }>
```

### Handler return value semantics:

| Handler result       | Effect                     |
| -------------------- | -------------------------- |
| `true`               | ACK (message removed)      |
| `false`              | NACK → retry once → DLQ    |
| throws / non-boolean | Fatal error → process exit |

---

## Configuration (`ConsumerOpts`)

```ts
type ConsumerOpts = {
  concurrency?: number; // default: 1
  prefetch?: number; // default: 2 × concurrency
  keyStore?: KeyStore; // enables PII decryption
  tag?: string; // consumer tag (defaults to hostname + package name)
  maxRetries?: number; // max retries before dropping a message (uses x-death)
};
```

---

## Runtime Metrics

The consumer tracks in-memory counters:

```ts
import { count } from '@proca/queue';

console.log(count.ack); // number of successfully processed messages
```

---

## Error & Retry Model (Summary)

- Invalid JSON → NACK → retry once → DLQ
- Unknown schema → NACK → retry once → DLQ
- Handler returns `false` → NACK → retry once → DLQ
- Handler throws or misbehaves → **process exits immediately**
- No infinite retries

Full details: see `workflow.md`.

---

## AMQP authentication

Use HTTP Basic Auth inlined in url to authenticate to AMQP server (eg. `amqps://username:password@example.com:1572`).

---

## Development

```bash
npm install
npm run build
npm test
```
