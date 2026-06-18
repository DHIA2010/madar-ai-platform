"use client"

import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export function SonnerTypes() {
  return (
    <div className="flex flex-col border p-6 rounded-xl shadow-sm max-w-xl">
      <h3 className="text-2xl mb-6 font-medium">Sooner Types</h3>
      <div className="flex flex-wrap gap-4">
        <Button variant="outline"
          onClick={() => toast("Event has been created")}
          className="px-5"
        >
          Default
        </Button>
        <Button
          onClick={() => toast.success("Event has been created")}
          className="bg-green-500 hover:bg-green-600 px-5"
        >
          Success
        </Button>
        <Button
          onClick={() =>
            toast.info("Be at the area 10 minutes before the event time")
          }
          className="bg-blue-500 text-white hover:bg-blue-600 px-5"
        >
          Info
        </Button>
        <Button
          onClick={() =>
            toast.warning("Event start time cannot be earlier than 8am")
          }
          className="bg-orange-400 text-white hover:bg-orange-500 px-5"
        >
          Warning
        </Button>
        <Button
          onClick={() => toast.error("Event has not been created")}
          className="bg-red-500 text-white hover:bg-red-600 px-5"
        >
          Error
        </Button>
        <Button
          onClick={() => {
            toast.promise<{ name: string }>(
              () =>
                new Promise((resolve) =>
                  setTimeout(() => resolve({ name: "Event" }), 2000)
                ),
              {
                loading: "Loading...",
                success: (data) => `${data.name} has been created`,
                error: "Error",
              }
            )
          }}
        >
          Promise
        </Button>
      </div>
    </div>
  )
}
