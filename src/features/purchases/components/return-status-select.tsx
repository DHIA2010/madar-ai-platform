"use client"

import { ChevronDown } from "lucide-react"

import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from "@/components/app"

import type { ReturnStatus } from "../types"
import { ReturnStatusBadge } from "./return-status-badge"

const STATUS_OPTIONS: ReturnStatus[] = ["pending", "approved", "refunded", "rejected"]

// The badge keeps its existing look and is just made clickable, with a standard dropdown panel
// listing the other statuses as that same badge, plus a small chevron signaling it's changeable.
export function ReturnStatusSelect({
  status,
  onChange,
}: {
  status: ReturnStatus
  onChange: (status: ReturnStatus) => void
}) {
  return (
    <AppDropdownMenu>
      <AppDropdownMenuTrigger asChild>
        <button
          type="button"
          className="cursor-pointer rounded-full border-none bg-transparent p-0 outline-none hover:bg-transparent focus:outline-none focus-visible:ring-0"
          aria-label="تغيير حالة الإرجاع"
        >
          <span className="inline-flex items-center gap-1">
            <ReturnStatusBadge status={status} />
            <ChevronDown className="size-3 text-[#95a4bd]" />
          </span>
        </button>
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="start">
        {STATUS_OPTIONS.map((option) => (
          <AppDropdownMenuItem
            key={option}
            className="focus:bg-transparent focus:text-inherit"
            onClick={() => onChange(option)}
          >
            <ReturnStatusBadge status={option} />
          </AppDropdownMenuItem>
        ))}
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  )
}
