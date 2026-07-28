# TEAM_EXECUTION_GUIDE

## Recommended Team Topology

Core team (minimum):
- 1 Principal Engineer / Architect
- 1 Engineering Manager
- 1 Technical Program Manager
- 2 Product Managers (Core + AI/Integrations)
- 2 Staff/Senior Backend Engineers (Platform)
- 3-4 Senior Backend Engineers (Domain squads)
- 2 Integration Engineers
- 2 AI/ML Engineers
- 2 Frontend Engineers (contract integration and UX flow wiring once backend begins)
- 2 QA/SDET Engineers
- 1 DevOps/SRE Engineer
- 1 Security Engineer (shared, part-time minimum)

Recommended steady-state delivery capacity: 14-18 engineers.

## Squad Model
- Squad A (Platform): Auth, Org, Workspace, RBAC, Audit.
- Squad B (Core Product): Campaigns, Analytics, Reports.
- Squad C (Integrations): Connector framework + provider adapters.
- Squad D (AI): Assistant, agents, model gateway.
- Enabling team: SRE/DevEx/Security/QA shared.

## Ceremonies
- Sprint planning: bi-weekly.
- Architecture review board: weekly.
- Risk review: bi-weekly.
- Incident and reliability review: weekly.

## Definition of Ready (Required)
- Story has acceptance criteria, API contracts, event impact, DB impact.
- Security and observability criteria are explicitly listed.
- Test strategy defined before implementation starts.

## Definition of Done (Required)
- Unit/integration/contract tests pass.
- Observability metrics/traces/logs added.
- Security controls implemented and verified.
- Documentation and runbook updates completed.
- No unresolved critical/high defects for delivered scope.

## Execution KPIs
- Lead time for change.
- Deployment frequency.
- Change failure rate.
- Mean time to recover.
- Queue lag and sync freshness.
- AI latency, quality proxy, and token cost per tenant.

## Governance Rules
- No cross-domain coupling without ADR.
- No API changes without contract versioning impact review.
- No event schema changes without compatibility review and migration path.
