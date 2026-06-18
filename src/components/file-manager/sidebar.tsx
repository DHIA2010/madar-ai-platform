import { Progress } from "@/components/ui/progress"
import { Folder } from "lucide-react"

export function FileManagerSidebar() {
  return (
    <aside className="w-64 border-r bg-background p-4 space-y-6">
      <div>
        <h3 className="mb-2 text-sm font-semibold">Storage</h3>
        <Progress value={65} />
        <p className="mt-2 text-xs text-muted-foreground">
          6.5 GB of 10 GB used
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Folders</h3>

        {["Documents", "Images", "Videos", "Music", "Archives"].map(
          (folder) => (
            <div
              key={folder}
              className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted cursor-pointer"
            >
              <Folder className="h-4 w-4" />
              <span className="text-sm">{folder}</span>
            </div>
          )
        )}
      </div>
    </aside>
  )
}
