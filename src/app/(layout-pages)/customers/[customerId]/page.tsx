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
  return <CustomerProfile customerId={customerId} />
}
