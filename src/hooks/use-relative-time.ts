import { useEffect, useMemo, useState } from "react"

export type RelativeTimeInput = string | number | Date | null | undefined

interface UseRelativeTimeOptions {
  fallback?: string
}

function toDate(value: RelativeTimeInput) {
  if (value === null || value === undefined || value === "") {
    return null
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date
}

function formatRelativeTime(now: Date, target: Date) {
  const diffMs = now.getTime() - target.getTime()
  const absoluteDiffMs = Math.abs(diffMs)
  const minutes = Math.floor(absoluteDiffMs / 60000)
  const hours = Math.floor(absoluteDiffMs / 3600000)
  const days = Math.floor(absoluteDiffMs / 86400000)

  if (diffMs >= 0) {
    if (minutes < 1) return "Just now"
    if (minutes < 60) return `${minutes} min ago`
    if (hours < 6) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`

    const sameDay = now.toDateString() === target.toDateString()
    if (sameDay) {
      return `Today ${target.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}`
    }

    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    if (yesterday.toDateString() === target.toDateString()) {
      return "Yesterday"
    }

    if (days < 7) {
      return `${days} days ago`
    }
  } else {
    if (minutes < 60) return `In ${Math.max(1, minutes)} min`
    if (hours < 24) return `In ${hours}h`
  }

  return target.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function getRefreshIntervalMs(nowMs: number, targetMs: number) {
  const elapsedMs = Math.abs(nowMs - targetMs)
  return elapsedMs < 60_000 ? 10_000 : 60_000
}

export function useRelativeTime(value: RelativeTimeInput, options: UseRelativeTimeOptions = {}) {
  const fallback = options.fallback ?? "Never"
  const [nowMs, setNowMs] = useState(() => Date.now())

  const date = useMemo(() => toDate(value), [value])
  const targetMs = date?.getTime() ?? null

  useEffect(() => {
    if (targetMs === null) {
      return
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let disposed = false

    const schedule = () => {
      if (disposed) {
        return
      }

      const currentNowMs = Date.now()
      setNowMs(currentNowMs)

      timeoutId = setTimeout(schedule, getRefreshIntervalMs(currentNowMs, targetMs))
    }

    timeoutId = setTimeout(schedule, getRefreshIntervalMs(Date.now(), targetMs))

    return () => {
      disposed = true
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [targetMs])

  if (!date) {
    return fallback
  }

  return formatRelativeTime(new Date(nowMs), date)
}
