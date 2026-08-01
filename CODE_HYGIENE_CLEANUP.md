# Code Hygiene Cleanup

## Decision Summary

- Runtime-affecting findings: 0
- Hygiene findings (deadcode report entries): 360
- Hygiene findings (reported expected total): 360
- Merge gate impact: does not block merge

## Resolved Runtime Risk

- Previously flagged unlisted dependencies were resolved by declaring these direct dependencies in package.json:
  - @radix-ui/react-dialog
  - @radix-ui/react-dropdown-menu
  - @radix-ui/react-separator
  - @radix-ui/react-visually-hidden

## Hygiene Findings Inventory

| Section | File | Symbol | Category | Reason |
| --- | --- | --- | --- | --- |
| Unused files | src/app/(layout-pages)/charts/apexcharts/ApexKpiCards.tsx | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/app/(layout-pages)/dashboard/analytics/LandingPage.tsx | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/app/(layout-pages)/dashboard/analytics/earnings-breakdown.tsx | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/application/tests/index.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/application/tracking-api/tracking-endpoints.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/backend-foundation/api-foundation.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/backend-foundation/event-foundation.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/backend-foundation/index.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/backend-foundation/postgres/database.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/backend-foundation/testing-foundation.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/components/Footer.tsx | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/components/appLauncher-dropdown.tsx | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/components/file-manager/data.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/components/file-manager/file-card.tsx | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/components/file-manager/folder-card.tsx | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/components/file-manager/sidebar.tsx | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/components/file-manager/toolbar.tsx | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/components/language-dropdown.tsx | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/components/nav-projects.tsx | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/components/nav-secondary.tsx | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/components/ui/sonner.tsx | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/constants/permissions.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/constants/roles.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/features/dashboard/commands/dashboard.commands.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/features/dashboard/commands/index.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/features/dashboard/index.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/features/dashboard/queries/dashboard-query-keys.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/features/dashboard/queries/index.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/features/dashboard/queries/use-dashboard-package-query.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/features/dashboard/services/index.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/features/dashboard/services/mock-dashboard-service.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/features/dashboard/tests/index.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/identity-platform/errors.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/identity-platform/google-ads/controller.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/identity-platform/index.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/identity-platform/openapi.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/identity-platform/rbac.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/identity-platform/repository.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/infrastructure/tracking/index.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/integration-platform/ai/index.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/integration-platform/analytics/index.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/integration-platform/api.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/integration-platform/automation/index.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/integration-platform/domain/index.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/integration-platform/execution/events.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/integration-platform/execution/hooks.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/integration-platform/execution/middleware.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/integration-platform/index.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/integration-platform/infrastructure/index.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/integration-platform/interfaces/index.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/integration-platform/interfaces/openapi/export.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/integration-platform/interfaces/openapi/index.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/integration-platform/interfaces/openapi/integration-openapi-spec.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/integration-platform/interfaces/rest/index.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/integration-platform/interfaces/rest/server.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/integration-platform/observability/index.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/integration-platform/schemas.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/integration-platform/storage/index.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/integration-platform/workflow/index.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/lib/env.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/lib/feature-flags.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/lib/query/index.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/lib/query/query-keys.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/lib/query/query-utilities.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/lib/tracking-sdk/index.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/project-platform/api.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/project-platform/application/ports/index.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/project-platform/bootstrap/create-project-platform.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/project-platform/errors.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/project-platform/index.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/project-platform/interfaces/openapi/export.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/project-platform/interfaces/openapi/project-openapi-spec.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/project-platform/interfaces/rest/server.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/project-platform/schemas.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/services/api-client.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/services/auth.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/types/campaign.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/types/customer.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/types/dashboard.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/types/product.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused files | src/types/store.ts | (file) | Hygiene | Hygiene: file is not reachable from the current runtime/module graph. |
| Unused dependencies | package.json | @boxicons/react, bootstrap-icons, shadcn, tailwindcss, tailwindcss-animate, tw-animate-css | Hygiene | Hygiene: dependency list is declared but unused by source imports. |
| Unused exports | src/app/(layout-pages)/charts/recharts/AreaChartPage.tsx | description | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/app/(layout-pages)/charts/recharts/BarChartPage.tsx | description | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/app/(layout-pages)/charts/recharts/ChartPieDonutActive.tsx | description | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/app/(layout-pages)/charts/recharts/ChartRadialText.tsx | description | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/app/(layout-pages)/charts/recharts/DonutChartPage.tsx | description | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/app/(layout-pages)/charts/recharts/LineChartPage.tsx | description | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/app/(layout-pages)/charts/recharts/PieChartPage.tsx | description | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/app/(layout-pages)/charts/recharts/RadarChartPage.tsx | description | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/app/(layout-pages)/charts/recharts/RadialChartPage.tsx | description | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/app/(layout-pages)/tables/data-tables/DataTablePage.tsx | columns | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/application/commands/authentication.commands.ts | LoginCommand | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/application/commands/index.ts | LoginCommand | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/application/dto/dashboard.dto.ts | marketingDashboardPackageDto, dashboardWidgetPayloadDtos | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/application/dto/index.ts | dashboardWidgetPayloadDtos, marketingDashboardPackageDto | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/application/errors/application-errors.ts | ValidationError, AuthorizationError, ReadModelExpiredError, CommandFailedError | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/application/errors/index.ts | AuthorizationError, CommandFailedError, ReadModelExpiredError, ValidationError | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/application/mappers/attribution.mappers.ts | mapSourcePerformanceToReadModel, mapSourcePerformanceReadModelToViewModel | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/application/mappers/auth.mappers.ts | mapCurrentUserDtoToViewModel, mapSessionDtoToViewModel | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/application/mappers/index.ts | mapSourcePerformanceReadModelToViewModel, mapSourcePerformanceToReadModel, mapCurrentUserDtoToViewModel, mapSessionDtoToViewModel | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/application/validators/attribution.validators.ts | attributionModelSchema | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/application/validators/auth.validators.ts | forgotPasswordRequestDtoSchema, resetPasswordRequestDtoSchema, verifyEmailRequestDtoSchema | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/application/validators/customer-intelligence.validators.ts | trackingEventNameSchema | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/application/validators/index.ts | attributionModelSchema, connectionStatusSchema, connectorCapabilitySchema, syncJobStatusSchema, forgotPasswordRequestDtoSchema, resetPasswordRequestDtoSchema, verifyEmailRequestDtoSchema, trackingEventNameSchema, segmentAudienceTypeSchema, segmentEvaluationModeSchema, segmentGroupOperatorSchema, segmentGroupSchema, segmentRuleFieldSchema, segmentRuleOperatorSchema, segmentRuleSchema, segmentStatusSchema | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/application/validators/integration.validators.ts | connectorCapabilitySchema, connectionStatusSchema, syncJobStatusSchema | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/application/validators/segmentation.validators.ts | segmentRuleOperatorSchema, segmentGroupOperatorSchema, segmentRuleFieldSchema, segmentRuleSchema, segmentGroupSchema, segmentAudienceTypeSchema, segmentStatusSchema, segmentEvaluationModeSchema | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/application/validators/tracking.validators.ts | trackingConsentStatusSchema, trackingDeviceSchema, trackingLocationSchema | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/backend-foundation/infrastructure-layer.ts | InMemoryFoundationMetrics, NoopFoundationTracer, SystemClock, CryptoUuidGenerator, FoundationError, mapErrorToProblem | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/backend-foundation/module-catalog.ts | listKnownModules | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/components/app/avatar.tsx | AppAvatarBadge, AppAvatarGroup, AppAvatarGroupCount, AppAvatarImage | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/components/app/card.tsx | AppStatCard, AppMetricCard | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/components/app/chart.tsx | AppChartHeader, AppChartLegend | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/components/app/forms.tsx | AppFormSection | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/components/app/menu.tsx | AppDropdownMenuGroup, AppDropdownMenuLabel, AppDropdownMenuPortal, AppDropdownMenuRadioGroup, AppDropdownMenuRadioItem, AppDropdownMenuShortcut, AppDropdownMenuSub, AppDropdownMenuSubContent, AppDropdownMenuSubTrigger | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/components/app/navigation.tsx | AppBreadcrumb | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/components/app/select.tsx | AppSelectGroup, AppSelectLabel, AppSelectSeparator | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/components/app/table.tsx | AppTableCaption | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/components/app/tabs.tsx | appTabsListVariants | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/components/ui/alert.tsx | AlertAction | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/components/ui/breadcrumb.tsx | BreadcrumbEllipsis | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/components/ui/calendar.tsx | CalendarDayButton | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/components/ui/chart.tsx | ChartStyle | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/components/ui/command.tsx | Command, CommandShortcut | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/components/ui/dialog.tsx | DialogClose, DialogDescription, DialogOverlay, DialogPortal, DialogTrigger | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/components/ui/field.tsx | FieldSeparator, FieldTitle | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/components/ui/input-group.tsx | InputGroupText, InputGroupTextarea | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/components/ui/pagination.tsx | PaginationEllipsis | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/components/ui/popover.tsx | PopoverDescription, PopoverHeader, PopoverTitle | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/components/ui/scroll-area.tsx | ScrollBar | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/components/ui/select.tsx | SelectScrollDownButton, SelectScrollUpButton | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/components/ui/sheet.tsx | SheetPortal, SheetOverlay, SheetClose, SheetFooter | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/components/ui/sidebar.tsx | SidebarGroup, SidebarGroupAction, SidebarGroupContent, SidebarGroupLabel, SidebarInput, SidebarMenuAction, SidebarMenuBadge, SidebarMenuSkeleton, SidebarMenuSubButton, SidebarRail, SidebarSeparator | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/components/ui/table.tsx | TableFooter | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/components/ui/toggle.tsx | Toggle | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/administration/components/index.ts | AdministrationModuleNav, AdministrationUserProfileDrawer, PermissionMatrix | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/authentication/commands/auth.commands.ts | createAuthCommands | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/authentication/commands/index.ts | createAuthCommands, createRecoveryCommands | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/authentication/commands/recovery.commands.ts | createRecoveryCommands | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/authentication/queries/index.ts | authQueryKeys, useCurrentUserQuery | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/authentication/queries/use-current-user-query.ts | useCurrentUserQuery | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/authentication/services/index.ts | createMockAuthService, MockAuthService, createSessionManager, SessionManager | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/authentication/services/mock-auth-service.ts | MockAuthService, createMockAuthService | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/authentication/services/session-manager.ts | createSessionManager | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/authentication/state/index.ts | useAuthStore | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/campaigns/components/campaign-metrics.ts | ANALYSIS_TABS | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/campaigns/components/index.ts | CampaignForm, CampaignListTable, CampaignModuleNav, CampaignStatusBadge | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/customers/hooks/index.ts | useCustomerTimeline | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/customers/hooks/use-customer.ts | useCustomerTimeline | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/dashboard/components/dashboard-screen.tsx | DashboardScreen | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/dashboard/components/index.ts | DashboardCanvas, DashboardScreen | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/dashboard/hooks/index.ts | useDashboardPackage, useDashboardRefresh, useWidgetRegistry | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/dashboard/hooks/use-dashboard-package.ts | useDashboardPackage | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/dashboard/hooks/use-dashboard-refresh.ts | useDashboardRefresh | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/dashboard/hooks/use-widget-registry.ts | useWidgetRegistry | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/dashboard/manifests/marketing-dashboard.manifests.ts | marketingDashboardManifests | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/dashboard/registry/dashboard-widget-registry.ts | createWidgetRegistry | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/dashboard/registry/index.ts | createWidgetRegistry | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/dashboard/validators/dashboard.validators.ts | widgetResponsiveBehaviorSchema, dashboardLayoutItemSchema | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/dashboard/validators/index.ts | dashboardLayoutItemSchema, widgetResponsiveBehaviorSchema | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/integrations/hooks/index.ts | useConnectionDetails | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/integrations/hooks/use-connection-details.ts | useConnectionDetails | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/integrations/services/connection-action-policy.ts | resolveConnectionActionState | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/integrations/services/connections-center.service.ts | CONNECTION_CENTER_STORAGE_KEY, CONNECTOR_ACCOUNTS_STORAGE_KEY, getDefaultWorkspaceId, normalizeConnectorId, getConnectorCatalogEntry | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/workspace/commands/index.ts | createWorkspaceCommands | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/workspace/commands/workspace.commands.ts | createWorkspaceCommands | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/workspace/hooks/index.ts | useOrganizations | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/workspace/hooks/use-organizations.ts | useOrganizations | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/workspace/queries/index.ts | useCurrentWorkspaceQuery, useOrganizationsQuery, useWorkspacesQuery, workspaceQueryKeys | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/workspace/queries/use-current-workspace-query.ts | useCurrentWorkspaceQuery | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/workspace/queries/use-organizations-query.ts | useOrganizationsQuery | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/workspace/queries/use-workspaces-query.ts | useWorkspacesQuery | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/workspace/services/index.ts | createMockWorkspaceService, MockWorkspaceService | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/features/workspace/services/mock-workspace-service.ts | MockWorkspaceService, createMockWorkspaceService | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/identity-platform/google-ads/errors.ts | isGoogleAdsSyncInProgressError | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/identity-platform/infrastructure/postgres/migration-runner.ts | listIdentityMigrationFiles | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/identity-platform/infrastructure/storage/in-memory.ts | createInMemoryIdentityDataStore, newId, nowIso | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/identity-platform/schemas.ts | inviteMemberSchema, googleOAuthStartSchema, googleAdsSyncSchema, googleAdsRecordsQuerySchema, googleAdsAccountsQuerySchema, googleAdsAccountSelectionSchema | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/identity-platform/security.ts | hashOpaqueToken, generateOpaqueToken, InMemoryRateLimiter | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/identity-platform/snapchat-oauth/snapchat-credentials.ts | StaticSnapchatOAuthCredentialsProvider, AwsSecretsSnapchatOAuthCredentialsProvider | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/data/adapters/index.ts | AuthenticationApiAdapter, DashboardApiAdapter, WorkspaceApiAdapter | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/data/api/index.ts | createHttpDataClient | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/data/cache/index.ts | createWorkspaceCacheKey, RepositoryCache | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/data/errors.ts | AuthenticationError, InvalidCredentialsError, SessionExpiredError | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/data/mappers/error-mapper.ts | mapStatusToRepositoryError | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/data/mappers/index.ts | mapStatusToRepositoryError | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/data/pagination/index.ts | normalizePaginationRequest | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/data/pagination/types.ts | normalizePaginationRequest | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/data/repositories/ai-intelligence.repository.ts | DataAIIntelligenceRepository | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/data/repositories/authentication.repository.ts | DataAuthenticationRepository | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/data/repositories/campaign.repository.ts | DataCampaignRepository | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/data/repositories/dashboard.repository.ts | DataDashboardRepository | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/data/repositories/index.ts | DataAIIntelligenceRepository, DataAuthenticationRepository, DataCampaignRepository, DataDashboardRepository, DataIntegrationRepository, DataNotificationRepository, DataWorkspaceRepository | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/data/repositories/integration.repository.ts | RestIntegrationRepository, DataIntegrationRepository | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/data/repositories/notification.repository.ts | DataNotificationRepository | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/data/repositories/workspace.repository.ts | DataWorkspaceRepository | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/data/serializers/index.ts | serializeFilters, serializePagination | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/data/serializers/query-serializer.ts | serializePagination | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/environment/app-environment.ts | environment | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/http/http-client.ts | apiClient, AppError, AuthorizationError, NetworkError, UnknownError, ValidationError, failure, logger, success | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/identity/index.ts | SessionManager | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/identity/session-manager.ts | SessionManager | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/integration/ga4/ga4.connector.ts | GA4_CONNECTOR_DEFINITION, GA4Connector | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/integration/ga4/index.ts | GA4Connector, GA4_CONNECTOR_DEFINITION, GA4Repository, GA4Sync | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/integration/google-ads/google-ads.connector.ts | GOOGLE_ADS_CONNECTOR_DEFINITION, GoogleAdsConnector | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/integration/google-ads/index.ts | GoogleAdsConnector, GOOGLE_ADS_CONNECTOR_DEFINITION, GoogleAdsRepository, GoogleAdsSync | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/integration/index.ts | DataIntegrationRepository | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/integration/meta-ads/index.ts | MetaAdsConnector, META_ADS_CONNECTOR_DEFINITION, MetaAdsRepository, MetaAdsSync | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/integration/meta-ads/meta-ads.connector.ts | META_ADS_CONNECTOR_DEFINITION, MetaAdsConnector | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/integration/salla/index.ts | SallaAuthentication, SallaConnector, SALLA_CONNECTOR_DEFINITION, SallaGateway, SallaRepository, SallaSync | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/integration/salla/salla.connector.ts | SALLA_CONNECTOR_DEFINITION, SallaConnector | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/integration/snapchat-ads/index.ts | SNAPCHAT_ADS_CONNECTOR_DEFINITION, SnapchatAdsConnector, SnapchatAdsRepository, SnapchatAdsSync | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/integration/snapchat-ads/snapchat-ads.connector.ts | SNAPCHAT_ADS_CONNECTOR_DEFINITION, SnapchatAdsConnector | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/integration/tiktok-ads/index.ts | TikTokAdsConnector, TIKTOK_ADS_CONNECTOR_DEFINITION, TikTokAdsRepository, TikTokAdsSync | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/integration/tiktok-ads/tiktok-ads.connector.ts | TIKTOK_ADS_CONNECTOR_DEFINITION, TikTokAdsConnector | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/integration/zid/index.ts | ZidConnector, ZID_CONNECTOR_DEFINITION, ZidRepository, ZidSync | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/integration/zid/zid.connector.ts | ZID_CONNECTOR_DEFINITION, ZidConnector | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/mock/index.ts | MockAuthenticationGateway, MockDashboardGateway, MockFeatureFlagGateway, createMockNotificationGateway, MockNotificationGateway, MockPermissionGateway, MockWorkspaceGateway | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/mock/mock-dashboard.gateway.ts | MockDashboardGateway | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/mock/mock-feature-flag.gateway.ts | MockFeatureFlagGateway | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/mock/mock-notification.gateway.ts | MockNotificationGateway, createMockNotificationGateway | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/mock/mock-permission.gateway.ts | MockPermissionGateway | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/segmentation/index.ts | createSegmentationRepository | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/storage/index.ts | MemoryStorageAdapter, createZustandStorageAdapter | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/storage/storage-adapter.ts | MemoryStorageAdapter | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/infrastructure/storage/zustand-storage.ts | createZustandStorageAdapter | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/integration-platform/application/errors/IntegrationPlatformError.ts | IntegrationPlatformError | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/integration-platform/domain/entities/index.ts | createConnectorConfiguration | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/integration-platform/execution/interceptors.ts | createNoopExecutionInterceptor | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/integration-platform/manifest/contracts.ts | compatibilityRuleSchema, connectorDependencySchema, connectorCapabilitySchema, connectorFieldSchema, connectorObjectSchema, connectorOperationSchema, connectorWorkflowTemplateSchema, connectorHealthCheckSchema, connectorRateLimitSchema | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/integration-platform/manifest/version.ts | compareSemver | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/integration-platform/safety/contracts.ts | connectorCapabilitySchema, validateExecutionEngineManifest | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/lib/app-errors.ts | mapHttpResponseError | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/lib/browser-storage.ts | getSessionStorageAdapter, createSessionZustandStorage, clearLocalStorage, clearSessionStorage | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/lib/logger.ts | createLogger | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/lib/query/query-client.ts | queryClientDefaults | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/lib/result.ts | isSuccess, isFailure | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/lib/tracking-sdk/configuration.ts | Configuration | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/lib/tracking-sdk/storage.ts | Storage | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/project-platform/application/errors/ProjectError.ts | ProjectError | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exports | src/project-platform/types.ts | SUPPORTED_DATA_SOURCE_TYPES | Hygiene | Hygiene: exported runtime symbol(s) are never imported/consumed. |
| Unused exported types | src/application/context/application-context.tsx | ApplicationServicesContextValue | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/application/context/index.ts | ApplicationServicesContextValue | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/application/contracts/ai-intelligence.contracts.ts | AIIntelligenceReadModel | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/application/contracts/attribution.contracts.ts | CustomerJourneyStep | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/application/contracts/authentication.contracts.ts | AuthenticationGateway, SessionStorageGateway | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/application/contracts/customer-intelligence.contracts.ts | TrafficSourceDto, CartEventDto, CheckoutEventDto, PurchaseEventDto | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/application/contracts/dashboard.contracts.ts | DashboardPackageResolver | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/application/contracts/index.ts | AIIntelligenceReadModel, AIIntelligenceRepository, Ad, AttributionCredit, AttributionModel, AttributionRepository, Campaign, CampaignGroup, Channel, Conversion, Creative, CustomerJourneyStep, Keyword, Medium, Referral, RoasDto, RoiDto, Source, AuthenticationRepository, AuthenticationGateway, RefreshSessionRequestDto, SessionStorageGateway, CampaignListItemDto, CampaignRepository, CartEventDto, CheckoutEventDto, CustomerIntelligenceRepository, CustomerIntelligenceWidgetMetricsDto, IdentityDto, PageViewDto, ProductViewDto, PurchaseEventDto, TimelineEntryDto, TrackingEventName, TrafficSourceDto, VisitorDto, DashboardRepository, DashboardPackageResolver, AccessToken, CapabilityDiscoveryPort, Connector, ConnectorConfigurationPort, ConnectorContract, ConnectorDefinition, ConnectorLifecycleAction, Credential, CredentialStoragePort, ErrorMapperPort, HealthMonitorPort, Integration, IntegrationEvent, IntegrationRepository, RateLimit, RateLimitPort, RefreshToken, RetryEnginePort, RetryPolicy, SchedulerPort, SyncResult, TokenLifecyclePort, Webhook, WebhookPort, DynamicAudience, SegmentAudienceType, SegmentEvaluationMode, SegmentGroupOperator, SegmentRuleField, SegmentRuleOperator, SegmentStatus, StaticAudience, AttributionInfrastructureGateway, AttributionDataRepository, IntegrationInfrastructureGateway, IntegrationDataRepository, CampaignInfrastructureGateway, CampaignDataRepository, CustomerIntelligenceInfrastructureGateway, CustomerIntelligenceDataRepository, SegmentationInfrastructureGateway, SegmentationDataRepository, AuthRepository, DashboardDataRepository, NotificationRepository, NotificationGateway, WorkspaceDataRepository, WorkspaceRepository | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/application/contracts/integration.contracts.ts | Integration, Connector, Webhook, CredentialStoragePort, TokenLifecyclePort, WebhookPort, SchedulerPort, RetryEnginePort, RateLimitPort, ErrorMapperPort, HealthMonitorPort, ConnectorConfigurationPort, CapabilityDiscoveryPort, ConnectorReadModel, ConnectorViewModel | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/application/contracts/segmentation.contracts.ts | DynamicAudience, StaticAudience | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/application/contracts/tracking.contracts.ts | TrackingIdentity, ActiveSessionsViewModel, LiveVisitorsViewModel, CurrentFunnelsViewModel, TopProductsViewModel, RecentEventsViewModel, AbandonedCartsReadModel, AbandonedCartsViewModel | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/application/events/application.events.ts | DashboardLoaded, DashboardRefreshRequested, ReadModelBuilt, WorkspaceResolved, SessionRestored, ReadModelExpired | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/application/events/index.ts | DashboardLoaded, DashboardRefreshRequested, ReadModelBuilt, ReadModelExpired, SessionRestored, WorkspaceResolved | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/application/read-models/dashboard.read-models.ts | ExecutiveDashboardReadModel, RevenueTrendReadModel, VisitorTrendReadModel, ActivityInsightsReadModel, WebsiteAnalyticsReadModel, CompletionRateReadModel, BrowserStatsReadModel, TrafficTableReadModel, TransactionsReadModel, SocialPerformanceReadModel | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/application/read-models/index.ts | ActivityInsightsReadModel, BrowserStatsReadModel, CompletionRateReadModel, ExecutiveDashboardReadModel, RevenueTrendReadModel, SocialPerformanceReadModel, TrafficTableReadModel, TransactionsReadModel, VisitorTrendReadModel, WebsiteAnalyticsReadModel | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/application/services/connection-management.service.ts | ConnectionLifecycleState, ConnectionState, ConnectionHealthStatus, ConnectionHealth, ConnectionHistoryEventType, ConnectionHistoryEvent, ConnectionHistory, RetryQueueItem, ConnectionScheduler, ConnectionRegistryEntry, ConnectionRegistry, ConnectionMetrics, ConnectionMetricsReadModelPayload | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/application/tracking-api/tracking-api.contracts.ts | TrackingEndpoint | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/application/tracking-api/tracking-authentication.ts | TrackingAuthenticationResult | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/application/tracking-api/tracking-rate-limiter.ts | TrackingRateLimitResult | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/application/validators/segmentation.validators.ts | SegmentRuleInput, SegmentGroupInput | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/components/app/button.tsx | AppButtonProps | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/components/app/card.tsx | AppCardProps, AppStatCardProps, AppMetricCardProps | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/components/app/chart.tsx | AppChartHeaderProps, AppChartLegendItem, AppChartLegendProps, AppChartCardProps | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/components/app/dialog.tsx | AppDialogProps, AppConfirmDialogProps | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/components/app/drawer.tsx | AppDrawerProps | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/components/app/feedback.tsx | AppLoadingVariant | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/components/app/forms.tsx | AppFormProps, AppFormFieldProps, AppFormSectionProps | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/components/app/input.tsx | AppInputProps, AppTextareaProps, AppSearchInputProps | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/components/app/layout.tsx | AppPageProps, AppGridProps | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/components/app/navigation.tsx | AppBreadcrumbItem, AppBreadcrumbProps, AppToolbarProps, AppPageHeaderProps | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/components/app/status.tsx | AppBadgeProps, AppStatusBadgeProps | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/components/app/table.tsx | AppTableToolbarProps, AppTablePaginationProps, AppTableEmptyProps | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/features/ai/types/ai-intelligence.types.ts | AIAnomalyDto, AICampaignInsightDto, AIChannelPerformanceDto, AICustomerInsightDto, AIProductInsightDto, AIWeeklySummaryDto, AIIntelligenceResult | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/features/authentication/services/auth-service.ts | AuthenticationService | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/features/authentication/services/index.ts | AuthenticationService | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/features/authentication/types/contracts.ts | AuthCommandResult | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/features/authentication/types/index.ts | AuthCommandResult, AccessToken, Permission, Role | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/features/authentication/types/models.ts | Permission | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/features/campaigns/components/campaign-metrics.ts | PlatformHierarchySpec | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/features/campaigns/components/campaign-status-badge.tsx | CampaignStatusBadgeProps | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/features/campaigns/types/contracts.ts | CampaignListFilters | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/features/campaigns/types/index.ts | CampaignListFilters, CampaignListViewModel, CampaignListResult | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/features/dashboard/types/dashboard.types.ts | DashboardWidgetSlot, WidgetModule, DashboardEventBase, DashboardLoadedEvent, WidgetLoadedEvent, WidgetFailedEvent, WidgetRefreshedEvent, DashboardRefreshRequestedEvent, DashboardService | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/features/dashboard/types/index.ts | DashboardEventBase, DashboardLayoutItem, DashboardLoadedEvent, DashboardRefreshRequestedEvent, DashboardService, DashboardWidgetSlot, DashboardWidgetStateStatus, WidgetFailedEvent, WidgetLifecycle, WidgetLoadedEvent, WidgetLoadingPolicy, WidgetManifestContracts, WidgetManifestMetadata, WidgetModule, WidgetRefreshedEvent, WidgetRendererLoader, WidgetSize | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/features/dashboard/validators/dashboard.validators.ts | WidgetManifestValues | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/features/dashboard/validators/index.ts | WidgetManifestValues | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/features/integrations/services/connection-action-policy.ts | ConnectionActionPolicyInput, ConnectionActionState | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/features/integrations/services/connections-center.service.ts | StoredConnectionReference, StoredConnectorAccountRegistry | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/features/workspace/state/index.ts | WorkspaceContextValue | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/features/workspace/state/workspace.context.ts | WorkspaceContextValue | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/features/workspace/types/index.ts | Membership, Plan, Subscription, WorkspaceContextModel | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/features/workspace/types/workspace.types.ts | Plan, Membership, WorkspaceContextModel | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/features/workspace/validators/index.ts | WorkspaceSelectionValues, WorkspaceSettingsValues | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/features/workspace/validators/workspace.validators.ts | WorkspaceSelectionValues, WorkspaceSettingsValues | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/identity-platform/application/errors/IdentityError.ts | IdentityErrorCategory | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/identity-platform/application/handlers/command-handlers.ts | IdentityCommandHandlerDependencies | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/identity-platform/configuration/provider-credential-resolution.ts | AwsCredentialSourceOptions | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/identity-platform/google-ads/campaign-management-service.ts | GoogleAdsCampaignSyncSummary | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/identity-platform/google-oauth/types.ts | GoogleOAuthRecentEventsResult | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/identity-platform/infrastructure/postgres/database.ts | QueryResultRow, QueryResult, QueryInput | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/identity-platform/integrations/provider-contracts.ts | IntegrationProviderOAuthCallbackInput | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/identity-platform/integrations/provider-dtos.ts | ProviderAccountsQueryDto | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/identity-platform/integrations/provider-models.ts | IntegrationSyncMode | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/identity-platform/integrations/provider-registry.ts | IntegrationProvider, IntegrationProviderAccountsQuery, IntegrationProviderOAuthCallbackInput, IntegrationProviderOAuthControllerResult, IntegrationProviderOAuthStartInput, IntegrationProviderRecordQuery, IntegrationProviderSyncInput | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/identity-platform/security.ts | JwtPayload | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/identity-platform/types.ts | UserProfile, Organization, Workspace, Membership, SessionRecord, EmailVerificationToken, PasswordResetToken, AuditLogEntry, TokenPair | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/infrastructure/data/dto/index.ts | AuthSessionDto, AuthUserDto, CurrentUserDto, ForgotPasswordRequestDto, LoginRequestDto, LoginResponseDto, ResetPasswordRequestDto, VerifyEmailRequestDto, DashboardPackageDto, DashboardPackageQueryDto, DashboardWidgetReadModelPayload, OrganizationDto, WorkspaceDto, WorkspaceSelectionDto, WorkspaceServiceSelectionDto, PaginationRequestDto, PaginatedResponseDto, PaginationMetaDto | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/infrastructure/data/filters/index.ts | FilterCollection, FilterExpression, PrimitiveFilterValue | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/infrastructure/data/filters/types.ts | PrimitiveFilterValue | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/infrastructure/data/pagination/index.ts | PaginationMetaDto, PaginationRequestDto, PaginatedResponseDto | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/infrastructure/data/pagination/types.ts | PaginationMetaDto, PaginatedResponseDto | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/infrastructure/data/repositories/repository-runtime.ts | RepositoryRuntimeBackend | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/infrastructure/http/http-client.ts | HttpMethod, PreparedRequest, RequestInterceptorContext, ResponseInterceptorContext, RequestInterceptor, ResponseInterceptor, ApiClientOptions, Result | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/infrastructure/integration/ga4/ga4.sync.ts | GA4SyncOutput | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/infrastructure/integration/ga4/index.ts | GA4AcquisitionMetricRowDto, GA4EcommerceMetricRowDto, GA4EngagementMetricRowDto, GA4EventMetricRowDto, GA4OAuthTokenResponseDto, GA4TrafficMetricRowDto | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/infrastructure/integration/google-ads/google-ads.sync.ts | GoogleAdsSyncOutput | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/infrastructure/integration/google-ads/index.ts | GoogleAdsAccountDto, GoogleAdsAdDto, GoogleAdsAdGroupDto, GoogleAdsCampaignDto, GoogleAdsKeywordDto, GoogleAdsOAuthTokenResponseDto, GoogleAdsPerformanceMetricDto | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/infrastructure/integration/meta-ads/index.ts | MetaAdsAccountDto, MetaAdsAdDto, MetaAdsAdSetDto, MetaAdsCampaignDto, MetaAdsConversionMetricDto, MetaAdsOAuthTokenResponseDto, MetaAdsPerformanceMetricDto | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/infrastructure/integration/meta-ads/meta-ads.sync.ts | MetaAdsSyncOutput | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/infrastructure/integration/salla/salla.sync.ts | SallaSyncOutput | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/infrastructure/integration/snapchat-ads/index.ts | SnapchatAdsAdAccountDto, SnapchatAdsAdDto, SnapchatAdsAdSquadDto, SnapchatAdsCampaignDto, SnapchatAdsConversionMetricDto, SnapchatAdsCreativeDto, SnapchatAdsOAuthTokenResponseDto, SnapchatAdsOrganizationDto, SnapchatAdsPerformanceMetricDto | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/infrastructure/integration/snapchat-ads/snapchat-ads.sync.ts | SnapchatAdsSyncOutput | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/infrastructure/integration/tiktok-ads/index.ts | TikTokAdsAdDto, TikTokAdsAdGroupDto, TikTokAdsAdvertiserAccountDto, TikTokAdsBusinessCenterDto, TikTokAdsCampaignDto, TikTokAdsConversionMetricDto, TikTokAdsCreativeDto, TikTokAdsOAuthTokenResponseDto, TikTokAdsPerformanceMetricDto | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/infrastructure/integration/tiktok-ads/tiktok-ads.sync.ts | TikTokAdsSyncOutput | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/infrastructure/integration/zid/index.ts | ParsedZidWebhook, ParsedZidWebhookEventType, ZidBrandDto, ZidCategoryDto, ZidCollectionDto, ZidCustomerDto, ZidInventoryDto, ZidOAuthTokenResponseDto, ZidOrderDto, ZidProductDto, ZidWebhookEnvelopeDto | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/infrastructure/integration/zid/zid.sync.ts | ZidSyncOutput | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/infrastructure/storage/index.ts | StorageScope | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/integration-platform/application/registry/connector-registry.ts | ConnectorDefinition | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/integration-platform/application/registry/metadata-registry.ts | ConnectorFieldMetadata, ConnectorRelationshipMetadata, ConnectorMetricMetadata, ConnectorDimensionMetadata | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/integration-platform/domain/entities/index.ts | TimestampedState, ConnectorCapabilityState, ConnectorState, CredentialState, OAuthSessionState, OAuthTokenState, SyncJobState, WebhookRegistrationState, ConnectorHealthState, ConnectorConfigurationState | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/integration-platform/execution/bus.ts | ExecutionBusDependencies | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/integration-platform/execution/metrics.ts | ExecutionMetricsSnapshot | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/integration-platform/execution/publisher.ts | ExecutionBusPublisherTarget | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/integration-platform/execution/registry.ts | ExecutionEngineRegistryEntry | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/integration-platform/execution/runtime.contracts.ts | ExecutionOrganizationContext, ExecutionWorkspaceContext, ExecutionProjectContext, ExecutionConnectionContext, ExecutionWorkflowContext, ExecutionSecretsReference | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/integration-platform/execution/runtime.ts | ExecutionRuntimeDependencies | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/integration-platform/infrastructure/oauth/oauth-engine.ts | OAuthEngineDependencies | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/integration-platform/integration/google-ads-v2/connector.ts | GoogleAdsV2ConnectorDependencies, GoogleAdsV2ObservabilitySnapshot | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/integration-platform/manifest/registry.ts | ConnectorManifestRegistryDependencies | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/integration-platform/manifest/validation.ts | ConnectorManifestValidationOptions | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/integration-platform/plugins/registry.ts | ConnectorPluginImplementation, ConnectorPluginRegistration, PluginRegistryDependencies | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/integration-platform/safety/contracts.ts | ConnectorManifest, ExecutionEngineManifest, ExecutionEngineHealthSnapshot, ExecutionEngineContract, ConnectorContractTarget | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/integration-platform/safety/diagnostics.ts | PlatformRegistrySnapshot, PlatformDiagnosticCheck, PlatformDiagnosticReport | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/integration-platform/types.ts | SyncMode, OAuthProviderConfiguration | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/lib/app-errors.ts | AppErrorKind, AppErrorOptions | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/lib/debug/frontend-execution-trace.ts | FrontendExecutionStep, FrontendExecutionEvent | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/lib/errors/app-error.ts | AppErrorKind, AppErrorOptions | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/lib/logger.ts | LogLevel, Logger | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/lib/permissions.ts | PermissionsService | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/lib/tracking-sdk/session-manager.ts | SessionState | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/lib/tracking-sdk/tracking-client.ts | TrackingClientDependencies | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/project-platform/infrastructure/storage/in-memory.ts | InMemoryProjectDataStore | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/store/store-context.store.ts | ActiveStoreContext | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Unused exported types | src/types/api.ts | Pagination, ResponseMetadata, PaginatedResponseDto, ApiResponse, PaginatedResponse | Hygiene | Hygiene: exported type-only symbol(s) are never imported/consumed. |
| Duplicate exports | src/identity-platform/schemas.ts | googleAdsAccountSelectionSchema, integrationAccountSelectionSchema | Hygiene | Hygiene: alias/duplicate export exists; no immediate runtime risk. |
| Duplicate exports | src/identity-platform/schemas.ts | googleAdsAccountsQuerySchema, integrationAccountsQuerySchema | Hygiene | Hygiene: alias/duplicate export exists; no immediate runtime risk. |
| Duplicate exports | src/identity-platform/schemas.ts | googleAdsSyncSchema, integrationSyncSchema | Hygiene | Hygiene: alias/duplicate export exists; no immediate runtime risk. |
| Duplicate exports | src/identity-platform/schemas.ts | googleOAuthStartSchema, integrationOAuthStartSchema | Hygiene | Hygiene: alias/duplicate export exists; no immediate runtime risk. |
| Duplicate exports | src/infrastructure/data/repositories/integration.repository.ts | RestIntegrationRepository, DataIntegrationRepository | Hygiene | Hygiene: alias/duplicate export exists; no immediate runtime risk. |

## Required Statement

The project is approved for merge. Remaining items are code hygiene improvements and will be tracked separately.

## Console Log Classification

Runtime
- Removed from src/identity-platform/server.ts.
- Removed from src/lib/debug/frontend-execution-trace.ts.

Legacy / Demo
- src/app/(layout-pages)/eCommerce/order-list/OrderList.tsx:420
- src/app/(layout-pages)/eCommerce/order-list/OrderList.tsx:429
- src/app/(layout-pages)/eCommerce/categories/CategoryList.tsx:315
- src/app/(layout-pages)/eCommerce/categories/CategoryList.tsx:324
- src/app/(layout-pages)/eCommerce/customer-list/CustomerList.tsx:382
- src/app/(layout-pages)/eCommerce/customer-list/CustomerList.tsx:390
- src/app/(layout-pages)/eCommerce/customer-list/CustomerList.tsx:521
- src/app/(layout-pages)/eCommerce/customer-list/CustomerList.tsx:530
- src/app/(layout-pages)/dashboard/eCommerce/RecentOrdersTable.tsx:299
- src/app/(layout-pages)/dashboard/eCommerce/RecentOrdersTable.tsx:308

Development Script
- scripts/check-deps.mjs:23
- scripts/check-deps.mjs:25
- scripts/check-deps.mjs:26
- scripts/local-backend-bootstrap.ts:34
- scripts/local-backend-bootstrap.ts:41
- scripts/local-backend-bootstrap.ts:81
- scripts/local-backend-bootstrap.ts:223
- scripts/local-backend-bootstrap.ts:247
- scripts/validate-env.mjs:43
- scripts/check-routes.mjs:53
- scripts/run-prettier-governed.mjs:77
