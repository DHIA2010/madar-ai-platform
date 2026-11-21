"use client"

// What the calendar, the list and the overview share: the services and providers, and the two
// windows a booking is taken and handled in. A screen asks for `openNew` or `openDetails`, puts
// `windows` somewhere in its output, and reloads its own bookings whenever `version` changes.

import { useCallback, useState } from "react"

import { BookingDetails } from "../components/booking-details"
import { BookingDialog } from "../components/booking-dialog"
import { bookingService } from "../services/booking.service"
import type { Booking } from "../types/booking.types"
import { useLoad } from "./use-booking"

// Where a new booking starts from: a spot on the calendar, or someone on the waiting list.
export interface NewBooking {
  date?: string
  providerId?: string
  serviceId?: string
  customerName?: string
  customerPhone?: string
}

export function useBookingBoard() {
  const base = useLoad(
    () =>
      Promise.all([
        bookingService.services(),
        bookingService.providers(),
        bookingService.settings(),
      ]).then(([services, providers, settings]) => ({ services, providers, settings })),
    []
  )
  const [version, setVersion] = useState(0)
  const [creating, setCreating] = useState<NewBooking | null>(null)
  // What to do once the booking being taken is saved (the waiting list closes its entry).
  const [afterSave, setAfterSave] = useState<(() => void) | null>(null)
  const [moving, setMoving] = useState<Booking | null>(null)
  const [viewing, setViewing] = useState<Booking | null>(null)
  const bump = useCallback(() => setVersion((value) => value + 1), [])

  const services = base.data?.services ?? []
  const providers = base.data?.providers ?? []

  const windows = (
    <>
      <BookingDialog
        open={creating !== null || moving !== null}
        onClose={() => {
          setCreating(null)
          setMoving(null)
        }}
        onSaved={(saved) => {
          bump()
          if (moving) setViewing(saved)
          else afterSave?.()
          setAfterSave(null)
        }}
        services={services}
        providers={providers}
        initial={creating ?? undefined}
        moving={moving}
      />
      <BookingDetails
        booking={moving ? null : viewing}
        businessName={base.data?.settings.displayName ?? null}
        onClose={() => setViewing(null)}
        onChanged={(changed) => {
          setViewing(changed)
          bump()
        }}
        onMove={(booking) => setMoving(booking)}
      />
    </>
  )

  return {
    ready: base.data !== null,
    failed: base.failed,
    reload: base.reload,
    services,
    providers,
    settings: base.data?.settings ?? null,
    version,
    openNew: (initial: NewBooking = {}, then?: () => void) => {
      setAfterSave(then ? () => then : null)
      setCreating(initial)
    },
    openDetails: (booking: Booking) => setViewing(booking),
    windows,
  }
}
