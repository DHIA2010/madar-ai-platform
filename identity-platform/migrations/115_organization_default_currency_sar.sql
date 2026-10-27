-- New organizations default to SAR (Saudi riyal) instead of USD -- matches OrganizationEntity.create's
-- own default. Only the column default changes; existing organizations keep whatever currency
-- they already have.
alter table organizations alter column currency set default 'SAR';
