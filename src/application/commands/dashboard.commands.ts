import type { DashboardPackageQueryDto } from "../contracts"

export class RefreshDashboardCommand {
  execute(input: DashboardPackageQueryDto): DashboardPackageQueryDto {
    return input
  }
}
