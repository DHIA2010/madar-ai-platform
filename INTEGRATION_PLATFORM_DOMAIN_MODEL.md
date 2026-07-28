# INTEGRATION_PLATFORM_DOMAIN_MODEL

## Purpose

This document is the canonical domain specification for MADAR’s integration platform.

It defines the business boundaries that all future implementation must respect. It is intentionally implementation-free.

## Core Domain Thesis

MADAR is not a collection of provider integrations.
MADAR is an enterprise integration platform with marketing intelligence as its primary product orientation.

The platform must be designed around:

- tenant ownership
- connector agnosticism
- workflow versioning
- durable execution
- auditable state transitions
- minimal coupling between business domain and execution mechanics

Google Ads is the first reference connector, but it must not shape the domain in a special way.

## Domain Principles

1. Every aggregate belongs to exactly one tenant scope: organization, workspace, and usually project.
2. Execution is not ownership. n8n may execute workflows, but it may not own domain entities.
3. Connectors are plugins. Business logic never branches on provider identity except at the connector boundary.
4. Workflow definitions are versioned and immutable once published.
5. Credentials are secrets, not metadata.
6. Auditability is a first-class domain concern, not a logging side effect.
7. Platform state must remain valid even when execution engines are unavailable.

## Context Map

The platform is composed of the following bounded contexts:

- Identity
- Organizations
- Workspaces
- Projects
- Integrations
- Connections
- OAuth
- Credentials
- Connector Registry
- Workflow Registry
- Workflow Runtime
- Jobs
- Sync
- Events
- Notifications
- AI
- Analytics
- Billing
- Audit
- Administration
- Feature Flags
- Plugin Marketplace
- Developer SDK

## Bounded Context Definitions

### 1. Identity

#### Responsibilities

- Authenticate users
- Manage sessions
- Manage profiles
- Manage password and email lifecycle
- Resolve actors
- Provide security claims to all other contexts

#### Aggregate Roots

- User
- Session
- PasswordCredential
- EmailVerificationToken
- PasswordResetToken

#### Entities

- UserProfile
- UserPreference
- SessionDevice
- SessionRefreshToken

#### Value Objects

- EmailAddress
- PasswordHash
- UserId
- SessionId
- AuthenticationMethod

#### Domain Services

- AuthenticationPolicy
- SessionIssuer
- CredentialStrengthPolicy

#### Events

- UserRegistered
- UserLoggedIn
- UserLoggedOut
- SessionCreated
- SessionRevoked
- PasswordChanged
- EmailVerified
- UserSuspended

#### Repositories

- UserRepository
- SessionRepository
- PasswordCredentialRepository
- VerificationTokenRepository

#### Policies

- Strong password requirement
- MFA-ready policy support
- Session expiry policy
- Device/session revocation policy

#### Commands

- RegisterUser
- AuthenticateUser
- RefreshSession
- RevokeSession
- ChangePassword
- VerifyEmail
- RequestPasswordReset
- ResetPassword

#### Queries

- GetCurrentUser
- GetSession
- ListUserSessions
- GetProfile

---

### 2. Organizations

#### Responsibilities

- Own enterprise tenant boundary
- Manage membership and roles
- Define organization-level configuration
- Control tenant-wide access policies

#### Aggregate Roots

- Organization
- OrganizationMembership
- OrganizationInvitation

#### Entities

- OrganizationSettings
- OrganizationBranding
- OrganizationQuota

#### Value Objects

- OrganizationId
- OrganizationName
- Role
- InvitationToken

#### Domain Services

- MembershipPolicy
- InvitationPolicy
- QuotaPolicy

#### Events

- OrganizationCreated
- OrganizationUpdated
- OrganizationArchived
- MemberInvited
- MemberJoined
- MemberRemoved
- MemberRoleChanged

#### Repositories

- OrganizationRepository
- MembershipRepository
- InvitationRepository

#### Policies

- Tenant membership required for tenant-scoped access
- Organization owner must exist
- Invitation expiration policy

#### Commands

- CreateOrganization
- UpdateOrganization
- ArchiveOrganization
- InviteMember
- AcceptInvitation
- RemoveMember
- ChangeMemberRole

#### Queries

- GetOrganization
- ListOrganizations
- ListOrganizationMembers
- ListOrganizationInvitations

---

### 3. Workspaces

#### Responsibilities

- Partition work within organizations
- Scope integrations, projects, and execution
- Enforce workspace-level isolation

#### Aggregate Roots

- Workspace
- WorkspaceMembership

#### Entities

- WorkspaceSettings
- WorkspaceEnvironment

#### Value Objects

- WorkspaceId
- WorkspaceName
- WorkspaceSlug

#### Domain Services

- WorkspaceAccessPolicy
- WorkspaceLifecyclePolicy

#### Events

- WorkspaceCreated
- WorkspaceUpdated
- WorkspaceArchived
- WorkspaceMemberAdded
- WorkspaceMemberRemoved

#### Repositories

- WorkspaceRepository
- WorkspaceMembershipRepository

#### Policies

- Workspace must belong to one organization
- Workspace access inherits from organization membership unless overridden

#### Commands

- CreateWorkspace
- UpdateWorkspace
- ArchiveWorkspace
- AddWorkspaceMember
- RemoveWorkspaceMember

#### Queries

- GetWorkspace
- ListWorkspaces
- ListWorkspaceMembers

---

### 4. Projects

#### Responsibilities

- Own product or client-specific operational scope
- Anchor integrations and data pipelines to a business domain boundary

#### Aggregate Roots

- Project
- ProjectEnvironment

#### Entities

- ProjectSettings
- ProjectMembership

#### Value Objects

- ProjectId
- ProjectName
- ProjectType

#### Domain Services

- ProjectLifecyclePolicy
- ProjectAccessPolicy

#### Events

- ProjectCreated
- ProjectUpdated
- ProjectArchived
- ProjectEnvironmentChanged

#### Repositories

- ProjectRepository

#### Policies

- Every connection must reference an owning project or an explicit platform-scope project

#### Commands

- CreateProject
- UpdateProject
- ArchiveProject

#### Queries

- GetProject
- ListProjects

---

### 5. Integrations

#### Responsibilities

- Represent the platform surface for all connector-based capabilities
- Manage connector definitions, capabilities, and supported operations
- Provide a generic lifecycle across all connectors

#### Aggregate Roots

- ConnectorDefinition
- IntegrationCapabilitySet

#### Entities

- ConnectorCapability
- ConnectorVersion
- ConnectorCategory

#### Value Objects

- ConnectorId
- ConnectorKey
- ConnectorDisplayName
- ConnectorCapabilityKey

#### Domain Services

- ConnectorCatalogPolicy
- CapabilityDiscoveryPolicy
- ConnectorCompatibilityPolicy

#### Events

- ConnectorRegistered
- ConnectorVersionPublished
- ConnectorCapabilityEnabled
- ConnectorCapabilityDisabled
- ConnectorRetired

#### Repositories

- ConnectorRegistryRepository
- ConnectorVersionRepository

#### Policies

- Connector names must be globally unique by connector key
- Versioned connector definitions are immutable after publication

#### Commands

- RegisterConnector
- PublishConnectorVersion
- RetireConnector
- EnableConnectorCapability
- DisableConnectorCapability

#### Queries

- ListConnectors
- GetConnector
- GetConnectorCapabilities

---

### 6. Connections

#### Responsibilities

- Own tenant-specific connection instances
- Track lifecycle state for a connector instance
- Link metadata, credentials, OAuth sessions, and workflow state

#### Aggregate Roots

- Connection

#### Entities

- ConnectionConfiguration
- ConnectionCredentialReference
- ConnectionStateHistory
- ConnectionHealthSnapshot

#### Value Objects

- ConnectionId
- ConnectionStatus
- ConnectionMetadata
- ConnectionReference
- ExternalAccountReference

#### Domain Services

- ConnectionLifecyclePolicy
- ConnectionReadinessPolicy
- ConnectionHealthPolicy

#### Events

- ConnectionCreated
- ConnectionConfigured
- ConnectionAuthorized
- ConnectionValidated
- ConnectionConnected
- ConnectionPaused
- ConnectionResumed
- ConnectionDisconnected
- ConnectionDeleted
- ConnectionDegraded

#### Repositories

- ConnectionRepository
- ConnectionHistoryRepository

#### Policies

- A connection must always belong to one organization, workspace, and project.
- A connection cannot sync unless it is authorized and active.
- Connection health is derived from credentials, workflow runs, and provider connectivity.

#### Commands

- CreateConnection
- ConfigureConnection
- AuthorizeConnection
- ValidateConnection
- ConnectConnection
- PauseConnection
- ResumeConnection
- DisconnectConnection
- DeleteConnection

#### Queries

- GetConnections
- GetConnection
- GetConnectionHealth
- GetConnectionHistory

---

### 7. OAuth

#### Responsibilities

- Manage authorization flows with providers
- Track session state and callback validation
- Exchange codes for tokens
- Handle token refresh and revocation semantics

#### Aggregate Roots

- OAuthSession
- OAuthTokenGrant

#### Entities

- AuthorizationRequest
- AuthorizationCallback
- TokenExchangeResult

#### Value Objects

- OAuthState
- AuthorizationCode
- RedirectUri
- ScopeSet

#### Domain Services

- OAuthSessionService
- OAuthCallbackValidationService
- OAuthTokenExchangeService
- OAuthTokenRefreshPolicy

#### Events

- OAuthAuthorizationStarted
- OAuthAuthorizationCompleted
- OAuthAuthorizationFailed
- OAuthTokenIssued
- OAuthTokenRefreshed
- OAuthTokenRevoked

#### Repositories

- OAuthSessionRepository
- OAuthTokenRepository

#### Policies

- State tokens must be single-use
- Tokens must be encrypted before persistence
- Scopes must be validated before connection activation

#### Commands

- StartOAuthAuthorization
- CompleteOAuthAuthorization
- RefreshOAuthToken
- RevokeOAuthToken

#### Queries

- GetOAuthSession
- GetOAuthTokenGrant

---

### 8. Credentials

#### Responsibilities

- Own encrypted secret material
- Version credentials
- Track credential rotation and revocation
- Provide secure retrieval by authorized platform services

#### Aggregate Roots

- Credential
- SecretEnvelope

#### Entities

- CredentialVersion
- CredentialRotationRecord

#### Value Objects

- CredentialId
- SecretCiphertext
- SecretVersion
- CredentialType

#### Domain Services

- SecretEncryptionPolicy
- CredentialRotationPolicy
- SecretAccessPolicy

#### Events

- CredentialStored
- CredentialRotated
- CredentialRevoked
- CredentialAccessed

#### Repositories

- CredentialRepository
- SecretVaultRepository

#### Policies

- Secrets never leave the platform in plaintext outside secure execution boundaries.
- Rotation should not break live connections without explicit policy.

#### Commands

- StoreCredential
- RotateCredential
- RevokeCredential

#### Queries

- GetCredential
- GetCredentialVersions

---

### 9. Connector Registry

#### Responsibilities

- Register available connectors and their versions
- Describe capabilities and supported lifecycle operations
- Expose connector metadata to product, admin, and SDK surfaces

#### Aggregate Roots

- ConnectorRegistryEntry

#### Entities

- ConnectorCapabilityDescriptor
- ConnectorTemplate
- ConnectorArtifactReference

#### Value Objects

- ConnectorDefinitionId
- ConnectorVersionId
- CapabilityKey

#### Domain Services

- RegistryConsistencyPolicy
- CompatibilityMatrixService

#### Events

- ConnectorTemplateRegistered
- ConnectorTemplatePublished
- ConnectorTemplateDeprecated

#### Repositories

- ConnectorRegistryRepository

#### Policies

- Registry definitions are authoritative and versioned.
- A connector can have multiple workflow versions but one canonical definition.

#### Commands

- RegisterConnectorDefinition
- PublishConnectorTemplate
- DeprecateConnectorTemplate

#### Queries

- ListRegisteredConnectors
- GetConnectorDefinition

---

### 10. Workflow Registry

#### Responsibilities

- Define workflow types per connector
- Version workflow contracts
- Publish and retire workflow definitions

#### Aggregate Roots

- WorkflowDefinition
- WorkflowVersion

#### Entities

- WorkflowStepDefinition
- WorkflowTriggerDefinition
- WorkflowParameterSchema

#### Value Objects

- WorkflowDefinitionId
- WorkflowVersionId
- WorkflowType
- WorkflowContract

#### Domain Services

- WorkflowVersioningPolicy
- WorkflowCompatibilityPolicy

#### Events

- WorkflowDefined
- WorkflowVersionPublished
- WorkflowVersionRetired
- WorkflowContractChanged

#### Repositories

- WorkflowDefinitionRepository
- WorkflowVersionRepository

#### Policies

- Published workflow versions are immutable.
- Backward-compatible versions may coexist for a connector.

#### Commands

- DefineWorkflow
- PublishWorkflowVersion
- RetireWorkflowVersion

#### Queries

- ListWorkflows
- GetWorkflowDefinition
- GetWorkflowVersion

---

### 11. Workflow Runtime

#### Responsibilities

- Manage runtime execution state of versioned workflows
- Persist checkpoints and execution progress
- Coordinate with n8n as the execution engine

#### Aggregate Roots

- WorkflowRun
- WorkflowCheckpoint

#### Entities

- ExecutionAttempt
- ExecutionStep
- RuntimeCorrelation

#### Value Objects

- WorkflowRunId
- ExecutionId
- WorkflowStepId
- CheckpointCursor

#### Domain Services

- ExecutionStateMachine
- CheckpointMergePolicy
- RuntimeRetryPolicy

#### Events

- WorkflowRunRequested
- WorkflowRunDispatched
- WorkflowRunStarted
- WorkflowRunProgressed
- WorkflowRunPaused
- WorkflowRunCompleted
- WorkflowRunFailed
- WorkflowRunCanceled

#### Repositories

- WorkflowRunRepository
- WorkflowCheckpointRepository

#### Policies

- Runs are immutable except for progress and status transitions.
- A workflow run must always be traceable to a workflow version.

#### Commands

- RequestWorkflowRun
- StartWorkflowRun
- RecordWorkflowProgress
- CompleteWorkflowRun
- FailWorkflowRun
- CancelWorkflowRun

#### Queries

- GetWorkflowRuns
- GetWorkflowRun
- GetWorkflowCheckpoint

---

### 12. Jobs

#### Responsibilities

- Represent asynchronous work units independent of provider behavior
- Manage job scheduling, state transitions, retries, and dead-lettering

#### Aggregate Roots

- Job

#### Entities

- JobAttempt
- JobSchedule
- JobLease

#### Value Objects

- JobId
- JobType
- JobPriority
- JobLeaseId

#### Domain Services

- JobQueuePolicy
- LeasePolicy
- RetryBackoffPolicy

#### Events

- JobQueued
- JobStarted
- JobProgressed
- JobCompleted
- JobFailed
- JobDeadLettered

#### Repositories

- JobRepository
- JobLeaseRepository

#### Policies

- Jobs must be idempotent.
- Jobs must be recoverable after lease expiration.

#### Commands

- QueueJob
- StartJob
- CompleteJob
- FailJob
- RetryJob
- DeadLetterJob

#### Queries

- GetJobs
- GetJob
- GetJobAttempts

---

### 13. Sync

#### Responsibilities

- Own data synchronization semantics
- Model initial sync, incremental sync, backfill, and resync
- Persist sync history and checkpoints

#### Aggregate Roots

- SyncPlan
- SyncJob
- SyncRun
- SyncCheckpoint

#### Entities

- SyncPolicy
- SyncCursor
- SyncWindow

#### Value Objects

- SyncMode
- SyncInterval
- SyncStatus
- SyncWindowRange

#### Domain Services

- SyncPlanningService
- SyncStateResolver
- SyncFreshnessPolicy

#### Events

- SyncStarted
- SyncScheduled
- SyncCompleted
- SyncFailed
- SyncPaused
- SyncResumed
- SyncRetried

#### Repositories

- SyncJobRepository
- SyncRunRepository
- SyncCheckpointRepository

#### Policies

- Syncs must be tenant-scoped.
- Incremental sync must be resumable.
- Historical backfills must be versioned and traceable.

#### Commands

- RunSync
- ScheduleSync
- RetrySync
- PauseSync
- ResumeSync
- BackfillSync

#### Queries

- GetSyncHistory
- GetLatestSync
- GetSyncCheckpoint

---

### 14. Events

#### Responsibilities

- Define platform-wide eventing semantics
- Normalize event envelopes and metadata
- Feed outbox, analytics, audit, notifications, and observability

#### Aggregate Roots

- IntegrationEventStream
- EventEnvelope

#### Entities

- OutboxRecord
- EventSubscription
- EventDeliveryAttempt

#### Value Objects

- EventId
- EventType
- CausationId
- CorrelationId

#### Domain Services

- EventRoutingPolicy
- EventNormalizationService
- EventDeduplicationPolicy

#### Events

- DomainEventPublished
- IntegrationEventStored
- EventDelivered
- EventDeliveryFailed

#### Repositories

- OutboxRepository
- EventStreamRepository
- EventDeliveryRepository

#### Policies

- Events are immutable.
- Events must contain tenant scope.

#### Commands

- PublishEvent
- DeliverEvent
- RetryEventDelivery

#### Queries

- GetEvents
- GetEventStream

---

### 15. Notifications

#### Responsibilities

- Deliver operational, product, and customer notifications
- Route alerts from jobs, workflows, health, and billing

#### Aggregate Roots

- NotificationRule
- NotificationDelivery

#### Entities

- NotificationChannel
- NotificationTemplate

#### Value Objects

- NotificationId
- ChannelType
- Recipient

#### Domain Services

- NotificationRoutingService
- NotificationPolicy

#### Events

- NotificationRequested
- NotificationSent
- NotificationFailed

#### Repositories

- NotificationRepository
- NotificationRuleRepository

#### Policies

- Notifications must respect tenant and role visibility.

#### Commands

- ConfigureNotificationRule
- SendNotification

#### Queries

- GetNotifications
- GetNotificationRules

---

### 16. AI

#### Responsibilities

- Orchestrate AI tasks inside MADAR
- Consume integration data and produce insights, recommendations, and automations

#### Aggregate Roots

- AIWorkflow
- AIJob

#### Entities

- PromptTemplate
- ModelInvocation
- AIInsight

#### Value Objects

- ModelProvider
- ModelName
- PromptId

#### Domain Services

- AIOrchestrationService
- PromptGovernanceService

#### Events

- AIJobRequested
- AIJobStarted
- AIJobCompleted
- AIJobFailed

#### Repositories

- AIJobRepository
- PromptTemplateRepository

#### Policies

- AI may use integration data, but it must never mutate core platform state without explicit commands.

#### Commands

- RequestAIJob
- PublishPromptTemplate

#### Queries

- GetAIJobs
- GetAIInsights

---

### 17. Analytics

#### Responsibilities

- Provide platform analytics, connector analytics, and product insights
- Expose dashboards, health trends, and revenue impact

#### Aggregate Roots

- AnalyticsReport
- MetricDefinition

#### Entities

- MetricSeries
- Dimension
- DashboardWidget

#### Value Objects

- MetricKey
- DimensionKey
- DateRange

#### Domain Services

- MetricAggregationService
- InsightGenerationService

#### Events

- MetricRecorded
- ReportGenerated

#### Repositories

- AnalyticsRepository
- MetricRepository

#### Policies

- Analytics is read-optimized and derived from platform events and workflow runs.

#### Commands

- GenerateReport
- RecordMetric

#### Queries

- GetMetrics
- GetReports
- GetDashboardSummary

---

### 18. Billing

#### Responsibilities

- Own subscription and plan entitlements
- Track connector usage and tenant limits
- Measure billable activity

#### Aggregate Roots

- Subscription
- Plan
- UsageRecord

#### Entities

- Entitlement
- BillingAccount
- Invoice

#### Value Objects

- PlanId
- BillingPeriod
- UsageQuantity

#### Domain Services

- EntitlementPolicy
- UsageMeteringService

#### Events

- SubscriptionCreated
- SubscriptionUpgraded
- UsageRecorded
- InvoiceIssued
- PaymentFailed

#### Repositories

- BillingRepository
- UsageRepository

#### Policies

- Billing must never be inferred from provider sync mechanics alone.
- Entitlements gate connector availability and workflow limits.

#### Commands

- CreateSubscription
- ChangeSubscription
- RecordUsage

#### Queries

- GetSubscription
- GetUsage
- GetInvoiceHistory

---

### 19. Audit

#### Responsibilities

- Track immutable business audit records
- Support compliance, forensics, and tenant transparency

#### Aggregate Roots

- AuditRecord

#### Entities

- AuditActor
- AuditSubject
- AuditContext

#### Value Objects

- AuditId
- AuditAction
- SubjectType

#### Domain Services

- AuditNormalizationService
- ComplianceRetentionPolicy

#### Events

- AuditRecorded
- AuditExportRequested

#### Repositories

- AuditRepository

#### Policies

- Audit records are append-only.
- Sensitive payloads must be redacted or encrypted where required.

#### Commands

- RecordAuditEntry
- ExportAuditLog

#### Queries

- GetAuditLog
- GetAuditRecord

---

### 20. Administration

#### Responsibilities

- System-level management
- Platform configuration
- Operability and support tooling

#### Aggregate Roots

- AdminAction
- PlatformConfiguration

#### Entities

- SupportCaseLink
- OperationalOverride

#### Value Objects

- AdminActionId
- ConfigurationKey

#### Domain Services

- OperationalSafetyPolicy
- AdminOverridePolicy

#### Events

- AdminActionExecuted
- PlatformConfigurationChanged

#### Repositories

- AdminRepository
- PlatformConfigurationRepository

#### Policies

- Administrative overrides must be auditable and time-bound.

#### Commands

- UpdatePlatformConfiguration
- ExecuteAdminAction

#### Queries

- GetPlatformConfiguration
- GetAdminActions

---

### 21. Feature Flags

#### Responsibilities

- Control gradual rollout and connector gating
- Support tenant, workspace, and environment targeting

#### Aggregate Roots

- FeatureFlag
- FeatureFlagRule

#### Entities

- FlagAudience
- FlagVariant

#### Value Objects

- FlagKey
- AudienceScope

#### Domain Services

- FlagEvaluationService
- RolloutPolicy

#### Events

- FeatureFlagCreated
- FeatureFlagUpdated
- FeatureFlagEnabled
- FeatureFlagDisabled

#### Repositories

- FeatureFlagRepository

#### Policies

- Flags must be evaluated deterministically.

#### Commands

- CreateFeatureFlag
- UpdateFeatureFlag
- ToggleFeatureFlag

#### Queries

- GetFeatureFlag
- ListFeatureFlags

---

### 22. Plugin Marketplace

#### Responsibilities

- Catalog connectors and plugins
- Support installation, review, distribution, and version pinning

#### Aggregate Roots

- PluginListing
- PluginPackage

#### Entities

- PluginPublisher
- PluginRelease

#### Value Objects

- PluginId
- PluginVersion
- MarketplaceListingId

#### Domain Services

- PluginVerificationService
- CompatibilityService

#### Events

- PluginPublished
- PluginInstalled
- PluginUpdated
- PluginDeprecated

#### Repositories

- PluginMarketplaceRepository

#### Policies

- Only signed and verified plugins may be installed in production environments.

#### Commands

- PublishPlugin
- InstallPlugin
- DeprecatePlugin

#### Queries

- ListPlugins
- GetPlugin

---

### 23. Developer SDK

#### Responsibilities

- Define the contract for third-party connector authors
- Provide stable abstractions for connector creation
- Enforce compatibility with the platform

#### Aggregate Roots

- SDKVersion
- ConnectorPackageManifest

#### Entities

- SDKCapability
- SDKAdapter
- SDKTemplate

#### Value Objects

- SDKVersionId
- ManifestVersion
- ContractVersion

#### Domain Services

- SDKCompatibilityService
- ManifestValidationService

#### Events

- SDKPublished
- SDKVersionDeprecated

#### Repositories

- SDKRepository
- ManifestRepository

#### Policies

- SDK contracts must be backward-compatible within a supported major version.

#### Commands

- PublishSDKVersion
- DeprecateSDKVersion

#### Queries

- GetSDKVersion
- ListSDKVersions

## Generic Connector Model

Every connector must fit the same abstract model.

### Connector archetypes

- OAuthConnector
- ApiKeyConnector
- WebhookConnector
- DatabaseConnector
- FileConnector
- StreamingConnector

### Generic connector contract

A connector must declare:

- identity and version
- capabilities
- supported auth mechanism
- supported sync modes
- supported webhook modes
- rate limit policy
- retry policy
- health checks
- workflow contracts
- data normalization mappings

### Connector invariants

- A connector may support multiple capabilities, but it must expose one canonical lifecycle.
- A connector may have provider-specific implementation details, but those must stay behind the SDK boundary.
- Connector authors must not modify backend business logic to add a new connector.

## Command Model

Commands represent intent to change the domain.

### Platform-wide commands

- CreateOrganization
- CreateWorkspace
- CreateProject
- RegisterConnector
- PublishConnectorVersion
- CreateConnection
- AuthorizeConnection
- ValidateConnection
- ConfigureConnection
- RunSync
- ScheduleSync
- RetrySync
- PauseSync
- ResumeSync
- DisconnectConnection
- DeleteConnection
- PublishWorkflow
- RequestWorkflowRun
- RotateCredential
- RevokeCredential
- RegisterWebhook
- RemoveWebhook
- ChangeFeatureFlag
- RecordAuditEntry

### Command invariants

- Commands are tenant-scoped.
- Commands must be idempotent where external execution can be retried.
- Commands may be rejected if policy or entitlement does not allow the change.

## Query Model

Queries represent read intent and must not mutate state.

### Platform-wide queries

- GetOrganizations
- GetWorkspaces
- GetProjects
- GetConnectors
- GetConnections
- GetConnectionHealth
- GetWorkflowDefinitions
- GetWorkflowVersions
- GetWorkflowRuns
- GetSyncHistory
- GetJobs
- GetAuditLog
- GetMetrics
- GetNotifications
- GetFeatureFlags
- GetPluginListings
- GetSDKVersions

### Query invariants

- Queries must be tenant-filtered.
- Queries may join read models, but they must not depend on write-only execution state.

## Domain Events

Events are the platform memory.

### Universal event categories

- Tenant lifecycle events
- Connector lifecycle events
- Connection lifecycle events
- OAuth lifecycle events
- Credential lifecycle events
- Workflow lifecycle events
- Job lifecycle events
- Sync lifecycle events
- Webhook lifecycle events
- Notification lifecycle events
- Health lifecycle events
- Audit lifecycle events
- Billing lifecycle events
- Feature flag lifecycle events
- Plugin lifecycle events
- AI lifecycle events

### Required event envelope fields

- eventId
- eventType
- aggregateType
- aggregateId
- organizationId
- workspaceId
- projectId
- connectorId
- connectionId
- workflowDefinitionId
- workflowVersionId
- workflowRunId
- causationId
- correlationId
- version
- occurredAt
- actorId
- actorType
- payload

## Logical Database Ownership

The database model must reflect bounded context ownership.

### Identity owns

- users
- sessions
- passwords
- tokens

### Organizations owns

- organizations
- organization_memberships
- organization_invitations

### Workspaces owns

- workspaces
- workspace_memberships

### Projects owns

- projects

### Integrations owns

- connector_definitions
- connector_capabilities
- connector_versions

### Connections owns

- connections
- connection_state_history
- connection_health_snapshots

### OAuth owns

- oauth_sessions
- oauth_token_grants

### Credentials owns

- credentials
- credential_versions

### Workflow Registry owns

- workflow_definitions
- workflow_versions

### Workflow Runtime owns

- workflow_runs
- workflow_checkpoints

### Jobs owns

- jobs
- job_attempts
- job_leases

### Sync owns

- sync_plans
- sync_jobs
- sync_runs
- sync_checkpoints

### Events owns

- outbox_events
- event_streams
- event_deliveries

### Notifications owns

- notification_rules
- notifications

### AI owns

- ai_jobs
- ai_insights

### Analytics owns

- metric_series
- reports

### Billing owns

- subscriptions
- usage_records
- invoices

### Audit owns

- audit_records

### Administration owns

- platform_configuration
- admin_actions

### Feature Flags owns

- feature_flags
- feature_flag_rules

### Plugin Marketplace owns

- plugin_listings
- plugin_releases

### Developer SDK owns

- sdk_versions
- sdk_manifests

## n8n Contract

n8n is an execution engine, not a domain owner.

### Backend to n8n request contract

The backend sends a workflow execution request containing:

- tenant identifiers
- connection identifier
- connector identifier
- workflow definition identifier
- workflow version identifier
- workflow type
- mode
- cursor/checkpoint
- idempotency key
- retry budget
- rate limit budget
- trace context
- execution metadata

### n8n to backend response contract

n8n returns execution telemetry containing:

- external execution id
- workflow run id
- status
- startedAt
- completedAt
- progress
- warnings
- error code
- error message
- checkpoint snapshot

### Hard rules

- n8n must not create or own business entities.
- n8n must not decide authorization or entitlement.
- n8n must not persist source-of-truth connection state.
- n8n may persist ephemeral execution state only if the backend remains authoritative for durable state.

## Plugin SDK

The SDK must let a developer add a new connector without touching backend business rules.

### SDK responsibilities

- Declare connector metadata
- Declare supported capabilities
- Declare auth strategy
- Declare workflow contracts
- Declare health checks
- Provide provider adapters
- Provide normalization hooks
- Provide error mapping hooks

### SDK extension points

- Connector manifest
- OAuth adapter
- API adapter
- Webhook adapter
- Sync adapter
- Health adapter
- Rate limit policy
- Retry policy
- Transform policy

### SDK guarantees

- A connector can be added through registration and packaged adapters.
- No new connector should require rewriting the backend’s connection, workflow, or audit domains.

## Multi-Tenancy Model

Every tenant-owned aggregate must include the organizational scope explicitly.

### Required ownership chain

- organizationId
- workspaceId
- projectId
- connectorId
- connectionId where applicable

### Rules

- No global mutable business state.
- Cross-tenant references are forbidden unless explicitly modeled as platform metadata.
- Read models must always filter by tenant scope.
- Background processing must propagate tenant context in every job/event/message.

## Architectural Challenges to Existing Assumptions

1. Integration and connection are not the same thing.
   - Integration is the platform capability.
   - Connection is the tenant-specific instance.

2. Workflow runtime is not the same thing as workflow registry.
   - Registry defines versioned contracts.
   - Runtime records execution.

3. OAuth is not connector logic.
   - OAuth is a generic lifecycle shared by many connectors.

4. Sync is not business state.
   - Sync is an execution concern that emits domain events and updates read models.

5. n8n should not be treated as a connector.
   - It is the execution engine beneath the platform.

6. Feature flags and billing are platform concerns, not connector concerns.

## Canonical Design Verdict

The right domain model is a layered, tenant-scoped platform with these core invariants:

- backend owns domain truth
- connectors are registered capabilities
- connections are tenant-specific instances
- workflows are versioned contracts
- runtime is execution state only
- events are immutable platform memory
- n8n is transport and execution, not ownership
- SDKs and plugins are the extension mechanism

This domain model is stable enough to support dozens or hundreds of connectors over the next five years without reworking the business core.
