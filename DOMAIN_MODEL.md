# DOMAIN_MODEL

## Domain Discovery and Ownership

## 1. Authentication
Why it exists: secure user identity and session lifecycle.
Owner: Identity Platform Team.
Core entities: user_identity, credential, session, mfa_factor.

## 2. Organizations
Why it exists: tenancy root and billing boundary.
Owner: Core Platform Team.
Core entities: organization, organization_settings, organization_plan.

## 3. Workspaces and Projects
Why it exists: operational partitioning and collaboration scope.
Owner: Workspace Team.
Core entities: workspace, project, membership, role_assignment.

## 4. User Management and Teams
Why it exists: human access, teams, provisioning, lifecycle.
Owner: Identity Platform Team.
Core entities: user_profile, team, team_membership, invitation.

## 5. Administration and Settings
Why it exists: system controls, policy settings, governance.
Owner: Platform Operations Team.
Core entities: policy, configuration, admin_action.

## 6. Marketing and Campaigns
Why it exists: core business workflow for campaign planning and operations.
Owner: Marketing Domain Team.
Core entities: campaign, objective, audience, budget_plan, creative_reference.

## 7. Integrations
Why it exists: external platform connectivity and data synchronization.
Owner: Integrations Team.
Core entities: connector, connection, oauth_token, sync_job, webhook_subscription.

## 8. Analytics and Intelligence Data
Why it exists: normalized metrics and signals across channels.
Owner: Analytics Team.
Core entities: metric_series, attribution_event, source_performance, conversion_event.

## 9. Reporting and Dashboards
Why it exists: actionable decision outputs and executive visibility.
Owner: Reporting Team.
Core entities: dashboard_definition, report_definition, report_run, export_artifact.

## 10. AI and Agents
Why it exists: AI insights, assistant interactions, automation orchestration.
Owner: AI Platform Team.
Core entities: conversation, message, context_snapshot, agent_run, insight_artifact, token_usage.

## 11. Billing and Entitlements
Why it exists: monetization, plan control, usage governance.
Owner: Billing Team.
Core entities: subscription, invoice, payment_event, entitlement, usage_meter.

## 12. Notifications
Why it exists: user/system communication and delivery guarantees.
Owner: Notification Team.
Core entities: notification, delivery_attempt, preference, channel_binding.

## 13. Audit and Compliance
Why it exists: traceability, legal accountability, and security forensics.
Owner: Security and Compliance Team.
Core entities: audit_event, compliance_policy, retention_policy.

## Bounded Context Summary
Each domain is a bounded context with:
- Internal model autonomy.
- Public API contracts.
- Published domain events.
- ACL adapters for external dependencies.

## Bounded Context Matrix

## Authentication
- Responsibilities: identity proofing, session lifecycle, MFA, token issuance.
- Owned data: user_identity, credential, session, mfa_factor.
- Public APIs: login, refresh, logout, password reset, session revoke.
- Events: UserCreated, SessionStarted, SessionTerminated.
- Dependencies: Notification (verification), Audit.
- Anti-corruption layer: external IdP adapter (if federated login introduced).
- Shared contracts: user_id, actor_id, auth_context.

## Organizations
- Responsibilities: tenant lifecycle, org policies, plan binding.
- Owned data: organization, organization_settings, organization_plan.
- Public APIs: create org, update org settings, archive org.
- Events: OrganizationCreated, OrganizationUpdated.
- Dependencies: Billing, Audit.
- Anti-corruption layer: billing entitlement adapter.
- Shared contracts: organization_id, plan_tier.

## Workspaces and Projects
- Responsibilities: workspace structure, project scoping, membership mapping.
- Owned data: workspace, project, membership, role_assignment.
- Public APIs: create workspace/project, assign membership, transfer ownership.
- Events: WorkspaceCreated, MembershipAdded, MembershipRemoved.
- Dependencies: Auth, Organizations, Audit.
- Anti-corruption layer: none external; internal ACL for role translation.
- Shared contracts: workspace_id, organization_id, role.

## User Management and Teams
- Responsibilities: profile lifecycle, team grouping, invitations.
- Owned data: user_profile, team, team_membership, invitation.
- Public APIs: invite user, accept invite, create team, assign team.
- Events: UserInvited, UserActivated, TeamUpdated.
- Dependencies: Auth, Notifications, Audit.
- Anti-corruption layer: email provider abstraction.
- Shared contracts: user_id, invitation_id.

## Administration and Settings
- Responsibilities: admin controls, policy management, operational settings.
- Owned data: policy, configuration, admin_action.
- Public APIs: update policy, read admin configs, force session revoke.
- Events: PolicyChanged, AdminActionRecorded.
- Dependencies: Auth, Audit, Notifications.
- Anti-corruption layer: config provider adapter (if externalized).
- Shared contracts: actor_id, policy_id.

## Marketing and Campaigns
- Responsibilities: campaign definitions, lifecycle states, targeting metadata.
- Owned data: campaign, objective, audience, budget_plan, creative_reference.
- Public APIs: create/update/launch/pause/archive campaign.
- Events: CampaignCreated, CampaignLaunched, CampaignPaused, CampaignArchived.
- Dependencies: Integrations, Analytics, Reporting, Audit.
- Anti-corruption layer: integration canonical model adapter.
- Shared contracts: campaign_id, objective_type, channel.

## Integrations
- Responsibilities: connector auth, token refresh, sync jobs, webhook normalization.
- Owned data: connector, connection, oauth_token, sync_job, webhook_subscription.
- Public APIs: authorize connector, trigger sync, disconnect connector.
- Events: ConnectorAuthorized, ConnectorSyncCompleted, AdsImported, ConnectorSyncFailed.
- Dependencies: Notifications, Audit, Job Processing.
- Anti-corruption layer: provider adapters for each external platform.
- Shared contracts: connection_id, provider_name, sync_status.

## Analytics and Intelligence Data
- Responsibilities: metric ingestion, attribution updates, aggregate queries.
- Owned data: metric_series, attribution_event, source_performance, conversion_event.
- Public APIs: query metrics, query attribution, query trends.
- Events: MetricIngested, AttributionUpdated.
- Dependencies: Integrations, Reporting.
- Anti-corruption layer: metric normalization mapper.
- Shared contracts: metric_key, time_bucket, dimension_set.

## Reporting and Dashboards
- Responsibilities: dashboard definitions, report runs, exports.
- Owned data: dashboard_definition, report_definition, report_run, export_artifact.
- Public APIs: create report, run report, fetch report artifact.
- Events: ReportGenerationRequested, ReportGenerated, ReportGenerationFailed.
- Dependencies: Analytics, Campaigns, Notifications.
- Anti-corruption layer: template/renderer adapter.
- Shared contracts: report_id, report_run_id, artifact_uri.

## AI and Agents
- Responsibilities: assistant chat, insight generation, agent orchestration.
- Owned data: conversation, message, context_snapshot, agent_run, insight_artifact, token_usage.
- Public APIs: start conversation, submit prompt, run agent, fetch insights.
- Events: AIMessageReceived, AIInsightCompleted, AgentRunCompleted, TokenUsageRecorded.
- Dependencies: Reporting, Analytics, Integrations, Notifications.
- Anti-corruption layer: model provider abstraction.
- Shared contracts: conversation_id, agent_run_id, token_usage_record.

## Billing and Entitlements
- Responsibilities: subscription lifecycle, invoices, usage metering, entitlements.
- Owned data: subscription, invoice, payment_event, entitlement, usage_meter.
- Public APIs: change plan, fetch invoice, check entitlement.
- Events: SubscriptionChanged, InvoicePaid, EntitlementUpdated.
- Dependencies: Organizations, Notifications, Audit.
- Anti-corruption layer: payment gateway adapter.
- Shared contracts: subscription_id, entitlement_key.

## Notifications
- Responsibilities: multi-channel notification delivery and preferences.
- Owned data: notification, delivery_attempt, preference, channel_binding.
- Public APIs: enqueue notification, update preferences, query delivery status.
- Events: NotificationRequested, NotificationDelivered, NotificationFailed.
- Dependencies: all producer domains.
- Anti-corruption layer: channel adapters (email/webhook/push).
- Shared contracts: notification_id, channel_type.

## Audit and Compliance
- Responsibilities: immutable audit trail, retention policy, compliance evidence.
- Owned data: audit_event, compliance_policy, retention_policy.
- Public APIs: query audit trails, export compliance logs.
- Events: AuditEventRecorded.
- Dependencies: all producer domains.
- Anti-corruption layer: SIEM/export adapters.
- Shared contracts: correlation_id, causation_id, actor_id.

## Shared Contracts
Shared contracts allowed across contexts:
- Tenant identifiers: organization_id, workspace_id.
- Identity references: user_id, actor_id.
- Time and currency primitives.
- Event envelope standard.

Forbidden shared state:
- Direct table-level coupling across bounded contexts.
- Shared mutable models without owning context.
