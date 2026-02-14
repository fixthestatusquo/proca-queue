import {
  ContactV2,
  PrivacyV2,
  Campaign as CampaignFragment,
  ActionV2,
  ActionPage,
  Tracking,
} from './actionMessage';

type EventBase = {
  schema: 'proca:event:2';
  timestamp: string; // ISO8601
};

/* -------------------- */
/* email_status event   */
/* -------------------- */

export type EmailStatusEvent = EventBase & {
  eventType: 'email_status';
  action?: ActionV2;
  actionPage?: ActionPage;
  campaign?: CampaignFragment;
  supporter: {
    contact: ContactV2;
    privacy: PrivacyV2;
  };
  tracking?: Tracking;
};

/* -------------------- */
/* campaign_updated     */
/* -------------------- */

type Json = Record<string, any>;

type CampaignMessage = {
  id: number;
  externalId: number;
  name: string;
  title: string;
  contactSchema: string;
  config: Json;
  org: {
    name: string;
    title: string;
  };
};

export type CampaignUpdatedEvent = EventBase & {
  eventType: 'campaign_updated';
  campaignId: number;
  orgId: number;
  campaign: CampaignMessage;
};

/* -------------------- */
/* confirm_created      */
/* -------------------- */

export type ConfirmCreatedEvent = EventBase & {
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

/* -------------------- */
/* Event   */
/* -------------------- */

export type Event =
  | EmailStatusEvent
  | CampaignUpdatedEvent
  | ConfirmCreatedEvent;
