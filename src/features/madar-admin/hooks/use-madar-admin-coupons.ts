"use client"

import { useState } from "react"

import { listCoupons } from "../services"
import type { Coupon, CouponDiscountType, PlanTier } from "../types"

export interface CreateCouponInput {
  code: string
  discountType: CouponDiscountType
  value: number
  usageLimit: number
  expiresAt: string
  applicablePlans: PlanTier[]
}

// Local-only, same discipline as use-applications-catalog.ts and use-madar-admin-packages.ts --
// no backend yet, state resets on reload.
export function useMadarAdminCoupons() {
  const [coupons, setCoupons] = useState<Coupon[]>(listCoupons())

  function createCoupon(input: CreateCouponInput) {
    setCoupons((current) => [
      {
        id: `cp-${current.length + 1}`,
        code: input.code.toUpperCase(),
        discountType: input.discountType,
        value: input.value,
        usageLimit: input.usageLimit,
        usedCount: 0,
        expiresAt: input.expiresAt,
        status: "active",
        applicablePlans: input.applicablePlans,
      },
      ...current,
    ])
  }

  function toggleCouponStatus(id: string) {
    setCoupons((current) =>
      current.map((coupon) =>
        coupon.id === id
          ? { ...coupon, status: coupon.status === "disabled" ? "active" : "disabled" }
          : coupon
      )
    )
  }

  return { coupons, createCoupon, toggleCouponStatus }
}
