-- "تحدث مع المبيعات" on madar.my: businesses asking Madar's sales team to contact them.
create table if not exists sales_leads (
  id uuid primary key,
  company_name varchar(160) not null,
  phone varchar(32) not null,
  email varchar(254),
  ip_address varchar(64),
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_sales_leads_created_at on sales_leads(created_at desc);
