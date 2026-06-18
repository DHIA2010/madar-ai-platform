import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText, ExternalLink } from "lucide-react"

export default function Documentation() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Documentation</h1>
        <p className="text-muted-foreground">
          PulseUI official documentation
        </p>
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            PulseUI Docs
          </CardTitle>
        </CardHeader>

        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            View the complete setup and usage guide for PulseUI.
          </p>

          <Button asChild>
            <a
              href="https://codervent.com/pulse-ui-next/documentation.pdf"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Documentation
              <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
