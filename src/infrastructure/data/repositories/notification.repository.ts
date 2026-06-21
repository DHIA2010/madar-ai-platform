import type { NotificationRepository } from "@/application/contracts/infrastructure.contracts"

export class DataNotificationRepository implements NotificationRepository {
  async notify(_notification?: {
    title?: string
    message?: string
    level?: "info" | "success" | "warning" | "error"
  }): Promise<void> {
    return
  }
}

export function createNotificationRepository(): NotificationRepository {
  return new DataNotificationRepository()
}
