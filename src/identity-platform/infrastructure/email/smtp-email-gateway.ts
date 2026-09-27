import nodemailer from "nodemailer"

import type { EmailGateway } from "../../application/ports"
import type { IdentityPlatformConfig } from "../../configuration"

export class SmtpEmailGateway implements EmailGateway {
  private readonly transport

  constructor(private readonly config: IdentityPlatformConfig) {
    this.transport = config.smtpHost
      ? nodemailer.createTransport({
          host: config.smtpHost,
          port: config.smtpPort ?? 587,
          auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPassword } : undefined,
        })
      : nodemailer.createTransport({ jsonTransport: true })
  }

  async sendVerificationEmail(input: { email: string; token: string }) {
    await this.transport.sendMail({
      from: this.config.emailFrom,
      to: input.email,
      subject: "Verify your email",
      text: `Verification token: ${input.token}`,
    })
  }

  async sendPasswordResetEmail(input: { email: string; token: string }) {
    await this.transport.sendMail({
      from: this.config.emailFrom,
      to: input.email,
      subject: "Reset your password",
      text: `Password reset token: ${input.token}`,
    })
  }

  async sendInvitationEmail(input: {
    email: string
    token: string
    organizationId: string
    workspaceId?: string
    fullName?: string
  }) {
    const workspaceInfo = input.workspaceId ? `\nWorkspace: ${input.workspaceId}` : ""
    const greeting = input.fullName ? `Hi ${input.fullName},\n\n` : ""
    await this.transport.sendMail({
      from: this.config.emailFrom,
      to: input.email,
      subject: "Workspace invitation",
      text: `${greeting}Invitation token: ${input.token}\nOrganization: ${input.organizationId}${workspaceInfo}`,
    })
  }

  async sendZidWelcomeEmail(input: {
    email: string
    password: string
    loginUrl: string
    storeName: string
  }) {
    await this.transport.sendMail({
      from: this.config.emailFrom,
      to: input.email,
      subject: `Your MADAR account for ${input.storeName} is ready`,
      text: `Email: ${input.email}\nTemporary password: ${input.password}\nSign in: ${input.loginUrl}\nYou can change this password anytime from Settings.`,
    })
  }
}
