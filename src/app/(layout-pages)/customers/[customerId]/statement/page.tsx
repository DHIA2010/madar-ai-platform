import { CustomerStatement } from "@/features/customers/components"

interface Props {
  params: Promise<{ customerId: string }>
}

export default async function Page({ params }: Props) {
  const { customerId } = await params
  // See the sibling [customerId]/page.tsx for why this decode matters: Next hands this segment
  // back still percent-encoded, which would otherwise get encoded a second time downstream.
  return <CustomerStatement customerId={decodeURIComponent(customerId)} />
}
