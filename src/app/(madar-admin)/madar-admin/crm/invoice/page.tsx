import { Suspense } from "react"

import { MadarAdminCrmInvoice } from "@/features/madar-admin"

// ?id= read on the client.
export default function Page() {
  return (
    <Suspense>
      <MadarAdminCrmInvoice />
    </Suspense>
  )
}
