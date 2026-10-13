"use client"

import { useCallback, useEffect, useState } from "react"

import { readyReportsService } from "../services"
import type {
  NetIncomeReportDto,
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
  const [data, setData] = useState<NetIncomeReportDto | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setData(await readyReportsService.netIncome(filters, timeGrouping))
    } catch {
      setError("تعذر تحميل تقرير صافي الدخل. حاول مرة أخرى.")
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
  const [data, setData] = useState<SalesByUserPaymentMethodDto | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setData(await readyReportsService.salesByUserAndPaymentMethod(filters))
    } catch {
      setError("تعذر تحميل التقرير. حاول مرة أخرى.")
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
  const [data, setData] = useState<SalesByCustomerDto | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setData(await readyReportsService.salesByCustomer(filters, customerId))
    } catch {
      setError("تعذر تحميل التقرير. حاول مرة أخرى.")
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
  const [data, setData] = useState<VatReturnDto | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setData(await readyReportsService.vatReturn(filters))
    } catch {
      setError("تعذر تحميل الإقرار الضريبي. حاول مرة أخرى.")
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
  const [data, setData] = useState<SalesByProductDto | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setData(await readyReportsService.salesByProduct(filters))
    } catch {
      setError("تعذر تحميل التقرير. حاول مرة أخرى.")
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
  const [data, setData] = useState<PurchaseInvoicesDto | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setData(await readyReportsService.purchaseInvoices(filters))
    } catch {
      setError("تعذر تحميل التقرير. حاول مرة أخرى.")
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
  const [data, setData] = useState<SalesMovementDto | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setData(await readyReportsService.salesMovement(filters))
    } catch {
      setError("تعذر تحميل التقرير. حاول مرة أخرى.")
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
  const [data, setData] = useState<SalesByBranchDto | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setData(await readyReportsService.salesByBranch(filters))
    } catch {
      setError("تعذر تحميل التقرير. حاول مرة أخرى.")
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
