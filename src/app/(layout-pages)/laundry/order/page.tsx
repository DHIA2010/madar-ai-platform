import { Suspense } from "react"

import { LaundryOrderPage } from "@/features/laundry"

// ?id= read on the client.
export default function Page() {
  return (
    <Suspense>
      <LaundryOrderPage />
    </Suspense>
  )
}
