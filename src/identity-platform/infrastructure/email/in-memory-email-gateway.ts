import type {
  EmailGateway,
  AccountActivatedEmail,
  RenewalReminderEmail,
  SalesLeadEmail,
  StoreWelcomeEmail,
} from "../../application/ports"

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

  async sendZidWelcomeEmail(input: {
    email: string
    password: string
    loginUrl: string
    storeName: string
  }) {
    this.sent.push({ kind: "zid_welcome", ...input })
  }

  async sendStoreWelcomeEmail(input: StoreWelcomeEmail) {
    this.sent.push({
      kind: "store_welcome",
      ...input,
      password: input.password ?? "",
      signInUrl: input.signInUrl ?? "",
    })
  }

  async sendRenewalReminderEmail(input: RenewalReminderEmail) {
    this.sent.push({ ...input, reminderKind: input.kind, kind: "renewal_reminder" })
  }

  async sendSalesLeadEmail(input: SalesLeadEmail) {
    this.sent.push({ kind: "sales_lead", ...input, email: input.email ?? "" })
  }

  async sendAccountActivatedEmail(input: AccountActivatedEmail) {
    this.sent.push({
      kind: "account_activated",
      email: input.email,
      fullName: input.fullName,
      companyName: input.companyName,
      applications: input.applications.join(","),
      newAccount: String(input.newAccount),
      actionUrl: input.actionUrl,
    })
  }
}
