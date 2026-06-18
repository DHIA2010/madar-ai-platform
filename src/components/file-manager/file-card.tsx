import { FileText, Image, Video } from "lucide-react"

const icons: Record<string, any> = {
  pdf: FileText,
  image: Image,
  video: Video,
  figma: FileText,
}

export function FileCard({
  name,
  size,
  type,
}: {
  name: string
  size: string
  type: string
}) {
  const Icon = icons[type] ?? FileText

  return (
    <div className="flex items-center gap-3 rounded-lg
     border p-3 hover:bg-muted cursor-pointer transition-shadow hover:shadow-sm">
      <Icon className="h-6 w-6 text-muted-foreground" />
      <div className="flex-1">
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{size}</p>
      </div>
    </div>
  )
}
