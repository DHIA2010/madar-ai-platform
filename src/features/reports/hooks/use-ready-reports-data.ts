"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import { readyReportsService } from "../services"
import type {
  NetIncomeReportDto,
  PosSummaryDto,
  PurchaseInvoicesDto,
  ReadyReportFilters,
  SalesByBranchDto,
  SalesByCustomerDto,
  SalesByProductDto,
  SalesByUserPaymentMethodDto,
  SalesMovementDto,
  VatReturnDto,
} from "../types"

export function useNetIncomeReport(
  filters: ReadyReportFilters,
  timeGrouping: "day" | "week" | "month"
) {
  const t = useTranslations("reports.common.errors")
  const [data, setData] = useState<NetIncomeReportDto | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setData(await readyReportsService.netIncome(filters, timeGrouping))
    } catch {
      setError(t("netIncomeLoadFailed"))
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.from, filters.to, filters.workspaceId, timeGrouping])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, isLoading, error, refetch }
}

export function useSalesByUserPaymentMethodReport(filters: ReadyReportFilters) {
  const t = useTranslations("reports.common.errors")
  const [data, setData] = useState<SalesByUserPaymentMethodDto | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setData(await readyReportsService.salesByUserAndPaymentMethod(filters))
    } catch {
      setError(t("genericLoadFailed"))
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.from, filters.to, filters.workspaceId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, isLoading, error, refetch }
}

export function useSalesByCustomerReport(filters: ReadyReportFilters, customerId: string | null) {
  const t = useTranslations("reports.common.errors")
  const [data, setData] = useState<SalesByCustomerDto | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setData(await readyReportsService.salesByCustomer(filters, customerId))
    } catch {
      setError(t("genericLoadFailed"))
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.from, filters.to, filters.workspaceId, customerId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, isLoading, error, refetch }
}

export function useVatReturnReport(filters: ReadyReportFilters) {
  const t = useTranslations("reports.common.errors")
  const [data, setData] = useState<VatReturnDto | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setData(await readyReportsService.vatReturn(filters))
    } catch {
      setError(t("vatReturnLoadFailed"))
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.from, filters.to, filters.workspaceId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, isLoading, error, refetch }
}

export function useSalesByProductReport(filters: ReadyReportFilters) {
  const t = useTranslations("reports.common.errors")
  const [data, setData] = useState<SalesByProductDto | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setData(await readyReportsService.salesByProduct(filters))
    } catch {
      setError(t("genericLoadFailed"))
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.from, filters.to, filters.workspaceId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, isLoading, error, refetch }
}

export function usePurchaseInvoicesReport(filters: ReadyReportFilters) {
  const t = useTranslations("reports.common.errors")
  const [data, setData] = useState<PurchaseInvoicesDto | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setData(await readyReportsService.purchaseInvoices(filters))
    } catch {
      setError(t("genericLoadFailed"))
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.from, filters.to, filters.workspaceId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, isLoading, error, refetch }
}

export function useSalesMovementReport(filters: ReadyReportFilters) {
  const t = useTranslations("reports.common.errors")
  const [data, setData] = useState<SalesMovementDto | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setData(await readyReportsService.salesMovement(filters))
    } catch {
      setError(t("genericLoadFailed"))
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.from, filters.to, filters.workspaceId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, isLoading, error, refetch }
}

export function usePosSummaryReport(filters: ReadyReportFilters) {
  const t = useTranslations("reports.common.errors")
  const [data, setData] = useState<PosSummaryDto | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setData(await readyReportsService.posSummary(filters))
    } catch {
      setError(t("genericLoadFailed"))
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.from, filters.to, filters.workspaceId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, isLoading, error, refetch }
}

export function useSalesByBranchReport(filters: ReadyReportFilters) {
  const t = useTranslations("reports.common.errors")
  const [data, setData] = useState<SalesByBranchDto | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setData(await readyReportsService.salesByBranch(filters))
    } catch {
      setError(t("genericLoadFailed"))
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.from, filters.to, filters.workspaceId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, isLoading, error, refetch }
}
