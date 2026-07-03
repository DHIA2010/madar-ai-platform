# Project Security

Security requirements enforced by the current implementation:
- Project access is organization-scoped.
- Project creation and lifecycle operations require owner/admin-level authority in the service layer.
- Data Sources cannot be created on deleted projects.
- Deleted Projects and Data Sources are terminal for write operations.
- REST input is schema-validated before command execution.

Remaining security work is mostly around dependency remediation and stronger API-level authorization integration once the module is wired into the full application stack.
