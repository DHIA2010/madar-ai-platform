-- The POS terminal moved inside madar.app itself: a cashier now authenticates with the same
-- account as everyone else (see the main `users`/`memberships` tables), not a separate employee
-- login. pos_roles/pos_employees/pos_employee_sessions (migration 032) backed that separate
-- login and have no other dependents (checked: no later migration references them), so they are
-- dropped outright rather than kept as dead tables. Session table first, then employees, then
-- roles, to respect the foreign keys migration 032 created.

drop table if exists pos_employee_sessions;
drop table if exists pos_employees;
drop table if exists pos_roles;
