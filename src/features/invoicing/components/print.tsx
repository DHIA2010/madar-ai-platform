"use client"

import { useSyncExternalStore } from "react"
import { createPortal } from "react-dom"

import { DocumentPaper, type PaperData } from "./document-paper"

const PRINT_TARGET = "invoicing-print-target"

// <body> exists only in the browser: false while rendering on the server, true once hydrated.
const subscribeNever = () => () => {}
const onClient = () => true
const onServer = () => false

// The A4 sheet the browser prints: a copy of the document kept as a direct child of <body>, the
// only one the print styles leave visible -- so printing from the browser's own menu gives the
// same sheet as the button. Kept mounted, hidden on screen, so its QR code is already drawn.
export function PrintSheet({ data }: { data: PaperData | null }) {
  const mounted = useSyncExternalStore(subscribeNever, onClient, onServer)
  if (!mounted || !data) return null
  return (
    <>
      {createPortal(
        <div id={PRINT_TARGET}>
          <DocumentPaper data={data} />
        </div>,
        document.body
      )}
      <style>{`
        #${PRINT_TARGET} { display: none; }
        @media print {
          @page { size: A4; margin: 9mm 0; }
          html, body { background: #fff !important; }
          body > *:not(#${PRINT_TARGET}) { display: none !important; }
          #${PRINT_TARGET} { display: block !important; }
          #${PRINT_TARGET} .invoicing-paper {
            max-width: none !important;
            padding-top: 1mm !important;
            padding-bottom: 1mm !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </>
  )
}

export const printDocument = () => window.print()
