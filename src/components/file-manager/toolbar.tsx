import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Upload, FolderPlus } from "lucide-react"

export function FileManagerToolbar() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Input
        placeholder="Search files..."
        className="max-w-sm"
      />

      <div className="flex gap-2">
        <Button variant="outline">
          <FolderPlus className="mr-2 h-4 w-4" />
          New Folder
        </Button>
        <Button>
          <Upload className="mr-2 h-4 w-4" />
          Upload
        </Button>
      </div>
    </div>
  )
}
