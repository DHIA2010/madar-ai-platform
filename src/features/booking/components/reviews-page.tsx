"use client"

// What customers said after their visits, and which of it shows on the public booking page.

import { useTranslations } from "next-intl"
import { Star } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { AppSwitch } from "@/components/app"

import {
  dayOf,
  useBookingAccess,
  useBookingError,
  useBookingFormat,
  useLoad,
} from "../hooks/use-booking"
import { bookingService } from "../services/booking.service"
import { BookingPage, Empty, LoadFailed, Loading } from "./shell"
import { MUTED, PANEL } from "./styles"

export function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={cn("inline-flex gap-0.5", className)} dir="ltr" aria-label={`${rating}/5`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          className={cn(
            "size-4",
            value <= Math.round(rating) ? "fill-[#f59e0b] text-[#f59e0b]" : "text-[#d5dce8]"
          )}
        />
      ))}
    </span>
  )
}

export function BookingReviewsPage() {
  const t = useTranslations("booking.reviews")
  const format = useBookingFormat()
  const errorText = useBookingError()
  const { canManage } = useBookingAccess()
  const reviews = useLoad(() => bookingService.reviews(), [])
  const list = reviews.data ?? []
  const average = list.length
    ? list.reduce((total, review) => total + review.rating, 0) / list.length
    : 0

  return (
    <BookingPage title={t("title")} subtitle={t("subtitle")}>
      {reviews.failed ? (
        <LoadFailed onRetry={reviews.reload} />
      ) : reviews.data === null ? (
        <Loading />
      ) : list.length === 0 ? (
        <div className={PANEL}>
          <Empty title={t("emptyTitle")}>{t("emptyHint")}</Empty>
        </div>
      ) : (
        <>
          <div className={cn(PANEL, "flex flex-wrap items-center gap-4 p-5")}>
            <p className="text-[34px] font-extrabold text-[#0b1738]">{average.toFixed(1)}</p>
            <div>
              <Stars rating={average} />
              <p className={cn("mt-1 text-[13px]", MUTED)}>{t("count", { count: list.length })}</p>
            </div>
          </div>
          <ul className="grid gap-3 md:grid-cols-2">
            {list.map((review) => (
              <li key={review.id} className={cn(PANEL, "p-4")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14.5px] font-bold text-[#0b1738]">
                      {review.customerName}
                    </p>
                    <p className={cn("truncate text-[12.5px]", MUTED)}>
                      {[review.serviceName, review.providerName].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Stars rating={review.rating} className="shrink-0" />
                </div>
                {review.comment ? (
                  <p className="mt-2 text-[13.5px] leading-6 text-[#3b4a66]">{review.comment}</p>
                ) : null}
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className={cn("text-[12px]", MUTED)}>
                    {format.day(dayOf(review.createdAt), "short")}
                  </span>
                  {canManage ? (
                    <label className="flex items-center gap-2 text-[12.5px] text-[#52607a]">
                      {t("shown")}
                      <AppSwitch
                        checked={review.isPublished}
                        aria-label={t("shown")}
                        onCheckedChange={(on) => {
                          void bookingService
                            .setReviewPublished(review.id, on)
                            .then(() => reviews.reload())
                            .catch((error: unknown) => toast.error(errorText(error)))
                        }}
                      />
                    </label>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </BookingPage>
  )
}
