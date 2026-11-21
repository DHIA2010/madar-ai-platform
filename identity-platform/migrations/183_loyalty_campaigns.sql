-- Internal campaigns (the Loyalty app): a message the business sends to a chosen group of its
-- members -- now or at a set time -- and what came of it. The first channel is the loyalty card
-- itself (a notification on the phone, kept in the card's list); WhatsApp and SMS are meant to
-- follow as further channels of the same campaign.
create table if not exists loyalty_campaigns (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  message text not null,
  -- card: the loyalty card's own notifications. Others come later.
  channel varchar(12) not null default 'card',
  -- Who it goes to: { kind, days?, minPoints?, memberIds? } (loyalty/campaigns.ts).
  audience jsonb not null default '{}'::jsonb,
  -- draft: saved, not sent. scheduled: waiting for its time. sending: being sent now.
  -- sent: done. cancelled: called off before it was sent.
  status varchar(12) not null default 'draft',
  scheduled_at timestamptz,
  sent_at timestamptz,
  -- How many days after sending a purchase still counts as the campaign's.
  track_days integer not null default 7,
  -- Counted once, when it is sent.
  recipients integer not null default 0,
  delivered integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_loyalty_campaigns_org on loyalty_campaigns(organization_id, created_at);
create index if not exists idx_loyalty_campaigns_due on loyalty_campaigns(status, scheduled_at);

-- Who a sent campaign went to. delivered: a phone took the notification (the message is kept on
-- the member's card either way).
create table if not exists loyalty_campaign_recipients (
  id uuid primary key,
  campaign_id uuid not null references loyalty_campaigns(id) on delete cascade,
  member_id uuid not null references loyalty_members(id) on delete cascade,
  delivered boolean not null default false
);
create index if not exists idx_loyalty_campaign_recipients_campaign
  on loyalty_campaign_recipients(campaign_id);
create index if not exists idx_loyalty_campaign_recipients_member
  on loyalty_campaign_recipients(member_id);

-- The campaign a kept notice belongs to, so "seen" can be counted per campaign.
alter table loyalty_notices add column if not exists campaign_id uuid;
create index if not exists idx_loyalty_notices_campaign on loyalty_notices(campaign_id);

-- What the customer paid on the sale or visit that earned the points, so a campaign can say
-- what its members spent afterwards. Empty for lines written before this.
alter table loyalty_ledger add column if not exists amount numeric(12, 2);
