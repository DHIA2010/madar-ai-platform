import { InvoiceEditorPage } from "@/features/invoicing"

// Every id is per-request data: render on demand (see shifts/[shiftId]).
export const dynamic = "force-dynamic"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <InvoiceEditorPage invoiceId={decodeURIComponent(id)} />
}
