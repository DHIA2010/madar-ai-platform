import type {
  DashboardGateway,
  DashboardPackageDto,
  DashboardPackageQueryDto,
  DashboardWidgetReadModelPayload,
} from "../contracts"

export class ResolveDashboardPackageQuery {
  constructor(private readonly gateway: DashboardGateway) {}

  async execute(input: DashboardPackageQueryDto): Promise<DashboardPackageDto> {
    return this.gateway.resolvePackage(input)
  }
}

export class GetWidgetReadModelQuery {
  constructor(private readonly gateway: DashboardGateway) {}

  async execute(widgetId: string): Promise<DashboardWidgetReadModelPayload | null> {
    return this.gateway.getWidgetReadModel(widgetId)
  }
}

export class GetDashboardReadModelQuery {
  constructor(private readonly widgetQuery: GetWidgetReadModelQuery) {}

  async execute(widgetIds: string[]) {
    const entries = await Promise.all(
      widgetIds.map(
        async (widgetId) => [widgetId, await this.widgetQuery.execute(widgetId)] as const
      )
    )

    return Object.fromEntries(entries)
  }
}
