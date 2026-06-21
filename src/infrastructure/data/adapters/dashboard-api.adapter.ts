import type {
  DashboardPackageDto,
  DashboardWidgetReadModelPayload,
} from "@/application/contracts/dashboard.contracts"
import type { ApiClient } from "@/infrastructure/http"

export class DashboardApiAdapter {
  constructor(private readonly client: ApiClient) {}

  resolvePackage(params: Record<string, unknown>): Promise<DashboardPackageDto> {
    return this.client.get<DashboardPackageDto>("/dashboard/package", {
      query: params,
    })
  }

  getWidgetReadModel(widgetId: string): Promise<DashboardWidgetReadModelPayload | null> {
    return this.client.get<DashboardWidgetReadModelPayload | null>(`/dashboard/widgets/${widgetId}`)
  }
}
