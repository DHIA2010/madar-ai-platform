import type { DashboardGateway, DashboardPackageDto, DashboardPackageQueryDto } from "../contracts"
import { ResolveDashboardPackageQuery } from "../queries"
import { dashboardPackageQueryDtoSchema } from "../validators"

export class ResolveDashboardPackageUseCase {
  private readonly query: ResolveDashboardPackageQuery

  constructor(gateway: DashboardGateway) {
    this.query = new ResolveDashboardPackageQuery(gateway)
  }

  async execute(input: DashboardPackageQueryDto): Promise<DashboardPackageDto> {
    const validatedInput: DashboardPackageQueryDto = dashboardPackageQueryDtoSchema.parse(input)
    return this.query.execute(validatedInput)
  }
}
