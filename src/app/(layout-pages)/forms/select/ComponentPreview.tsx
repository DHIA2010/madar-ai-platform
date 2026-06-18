"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Copy, Check } from "lucide-react"

interface ComponentPreviewProps {
  title: string
  description?: string
  children: React.ReactNode
  code: string
}

export function ComponentPreview({
  title,
  description,
  children,
  code,
}: ComponentPreviewProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card>
      <div className="py-4 px-6 border-b">
        <h3 className="text-lg font-semibold">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">
            {description}
          </p>
        )}
      </div>

      <Tabs defaultValue="preview">
        <div className="flex items-center justify-between px-6 pt-4">
          <TabsList>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="code">Code</TabsTrigger>
          </TabsList>

          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            className="gap-2"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" /> Copy
              </>
            )}
          </Button>
        </div>

        <TabsContent value="preview" className="p-6">
          <div className="flex items-center justify-center min-h-[120px]">
            {children}
          </div>
        </TabsContent>

        <TabsContent value="code">
          <div className="bg-muted p-6 overflow-x-auto text-sm">
            <pre>
              <code>{code}</code>
            </pre>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  )
}