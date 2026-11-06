import Script from "next/script"

// Google Tag Manager's official snippet: the script (as early as Next.js allows) and the
// <noscript> iframe for visitors without JavaScript. The "gtm.js" start event it pushes is what
// fires GTM's page-view ("All Pages") triggers. Form events are pushed by lib/data-layer.ts.
export function GoogleTagManagerScript({ containerId }: { containerId: string }) {
  return (
    <Script id="google-tag-manager" strategy="afterInteractive">
      {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${containerId}');`}
    </Script>
  )
}

export function GoogleTagManagerNoScript({ containerId }: { containerId: string }) {
  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${containerId}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
      />
    </noscript>
  )
}
