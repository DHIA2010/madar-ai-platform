alter table snapchat_oauth_connections
  drop constraint if exists snapchat_oauth_connections_status_check;

alter table snapchat_oauth_connections
  add constraint snapchat_oauth_connections_status_check
  check (status in ('pending', 'connected', 'paused', 'disconnected', 'error'));
