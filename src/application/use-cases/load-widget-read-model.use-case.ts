import type { DashboardGateway, DashboardWidgetReadModel } from "../contracts"
import { mapDashboardWidgetDtoToReadModel } from "../mappers"
import { GetWidgetReadModelQuery } from "../queries"
import { ReadModelNotFoundError } from "../errors"
import { widgetReadModelQuerySchema } from "../validators"

export class LoadWidgetReadModelUseCase {
  private readonly query: GetWidgetReadModelQuery

  constructor(gateway: DashboardGateway) {
    this.query = new GetWidgetReadModelQuery(gateway)
  }

  async execute(widgetId: string): Promise<DashboardWidgetReadModel> {
    const validatedInput = widgetReadModelQuerySchema.parse({ widgetId })
    const payload = await this.query.execute(validatedInput.widgetId)
    if (!payload) {
      throw new ReadModelNotFoundError(validatedInput.widgetId)
    }

    return mapDashboardWidgetDtoToReadModel(validatedInput.widgetId, payload)
  }
}
