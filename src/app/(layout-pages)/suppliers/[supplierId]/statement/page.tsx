import { SupplierStatement } from "@/features/suppliers"

interface Props {
  params: Promise<{ supplierId: string }>
}

export default async function Page({ params }: Props) {
  const { supplierId } = await params
  return <SupplierStatement supplierId={decodeURIComponent(supplierId)} />
}
