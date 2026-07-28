import type {
  AIIntelligenceDashboardDto,
  AIIntelligenceGateway,
  AIIntelligenceQueryDto,
} from "../contracts"

export class GetAIIntelligenceDashboardQuery {
  constructor(private readonly gateway: AIIntelligenceGateway) {}

  async execute(input: AIIntelligenceQueryDto): Promise<AIIntelligenceDashboardDto> {
    return this.gateway.getIntelligenceDashboard(input)
  }
}
