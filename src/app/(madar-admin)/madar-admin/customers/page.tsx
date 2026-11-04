import { Suspense } from "react"

import { MadarAdminCustomers } from "@/features/madar-admin"

// ?customer=<id> opens that customer's details, read on the client.
export default function Page() {
  return (
    <Suspense>
      <MadarAdminCustomers />
    </Suspense>
  )
}
