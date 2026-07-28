import type { Logger } from "../../application/ports"

export class ConsoleLogger implements Logger {
  info(message: string, details: Record<string, unknown> = {}) {
    console.info(JSON.stringify({ level: "info", message, ...details }))
  }

  warn(message: string, details: Record<string, unknown> = {}) {
    console.warn(JSON.stringify({ level: "warn", message, ...details }))
  }

  error(message: string, details: Record<string, unknown> = {}) {
    console.error(JSON.stringify({ level: "error", message, ...details }))
  }
}
