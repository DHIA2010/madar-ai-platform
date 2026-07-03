export type FrontendExecutionStep =
  | "fetchConnections()"
  | "bootstrapConnections()"
  | "buildConnectionCards()"
  | "getConnectorHealth()"
  | "getRecords()"
  | "deleteConnection()"
  | "invalidateQueries()"
  | "refetchConnections()"

export interface FrontendExecutionEvent {
  step: FrontendExecutionStep
  timestamp: string
  connectionId: string | null
  customerId: string | null
  connectionCount: number
  stackTop5: string[]
  details?: string
}

declare global {
  interface Window {
    __frontendExecutionTimeline?: FrontendExecutionEvent[]
  }
}

function getTopFrames(limit = 5): string[] {
  const stack = new Error().stack ?? ""
  return stack
    .split("\n")
    .slice(2)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, limit)
}

export function traceFrontendExecution(input: {
  step: FrontendExecutionStep
  connectionId?: string | null
  customerId?: string | null
  connectionCount: number
  details?: string
}) {
  const event: FrontendExecutionEvent = {
    step: input.step,
    timestamp: new Date().toISOString(),
    connectionId: input.connectionId ?? null,
    customerId: input.customerId ?? null,
    connectionCount: input.connectionCount,
    stackTop5: getTopFrames(5),
    details: input.details,
  }

  if (typeof window !== "undefined") {
    if (!window.__frontendExecutionTimeline) {
      window.__frontendExecutionTimeline = []
    }

    window.__frontendExecutionTimeline.push(event)
  }

  // Keep console logging for live debugging in browser devtools.
  console.log("[frontend-execution-trace]", event)
}
