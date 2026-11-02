// Opens a file that isn't public (a supplier invoice, a payment receipt) in a new tab. The tab is
// opened right away, inside the click, so the browser doesn't block it as a pop-up, and is pointed
// at the file once the authorized download finishes.
export async function openPrivateFile(
  load: () => Promise<{ contentType: string; dataBase64: string }>
): Promise<void> {
  const tab = window.open("", "_blank")
  try {
    const file = await load()
    const bytes = Uint8Array.from(atob(file.dataBase64), (char) => char.charCodeAt(0))
    const objectUrl = URL.createObjectURL(new Blob([bytes], { type: file.contentType }))
    if (tab) tab.location.href = objectUrl
    else window.open(objectUrl, "_blank")
  } catch (error) {
    tab?.close()
    throw error
  }
}
