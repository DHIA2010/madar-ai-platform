import type {
  DashboardApplicationBundle,
  DashboardGateway,
  DashboardPackageDto,
  DashboardPackageQueryDto,
  DashboardWidgetReadModel,
  FeatureFlagGateway,
} from "../contracts"
import {
  GetDashboardUseCase,
  LoadWidgetReadModelUseCase,
  RefreshDashboardUseCase,
  ResolveDashboardPackageUseCase,
} from "../use-cases"

export class DashboardApplicationService {
  private readonly getDashboardUseCase: GetDashboardUseCase
  private readonly refreshDashboardUseCase: RefreshDashboardUseCase
  private readonly resolveDashboardPackageUseCase: ResolveDashboardPackageUseCase
  private readonly loadWidgetReadModelUseCase: LoadWidgetReadModelUseCase

  constructor(
    gateway: DashboardGateway,
    private readonly featureFlagGateway?: FeatureFlagGateway
  ) {
    this.getDashboardUseCase = new GetDashboardUseCase(gateway)
    this.refreshDashboardUseCase = new RefreshDashboardUseCase(gateway)
    this.resolveDashboardPackageUseCase = new ResolveDashboardPackageUseCase(gateway)
    this.loadWidgetReadModelUseCase = new LoadWidgetReadModelUseCase(gateway)
  }

  private withResolvedFeatureFlags(input: DashboardPackageQueryDto): DashboardPackageQueryDto {
    if (!this.featureFlagGateway) {
      return input
    }

    return {
      ...input,
      featureFlags: {
        ...this.featureFlagGateway.getFlags(),
        ...input.featureFlags,
      },
    }
  }

  getDashboard(input: DashboardPackageQueryDto): Promise<DashboardApplicationBundle> {
    return this.getDashboardUseCase.execute(this.withResolvedFeatureFlags(input))
  }

  refreshDashboard(input: DashboardPackageQueryDto): Promise<DashboardApplicationBundle> {
    return this.refreshDashboardUseCase.execute(this.withResolvedFeatureFlags(input))
  }

  resolveDashboardPackage(input: DashboardPackageQueryDto): Promise<DashboardPackageDto> {
    return this.resolveDashboardPackageUseCase.execute(this.withResolvedFeatureFlags(input))
  }

  loadWidgetReadModel(widgetId: string): Promise<DashboardWidgetReadModel> {
    return this.loadWidgetReadModelUseCase.execute(widgetId)
  }
}
