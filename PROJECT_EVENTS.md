# Project Events

The Project Platform emits domain events through the existing outbox pattern.

Implemented event names:
- `ProjectCreated`
- `ProjectUpdated`
- `ProjectArchived`
- `ProjectDeleted`
- `ProjectRestored`
- `DataSourceCreated`
- `DataSourceUpdated`
- `DataSourceEnabled`
- `DataSourceDisabled`
- `DataSourceArchived`
- `DataSourceDeleted`

Events are shaped to match the existing platform event contract and can be published through the same infrastructure channel used by the foundation.
