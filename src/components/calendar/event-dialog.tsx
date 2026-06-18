"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { CalendarEvent } from "./types"
import { useEffect, useState } from "react"

type Props = {
  open: boolean
  onClose: () => void
  onSave: (event: CalendarEvent) => void
  event?: CalendarEvent | null
  selectedDate?: string | null
}

export function EventDialog({
  open,
  onClose,
  onSave,
  event,
  selectedDate,
}: Props) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [color, setColor] = useState("#3b82f6")

  useEffect(() => {
    if (event) {
      setTitle(event.title)
      setDescription(event.description ?? "")
      setStart(event.start)
      setEnd(event.end ?? "")
      setColor(event.color ?? "#3b82f6")
    } else if (selectedDate) {
      setTitle("")
      setDescription("")
      setStart(`${selectedDate}T09:00`)
      setEnd(`${selectedDate}T09:30`)
      setColor("#3b82f6")
    }
  }, [event, selectedDate])

  const handleSave = () => {
    onSave({
      id: event?.id ?? crypto.randomUUID(),
      title,
      description,
      start,
      end,
      color,
    })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {event ? "Edit Event" : "Add Event"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              placeholder="Standup Meeting"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              placeholder="Daily session"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Start */}
          <div className="space-y-2">
            <Label>Start</Label>
            <Input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>

          {/* End */}
          <div className="space-y-2">
            <Label>End</Label>
            <Input
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>

          {/* Color */}
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-10 cursor-pointer rounded-md border"
              />
              <Input value={color} readOnly />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!title || !start}
          >
            {event ? "Update Event" : "Add Event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
