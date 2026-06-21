import type { ComponentType, LazyExoticComponent } from "react"

import type {
  DASHBOARD_REFRESH_REASONS,
  DASHBOARD_WIDGET_SLOTS,
  DASHBOARD_WIDGET_STATES,
} from "../constants"

import type { DashboardWidgetReadModel, DashboardWidgetReadModelViewModel } from "@/application"

export type DashboardWidgetSlot = (typeof DASHBOARD_WIDGET_SLOTS)[number]
export type DashboardWidgetStateStatus = (typeof DASHBOARD_WIDGET_STATES)[number]
export type DashboardRefreshReason = (typeof DASHBOARD_REFRESH_REASONS)[number]

export interface WidgetSize {
  width: number
  height: number
}

export interface WidgetRefreshPolicy {
  strategy: "manual" | "event-driven"
  triggers: DashboardRefreshReason[]
  intervalMs?: number
}

export interface WidgetLoadingPolicy {
  strategy: "lazy"
  suspense: boolean
  fallbackVariant: "card" | "chart" | "table"
  fallbackHeight: number
}

export interface WidgetLifecycle {
  mount: "route-enter"
  dispose: "route-leave"
}

export interface WidgetResponsiveBehavior {
  mobile: number
  tablet?: number
  desktop?: number
  tabletBreakpoint?: "md" | "lg"
  desktopBreakpoint?: "xl"
  utilityClassName?: string
}

export interface WidgetManifestMetadata {
  widgetId: string
  displayName: string
  category: string
  version: string
  owner: string
  businessQuestion: string
}

export interface WidgetManifestContracts {
  readModel: string
  propsContract: "none"
  stateContract: DashboardWidgetStateStatus[]
}

export interface WidgetManifest {
  metadata: WidgetManifestMetadata
  permissions: string[]
  featureFlags: string[]
  dashboardAvailability: string[]
  contracts: WidgetManifestContracts
  loadingStrategy: WidgetLoadingPolicy
  refreshStrategy: WidgetRefreshPolicy
  sizing: {
    defaultSize: WidgetSize
  }
  responsiveBehavior: WidgetResponsiveBehavior
}

export interface DashboardLayoutItem {
  widgetId: string
  zone: DashboardWidgetSlot
  order: number
  responsive: WidgetResponsiveBehavior
}

export interface DashboardPackage {
  id: string
  persona: string
  widgets: string[]
  layout: DashboardLayoutItem[]
  permissions: string[]
  featureFlags: string[]
  themePreset: string
  defaultFilters: Record<string, string>
  version: string
}

export interface ResolvedDashboardLayoutItem extends DashboardLayoutItem {
  className: string
}

export type WidgetModule = {
  default: ComponentType
}

export type WidgetRendererLoader = () => Promise<WidgetModule>

export interface WidgetRegistryEntry {
  widgetId: string
  displayName: string
  category: string
  version: string
  owner: string
  businessQuestion: string
  supportedPackages: string[]
  permissions: string[]
  featureFlags: string[]
  supportedBreakpoints: Array<"mobile" | "tablet" | "desktop">
  defaultSize: WidgetSize
  refreshPolicy: WidgetRefreshPolicy
  loadingPolicy: WidgetLoadingPolicy
  lifecycle: WidgetLifecycle
  dependencies: string[]
  readModel: string
  renderer: WidgetLazyComponent
  loader: WidgetRendererLoader
  manifest: WidgetManifest
}

export interface WidgetRuntimeState {
  widgetId: string
  status: DashboardWidgetStateStatus
  errorMessage?: string
}

export interface DashboardEventBase {
  dashboardId: string
  occurredAt: string
}

export interface DashboardLoadedEvent extends DashboardEventBase {
  type: "DashboardLoaded"
}

export interface WidgetLoadedEvent extends DashboardEventBase {
  type: "WidgetLoaded"
  widgetId: string
}

export interface WidgetFailedEvent extends DashboardEventBase {
  type: "WidgetFailed"
  widgetId: string
  errorMessage: string
}

export interface WidgetRefreshedEvent extends DashboardEventBase {
  type: "WidgetRefreshed"
  widgetId: string
  reason: DashboardRefreshReason
}

export interface DashboardRefreshRequestedEvent extends DashboardEventBase {
  type: "DashboardRefreshRequested"
  reason: DashboardRefreshReason
}

export interface DashboardPackageResolverInput {
  workspaceId: string | null
  permissions: string[]
  featureFlags: Record<string, boolean>
  role: string | null
}

export interface DashboardService {
  resolvePackage(input: DashboardPackageResolverInput): Promise<DashboardPackage>
}

export interface DashboardContextValue {
  dashboardPackage: DashboardPackage | null
  layout: ResolvedDashboardLayoutItem[]
  widgetStates: Record<string, WidgetRuntimeState>
  widgetReadModels: Record<string, DashboardWidgetReadModel>
  widgetReadModelViewModels: Record<string, DashboardWidgetReadModelViewModel>
  registry: Record<string, WidgetRegistryEntry>
  manifests: Record<string, WidgetManifest>
  isLoading: boolean
  refreshVersion: number
  lastRefreshReason: DashboardRefreshReason | null
  requestRefresh: (reason: DashboardRefreshReason) => Promise<void>
}

export interface WidgetViewModel {
  manifest: WidgetManifest
  entry: WidgetRegistryEntry | null
  layoutItem: ResolvedDashboardLayoutItem | null
  state: WidgetRuntimeState | null
  readModel: DashboardWidgetReadModel | null
  readModelViewModel: DashboardWidgetReadModelViewModel | null
}

export type WidgetLazyComponent = LazyExoticComponent<ComponentType>
