"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"

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

      <Tabs defaultValue="preview" className="w-full">
        <TabsList className="ml-6 mt-4">
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="code">Code</TabsTrigger>
        </TabsList>

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