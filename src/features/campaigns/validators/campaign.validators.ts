import { z } from "zod"

export const campaignFormSchema = z
  .object({
    name: z.string().min(2, "Campaign name is required."),
    objective: z.string().min(2, "Objective is required."),
    channel: z.enum(["meta", "google", "tiktok", "snapchat", "linkedin", "email"]),
    budget: z.number().positive("Budget must be greater than zero."),
    startDate: z.string().min(1, "Start date is required."),
    endDate: z.string().min(1, "End date is required."),
    audience: z.string().min(2, "Audience is required."),
    country: z.string().min(2, "Country is required."),
    language: z.string().min(2, "Language is required."),
    status: z.enum(["draft", "scheduled", "active", "paused", "completed", "archived"]),
    owner: z.string().min(2, "Owner is required."),
  })
  .refine((value) => new Date(value.endDate).getTime() >= new Date(value.startDate).getTime(), {
    path: ["endDate"],
    message: "End date must be after start date.",
  })

export type CampaignFormSchemaValues = z.infer<typeof campaignFormSchema>
