"use client"

import { useRouter } from "next/navigation"
import { ArrowRight } from "lucide-react"

import { ROUTES } from "@/constants/routes"

import { ExpenseForm } from "./expense-form"

export function ExpenseFormPage() {
  const router = useRouter()

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => router.push(ROUTES.expenses)}
        className="flex w-fit items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="size-3.5" />
        العودة إلى المصروفات
      </button>

      <h1 className="text-2xl font-bold text-foreground">إضافة مصروف</h1>

      <ExpenseForm />
    </div>
  )
}
