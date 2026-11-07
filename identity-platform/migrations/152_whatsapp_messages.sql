-- Every WhatsApp message Madar sends (today: POS invoices as PDF), with its delivery status --
-- updated from Meta's webhook (sent -> delivered -> read, or failed). organization_id is the
-- merchant it was sent for; reference_id the document (e.g. the POS invoice).
create table if not exists whatsapp_messages (
  id uuid primary key,
  organization_id uuid references organizations(id) on delete cascade,
  kind text not null,
  reference_id uuid,
  to_phone text not null,
  template_name text not null,
  wa_message_id text,
  status text not null,
  error text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_whatsapp_messages_reference on whatsapp_messages(organization_id, kind, reference_id);
create index if not exists idx_whatsapp_messages_wa_id on whatsapp_messages(wa_message_id);
create index if not exists idx_whatsapp_messages_org_created on whatsapp_messages(organization_id, created_at desc);
