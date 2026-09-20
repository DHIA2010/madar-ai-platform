-- ZATCA Phase 2 (Integration Phase) device onboarding. One row per Electronic Generation
-- Solution (EGS) unit registered against ZATCA -- an organization may have more than one (e.g.
-- one per branch/register), each carrying its own signing key pair and its own strictly-
-- increasing ICV/PIH chain (see zatca-crypto.ts, zatca-devices-service.ts). Nullable
-- workspace_id: an org-wide device unless explicitly scoped to one branch.
create table if not exists zatca_devices (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  common_name text not null,
  -- The CSR itself (PEM) isn't secret -- it's the public request sent to ZATCA -- kept for
  -- reference/audit. The signing key pair is: private_key_encrypted never leaves this row.
  csr text not null,
  private_key_encrypted text not null,
  public_key_pem text not null,
  -- draft: CSR generated, nothing submitted yet.
  -- compliance: Compliance CSID obtained, can run Compliance Checks.
  -- production: Production CSID obtained, can report/clear real invoices.
  status text not null default 'draft'
    check (status in ('draft', 'compliance', 'production')),
  compliance_request_id text,
  compliance_csid_encrypted text,
  compliance_secret_encrypted text,
  production_csid_encrypted text,
  production_secret_encrypted text,
  -- The ZATCA-specific invoice chain counter/hash for THIS device -- distinct from
  -- pos_invoice_number_counters (this app's own display numbering, e.g. "INV-000001"). ICV must
  -- never be reused; PIH of the next invoice must equal this device's last invoice_hash.
  last_icv bigint not null default 0,
  last_invoice_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_zatca_devices_org on zatca_devices(organization_id);

-- Which device actually stamped this invoice -- lets a signed invoice be re-verified against the
-- exact device/key that signed it even if the organization later registers another device.
alter table pos_invoices add column if not exists zatca_device_id uuid references zatca_devices(id);

-- The full signed UBL XML (with the real QR embedded) -- stored verbatim rather than rebuilt on
-- demand at Reporting time, since any drift from what was actually hashed/signed at sale time
-- would silently invalidate the signature. NULL for an invoice with no production device at sale
-- time (the pre-existing Phase 1-only case).
alter table pos_invoices add column if not exists zatca_signed_xml text;
alter table pos_invoices add column if not exists zatca_uuid uuid;
alter table pos_invoices add column if not exists zatca_reported_at timestamptz;
