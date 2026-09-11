-- pos_device_settings (migration 048) was a branch-wide config screen kept separate from the
-- pos_devices registry (migration 049) it predates. Nothing outside that one screen ever read or
-- wrote it -- new devices get their per-unit defaults from code (DEFAULT_DEVICE_SCALE_SETTINGS /
-- DEFAULT_DEVICE_PRINTER_SETTINGS), never from this table -- and the "+ إضافة" button that used
-- to open it now opens the real add-device page instead. No other dependents (checked: no later
-- migration references it), so it is dropped outright rather than kept as a dead table.

drop table if exists pos_device_settings;
