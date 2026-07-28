# SECURITY_ARCHITECTURE

## Security Principles
- Least privilege by default.
- Tenant isolation everywhere.
- Defense in depth.
- Auditability for all privileged actions.

## Authentication
- Central auth service with short-lived access tokens and rotating refresh tokens.
- MFA for privileged roles.
- Session and device management with risk-based checks.

## Authorization (RBAC + Scopes)
- Role hierarchy at organization and workspace levels.
- Permission matrix for domain actions.
- Fine-grained scopes for integrations, billing, AI actions, and administration.

## Tenant and Workspace Isolation
- Mandatory organization_id scoping on all tenant resources.
- Workspace-level constraints where applicable.
- Policy enforcement in API layer plus DB-level safeguards.

## Secrets Management
- All secrets in managed secret store.
- Per-service scoped secret access.
- Rotation policies and expiration alerts.

## Encryption
- TLS everywhere in transit.
- Encryption at rest for DB, cache persistence, object storage, and backups.
- Field-level encryption for highly sensitive token/credential data.

## Audit Logging
- Immutable append-only audit events.
- Tracks actor, action, target, previous/new state, source IP/device, correlation_id.
- Retention and export policy for compliance and forensics.

## Compliance Posture (Target)
- SOC 2 readiness controls.
- GDPR-aligned data handling and deletion workflows.
- Regional data handling constraints configurable by tenant tier.

## Security Operations
- Centralized SIEM-compatible logs.
- Alerting on auth anomalies, privilege escalation, unusual token usage.
- Incident response runbook and severity matrix.

## Security Testing
- SAST and dependency scans in CI.
- DAST and penetration tests before major releases.
- Threat model review per major domain release.
