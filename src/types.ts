import { KeyStore } from '@proca/crypto';
import { ActionMessage } from './actionMessage';
import { Event } from './events';

export type DecryptOpts = {
  decrypt?: boolean;
  ignore?: boolean;
};

export type ConsumerOpts = {
  concurrency?: number; // 1 by default
  prefetch?: number; // 2x concurrency by default
  keyStore?: KeyStore;
  tag?: string; // custom name for the consumer, package name by default
  maxRetries?: number; // max retries before dropping a message, default is 5
};

export type SyncCallback = (message: ActionMessage | Event) => Promise<boolean>;

export type Counters = {
  ack: number;
  nack: number;
  queued: number | undefined;
};
