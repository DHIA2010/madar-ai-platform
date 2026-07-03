import type {
  AIIntelligenceQueryDto,
  AIIntelligenceRepository,
} from "@/application/contracts/ai-intelligence.contracts"

import { mockAIIntelligenceDashboard } from "@/infrastructure/ai"
import { assertMockRepositoryEnabled } from "./repository-runtime"

export class DataAIIntelligenceRepository implements AIIntelligenceRepository {
  async getIntelligenceDashboard(input: AIIntelligenceQueryDto) {
    assertMockRepositoryEnabled("ai-intelligence")
    const workspaceId = input.workspaceId ?? mockAIIntelligenceDashboard.workspaceId

    return {
      ...mockAIIntelligenceDashboard,
      workspaceId,
      generatedAt: new Date().toISOString(),
    }
  }
}

export function createAIIntelligenceRepository(): AIIntelligenceRepository {
  return new DataAIIntelligenceRepository()
}
