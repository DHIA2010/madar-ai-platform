"use client"

import { useEffect } from "react"

// The last line of defence: a failure outside every page (the root layout or a provider). It
// replaces the whole document, so it carries its own <html> and plain styles.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("app.render_failed", error)
  }, [error])

  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#f7f9fd",
          color: "#0b1738",
        }}
      >
        <h1 style={{ fontSize: 22, margin: 0 }}>حدث خطأ غير متوقع</h1>
        <p style={{ margin: 0, color: "#5b6b85", maxWidth: 420 }}>
          تعذّر تشغيل مدار. جرّب إعادة المحاولة، وإن استمرت المشكلة تواصل مع فريق الدعم.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            border: 0,
            borderRadius: 10,
            padding: "10px 22px",
            fontSize: 15,
            fontWeight: 600,
            background: "#2563eb",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          إعادة المحاولة
        </button>
      </body>
    </html>
  )
}
