// Real ESC/POS hardware dispatch over the Web Serial API -- the only way a browser can talk to a
// receipt printer or cash drawer directly, no backend involved (the device is plugged into the
// till's own computer, not reachable from the server). Chrome/Edge only, requires a secure
// context (HTTPS or localhost), and every browser tab needs its own one-time device pairing via
// a real user gesture (requestPort()) before anything here can run -- there is no way to test a
// physical drawer/printer in this dev environment, so this is built correctly against the spec
// and Epson's documented ESC/POS command set, not verified against real hardware.

// ESC p 0 25 250 -- the standard ESC/POS "generic pulse" cash-drawer-kick command (pin 2,
// ~25ms on-pulse, ~250ms off-pulse), sent to whichever port is paired -- the same command a
// receipt printer's own drawer-kick port would forward to a connected drawer.
const ESC_POS_DRAWER_KICK = new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa])

interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>
  close(): Promise<void>
  writable: WritableStream<Uint8Array> | null
}

interface SerialLike {
  getPorts(): Promise<SerialPortLike[]>
  requestPort(): Promise<SerialPortLike>
}

function getSerial(): SerialLike | null {
  if (typeof navigator === "undefined") return null
  return (navigator as unknown as { serial?: SerialLike }).serial ?? null
}

export function isWebSerialSupported(): boolean {
  return getSerial() !== null
}

async function writeToPort(port: SerialPortLike, bytes: Uint8Array): Promise<void> {
  await port.open({ baudRate: 9600 })
  const writable = port.writable
  if (!writable) {
    await port.close()
    throw new Error("Serial port is not writable.")
  }
  const writer = writable.getWriter()
  try {
    await writer.write(bytes)
  } finally {
    writer.releaseLock()
    await port.close()
  }
}

export type PairAndTestResult =
  | { ok: true }
  | { ok: false; code: "unsupported" | "failed"; detail?: string }

// Requires a real, direct user gesture (a click handler calling this with no prior await) --
// the browser silently rejects requestPort() otherwise. Used once, from the settings page's
// test-print action, to grant this origin persistent access to the device; every later call
// anywhere in the app can then reuse getPorts() with no further prompt.
//
// Returns a machine-readable code rather than a user-facing message -- the caller translates it,
// since this module has no access to the active locale. `detail` carries the raw
// (English/browser-authored) error text for diagnostics only; it is never shown to the user.
export async function pairAndTestDevice(): Promise<PairAndTestResult> {
  const serial = getSerial()
  if (!serial) {
    return { ok: false, code: "unsupported" }
  }

  try {
    const port = await serial.requestPort()
    await writeToPort(port, ESC_POS_DRAWER_KICK)
    return { ok: true }
  } catch (error) {
    return { ok: false, code: "failed", detail: error instanceof Error ? error.message : undefined }
  }
}

// No user gesture required -- reuses whatever device was already paired via
// pairAndTestDevice(). Silently no-ops when unsupported or nothing is paired yet, since this
// runs automatically right after checkout and has no user-facing moment to ask for permission.
export async function openCashDrawerIfPaired(): Promise<{ sent: boolean; reason?: string }> {
  const serial = getSerial()
  if (!serial) {
    return { sent: false, reason: "unsupported" }
  }

  try {
    const ports = await serial.getPorts()
    const port = ports[0]
    if (!port) {
      return { sent: false, reason: "not_paired" }
    }
    await writeToPort(port, ESC_POS_DRAWER_KICK)
    return { sent: true }
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : "unknown_error" }
  }
}
