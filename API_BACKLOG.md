# API_BACKLOG

## API Standards
- Versioning: `/v1/*`
- Auth: bearer token unless noted
- Error model: `{ code, message, details?, correlation_id }`
- Rate limits: per endpoint class + per tenant

## Authentication Service
| Method | URL | Auth | Request DTO | Response DTO | Error Codes | Rate Limit | Owner | Priority |
|---|---|---|---|---|---|---|---|---|
| POST | /v1/auth/register | Public | RegisterRequest | AuthSessionResponse | AUTH_400, AUTH_409 | 10/min/IP | Auth | P0 |
| POST | /v1/auth/login | Public | LoginRequest | AuthSessionResponse | AUTH_401, AUTH_429 | 20/min/IP | Auth | P0 |
| POST | /v1/auth/refresh | Refresh token | RefreshRequest | AuthSessionResponse | AUTH_401, AUTH_429 | 30/min/user | Auth | P0 |
| POST | /v1/auth/logout | User | LogoutRequest | EmptyResponse | AUTH_401 | 60/min/user | Auth | P0 |
| POST | /v1/auth/password/forgot | Public | ForgotPasswordRequest | AcceptedResponse | AUTH_404_MASKED | 5/min/IP | Auth | P0 |
| POST | /v1/auth/password/reset | Public | ResetPasswordRequest | EmptyResponse | AUTH_400, AUTH_410 | 10/min/IP | Auth | P0 |

## Organizations/Workspaces
| Method | URL | Auth | Request DTO | Response DTO | Error Codes | Rate Limit | Owner | Priority |
|---|---|---|---|---|---|---|---|---|
| POST | /v1/organizations | User | CreateOrganizationRequest | OrganizationResponse | ORG_409 | 10/min/user | Org | P0 |
| GET | /v1/organizations/{orgId} | User | - | OrganizationResponse | ORG_403, ORG_404 | 120/min/user | Org | P0 |
| PATCH | /v1/organizations/{orgId} | Admin | UpdateOrganizationRequest | OrganizationResponse | ORG_403 | 30/min/user | Org | P1 |
| POST | /v1/workspaces | Admin | CreateWorkspaceRequest | WorkspaceResponse | WS_409 | 20/min/user | Workspace | P0 |
| GET | /v1/workspaces | User | WorkspaceQuery | WorkspaceListResponse | WS_403 | 120/min/user | Workspace | P0 |

## Users/Teams/RBAC
| Method | URL | Auth | Request DTO | Response DTO | Error Codes | Rate Limit | Owner | Priority |
|---|---|---|---|---|---|---|---|---|
| POST | /v1/invitations | Admin | CreateInvitationRequest | InvitationResponse | INV_409 | 20/min/user | Identity | P0 |
| POST | /v1/invitations/{token}/accept | Public token | AcceptInvitationRequest | MembershipResponse | INV_410 | 30/min/IP | Identity | P0 |
| POST | /v1/teams | Admin | CreateTeamRequest | TeamResponse | TEAM_409 | 20/min/user | Identity | P1 |
| PATCH | /v1/memberships/{id}/role | Admin | UpdateRoleRequest | MembershipResponse | RBAC_403 | 30/min/user | Identity | P0 |

## Campaigns
| Method | URL | Auth | Request DTO | Response DTO | Error Codes | Rate Limit | Owner | Priority |
|---|---|---|---|---|---|---|---|---|
| POST | /v1/campaigns | User | CreateCampaignRequest | CampaignResponse | CMP_400 | 30/min/user | Campaign | P0 |
| GET | /v1/campaigns/{id} | User | - | CampaignResponse | CMP_404 | 120/min/user | Campaign | P0 |
| PATCH | /v1/campaigns/{id} | User | UpdateCampaignRequest | CampaignResponse | CMP_409 | 60/min/user | Campaign | P0 |
| POST | /v1/campaigns/{id}/status | User | UpdateCampaignStatusRequest | CampaignResponse | CMP_400 | 30/min/user | Campaign | P0 |

## Integrations
| Method | URL | Auth | Request DTO | Response DTO | Error Codes | Rate Limit | Owner | Priority |
|---|---|---|---|---|---|---|---|---|
| POST | /v1/integrations/{provider}/authorize | User | AuthorizeConnectorRequest | RedirectResponse | INT_400 | 20/min/user | Integrations | P0 |
| GET | /v1/integrations/{provider}/callback | Public callback | OAuthCallbackRequest | ConnectionResponse | INT_401, INT_409 | provider-limited | Integrations | P0 |
| POST | /v1/integrations/{connectionId}/sync | User | TriggerSyncRequest | SyncJobResponse | INT_409 | 10/min/connection | Integrations | P0 |
| POST | /v1/integrations/webhooks/{provider} | Provider signed | WebhookPayload | AcceptedResponse | INT_401, INT_400 | provider-limited | Integrations | P0 |

## Analytics/Reports
| Method | URL | Auth | Request DTO | Response DTO | Error Codes | Rate Limit | Owner | Priority |
|---|---|---|---|---|---|---|---|---|
| GET | /v1/analytics/metrics | User | MetricsQueryRequest | MetricsQueryResponse | ANL_400 | 120/min/user | Analytics | P1 |
| POST | /v1/reports | User | CreateReportRequest | ReportResponse | RPT_400 | 20/min/user | Reporting | P1 |
| POST | /v1/reports/{id}/run | User | RunReportRequest | ReportRunResponse | RPT_409 | 20/min/user | Reporting | P1 |
| GET | /v1/reports/{id}/runs/{runId} | User | - | ReportRunStatusResponse | RPT_404 | 120/min/user | Reporting | P1 |

## AI
| Method | URL | Auth | Request DTO | Response DTO | Error Codes | Rate Limit | Owner | Priority |
|---|---|---|---|---|---|---|---|---|
| POST | /v1/ai/conversations | User | CreateConversationRequest | ConversationResponse | AI_400 | 30/min/user | AI | P1 |
| POST | /v1/ai/conversations/{id}/messages | User | SendMessageRequest | StreamInitResponse | AI_429, AI_403_QUOTA | 30/min/user | AI | P1 |
| POST | /v1/ai/agents/runs | User | StartAgentRunRequest | AgentRunResponse | AI_403_QUOTA | 10/min/user | AI | P2 |

## Billing
| Method | URL | Auth | Request DTO | Response DTO | Error Codes | Rate Limit | Owner | Priority |
|---|---|---|---|---|---|---|---|---|
| GET | /v1/billing/subscription | Owner | - | SubscriptionResponse | BIL_404 | 60/min/user | Billing | P2 |
| POST | /v1/billing/subscription/change | Owner | ChangePlanRequest | SubscriptionResponse | BIL_402 | 10/min/user | Billing | P2 |
| POST | /v1/billing/webhooks/provider | Provider signed | BillingWebhookRequest | AcceptedResponse | BIL_401 | provider-limited | Billing | P2 |
