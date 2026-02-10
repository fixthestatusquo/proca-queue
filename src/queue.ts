import { decryptPersonalInfo } from '@proca/crypto';
import { AsyncMessage, Connection, ConsumerStatus } from 'rabbitmq-client';

import LineByLine from 'line-by-line';
export {
  ActionMessageV2 as ActionMessage,
  ActionMessageV2,
  ProcessStage,
} from './actionMessage';

import { ActionMessageV2 } from './actionMessage';

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

export async function testQueue(queueUrl: string, queueName: string) {
  throw new Error("it shouldn't call testQueue " + queueUrl + ':' + queueName);

  /*
  const conn = await connect(queueUrl)
  const ch = await conn.createChannel()
  try {
    const status = await ch.checkQueue(queueName)
    return status
  } finally {
    ch.close()
    conn.close()
  }
  */
}

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
    async (msg: AsyncMessage) => {
      // The message is automatically acknowledged when this function ends.
      // If this function throws an error, then msg is NACK'd (rejected) and
      // possibly requeued or sent to a dead-letter exchange
      const action = JSON.parse(msg.body.toString());

      if (action.schema === 'proca:action:2') {
        // make it easier to process by moving the id to their objects
        if (action.campaign) action.campaign.id = action.campaignId;
        if (action.action) action.action.id = action.actionId;
        if (action.org) action.org.id = action.orgId;
        if (action.actionPage) action.actionPage.id = action.actionPageId;
        // optional decrypt
        if (action.personalInfo && opts?.keyStore) {
          const plainPII = decryptPersonalInfo(
            action.personalInfo,
            opts.keyStore
          );
          action.contact = { ...action.contact, ...plainPII };
        }
      }
      try {
        // we expect the syncer to return boolean. Anything else will trigger an error and a shutdown
        const result = await syncer(action);

        if (result === true) {
          count.ack++;
          return ConsumerStatus.ACK;
        }

        if (result === false) {
          count.nack++;

          if (msg.redelivered) {
            console.error(
              'already requeued, push to dead-letter',
              action?.actionId ? 'Action Id:' + action.actionId : '!'
            );
            return ConsumerStatus.DROP;
          }

          console.error(
            'syncer returned false, nack and requeue',
            action?.actionId ? 'Action Id:' + action.actionId : '!'
          );
          return ConsumerStatus.REQUEUE;
        }

        throw new Error(
          `syncer must return boolean, got: ${JSON.stringify(result)}`
        );
      } catch (e) {
        // if the syncer throw an error it's a permanent problem, we need to close
        console.error('fatal error processing, we should close?', e);
        return ConsumerStatus.DROP; // no requeue
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

export const syncFile = (
  filePath: string,
  syncer: SyncCallback,
  opts?: ConsumerOpts
) => {
  const lines = new LineByLine(filePath);

  lines.on('line', async l => {
    let action: ActionMessageV2 = JSON.parse(l);

    //    if (action.schema === 'proca:action:1') {
    //      action = actionMessageV1to2(action);
    //    }

    // optional decrypt
    if (action.personalInfo && opts?.keyStore) {
      const plainPII = decryptPersonalInfo(action.personalInfo, opts.keyStore);
      action.contact = { ...action.contact, ...plainPII };
    }

    lines.pause();
    await syncer(action);
    lines.resume();
  });
};
