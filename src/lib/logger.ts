export type LogLevel = "debug" | "info" | "warn" | "error"

export interface Logger {
  debug(message: string, data?: unknown): void
  info(message: string, data?: unknown): void
  warn(message: string, data?: unknown): void
  error(message: string, data?: unknown): void
}

function write(level: LogLevel, message: string, data?: unknown) {
  const prefix = `[MADAR:${level}]`

  if (data === undefined) {
    console[level](prefix, message)
    return
  }

  console[level](prefix, message, data)
}

export function createLogger(): Logger {
  return {
    debug: (message, data) => write("debug", message, data),
    info: (message, data) => write("info", message, data),
    warn: (message, data) => write("warn", message, data),
    error: (message, data) => write("error", message, data),
  }
}

export const logger = createLogger()
