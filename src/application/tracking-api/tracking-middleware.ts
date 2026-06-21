import type {
  TrackingMiddlewareContext,
  TrackingMiddlewareHandler,
  TrackingMiddlewareNext,
  TrackingResponse,
} from "./tracking-api.contracts"

export class TrackingMiddleware {
  constructor(private readonly handlers: TrackingMiddlewareHandler[]) {}

  run(
    context: TrackingMiddlewareContext,
    terminal: () => Promise<TrackingResponse>
  ): Promise<TrackingResponse> {
    const dispatch = (index: number): Promise<TrackingResponse> => {
      if (index >= this.handlers.length) {
        return terminal()
      }

      const handler = this.handlers[index]
      const next: TrackingMiddlewareNext = () => dispatch(index + 1)
      return handler(context, next)
    }

    return dispatch(0)
  }
}
