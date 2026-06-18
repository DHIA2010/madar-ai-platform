import { Folder } from "lucide-react"

type Props = {
  name: string
  files: number
}

export function FolderCard({ name, files }: Props) {
  return (
    <div className="rounded-lg border p-6 hover:shadow-sm transition cursor-pointer">
      <Folder className="h-8 w-8 text-primary mb-2" />
      <p className="font-medium">{name}</p>
      <p className="text-xs text-muted-foreground">
        {files} files
      </p>
    </div>
  )
}
