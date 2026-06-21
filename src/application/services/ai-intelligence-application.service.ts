import type {
  AIIntelligenceGateway,
  AIIntelligenceQueryDto,
  AIIntelligenceViewModel,
} from "../contracts"
import { GetAIIntelligenceDashboardUseCase } from "../use-cases"

export class AIIntelligenceApplicationService {
  private readonly getAIIntelligenceDashboardUseCase: GetAIIntelligenceDashboardUseCase

  constructor(gateway: AIIntelligenceGateway) {
    this.getAIIntelligenceDashboardUseCase = new GetAIIntelligenceDashboardUseCase(gateway)
  }

  getIntelligenceDashboard(input: AIIntelligenceQueryDto): Promise<AIIntelligenceViewModel> {
    return this.getAIIntelligenceDashboardUseCase.execute(input)
  }
}
