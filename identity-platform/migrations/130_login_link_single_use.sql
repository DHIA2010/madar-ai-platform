-- A sign-in link can be single-use (the one "Continue with Google" hands the browser), unlike the
-- welcome email's reusable link.
alter table account_login_links add column if not exists single_use boolean not null default false;
