import type {
  AIIntelligenceDashboardDto,
  AIIntelligenceGateway,
  AIIntelligenceQueryDto,
  AIIntelligenceViewModel,
} from "../contracts"
import { GetAIIntelligenceDashboardQuery } from "../queries"

function mapToViewModel(payload: AIIntelligenceDashboardDto): AIIntelligenceViewModel {
  return {
    id: `ai-intelligence:${payload.workspaceId}`,
    freshness: "fresh",
    payload,
  }
}

export class GetAIIntelligenceDashboardUseCase {
  private readonly query: GetAIIntelligenceDashboardQuery

  constructor(gateway: AIIntelligenceGateway) {
    this.query = new GetAIIntelligenceDashboardQuery(gateway)
  }

  async execute(input: AIIntelligenceQueryDto): Promise<AIIntelligenceViewModel> {
    const payload = await this.query.execute(input)
    return mapToViewModel(payload)
  }
}
