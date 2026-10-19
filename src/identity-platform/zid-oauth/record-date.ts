// Shared between the poll-sync path (sync-service.ts) and the webhook-ingest path
// (webhook-service.ts) so both compute zid_records.record_date identically for the same
// underlying Zid entity -- a webhook-written row and a later poll-written row must never
// disagree on this column just because they went through different code paths.
export function toRecordDate(candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    if (!candidate) continue
    const parsed = new Date(candidate)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10)
    }
  }
  return new Date().toISOString().slice(0, 10)
}
