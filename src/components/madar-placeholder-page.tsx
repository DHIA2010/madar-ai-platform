import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type MadarPlaceholderPageProps = {
  title: string
}

export default function MadarPlaceholderPage({
  title,
}: MadarPlaceholderPageProps) {
  return (
    <div className="max-w-5xl">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            This section is reserved for MADAR foundation implementation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Placeholder route created to complete the first navigation migration.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
