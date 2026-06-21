import { z } from "zod"

export const campaignListQuerySchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
  search: z.string().optional(),
  status: z.enum(["draft", "scheduled", "active", "paused", "completed", "archived"]).optional(),
  channel: z.enum(["meta", "google", "tiktok", "snapchat", "linkedin", "email"]).optional(),
  sortBy: z
    .enum([
      "name",
      "status",
      "channel",
      "budget",
      "spend",
      "revenue",
      "roas",
      "ctr",
      "cpc",
      "conversionRate",
      "startDate",
      "endDate",
      "owner",
    ])
    .optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
})

export const campaignIdSchema = z.object({
  campaignId: z.string().min(1),
})

export const campaignMutationSchema = z
  .object({
    name: z.string().min(2),
    objective: z.string().min(2),
    channel: z.enum(["meta", "google", "tiktok", "snapchat", "linkedin", "email"]),
    budget: z.number().positive(),
    startDate: z.string().min(1),
    endDate: z.string().min(1),
    audience: z.string().min(2),
    country: z.string().min(2),
    language: z.string().min(2),
    status: z.enum(["draft", "scheduled", "active", "paused", "completed", "archived"]),
    owner: z.string().min(2),
  })
  .refine((value) => new Date(value.endDate).getTime() >= new Date(value.startDate).getTime(), {
    path: ["endDate"],
    message: "End date must be after start date.",
  })
