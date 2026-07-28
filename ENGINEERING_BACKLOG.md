# ENGINEERING_BACKLOG

## Structure
Each item is story-linked and decomposed into execution tracks.

## Story Example A: Invite Workspace Members
Story: As a workspace owner, I want to invite members so my team can collaborate.

Acceptance criteria:
- Owner/admin can issue one or multiple invitations.
- Invitee receives secure link with expiration.
- Invitation acceptance binds workspace role.
- Action is audit logged.

Business rules:
- Only authorized roles can invite.
- Duplicate active invitation for same email/workspace is prevented.
- Invitation expires after configured TTL.

Edge cases:
- Existing member invited again.
- Expired invitation acceptance attempt.
- Workspace archived while invite pending.

Validation rules:
- Email format valid.
- Role in allowed role set.
- Workspace belongs to actor organization.

Dependencies:
- Auth, RBAC, Notifications, Audit.

Tasks:
- Backend: invitation command handler contract, invitation token strategy, role binding policy.
- Frontend: API contract integration planning, success/error state mapping.
- Database: invitation table spec, unique constraints, TTL fields.
- Infrastructure: email provider integration plan, secrets references.
- Testing: unit (invitation rules), integration (invite -> accept flow), contract tests.
- Documentation: admin/invite runbook and API spec entries.
- Observability: invite_sent, invite_accepted metrics + failure counters.
- Security: anti-enumeration response policy, signed token verification, audit events.

## Story Example B: Connector OAuth Authorization
Story: As a marketer, I want to connect Google Ads so MADAR can sync campaign metrics.

Acceptance criteria:
- OAuth connect/disconnect flow works.
- Refresh token stored encrypted.
- Connection health visible.
- Initial sync queued.

Business rules:
- One connector account can map to one workspace connection unless multi-account feature enabled.
- Re-auth required state must block sync attempts.

Edge cases:
- OAuth callback replay.
- Revoked provider consent.
- Token refresh temporary failure.

Tasks:
- Backend: auth adapter contract, token vault interface, sync job enqueue.
- Frontend: connector status contract mapping, auth redirect handling plan.
- Database: connection, token metadata, sync_job rows.
- Infrastructure: webhook endpoint and callback route ownership plan.
- Testing: OAuth callback contract test, token refresh retry tests.
- Documentation: connector setup guide, incident troubleshooting guide.
- Observability: auth_success, auth_failure, refresh_failure metrics.
- Security: encrypted token storage, scope validation, callback CSRF state checks.

## Story Example C: AI Insight Request
Story: As a marketer, I want AI-generated performance insights so I can optimize campaigns.

Acceptance criteria:
- Prompt accepted with scoped context.
- Streaming response available.
- Token usage tracked and attributed.
- Output stored in conversation history.

Business rules:
- Insight must only use tenant-scoped data.
- Output must pass safety guardrails.

Edge cases:
- Provider timeout.
- Tool call partial failures.
- Token quota exceeded.

Tasks:
- Backend: model gateway interface, context builder, streaming protocol contract.
- Frontend: stream event consumption contract and error state handling plan.
- Database: conversation/message/token_usage schema definitions.
- Infrastructure: queue path for async agent fallback.
- Testing: prompt pipeline tests, provider abstraction contract tests.
- Documentation: AI usage policy and operator playbook.
- Observability: response latency, token consumption, failure classes.
- Security: prompt injection defenses, redaction policies, audit trace.

## Cross-Cutting Engineering Backlog
- Domain boundary linting and architectural tests.
- Event schema registry and compatibility checks.
- API versioning policy and deprecation lifecycle.
- RBAC matrix enforcement tests.
- SLO definition and alert thresholds.
