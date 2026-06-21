import type { ReadModel, ReadModelViewModel } from "./read-model.contracts"

export interface DashboardPackageDto {
  id: string
  persona: string
  widgets: string[]
  layout: Array<{
    widgetId: string
    zone:
      | "hero"
      | "executive"
      | "analytics"
      | "diagnostics"
      | "recommendations"
      | "operations"
      | "footer"
    order: number
    responsive: {
      mobile: number
      tablet?: number
      desktop?: number
      tabletBreakpoint?: "md" | "lg"
      desktopBreakpoint?: "xl"
      utilityClassName?: string
    }
  }>
  permissions: string[]
  featureFlags: string[]
  themePreset: string
  defaultFilters: Record<string, string>
  version: string
}

export interface DashboardPackageQueryDto {
  workspaceId: string | null
  permissions: string[]
  featureFlags: Record<string, boolean>
  role: string | null
}

export interface DashboardPackageResolver {
  resolve(input: DashboardPackageQueryDto): Promise<DashboardPackageDto>
}

export interface DashboardRepository {
  resolvePackage(input: DashboardPackageQueryDto): Promise<DashboardPackageDto>
  getWidgetReadModel(widgetId: string): Promise<DashboardWidgetReadModelPayload | null>
}

export type DashboardGateway = DashboardRepository

export interface DashboardApplicationBundle {
  dashboardPackage: DashboardPackageDto
  readModels: Record<string, DashboardWidgetReadModel>
  viewModels: Record<string, DashboardWidgetReadModelViewModel>
}

export interface DashboardWidgetReadModelPayload {
  widgetId: string
  title: string
  summary: string
  dataPoints?: Array<Record<string, string | number>>
}

export type DashboardWidgetReadModel = ReadModel<DashboardWidgetReadModelPayload>
export type DashboardWidgetReadModelViewModel = ReadModelViewModel<DashboardWidgetReadModelPayload>
