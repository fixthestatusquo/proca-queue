# Message Consumer Workflow

## 1. Connection & Startup

1. The service connects to RabbitMQ using `connect(queueUrl)`
2. Signal and process handlers are registered:

   - `SIGINT`, `SIGTERM` → graceful shutdown
   - `uncaughtException`, `unhandledRejection` → log and exit

3. A consumer is created with:

   - `noAck: false`
   - `requeue: false`
   - bounded `concurrency`
   - `prefetch = 2 × concurrency`

On startup, the consumer logs the **current queue depth**.

---

## 2. Message Intake

For each message received:

1. The message body is parsed as JSON

   - ❌ Invalid JSON → **NACK**
   - First failure → **requeue**
   - Redelivered → **dead-letter**

2. The message schema is validated
   Accepted schemas:

   - `proca:action:2`

   - `proca:event:2`

   - ❌ Unknown schema → **NACK**

   - First failure → **requeue**

   - Redelivered → **dead-letter**

---

## 3. Message Normalization (Action v2 only)

If `schema === proca:action:2`:

- IDs are copied into their nested objects for convenience:

  - `campaign.id`
  - `action.id`
  - `org.id`
  - `actionPage.id`

- If a keystore is configured:

  - `personalInfo` is decrypted
  - decrypted fields are merged into `contact`

No side effects occur at this stage.

---

## 4. Business Processing (`syncer`)

The normalized message is passed to the user-provided `syncer(msg)`.

### Expected contract

The `syncer` **must** return a boolean:

| syncer result                 | Consumer behavior                       |
| ----------------------------- | --------------------------------------- |
| `true`                        | **ACK** (message removed from queue)    |
| `false`                       | **NACK** (retry once, then dead-letter) |
| throws or returns non-boolean | **Fatal error → process exit**          |

---

## 5. Retry & Dead-Letter Strategy

- Messages are retried **at most once**
- Retry detection uses `message.redelivered`
- Second failure → **DROP** (dead-letter exchange)

---

## 6. Fatal Errors

If the `syncer`:

- throws an exception
- returns a non-boolean value

Then:

1. The error is logged
2. The process exits immediately

---

## 7. Shutdown Behavior

On shutdown (`SIGINT`, `SIGTERM`, fatal error):

1. The consumer is closed
2. The RabbitMQ connection is closed
3. Final ACK/NACK counters are logged
4. The process exits

---

## 8. Metrics

The following counters are tracked in memory:

- `count.queued` – queue depth at startup
- `count.ack` – successfully processed messages
- `count.nack` – rejected / retried messages

---

## Summary (TL;DR)

- **Good messages** → ACK
- **Recoverable failures** → retry once → DLQ
- **Bad code or corrupted data** → crash fast
