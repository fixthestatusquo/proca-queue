import { Connection, Consumer } from 'rabbitmq-client';
import { KeyStore, PersonalInfo } from '@proca/crypto';

export type ProcessStage = "confirm" | "deliver";

export type ContactV1 = {
  email: string;
  firstName: string;
  ref: string;
  payload: string;
  signKey?: string;
  publicKey?: string;
  nonce?: string;
  area: string | null;
};

export type ContactV2 = {
  email: string;
  firstName: string;
  contactRef: string;
  area: string | null;
} & { [key: string]: any };

export type Campaign = {
  title: string;
  name: string;
  externalId: number;
  id?: number;
};

export type ActionPage = {
  locale: string;
  name: string;
  thankYouTemplate: string;
  thankYouTemplateRef: string;
  id?: number;
};

export type ActionV2 = {
  id?: number;
  actionType: string;
  customFields: {
    [key: string]: string | number | boolean | string[] | number[];
  };
  createdAt: string;
  testing: boolean;
};

export type Organisation = {
  name: string;
  title: string;
  id?: number;
};

export type Tracking = {
  source: string;
  medium: string;
  campaign: string;
  content: string;
  location: string;
};

export type PrivacyV2 = {
  withConsent: boolean;
  optIn?: boolean;
  givenAt?: string;
  emailStatus: null | "double_opt_in" | "bounce" | "blocked" | "spam" | "unsub";
  emailStatusChanged: null | string;
};

export type ActionMessageV1 = {
  actionId: number;
  actionPageId: number;
  campaignId: number;
  action: {
    actionType: string;
    fields: { [key: string]: string };
    createdAt: string;
    testing: boolean;
  };
  contact: ContactV1;
  campaign: Campaign;
  actionPage: ActionPage;
  tracking: Tracking;
  privacy: {
    communication: boolean;
    givenAt: string;
  };
  schema: "proca:action:1";
  stage: ProcessStage;
};

export type ActionMessageV2 = {
  actionId: number;
  actionPageId: number;
  campaignId: number;
  orgId: number;
  org: Organisation;
  action: ActionV2;
  contact: ContactV2;
  personalInfo: PersonalInfo | null;
  campaign: Campaign;
  actionPage: ActionPage;
  tracking: Tracking;
  privacy: PrivacyV2;
  schema: "proca:action:2";
  stage: ProcessStage;
};

export type ActionMessage = ActionMessageV1 | ActionMessageV2;

export type EmailStatusEvent = {
  schema: 'proca:event:2';
  timestamp: string;
  eventType: 'email_status';
  action?: ActionV2;
  actionPage?: ActionPage;
  campaign?: Campaign;
  supporter: {
    contact: ContactV2;
    privacy: PrivacyV2;
  };
  tracking?: Tracking;
};

export type CampaignUpdatedEvent = {
  schema: 'proca:event:2';
  timestamp: string;
  eventType: 'campaign_updated';
  campaignId: number;
  orgId: number;
  campaign: {
    id: number;
    externalId: number;
    name: string;
    title: string;
    contactSchema: string;
    config: Record<string, any>;
    org: {
      name: string;
      title: string;
    };
  };
};

export type ConfirmCreatedEvent = {
  schema: 'proca:event:2';
  timestamp: string;
  eventType: 'confirm_created';
  confirm: {
    acceptLink: string;
    rejectLink: string;
    code: string;
    objectId: number;
    subjectId: number;
    operation: string;
    email: string;
    message: string;
    campaign: {
      name: string;
      title: string;
    };
    creator: {
      email: string;
      jobTitle: string | null;
    };
    org: {
      name: string;
      title: string;
      twitter?: {
        name: string;
        screenName: string;
        description: string;
        url: string;
        picture: string;
        followersCount: number;
      };
    };
  };
};

export type CampaignUpdatedEventMessage = CampaignUpdatedEvent;

export type Event = EmailStatusEvent | CampaignUpdatedEvent | ConfirmCreatedEvent;

export type EventMessageV2 = Event;

export type ConsumerOpts = {
  concurrency?: number;
  prefetch?: number;
  keyStore?: KeyStore;
  tag?: string;
  maxRetries?: number;
};

export type SyncCallback = (message: ActionMessage | Event) => Promise<boolean>;

export type Counters = {
  ack: number;
  nack: number;
  queued: number | undefined;
};

export const count: Counters;

export function connect(queueUrl: string): Connection;

export function listenConnection(fct: (connection: Connection) => void): void;

export function syncQueue(
  queueUrl: string,
  queueName: string,
  syncer: SyncCallback,
  opts?: ConsumerOpts
): Promise<{ close: () => Promise<void> }>;

export function pause(ms: number): Promise<void>;

export function actionMessageV1to2(a1: ActionMessageV1): ActionMessage;
