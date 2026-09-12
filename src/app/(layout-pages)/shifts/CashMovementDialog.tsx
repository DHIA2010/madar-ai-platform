"use client"

// Record a real cash-drawer withdrawal or deposit against an open shift -- a manager pulling
// change out, or topping the float up. Shared between الكاشير's own top bar (recording it live,
// mid-shift) and a shift's detail page (recording it while reviewing the shift) -- one real
// implementation, backed by pos_cash_movements, read back by the shift's own close summary and
// detail page.

import { useEffect, useState } from "react"
import { Wallet } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { posShiftsService, type CashMovementType } from "@/features/pos/services/pos-shifts.service"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const HEADING = "text-[#0d1b3e]"
const MUTED = "text-[#5b6b85]"
const FIELD_CLASS =
  "h-11 rounded-[10px] border-[#e8edf3] bg-white text-[13px] text-[#0d1b3e] placeholder:text-[#8098b4]"

export interface CashMovementDialogProps {
  // The open shift to record against; null keeps the dialog closed.
  shiftId: string | null
  // Which toggle is preselected when the dialog opens -- e.g. a page with separate "سحب"/"إيداع"
  // buttons wants the matching one active already, not always defaulting to withdrawal.
  initialType?: CashMovementType
  onOpenChange: (open: boolean) => void
  onRecorded: () => void
}

export function CashMovementDialog({
  shiftId,
  initialType = "withdrawal",
  onOpenChange,
  onRecorded,
}: CashMovementDialogProps) {
  const [type, setType] = useState<CashMovementType>(initialType)
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setType(initialType)
    setAmount("")
    setNote("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftId])

  const submit = async () => {
    if (!shiftId) return
    const parsedAmount = Number(amount)
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error("أدخل مبلغا صحيحا.")
      return
    }
    setSaving(true)
    try {
      await posShiftsService.recordCashMovement(shiftId, {
        type,
        amount: parsedAmount,
        note: note.trim() || null,
      })
      toast.success(type === "withdrawal" ? "تم تسجيل السحب." : "تم تسجيل الإيداع.")
      onRecorded()
    } catch {
      toast.error("تعذر تسجيل العملية.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={shiftId !== null} onOpenChange={(open) => !saving && onOpenChange(open)}>
      <DialogContent className="sm:max-w-[22rem] [direction:rtl]">
        <DialogHeader className="text-right">
          <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>
            سحب أو إيداع نقدي
          </DialogTitle>
          <DialogDescription className={cn("text-[12.5px] leading-6", MUTED)}>
            يُسجَّل على الوردية المفتوحة الآن ويظهر عند إغلاقها.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType("withdrawal")}
              className={cn(
                "flex h-10 items-center justify-center gap-1.5 rounded-[10px] border text-[12.5px] font-semibold",
                type === "withdrawal"
                  ? "border-[#f59e0b] bg-[#fffbeb] text-[#92400e]"
                  : "border-[#e8edf3] text-[#5b6b85]"
              )}
            >
              سحب من الصندوق
            </button>
            <button
              type="button"
              onClick={() => setType("deposit")}
              className={cn(
                "flex h-10 items-center justify-center gap-1.5 rounded-[10px] border text-[12.5px] font-semibold",
                type === "deposit"
                  ? "border-[#0891b2] bg-[#ecfeff] text-[#0e7490]"
                  : "border-[#e8edf3] text-[#5b6b85]"
              )}
            >
              إيداع في الصندوق
            </button>
          </div>

          <div>
            <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>المبلغ</Label>
            <div className="relative">
              <Wallet className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-[#8098b4]" />
              <Input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                className={cn(FIELD_CLASS, "ps-9")}
              />
            </div>
          </div>

          <div>
            <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
              ملاحظة (اختياري)
            </Label>
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="مثال: تحويل نقدية زائدة للخزنة"
              className={FIELD_CLASS}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            className="h-11 gap-2 rounded-[10px] bg-[#2563eb] px-6 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
            disabled={saving}
            onClick={() => void submit()}
          >
            {saving ? "جارٍ الحفظ..." : "تأكيد"}
          </Button>
          <Button
            variant="outline"
            className="h-11 rounded-[10px] border-[#e8edf3] px-5 text-[13px] font-semibold text-[#5b6b85]"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
