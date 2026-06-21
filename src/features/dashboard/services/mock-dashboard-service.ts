import type { DashboardPackageResolverInput, DashboardService } from "../types"

import { createMockDashboardGateway, MockDashboardGateway } from "@/infrastructure"

export class MockDashboardService extends MockDashboardGateway implements DashboardService {
  async resolvePackage(input: DashboardPackageResolverInput) {
    return super.resolvePackage(input)
  }
}

export function createMockDashboardService(): DashboardService {
  return createMockDashboardGateway()
}
