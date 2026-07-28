# Project Database

The Sprint 5 schema adds four core tables:
- `projects`
- `project_members`
- `project_invitations`
- `data_sources`

The schema includes:
- Primary keys and foreign keys back to Organizations, Workspaces, and Users
- Status constraints for lifecycle states
- JSONB columns for metadata and extensible settings
- Indexes for organization, workspace, project, status, and source type lookups

The project migration is designed to stay compatible with the existing semicolon-splitting migration runner.
