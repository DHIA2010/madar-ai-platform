import type {
  DashboardApplicationBundle,
  DashboardGateway,
  DashboardPackageQueryDto,
} from "../contracts"
import { RefreshDashboardCommand } from "../commands"
import { GetDashboardUseCase } from "./get-dashboard.use-case"

export class RefreshDashboardUseCase {
  private readonly command = new RefreshDashboardCommand()
  private readonly getDashboardUseCase: GetDashboardUseCase

  constructor(gateway: DashboardGateway) {
    this.getDashboardUseCase = new GetDashboardUseCase(gateway)
  }

  async execute(input: DashboardPackageQueryDto): Promise<DashboardApplicationBundle> {
    return this.getDashboardUseCase.execute(this.command.execute(input))
  }
}
