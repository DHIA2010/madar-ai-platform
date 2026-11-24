-- The prospect finder's own count of the searches it asked Google for, month by month (Google's
-- billing month, Pacific time). It feeds the "free searches left" bar on the page and stops the
-- team at the free allowance unless they choose to go on at Google's price.
create table if not exists crm_prospect_usage (
  month varchar(7) primary key,
  searches integer not null default 0,
  updated_at timestamptz not null default now()
);
