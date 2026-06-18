"use client"

import { useState } from "react"
import Editor from "react-simple-wysiwyg"

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"

export default function FormTextEditor() {
  const [html, setHtml] = useState("my <b>HTML</b>")

  function onChange(e: any) {
    setHtml(e.target.value)
  }

  return (
    <div className="flex justify-center py-8 px-4">
      <Card className="w-full max-w-3xl rounded-2xl">
        <CardHeader>
          <CardTitle>Text Editor</CardTitle>
          <CardDescription>
            This is a simple text editor using{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-sm">
              react-simple-wysiwyg
            </code>.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            You can type your content here:
          </p>

          <div className="border rounded-lg overflow-hidden bg-background">
            <Editor
              value={html}
              onChange={onChange}
              containerProps={{
                style: {
                  minHeight: "200px",
                },
              }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}