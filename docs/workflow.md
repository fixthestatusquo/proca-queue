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
   - consumer tag = `<hostname>.<tag || package name>`

4. Consumer options are validated:
   - `concurrency`, `prefetch`, `maxRetries` must be **positive integers (> 0)**
   - invalid values throw at startup

On startup, the consumer logs the **queue depth if available** from consumer stats.

---

## 2. Message Intake

For each message received:

### 2.1 Retry limit guard (`x-death` header)

If `maxRetries` is configured:

- retry count is read from `message.headers['x-death'][0].count`
- if retry count **exceeds maxRetries**:

```
ACK and drop (message considered permanently failed)
```

No further processing occurs.

---

### 2.2 JSON parsing

The message body is parsed as JSON.

- ❌ Invalid JSON → **NACK**
- First failure → **requeue**
- Redelivered → **dead-letter**

---

### 2.3 Schema validation

Accepted schemas:

- `proca:action:2`
- `proca:event:2`

If schema is unknown:

- ❌ Unknown schema → **NACK**
- First failure → **requeue**
- Redelivered → **dead-letter**

---

## 3. Message Normalization (Action v2 only)

If `schema === proca:action:2`:

### ID normalization

IDs are copied into nested objects for convenience:

- `campaign.id`
- `action.id`
- `org.id`
- `actionPage.id`

---

### Optional PII decryption

If:

- `personalInfo` exists
- `keyStore` is configured

Then:

- `personalInfo` is decrypted
- decrypted fields are merged into `contact`
- decrypted values overwrite existing fields

No side effects occur at this stage.

---

## 4. Business Processing (`syncer`)

The normalized message is passed to the user-provided:

```
await syncer(msg)
```

### Expected contract

The `syncer` **must return a boolean**.

| syncer result | Consumer behavior                     |
| ------------- | ------------------------------------- |
| `true`        | **ACK** (message removed)             |
| `false`       | **NACK → requeue once → dead-letter** |
| throws        | **Fatal error → process exit**        |
| non-boolean   | **Fatal error → process exit**        |

---

## 5. Retry & Dead-Letter Strategy

Two independent retry controls exist.

### 5.1 Consumer redelivery guard

- First failure → requeue
- If message is redelivered again → **DROP → dead-letter**

This prevents infinite retry loops.

---

### 5.2 Retry limit (`maxRetries`)

If configured:

- retry count is read from RabbitMQ `x-death` header
- when exceeded → **ACK and drop**

This is used when queues already implement retry pipelines via DLX.

---

## 6. Fatal Errors

If the `syncer`:

- throws an exception
- returns a non-boolean value

Then:

1. Error is logged
2. Consumer closes
3. Connection closes
4. Process exits immediately

This is treated as a **permanent system failure**, not a message failure.

---

## 7. Shutdown Behavior

On shutdown (`SIGINT`, `SIGTERM`, fatal error):

1. Consumer is closed
2. RabbitMQ connection is closed
3. Final ACK/NACK counters are logged
4. Process exits

Shutdown is graceful unless the process crashes unexpectedly.

---

## 8. Metrics

The following counters are tracked in memory:

- `count.queued` – queue depth at startup
- `count.ack` – successfully processed messages
- `count.nack` – rejected / retried messages

Counters reset on process restart.

---

## Summary (TL;DR)

- Valid message + handler success → ACK
- Recoverable failure → requeue once → DLQ
- Retry limit exceeded → ACK and drop
- Invalid message → requeue once → DLQ
- Handler crash or contract violation → process exits immediately

---
