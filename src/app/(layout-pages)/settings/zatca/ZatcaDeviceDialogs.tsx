"use client"

// The two device dialogs of the ZATCA settings: everything about a device (what its CSR registered,
// its certificate, how many invoices it signed), and removing one -- deleted when it never signed
// an invoice, stopped otherwise (see the backend's ZatcaDevicesService.removeDevice()).

import { useState } from "react"
import { Loader2, Trash2 } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { localeDirection, type Locale } from "@/i18n/locales"
import { zatcaService, type ZatcaDevice } from "@/features/pos/services/zatca.service"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const HEADING = "text-[#0b1738]"
const MUTED = "text-[#667085]"

function formatDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value))
}

export function ZatcaDeviceDetailsDialog({
  device,
  onClose,
}: {
  device: ZatcaDevice | null
  onClose: () => void
}) {
  const t = useTranslations("settings.zatca.details")
  const locale = useLocale() as Locale
  if (!device) return null

  const rows: Array<[string, string | number | null]> = [
    [t("fields.commonName"), device.details.commonName ?? device.commonName],
    [t("fields.organizationName"), device.details.organizationName],
    [t("fields.vatNumber"), device.details.vatNumber],
    [t("fields.organizationUnit"), device.details.organizationUnit],
    [t("fields.egsSerialNumber"), device.details.egsSerialNumber],
    [t("fields.location"), device.details.location],
    [t("fields.industry"), device.details.industry],
    [t("fields.country"), device.details.country],
    [t("fields.signedDocuments"), device.signedDocuments],
    [t("fields.lastIcv"), device.lastIcv],
    [t("fields.createdAt"), formatDate(device.createdAt, locale)],
  ]
  const certificateRows: Array<[string, string]> = device.certificate
    ? [
        [t("fields.validFrom"), formatDate(device.certificate.validFrom, locale)],
        [t("fields.validTo"), formatDate(device.certificate.validTo, locale)],
        [t("fields.certificateSerial"), device.certificate.serialNumber],
        [t("fields.issuer"), device.certificate.issuer],
      ]
    : []

  const table = (items: Array<[string, string | number | null]>) => (
    <dl className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-2 text-[12px]">
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className={MUTED}>{label}</dt>
          <dd dir="auto" className={cn("break-words font-semibold", HEADING)}>
            {value ?? "—"}
          </dd>
        </div>
      ))}
    </dl>
  )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        dir={localeDirection(locale)}
        className="max-h-[85vh] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader className="text-start">
          <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>
            {t("title", { name: device.commonName })}
          </DialogTitle>
        </DialogHeader>
        {table(rows)}
        <div className="border-t border-[#eef2f8] pt-3">
          <p className={cn("mb-2 text-[12.5px] font-bold", HEADING)}>{t("certificateTitle")}</p>
          {certificateRows.length > 0 ? (
            table(certificateRows)
          ) : (
            <p className={cn("text-[12px]", MUTED)}>{t("noCertificate")}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ZatcaRemoveDeviceDialog({
  device,
  onClose,
  onRemoved,
}: {
  device: ZatcaDevice | null
  onClose: () => void
  onRemoved: () => void
}) {
  const t = useTranslations("settings.zatca.remove")
  const locale = useLocale() as Locale
  const [removing, setRemoving] = useState(false)
  if (!device) return null

  const stops = device.signedDocuments > 0
  const linked = device.status !== "draft"

  const remove = async () => {
    setRemoving(true)
    try {
      const { result } = await zatcaService.removeDevice(device.id)
      toast.success(result === "deleted" ? t("toasts.deleted") : t("toasts.deactivated"))
      onRemoved()
      onClose()
    } catch {
      toast.error(t("toasts.failed"))
    } finally {
      setRemoving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !removing && onClose()}>
      <DialogContent dir={localeDirection(locale)} className="sm:max-w-md">
        <DialogHeader className="text-start">
          <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>
            {stops
              ? t("titleStop", { name: device.commonName })
              : t("titleDelete", { name: device.commonName })}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2.5 text-[12.5px] leading-6">
          <p className={HEADING}>
            {stops ? t("stopBody", { count: device.signedDocuments }) : t("deleteBody")}
          </p>
          {linked ? (
            <p className="rounded-[10px] bg-[#eef4ff] px-3 py-2 text-[12px] leading-6 text-[#2878ff]">
              {t("revokeHint")}
            </p>
          ) : null}
        </div>
        <DialogFooter className="flex-row items-center gap-2.5 border-t border-[#eef2f8] pt-4">
          <Button variant="outline" className="h-10" disabled={removing} onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            className="h-10 flex-1 gap-2 bg-[#d92d20] text-white hover:bg-[#b42318]"
            disabled={removing}
            onClick={() => void remove()}
          >
            {removing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            {stops ? t("confirmStop") : t("confirmDelete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
