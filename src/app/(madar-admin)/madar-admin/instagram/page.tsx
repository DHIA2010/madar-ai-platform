import { Suspense } from "react"

import { MadarAdminInstagram } from "@/features/madar-admin"

export default function Page() {
  return (
    <Suspense>
      <MadarAdminInstagram />
    </Suspense>
  )
}
