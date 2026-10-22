import { useEffect, useState } from "react"

// navigator.onLine is only ever a hint (true can still mean "connected to a router with no real
// internet"), but it's the same signal this codebase already relies on elsewhere for exactly this
// purpose -- see tracking-sdk/tracking-client.ts's own "online" listener. The offline-aware
// checkout flow never trusts this alone for the thing that actually matters (whether a sale
// synced) -- it always attempts the real request and reacts to what actually happens.
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  )

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  return isOnline
}
