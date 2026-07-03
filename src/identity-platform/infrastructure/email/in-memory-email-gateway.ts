import type { EmailGateway } from "../../application/ports"

export class InMemoryEmailGateway implements EmailGateway {
  readonly sent: Array<Record<string, string>> = []

  async sendVerificationEmail(input: { email: string; token: string }) {
    this.sent.push({ kind: "verification", ...input })
  }

  async sendPasswordResetEmail(input: { email: string; token: string }) {
    this.sent.push({ kind: "password_reset", ...input })
  }

  async sendInvitationEmail(input: {
    email: string
    token: string
    organizationId: string
    workspaceId?: string
  }) {
    this.sent.push({ kind: "invitation", ...input })
  }
}
