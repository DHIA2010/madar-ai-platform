import { Suspense } from "react"

import { MadarAdminCustomerUtilization } from "@/features/madar-admin"

// The customer's id is in the query string (?id=), read on the client.
export default function Page() {
  return (
    <Suspense>
      <MadarAdminCustomerUtilization />
    </Suspense>
  )
}
