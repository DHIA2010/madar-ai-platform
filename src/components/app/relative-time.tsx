"use client"

import { type RelativeTimeInput,useRelativeTime } from "@/hooks/use-relative-time"

interface RelativeTimeProps {
  value?: RelativeTimeInput
  fallback?: string
  className?: string
}

export function RelativeTime({ value, fallback, className }: RelativeTimeProps) {
  const label = useRelativeTime(value, { fallback })

  return <span className={className}>{label}</span>
}
