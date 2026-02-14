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

The consumer passes mesages to the handler/syncer.

---

## Consumer API

### `syncQueue`

```ts
syncQueue(
  queueUrl: string,
  queueName: string,
  syncer: SyncCallback,
  opts?: ConsumerOpts
)
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
  tag?: string; // consumer tag (defaults to package name)
};
```

---

## Runtime Metrics

The consumer tracks in-memory counters:

```ts
type Counters = {
  ack: number; // successfully processed
  nack: number; // rejected / retried
  queued: number | undefined; // queue depth at startup
};
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

## Local Testing

To connect to a whatever queue locally set ENVs and `nmp run test`, eg:

```
PROCA_USERNAME=username \
PROCA_PASSWORD=password \
PROCA_QUEUE=queue \
npm run test
```

It will log and nack messages (nothing will be lost from the queue).
