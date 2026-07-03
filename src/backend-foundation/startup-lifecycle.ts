import type { FoundationLogger } from "./types"

interface StartupTask {
  name: string
  run(): Promise<void>
}

interface ShutdownTask {
  name: string
  run(): Promise<void>
}

export class StartupLifecycle {
  private readonly startupTasks: StartupTask[] = []
  private readonly shutdownTasks: ShutdownTask[] = []
  private phase: "idle" | "starting" | "ready" | "stopping" | "stopped" = "idle"

  constructor(private readonly logger: FoundationLogger) {}

  registerStartupTask(task: StartupTask) {
    this.startupTasks.push(task)
  }

  registerShutdownTask(task: ShutdownTask) {
    this.shutdownTasks.push(task)
  }

  getStatus() {
    return this.phase
  }

  async start() {
    this.phase = "starting"
    for (const task of this.startupTasks) {
      this.logger.info("startup.task.begin", { task: task.name })
      await task.run()
      this.logger.info("startup.task.done", { task: task.name })
    }
    this.phase = "ready"
  }

  async stop() {
    this.phase = "stopping"
    for (const task of [...this.shutdownTasks].reverse()) {
      this.logger.info("shutdown.task.begin", { task: task.name })
      await task.run()
      this.logger.info("shutdown.task.done", { task: task.name })
    }
    this.phase = "stopped"
  }
}
