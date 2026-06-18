"use client"

import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export function SonnerPosition() {
  return (
    <div className="flex flex-wrap justify-center gap-4 border p-6 rounded-xl shadow-sm max-w-xl">
      <Button
        variant="outline"
        onClick={() =>
          toast("Event has been created", { position: "top-left" })
        }
      >
        Top Left
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast("Event has been created", { position: "top-center" })
        }
      >
        Top Center
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast("Event has been created", { position: "top-right" })
        }
      >
        Top Right
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast("Event has been created", { position: "bottom-left" })
        }
      >
        Bottom Left
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast("Event has been created", { position: "bottom-center" })
        }
      >
        Bottom Center
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast("Event has been created", { position: "bottom-right" })
        }
      >
        Bottom Right
      </Button>
    </div>
  )
}
