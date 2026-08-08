import type { EmailGateway } from "../../application/ports"
import type { IdentityPlatformConfig } from "../../configuration"

const BRAND_COLOR = "#7C3AED"

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function renderLayout(input: {
  preheader: string
  heading: string
  bodyHtml: string
  ctaLabel?: string
  ctaUrl?: string
}) {
  const cta =
    input.ctaLabel && input.ctaUrl
      ? `<tr><td style="padding:28px 0 4px;">
           <a href="${input.ctaUrl}" style="background:${BRAND_COLOR};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px;display:inline-block;">${escapeHtml(input.ctaLabel)}</a>
         </td></tr>`
      : ""

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <span style="display:none;font-size:1px;color:#f4f4f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(input.preheader)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:480px;width:100%;">
            <tr>
              <td style="background:${BRAND_COLOR};padding:20px 32px;">
                <span style="color:#ffffff;font-size:16px;font-weight:700;letter-spacing:0.02em;">MADAR</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr><td style="font-size:19px;font-weight:700;color:#111827;padding-bottom:12px;">${escapeHtml(input.heading)}</td></tr>
                  <tr><td style="font-size:14px;line-height:22px;color:#4b5563;">${input.bodyHtml}</td></tr>
                  ${cta}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#fafafa;border-top:1px solid #eee;">
                <span style="font-size:12px;color:#9ca3af;">MADAR &mdash; AI Marketing Intelligence</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export class ResendEmailGateway implements EmailGateway {
  constructor(private readonly config: IdentityPlatformConfig) {}

  private get from() {
    const email = this.config.resendFromEmail ?? this.config.emailFrom
    const name = this.config.resendFromName
    return name ? `${name} <${email}>` : email
  }

  private async send(input: { to: string; subject: string; html: string; text: string }) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [input.to],
        reply_to: this.config.resendReplyTo,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    })
    if (!response.ok) {
      const body = await response.text().catch(() => "")
      throw new Error(`Resend email send failed (${response.status}): ${body}`)
    }
  }

  async sendVerificationEmail(input: { email: string; token: string }) {
    const url = `${this.config.appUrl.replace(/\/$/, "")}/auth/basic/verify-email?token=${encodeURIComponent(input.token)}`
    await this.send({
      to: input.email,
      subject: "Verify your email",
      text: `Verify your email by visiting: ${url}`,
      html: renderLayout({
        preheader: "Confirm your email address to finish setting up your MADAR account.",
        heading: "Verify your email",
        bodyHtml: "Confirm this is your email address to finish setting up your MADAR account.",
        ctaLabel: "Verify email",
        ctaUrl: url,
      }),
    })
  }

  async sendPasswordResetEmail(input: { email: string; token: string }) {
    const url = `${this.config.appUrl.replace(/\/$/, "")}/auth/basic/reset-password?token=${encodeURIComponent(input.token)}`
    await this.send({
      to: input.email,
      subject: "Reset your password",
      text: `Reset your password by visiting: ${url}`,
      html: renderLayout({
        preheader: "Reset your MADAR password.",
        heading: "Reset your password",
        bodyHtml:
          "We received a request to reset your password. If this wasn't you, you can safely ignore this email.",
        ctaLabel: "Reset password",
        ctaUrl: url,
      }),
    })
  }

  async sendInvitationEmail(input: {
    email: string
    token: string
    organizationId: string
    workspaceId?: string
    organizationName?: string
    workspaceName?: string
  }) {
    const url = `${this.config.appUrl.replace(/\/$/, "")}/auth/basic/register?invitation=${encodeURIComponent(input.token)}&email=${encodeURIComponent(input.email)}`
    const orgLabel = input.organizationName ?? "a MADAR organization"
    const scope = input.workspaceName
      ? ` &mdash; workspace <strong>${escapeHtml(input.workspaceName)}</strong>`
      : ""
    await this.send({
      to: input.email,
      subject: `You've been invited to join ${input.organizationName ?? "MADAR"}`,
      text: `You've been invited to join ${orgLabel}${input.workspaceName ? ` (workspace: ${input.workspaceName})` : ""} on MADAR. Accept your invitation: ${url}`,
      html: renderLayout({
        preheader: `You've been invited to join ${orgLabel} on MADAR.`,
        heading: "You've been invited",
        bodyHtml: `You've been invited to join <strong>${escapeHtml(orgLabel)}</strong>${scope} on MADAR. Sign in (or create an account with this email address) to accept.`,
        ctaLabel: "Accept invitation",
        ctaUrl: url,
      }),
    })
  }
}
