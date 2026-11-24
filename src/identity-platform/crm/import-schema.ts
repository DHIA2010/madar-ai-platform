import { z } from "zod"

// A list of leads brought in from a file (Madar Admin -> CRM -> "استيراد من ملف"). The browser
// reads the file and sends its rows; each needs a name and a way to reach the business.
const cell = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null))

export const crmLeadImportSchema = z.object({
  // The label every lead of this file carries, so the batch can be found and filtered later.
  tag: z.string().trim().min(1).max(40),
  // Where the rows came from: a file (the default), the free directory, or a Google Maps search.
  source: z.enum(["import", "directory", "google_maps"]).optional(),
  rows: z
    .array(
      z.object({
        companyName: cell(160),
        contactName: cell(160),
        phone: cell(32),
        email: cell(254),
      })
    )
    .min(1)
    .max(2000),
})
export type CrmLeadImportInput = z.infer<typeof crmLeadImportSchema>
