import { ActionMessage } from './actionMessage';
import { syncQueue } from './queue';
import type { Event } from './events';

const { PROCA_USERNAME, PROCA_PASSWORD, PROCA_QUEUE } = process.env;
if (!PROCA_QUEUE) {
  throw new Error('PROCA_QUEUE environment variable is required');
}

const url = () => {
  if (!PROCA_USERNAME || !PROCA_PASSWORD) {
    throw new Error(
      'Either PROCA_URL or both PROCA_USERNAME and PROCA_PASSWORD must be set'
    );
  }

  return `amqps://${PROCA_USERNAME}:${encodeURIComponent(
    PROCA_PASSWORD
  )}@api.proca.app/proca_live`;
};

async function handler(msg: ActionMessage | Event) {
  console.log('msg:', msg);
  return false; // safe: requeue
}

syncQueue(url(), PROCA_QUEUE!, handler, {
  concurrency: 1,
  tag: 'local-dev',
  // be careful with maxRetries it will ACK and drop messages after the limit is exceeded!!!!
  maxRetries: 9000000000000000,
});
