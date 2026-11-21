import { bookingService } from "./booking.service"

const MAX_SIDE = 1600

// A picture chosen by the staff, made no larger than the page needs and saved: phone photos are
// several megabytes each, and a page of them would be slow for every customer.
export async function uploadBookingImage(file: File): Promise<string> {
  const source = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("image"))
    image.src = URL.createObjectURL(file)
  })
  const scale = Math.min(1, MAX_SIDE / Math.max(source.naturalWidth, source.naturalHeight))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(source.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(source.naturalHeight * scale))
  const pen = canvas.getContext("2d")
  if (!pen) throw new Error("canvas")
  // A white ground, so a see-through logo does not turn black when saved as a photo.
  pen.fillStyle = "#ffffff"
  pen.fillRect(0, 0, canvas.width, canvas.height)
  pen.drawImage(source, 0, 0, canvas.width, canvas.height)
  URL.revokeObjectURL(source.src)
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85)
  return bookingService.uploadImage({
    contentType: "image/jpeg",
    dataBase64: dataUrl.slice(dataUrl.indexOf(",") + 1),
  })
}
