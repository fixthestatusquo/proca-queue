import {ContactV2, PrivacyV2, Campaign as CampaignFragment, ActionV2, ActionPage, Tracking} from './actionMessage'

export type EmailStatusEvent = {
  eventType: 'email_status';
  action?: ActionV2;
  actionPage?: ActionPage;
  campaign?: CampaignFragment;
  supporter: {
    contact: ContactV2;
    privacy: PrivacyV2;
  },
  tracking?: Tracking;
}

export type EventMessageV2 = {
  schema: 'proca:event:2',
  timestamp: string,
} & EmailStatusEvent


type Json = Record<string, any>;

type CampaignMessage = {
  config: Json; // JSON object with arbitrary structure
  contactSchema: string; // e.g., "basic"
  externalId: number;
  id: number;
  name: string;
  org: {
    name: string;
    title: string;
  };
  title: string;
};

export type CampaignUpdatedEventMessage = {
  campaign: CampaignMessage;
  campaignId: number;
  eventType: string; // e.g., "campaign_updated"
  orgId: number;
  schema: string; // e.g., "proca:event:2"
  timestamp: string; // ISO8601 format
};