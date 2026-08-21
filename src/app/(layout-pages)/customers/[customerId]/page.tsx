import { CustomerProfile } from "@/features/customers/components"

interface Props {
  params: Promise<{ customerId: string }>
}

export function generateStaticParams() {
  return [
    { customerId: "cust_001" },
    { customerId: "cust_002" },
    { customerId: "cust_003" },
    { customerId: "cust_004" },
    { customerId: "cust_005" },
    { customerId: "cust_006" },
    { customerId: "cust_007" },
    { customerId: "cust_008" },
  ]
}

export default async function Page({ params }: Props) {
  const { customerId } = await params
  // Next hands this dynamic segment back still percent-encoded (confirmed live: a customer id
  // containing ":" arrived here as "salla%3A..."), so without this decode it gets encoded a
  // second time downstream in customerDetailEndpoint(), producing "salla%253A..." and a 400
  // from the backend. Decoding here is safe even if a future Next version already decodes it --
  // decodeURIComponent on an already-plain string is a no-op.
  return <CustomerProfile customerId={decodeURIComponent(customerId)} />
}
