import { decryptPersonalInfo } from '@proca/crypto';
import {
  AsyncMessage,
  Connection,
  ConsumerStatus,
  Consumer,
} from 'rabbitmq-client';

export {
  ActionMessageV2 as ActionMessage,
  ActionMessageV2,
  ProcessStage,
} from './actionMessage';

import { ConsumerOpts, SyncCallback, Counters } from './types';

import os from 'os';

let connection: Connection | null = null;
let consumer: Consumer | null = null;

const listeners: any = []; // functions to be called when a new connection is created

export const listenConnection = (fct: any) => listeners.push(fct);

export const count: Counters = { queued: undefined, ack: 0, nack: 0 };

async function exitHandler(
  evtOrExitCodeOrError: number | string | Error
): Promise<void> {
  try {
    if (connection) {
      console.log(
        'closing after processing',
        count.ack,
        'and rejecting',
        count.nack
      );
      await consumer?.close();
      await connection?.close();
    }
    console.log('closed, exit now');
    process.exit(isNaN(+evtOrExitCodeOrError) ? 0 : +evtOrExitCodeOrError);
  } catch (e) {
    console.error('EXIT HANDLER ERROR', e);
    process.exit(isNaN(+evtOrExitCodeOrError) ? 1 : +evtOrExitCodeOrError);
  }
}

export const connect = (queueUrl: string) => {
  const rabbit = new Connection(queueUrl);
  connection = rabbit; // global
  rabbit.on('error', (err) => {
    console.log('RabbitMQ connection error', err);
  });

  rabbit.on('connection', () => {
    console.log(
      `Connection successfully (re)established, ${consumer?.stats?.initialMessageCount} messages in the queue`
    );
    listeners.forEach((d: any) => d(connection));
  });

  // Connect() might be called multiple times
  //so guard against duplicate listeners
  if (!process.listenerCount('SIGINT')) {
    process.once('SIGINT', exitHandler);
  }

  ['uncaughtException', 'unhandledRejection', 'SIGTERM'].forEach((evt) => {
    // duplicates guard
    if (!process.listenerCount(evt)) {
      process.on(evt, exitHandler);
    }
  });

  return rabbit as any;
};

const requeueOnceOrDrop = (
  message: AsyncMessage,
  reason: string = 'unknown reason'
): ConsumerStatus => {
  console.error(reason);
  count.nack++;

  if (message.redelivered) {
    console.error('already requeued, push to dead-letter');
    return ConsumerStatus.DROP;
  }
  return ConsumerStatus.REQUEUE;
};

export const isPositiveInt = (value: number, name = 'value') => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer (> 0), got ${value}`);
  }
  return value;
};

export const syncQueue = async (
  queueUrl: string,
  queueName: string,
  syncer: SyncCallback,
  opts?: ConsumerOpts
) => {
  // might be an overkill but want to be sure that invalid options not cause unexpected behavior
  const concurrency = opts?.concurrency
    ? isPositiveInt(opts.concurrency, 'concurrency')
    : isPositiveInt(1, 'concurrency');

  const prefetch = opts?.prefetch
    ? isPositiveInt(opts.prefetch, 'prefetch')
    : isPositiveInt(2 * concurrency, 'prefetch');

  const maxRetries = opts?.maxRetries
    ? isPositiveInt(opts.maxRetries, 'maxRetries')
    : null;

  const rabbit = await connect(queueUrl);

  // get host name
  const tag =
    os.hostname() + '.' + (opts?.tag ? opts.tag : process.env.npm_package_name);
  const sub = rabbit.createConsumer(
    {
      queue: queueName,
      requeue: false,
      noAck: false,
      queueOptions: { passive: true },
      concurrency,
      consumerTag: tag,
      qos: { prefetchCount: prefetch },
    },
    async (message: AsyncMessage) => {
      // If this function throws an error, then message is NACK'd (rejected) and
      // possibly requeued or sent to a dead-letter exchange

      if (maxRetries) {
        const deaths = message.headers?.['x-death']?.[0]?.count ?? 0;

        if (deaths > maxRetries) {
          console.error(
            `retry limit exceeded (${deaths} > ${maxRetries}) — ACK and drop`
          );
          count.ack++;
          return ConsumerStatus.ACK;
        }
      }

      let msg: any;

      try {
        msg = JSON.parse(message.body.toString());
      } catch {
        return requeueOnceOrDrop(
          message,
          `invalid JSON payload, cannot parse ${message.body
            .toString()
            .slice(0, 512)}`
        );
      }

      // if the message is unknown, drop and log but do not crash
      if (msg?.schema !== 'proca:action:2' && msg?.schema !== 'proca:event:2') {
        return requeueOnceOrDrop(
          message,
          `unknown schema "${msg?.schema || JSON.stringify(msg).slice(0, 512)}"`
        );
      }

      if (msg.schema === 'proca:action:2') {
        // make it easier to process by moving the id to their objects
        if (msg.campaign) msg.campaign.id = msg.campaignId;
        if (msg.action) msg.action.id = msg.actionId;
        if (msg.org) msg.org.id = msg.orgId;
        if (msg.actionPage) msg.actionPage.id = msg.actionPageId;
        // optional decrypt
        if (msg.personalInfo && opts?.keyStore) {
          const plainPII = decryptPersonalInfo(msg.personalInfo, opts.keyStore);
          msg.contact = { ...msg.contact, ...plainPII };
        }
      }
      try {
        // we expect the syncer to return boolean.
        // - return true  → ACK
        // - return false → NACK / requeue
        // - throw or return non-boolean → process exits immediately

        const result = await syncer(msg);

        if (result === true) {
          count.ack++;
          return ConsumerStatus.ACK;
        }

        if (result === false) {
          return requeueOnceOrDrop(
            message,
            `syncer returned false for message ${msg?.actionId ?? msg}`
          );
        }

        throw new Error(
          `syncer must return boolean, got: ${JSON.stringify(result)}`
        );
      } catch (e) {
        // if the syncer throw an error it's a permanent problem, we need to close
        console.error('fatal error processing:', e);
        await exitHandler(e instanceof Error ? e : String(e));
        throw e;
      }
    }
  );

  sub.on('error', (err: any) => {
    // Maybe the consumer was cancelled, or the connection was reset before a
    // message could be acknowledged.
    console.log('rabbit error', err);
  });
  consumer = sub; // global
};
