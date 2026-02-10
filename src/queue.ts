import { decryptPersonalInfo } from '@proca/crypto';
import { AsyncMessage, Connection, ConsumerStatus } from 'rabbitmq-client';

export {
  ActionMessageV2 as ActionMessage,
  ActionMessageV2,
  ProcessStage,
} from './actionMessage';

import { ConsumerOpts, SyncCallback, Counters } from './types';

import os from 'os';

let connection: any = null;

const listeners: any = []; // functions to be called when a new connection is created

export const listenConnection = (fct: any) => listeners.push(fct);

let consumer: any = null;
export const count: Counters = { queued: undefined, ack: 0, nack: 0 };

async function exitHandler(evtOrExitCodeOrError: number | string | Error) {
  try {
    if (connection) {
      console.log(
        'closing after processing',
        count.ack,
        'and rejecting',
        count.nack
      );
      await consumer.close();
      await connection.close();
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
  rabbit.on('error', err => {
    console.log('RabbitMQ connection error', err);
  });
  rabbit.on('connection', () => {
    console.log('Connection successfully (re)established');
    listeners.forEach((d: any) => d(connection));
    //await ch.close()
  });

  process.once('SIGINT', exitHandler),
    ['uncaughtException', 'unhandledRejection', 'SIGTERM'].forEach(evt =>
      process.on(evt, exitHandler)
    );

  return rabbit as any;
};

export const syncQueue = async (
  queueUrl: string,
  queueName: string,
  syncer: SyncCallback,
  opts?: ConsumerOpts
) => {
  const concurrency = opts?.concurrency || 1;
  const prefetch = 2 * concurrency;
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
      concurrency: concurrency,
      consumerTag: tag,
      qos: { prefetchCount: prefetch },
    },
    async (message: AsyncMessage) => {
      // If this function throws an error, then message is NACK'd (rejected) and
      // possibly requeued or sent to a dead-letter exchange

      let msg: any;

      try {
        msg = JSON.parse(message.body.toString());
      } catch {
        console.error(
          'invalid JSON payload, cannot parse, rejecting',
          message.body.toString().slice(0, 512)
        );

        count.nack++;

        if (message.redelivered) {
          console.error('already redelivered once, dropping');
          return ConsumerStatus.DROP;
        }

        return ConsumerStatus.REQUEUE;
      }

      // if the message is unknown, drop and log but do not crash
      if (msg?.schema !== 'proca:action:2' && msg?.schema !== 'proca:event:2') {
        console.error('unknown message schema', msg?.schema);
        count.nack++;
        if (message.redelivered) {
          console.error('already requeued once, dropping');
          return ConsumerStatus.DROP;
        }
        return ConsumerStatus.REQUEUE;
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
          count.nack++;

          if (message.redelivered) {
            console.error(
              'already requeued, push to dead-letter',
              msg?.actionId ? 'Action Id:' + msg.actionId : '!'
            );
            return ConsumerStatus.DROP;
          }

          console.error(
            'syncer returned false, nack and requeue',
            msg?.actionId ? 'Action Id:' + msg.actionId : '!'
          );
          return ConsumerStatus.REQUEUE;
        }

        throw new Error(
          `syncer must return boolean, got: ${JSON.stringify(result)}`
        );
      } catch (e) {
        // if the syncer throw an error it's a permanent problem, we need to close
        console.error('fatal error processing:', e);
        process.exit(1);
      }
    }
  );

  const messageCount = async () => {
    const { messageCount } = await sub._ch.queueDeclare({
      queue: sub._queue,
      passive: true,
    });
    console.log('messages in the queue', messageCount);
    count.queued = messageCount;
  };

  sub.on('ready', async () => {
    await messageCount();
  });

  sub.on('error', (err: any) => {
    // Maybe the consumer was cancelled, or the connection was reset before a
    // message could be acknowledged.
    console.log('rabbit error', err);
  });
  consumer = sub; // global
};
