import type { KeyStore } from "@proca/crypto";
import type { ActionMessage } from "./actionMessage";
import type { Event } from "./events";

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

export type MessageMeta = {
  routingKey: string;
  exchange: string;
  redelivered: boolean;
  headers?: Record<string, unknown>;
};

export type SyncCallback = (message: ActionMessage | Event, meta: MessageMeta) => Promise<boolean>;

export type Counters = {
  ack: number;
  nack: number;
  queued: number | undefined;
};
