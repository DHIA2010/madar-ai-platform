import type {
  DashboardApplicationBundle,
  DashboardPackageDto,
  DashboardWidgetReadModel,
  DashboardWidgetReadModelPayload,
  DashboardWidgetReadModelViewModel,
} from "../contracts"
import { createReadModel } from "../read-models"

export function mapDashboardWidgetDtoToReadModel(
  widgetId: string,
  payload: DashboardWidgetReadModelPayload
): DashboardWidgetReadModel {
  return createReadModel({
    id: `${widgetId}:read-model`,
    owner: "dashboard",
    sourceDomains: ["dashboard"],
    payload,
  })
}

export function mapReadModelToViewModel(
  readModel: DashboardWidgetReadModel
): DashboardWidgetReadModelViewModel {
  return {
    id: readModel.id,
    freshness: readModel.freshness,
    payload: readModel.payload,
  }
}

export function mapDashboardBundleToViewModel(input: {
  dashboardPackage: DashboardPackageDto
  readModels: Record<string, DashboardWidgetReadModel>
}): DashboardApplicationBundle {
  return {
    dashboardPackage: input.dashboardPackage,
    readModels: input.readModels,
    viewModels: Object.fromEntries(
      Object.entries(input.readModels).map(([widgetId, readModel]) => [
        widgetId,
        mapReadModelToViewModel(readModel),
      ])
    ),
  }
}
