import type {
  AttachIdentityRequestDto,
  CustomerIntelligenceGateway,
  JourneyViewModel,
} from "../contracts"
import { mapJourneyDtoToReadModel, mapJourneyReadModelToViewModel } from "../mappers"
import { AttachIdentityQuery } from "../queries"
import { attachIdentitySchema } from "../validators"

export class AttachIdentityUseCase {
  private readonly query: AttachIdentityQuery

  constructor(gateway: CustomerIntelligenceGateway) {
    this.query = new AttachIdentityQuery(gateway)
  }

  async execute(input: AttachIdentityRequestDto): Promise<JourneyViewModel> {
    const validatedInput = attachIdentitySchema.parse(input)
    const payload = await this.query.execute(validatedInput)
    return mapJourneyReadModelToViewModel(mapJourneyDtoToReadModel(payload))
  }
}
