import { Suspense } from "react"

import { MadarAdminSeo } from "@/features/madar-admin"

export default function Page() {
  return (
    <Suspense>
      <MadarAdminSeo />
    </Suspense>
  )
}
