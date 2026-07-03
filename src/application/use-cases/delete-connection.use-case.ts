import type { DeleteConnectionRequestDto, IntegrationGateway } from "../contracts"
import { DeleteConnectionQuery } from "../queries"
import { deleteConnectionSchema } from "../validators"

export class DeleteConnectionUseCase {
  private readonly query: DeleteConnectionQuery

  constructor(gateway: IntegrationGateway) {
    this.query = new DeleteConnectionQuery(gateway)
  }

  async execute(input: DeleteConnectionRequestDto): Promise<void> {
    const validated = deleteConnectionSchema.parse(input)
    await this.query.execute(validated)
  }
}
