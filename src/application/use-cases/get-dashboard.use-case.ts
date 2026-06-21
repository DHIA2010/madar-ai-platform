import type {
  DashboardApplicationBundle,
  DashboardGateway,
  DashboardPackageQueryDto,
} from "../contracts"
import { mapDashboardBundleToViewModel } from "../mappers"
import { GetDashboardReadModelQuery } from "../queries"
import { ResolveDashboardPackageUseCase } from "./resolve-dashboard-package.use-case"
import { GetWidgetReadModelQuery } from "../queries"
import { mapDashboardWidgetDtoToReadModel } from "../mappers"

export class GetDashboardUseCase {
  private readonly resolveDashboardPackageUseCase: ResolveDashboardPackageUseCase
  private readonly getDashboardReadModelQuery: GetDashboardReadModelQuery

  constructor(gateway: DashboardGateway) {
    this.resolveDashboardPackageUseCase = new ResolveDashboardPackageUseCase(gateway)
    this.getDashboardReadModelQuery = new GetDashboardReadModelQuery(
      new GetWidgetReadModelQuery(gateway)
    )
  }

  async execute(input: DashboardPackageQueryDto): Promise<DashboardApplicationBundle> {
    const dashboardPackage = await this.resolveDashboardPackageUseCase.execute(input)
    const readModelPayloads = await this.getDashboardReadModelQuery.execute(
      dashboardPackage.widgets
    )
    const readModels = Object.fromEntries(
      Object.entries(readModelPayloads)
        .filter((entry): entry is [string, NonNullable<(typeof readModelPayloads)[string]>] =>
          Boolean(entry[1])
        )
        .map(([widgetId, payload]) => [
          widgetId,
          mapDashboardWidgetDtoToReadModel(widgetId, payload),
        ])
    )

    return mapDashboardBundleToViewModel({
      dashboardPackage,
      readModels,
    })
  }
}
