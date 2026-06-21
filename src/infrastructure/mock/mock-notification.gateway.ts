import type { NotificationGateway } from "@/application/contracts/infrastructure.contracts"

export class MockNotificationGateway implements NotificationGateway {
  async notify(): Promise<void> {
    return
  }
}

export function createMockNotificationGateway(): NotificationGateway {
  return new MockNotificationGateway()
}
