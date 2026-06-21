"use client"

import { useMemo } from "react"

import { customerListService } from "../services"

export function useCustomer(customerId: string) {
  const record = useMemo(() => customerListService.getCustomer(customerId), [customerId])

  return { customer: record, isLoading: false }
}

export function useCustomerTimeline(customerId: string) {
  const events = useMemo(() => customerListService.getCustomerTimeline(customerId), [customerId])

  return { events, isLoading: false }
}

export function useCustomerJourney(customerId: string) {
  const events = useMemo(() => customerListService.getCustomerTimeline(customerId), [customerId])

  return { events, isLoading: false }
}

export function useCustomerOrders(customerId: string) {
  const orders = useMemo(() => customerListService.getCustomerOrders(customerId), [customerId])

  return { orders, isLoading: false }
}

export function useCustomerSegments(customerId: string) {
  const segments = useMemo(
    () => customerListService.getCustomerSegmentHistory(customerId),
    [customerId]
  )

  return { segments, isLoading: false }
}

export function useCustomerAttribution(customerId: string) {
  const attribution = useMemo(
    () => customerListService.getCustomerAttribution(customerId),
    [customerId]
  )

  return { attribution, isLoading: false }
}

export function useCustomerWebsiteActivity(customerId: string) {
  const activity = useMemo(
    () => customerListService.getCustomerWebsiteActivity(customerId),
    [customerId]
  )

  return { activity, isLoading: false }
}

export function useCustomerMarketingActivity(customerId: string) {
  const activity = useMemo(
    () => customerListService.getCustomerMarketingActivity(customerId),
    [customerId]
  )

  return { activity, isLoading: false }
}

export function useCustomerCommerceStats(customerId: string) {
  const stats = useMemo(() => customerListService.getCommerceStats(customerId), [customerId])

  return { stats, isLoading: false }
}

export function useCustomerSessions(customerId: string) {
  const sessions = useMemo(() => customerListService.getCustomerSessions(customerId), [customerId])

  return { sessions, isLoading: false }
}
