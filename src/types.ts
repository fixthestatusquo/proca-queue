import { KeyStore } from "@proca/crypto";
import { ActionMessage } from "./actionMessage";
import { EventMessageV2, CampaignUpdatedEventMessage } from "./events";

export type DecryptOpts = {
  decrypt?: boolean;
  ignore?: boolean;
};

export type ConsumerOpts = {
  concurrency?: number; // 1 by default
  prefetch?: number; // 2x concurrency by default
  keyStore?: KeyStore;
  tag?: string; // custom name for the consumer, package name by default
};

export type SyncResult = {
  processed: boolean;
}

export type SyncCallback = (action: ActionMessage | EventMessageV2 | CampaignUpdatedEventMessage) => Promise<SyncResult | boolean>;

export type Counters = {
  ack: number;
  nack: number;
  queued: number | undefined;
};
