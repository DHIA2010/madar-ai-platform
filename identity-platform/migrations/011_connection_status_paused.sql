alter table google_oauth_connections
  drop constraint if exists google_oauth_connections_status_check;

alter table google_oauth_connections
  add constraint google_oauth_connections_status_check
  check (status in ('pending', 'connected', 'paused', 'disconnected', 'error'));

alter table integration_connections
  drop constraint if exists integration_connections_status_check;

alter table integration_connections
  add constraint integration_connections_status_check
  check (status in ('pending', 'connected', 'paused', 'disconnected', 'error'));
