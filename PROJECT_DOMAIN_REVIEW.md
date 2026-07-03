# Project Domain Review

## Scope
Sprint 5 introduces the Project Platform and the Data Source abstraction layer on top of the completed foundation and Organization Platform.

Projects are the primary business container inside an Organization. Every future connector, dashboard, report, and AI capability must belong to a Project.

## Current Baseline
- Organization Platform already provides organization lifecycle, membership lifecycle, invitations, RBAC, audit logs, events, observability, persistence, and API conventions.
- No Project aggregate exists yet.
- No Data Source aggregate or abstraction layer exists yet.
- No project-scoped permissions, invitations, or project-level isolation model exists yet.

## Target Domain Boundaries
- Project Aggregate:
  - Owns project identity, lifecycle, branding, metadata, settings, and business configuration.
  - Belongs to exactly one Organization.
  - May be scoped to one Workspace when the business needs workspace-level isolation, but the Organization remains the root ownership boundary.
  - Acts as the parent container for all future integrations and analytics surfaces.
- Data Source Aggregate:
  - Belongs to exactly one Project.
  - Stores source metadata only, not live connector credentials or sync logic.
  - Is future-OAuth-ready, but must not implement OAuth or external integration behavior now.
- Project Membership:
  - Projects have project-scoped members, roles, and inherited Organization authority.
  - Project access is derived from Organization membership and explicit project-level grants.

## Project Lifecycle
- Project states:
  - `active`
  - `archived`
  - `deleted`
- State transitions:
  - active -> archived
  - archived -> active
  - active -> deleted
  - archived -> deleted
- Terminal rule:
  - deleted is terminal for write operations.

## Ownership Model
- Every Project has an Organization owner boundary.
- A Project may optionally designate a project owner user inside the owning Organization.
- The owner must always be authorized to manage the Project.
- Ownership changes must preserve project accessibility and cannot create an orphaned project.

## Organization Relationship
- A Project belongs to one Organization and cannot move across Organizations after creation.
- Organization isolation is the primary hard boundary.
- Organization archival or deletion must make associated Projects read-only or terminal according to project status rules.

## Workspace Relationship
- A Project may reference a Workspace for default execution context or isolation.
- Workspace association is optional but immutable once the Project is in use, unless explicitly updated by a permitted workflow.
- A Project cannot reference a Workspace outside its Organization.

## Project Boundaries
- A Project is the top-level container for future connectors, dashboards, reports, and AI surfaces.
- A Project may contain multiple Data Sources.
- A Project may contain multiple project members and project-specific configuration entries.
- Project-level business logic must not depend on connector runtime behavior.

## State Transitions and Invariants
- Project name must be non-empty and bounded.
- Archived or deleted Projects cannot be used to create new Data Sources.
- Deleted Projects are immutable.
- Project branding, locale, timezone, currency, environment, and settings are validated inside the aggregate.
- Project metadata must be structured and safe for persistence.
- Project settings are extensible but bounded to primitive JSON-compatible values.
- Workspace and Organization references must belong to the same tenant hierarchy.

## Data Source Lifecycle
- Data Source states:
  - `draft`
  - `enabled`
  - `disabled`
  - `archived`
  - `deleted`
- State transitions:
  - draft -> enabled
  - enabled -> disabled
  - disabled -> enabled
  - enabled|disabled -> archived
  - archived -> deleted
- Deleted data sources are terminal for write operations.

## Data Source Types
Metadata-only support is required for:
- Google Ads
- Meta Ads
- TikTok Ads
- Snapchat Ads
- Google Analytics 4
- Shopify
- WooCommerce
- Salla
- Zid
- CSV Import
- REST API
- Webhook
- Manual Upload

## Data Source Rules and Invariants
- Data Source type must be one of the supported metadata-only source kinds.
- Data Source names must be non-empty and bounded.
- Data Source connection state and sync state are descriptive fields only.
- Health state must be derivable without connector execution.
- A disabled or archived Data Source cannot be re-enabled without an explicit enable workflow.
- Future OAuth readiness is represented as metadata only; no OAuth runtime behavior is implemented.

## Membership and Access Model
- Organization roles continue to exist and remain the source of inherited authority.
- Project-level roles are additional and should be compatible with the existing RBAC design.
- Project permissions must support least-privilege isolation for future team segmentation.
- Project invitations must not bypass Organization authorization.

## Integration Points
- Domain events are published through the existing outbox pattern.
- Audit logs capture Project and Data Source lifecycle changes.
- Feature flags can gate future rollout or experimental behaviors.
- Observability uses the existing metrics and structured logging abstractions.
- Persistence uses the same repository and migration conventions already used by the Identity and Organization platform.

## Implementation Safety Notes
- Do not change backend architecture.
- Do not refactor the foundation.
- Do not add external connector behavior, OAuth, schedulers, sync workers, dashboards, analytics, or AI.
- Keep the Project Domain ready for Sprint 6 connector attachment without changing the aggregate shape.
