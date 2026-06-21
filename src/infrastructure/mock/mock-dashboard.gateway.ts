import type {
  DashboardPackageDto,
  DashboardPackageQueryDto,
  DashboardWidgetReadModelPayload,
} from "@/application/contracts/dashboard.contracts"
import type { DashboardGateway } from "@/application/contracts/infrastructure.contracts"

import {
  dashboardWidgetPayloadDtos,
  marketingDashboardPackageDto,
  waitForDashboardMock,
} from "../dashboard"

export class MockDashboardGateway implements DashboardGateway {
  async resolvePackage(_input: DashboardPackageQueryDto): Promise<DashboardPackageDto> {
    await waitForDashboardMock()
    return marketingDashboardPackageDto
  }

  async getWidgetReadModel(widgetId: string): Promise<DashboardWidgetReadModelPayload | null> {
    await waitForDashboardMock()
    return dashboardWidgetPayloadDtos[widgetId] ?? null
  }
}

export function createMockDashboardGateway(): DashboardGateway {
  return new MockDashboardGateway()
}
