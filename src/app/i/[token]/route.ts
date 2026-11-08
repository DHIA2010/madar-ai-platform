import { environment } from "@/infrastructure/environment/app-environment"

// A POS invoice shared on WhatsApp opens here (app.madar.my/i/<token>): the backend checks the
// link's signature and renders the receipt PDF -- see the backend's whatsapp/invoice-links.ts.
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  const apiBase = environment.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || ""
  const path = ["", "v1", "public", "pos-invoices", encodeURIComponent(token), "pdf"].join(
    String.fromCharCode(47)
  )
  try {
    const upstream = await fetch(new URL(path, apiBase), {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    })
    if (!upstream.ok) {
      return new Response("الفاتورة غير موجودة.", {
        status: upstream.status === 404 ? 404 : 502,
        headers: { "content-type": "text/plain; charset=utf-8" },
      })
    }
    return new Response(await upstream.arrayBuffer(), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": upstream.headers.get("content-disposition") ?? "inline",
        "cache-control": "private, max-age=300",
      },
    })
  } catch {
    return new Response("تعذر فتح الفاتورة، حاول مرة أخرى.", {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    })
  }
}
