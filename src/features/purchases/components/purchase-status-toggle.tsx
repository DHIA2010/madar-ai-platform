import { useTranslations } from "next-intl"

import { AppSwitch } from "@/components/app"

import type { PurchaseStatus } from "../types"

// The reference design uses a toggle, not a badge, for purchase status -- a purchase is simply
// received or not yet, a binary the rest of this module's badges (payment/return status, which
// have 3-4 distinct states) don't fit.
export function PurchaseStatusToggle({
  status,
  onChange,
}: {
  status: PurchaseStatus
  onChange: (status: PurchaseStatus) => void
}) {
  const t = useTranslations("purchases.status")
  return (
    <AppSwitch
      checked={status === "received"}
      onCheckedChange={(checked) => onChange(checked ? "received" : "pending")}
      aria-label={status === "received" ? t("received") : t("pending")}
    />
  )
}
