import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { IdentityError } from "../application/errors/IdentityError"
import { ZatcaApiError, submitZatcaReporting, zatcaErrorMessage } from "../zatca/zatca-api-client"
import type { ZatcaDevicesService } from "../zatca/zatca-devices-service"

// Reports signed sales (pos_invoices) and returns (pos_invoice_returns, as credit notes) to
// ZATCA's Reporting API. Every document is reported right after it is saved (reportInBackground,
// from PosInvoicesService), and a timer retries whatever could not be reported then
// (reportPending, from server.ts) -- ZATCA wants every simplified invoice within 24 hours.
//
// Outcomes:
// - reported: ZATCA accepted it (REPORTED, warnings or not). Never sent again.
// - rejected: ZATCA refused its content (400 NOT_REPORTED). Not retried on its own -- sending the
//   same signed XML again would get the same answer -- but listed with ZATCA's reason so it can
//   be retried by hand (e.g. after a device problem is fixed).
// - failed: anything else (ZATCA down, network, auth). Retried by the timer.
export type ZatcaDocumentKind = "invoice" | "return"

const TABLE: Record<ZatcaDocumentKind, string> = {
  invoice: "pos_invoices",
  return: "pos_invoice_returns",
}
const NUMBER_COLUMN: Record<ZatcaDocumentKind, string> = {
  invoice: "invoice_number",
  return: "return_number",
}

export type ZatcaReportOutcome =
  | { result: "reported"; status: string }
  // error is in English; errorAr is ZATCA's Arabic wording of the same reason (null when there
  // is none, e.g. a network failure).
  | { result: "rejected"; status: string; error: string; errorAr: string | null }
  | { result: "failed"; status: null; error: string; errorAr: string | null }

export interface ZatcaUnreportedDocument {
  kind: ZatcaDocumentKind
  id: string
  number: string
  totalAmount: number
  createdAt: string
  // NOT_REPORTED once ZATCA refused it; null while it was never answered.
  zatcaStatus: string | null
  lastError: string | null
  lastErrorAr: string | null
  attempts: number
  lastAttemptAt: string | null
}

type ReportableRow = {
  organization_id: string
  zatca_device_id: string | null
  zatca_signed_xml: string | null
  invoice_hash: string | null
  zatca_uuid: string | null
  zatca_reported_at: Date | string | null
}

// Two tasks (or the timer and a click) must not send the same document at once: a document is
// claimed for this long by whoever starts sending it.
const CLAIM_MS = 60_000

const toIso = (value: Date | string | null) =>
  value === null
    ? null
    : value instanceof Date
      ? value.toISOString()
      : new Date(value).toISOString()

export class PosZatcaReporting {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly devicesService: ZatcaDevicesService
  ) {}

  // Fire-and-forget after a sale or return is committed: never delays or fails the checkout.
  reportInBackground(kind: ZatcaDocumentKind, id: string): void {
    void this.report(kind, id).catch((error: unknown) =>
      console.error("zatca.auto_report_failed", { kind, id, error })
    )
  }

  // Sends one document. Returns the outcome, already saved on the row; returns null when the
  // document isn't signed, is already reported, or someone else is sending it right now.
  async report(
    kind: ZatcaDocumentKind,
    id: string,
    organizationId?: string
  ): Promise<ZatcaReportOutcome | null> {
    const table = TABLE[kind]
    const params: unknown[] = [id, new Date(Date.now() - CLAIM_MS)]
    if (organizationId) params.push(organizationId)
    const claimed = await this.database.query<ReportableRow>(
      `UPDATE ${table} SET zatca_last_attempt_at = now()
        WHERE id = $1 AND zatca_reported_at IS NULL AND zatca_signed_xml IS NOT NULL
          AND (zatca_last_attempt_at IS NULL OR zatca_last_attempt_at < $2)
          ${organizationId ? "AND organization_id = $3" : ""}
        RETURNING organization_id, zatca_device_id, zatca_signed_xml, invoice_hash, zatca_uuid,
                  zatca_reported_at`,
      params
    )
    const row = claimed.rows[0]
    if (!row || !row.zatca_device_id || !row.invoice_hash || !row.zatca_uuid) return null

    const outcome = await this.send(row)
    await this.database.query(
      `UPDATE ${table}
          SET zatca_attempts = zatca_attempts + 1, zatca_last_error = $2, zatca_status = $3,
              zatca_response = COALESCE($4::jsonb, zatca_response),
              zatca_reported_at = CASE WHEN $5 THEN now() ELSE zatca_reported_at END,
              zatca_last_error_ar = $6
        WHERE id = $1`,
      [
        id,
        outcome.result === "reported" ? null : outcome.error,
        outcome.status,
        outcome.raw === undefined ? null : JSON.stringify(outcome.raw),
        outcome.result === "reported",
        outcome.result === "reported" ? null : outcome.errorAr,
      ]
    )
    if (outcome.result !== "reported") {
      console.error("zatca.report_not_accepted", { kind, id, outcome: outcome.result })
    }
    return outcome.result === "reported"
      ? { result: "reported", status: outcome.status }
      : outcome.result === "rejected"
        ? {
            result: "rejected",
            status: outcome.status,
            error: outcome.error,
            errorAr: outcome.errorAr,
          }
        : { result: "failed", status: null, error: outcome.error, errorAr: outcome.errorAr }
  }

  private async send(row: ReportableRow): Promise<ZatcaReportOutcome & { raw?: unknown }> {
    let submit: ((language: "en" | "ar") => ReturnType<typeof submitZatcaReporting>) | null = null
    try {
      const credentials = await this.devicesService.getProductionCredentials(
        row.organization_id,
        row.zatca_device_id!
      )
      submit = (language) =>
        submitZatcaReporting(
          credentials.environment,
          row.invoice_hash!,
          row.zatca_uuid!,
          Buffer.from(row.zatca_signed_xml!, "utf8").toString("base64"),
          credentials,
          language
        )
      const report = await submit("en")
      if (report.status === "NOT_REPORTED") {
        return {
          result: "rejected",
          status: report.status,
          error: zatcaErrorMessage(report.raw) ?? "ZATCA did not accept the document.",
          errorAr: await this.arabicReason(submit),
          raw: report.raw,
        }
      }
      return { result: "reported", status: report.status, raw: report.raw }
    } catch (error) {
      if (error instanceof ZatcaApiError && error.status === 400) {
        return {
          result: "rejected",
          status: "NOT_REPORTED",
          error: zatcaErrorMessage(error.body) ?? "ZATCA did not accept the document.",
          errorAr: submit ? await this.arabicReason(submit) : null,
          raw: error.body,
        }
      }
      // 409: ZATCA already has this document (an earlier attempt got through but its answer was
      // lost) -- it counts as reported.
      if (error instanceof ZatcaApiError && error.status === 409) {
        return { result: "reported", status: "REPORTED", raw: error.body }
      }
      const message =
        error instanceof ZatcaApiError
          ? (zatcaErrorMessage(error.body) ?? error.message)
          : error instanceof Error
            ? error.message
            : String(error)
      return {
        result: "failed",
        status: null,
        error: message.slice(0, 500),
        errorAr: error instanceof ZatcaApiError ? zatcaErrorMessage(error.body, "ar") : null,
      }
    }
  }

  // ZATCA words its business rules in Arabic when asked, so a refused document is sent once more
  // asking for Arabic -- it's refused again (nothing about it changed), this time in Arabic.
  private async arabicReason(
    submit: (language: "en" | "ar") => ReturnType<typeof submitZatcaReporting>
  ): Promise<string | null> {
    try {
      const report = await submit("ar")
      return report.status === "NOT_REPORTED" ? zatcaErrorMessage(report.raw, "ar") : null
    } catch (error) {
      return error instanceof ZatcaApiError ? zatcaErrorMessage(error.body, "ar") : null
    }
  }

  // The "report to ZATCA" button on one document: same as the automatic path, but a refusal
  // comes back as an error carrying ZATCA's reason.
  async reportNow(
    kind: ZatcaDocumentKind,
    organizationId: string,
    id: string
  ): Promise<{ status: string }> {
    const outcome = await this.report(kind, id, organizationId)
    if (!outcome) {
      const existing = await this.database.query<{
        zatca_signed_xml: string | null
        zatca_reported_at: Date | string | null
      }>(
        `SELECT zatca_signed_xml, zatca_reported_at FROM ${TABLE[kind]}
          WHERE id = $1 AND organization_id = $2`,
        [id, organizationId]
      )
      const row = existing.rows[0]
      if (!row) throw new IdentityError("POS_INVOICE_NOT_FOUND", 404, "business", "Not found.")
      if (!row.zatca_signed_xml) {
        throw new IdentityError(
          "POS_INVOICE_NOT_ZATCA_SIGNED",
          409,
          "business",
          "This document wasn't signed by a ZATCA production device -- there is nothing to report."
        )
      }
      if (row.zatca_reported_at) {
        throw new IdentityError(
          "POS_INVOICE_ALREADY_REPORTED_TO_ZATCA",
          409,
          "business",
          "This document has already been reported to ZATCA."
        )
      }
      throw new IdentityError(
        "ZATCA_REPORT_IN_PROGRESS",
        409,
        "business",
        "This document is being reported to ZATCA right now."
      )
    }
    if (outcome.result !== "reported") {
      throw new IdentityError("ZATCA_REJECTED", 422, "business", outcome.error, {
        result: outcome.result,
        reasonAr: outcome.errorAr,
      })
    }
    return { status: outcome.status }
  }

  // Every signed sale and return of this organization ZATCA hasn't accepted yet, oldest first.
  async listUnreported(organizationId: string): Promise<ZatcaUnreportedDocument[]> {
    const documents: ZatcaUnreportedDocument[] = []
    for (const kind of ["invoice", "return"] as const) {
      const result = await this.database.query<{
        id: string
        number: string
        total_amount: string | number
        created_at: Date | string
        zatca_status: string | null
        zatca_last_error: string | null
        zatca_last_error_ar: string | null
        zatca_attempts: number
        zatca_last_attempt_at: Date | string | null
      }>(
        `SELECT id, ${NUMBER_COLUMN[kind]} AS number, total_amount, created_at, zatca_status,
                zatca_last_error, zatca_last_error_ar, zatca_attempts, zatca_last_attempt_at
           FROM ${TABLE[kind]}
          WHERE organization_id = $1 AND zatca_signed_xml IS NOT NULL
            AND zatca_reported_at IS NULL`,
        [organizationId]
      )
      for (const row of result.rows) {
        documents.push({
          kind,
          id: row.id,
          number: row.number,
          totalAmount: Number(row.total_amount),
          createdAt: toIso(row.created_at)!,
          zatcaStatus: row.zatca_status,
          lastError: row.zatca_last_error,
          lastErrorAr: row.zatca_last_error_ar,
          attempts: Number(row.zatca_attempts),
          lastAttemptAt: toIso(row.zatca_last_attempt_at),
        })
      }
    }
    return documents.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  // "Report all": every unreported document of this organization, rejected ones included.
  async reportAll(
    organizationId: string
  ): Promise<{ reported: number; rejected: number; failed: number; skipped: number }> {
    const summary = { reported: 0, rejected: 0, failed: 0, skipped: 0 }
    for (const document of await this.listUnreported(organizationId)) {
      const outcome = await this.report(document.kind, document.id, organizationId)
      if (!outcome) summary.skipped += 1
      else summary[outcome.result] += 1
    }
    return summary
  }

  // The timer's pass, across every organization: documents never answered by ZATCA (or that
  // failed for a reason other than a refusal), oldest first. Refused ones wait for a person.
  async reportPending(
    limit = 200
  ): Promise<{ reported: number; rejected: number; failed: number }> {
    const summary = { reported: 0, rejected: 0, failed: 0 }
    for (const kind of ["invoice", "return"] as const) {
      const pending = await this.database.query<{ id: string }>(
        `SELECT id FROM ${TABLE[kind]}
          WHERE zatca_signed_xml IS NOT NULL AND zatca_reported_at IS NULL
            AND (zatca_status IS NULL OR zatca_status <> 'NOT_REPORTED')
          ORDER BY created_at
          LIMIT ${Math.max(1, Math.floor(limit))}`
      )
      for (const row of pending.rows) {
        const outcome = await this.report(kind, row.id)
        if (outcome) summary[outcome.result] += 1
      }
    }
    return summary
  }
}
