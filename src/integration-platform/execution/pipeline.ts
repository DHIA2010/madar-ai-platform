import type {
  ExecutionInterceptor,
  ExecutionInterceptorContext,
  ExecutionInterceptorNext,
} from "./bus.contracts"
import type { ExecutionRuntimeResult } from "./runtime.contracts"

export class ExecutionPipeline {
  private readonly interceptors: ExecutionInterceptor[] = []

  use(interceptor: ExecutionInterceptor) {
    this.interceptors.push(interceptor)
  }

  async run(
    context: ExecutionInterceptorContext,
    dispatch: ExecutionInterceptorNext
  ): Promise<ExecutionRuntimeResult> {
    const chain = [...this.interceptors]
    let index = -1

    const invoke = async (): Promise<ExecutionRuntimeResult> => {
      index += 1
      const interceptor = chain[index]
      if (!interceptor) {
        return dispatch()
      }
      return interceptor(context, invoke)
    }

    return invoke()
  }
}
