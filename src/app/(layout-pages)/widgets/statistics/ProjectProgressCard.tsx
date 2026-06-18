import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { ColoredProgress } from "@/components/ui/colored-progress"

type ProjectProgressCardProps = {
  title: string
  name: string
  role: string
  avatar: string
  progress: number
  progressColor: string
}

export default function ProjectProgressCard({
  title,
  name,
  role,
  avatar,
  progress,
  progressColor,
}: ProjectProgressCardProps) {
  return (
    <Card className="rounded-xl shadow-sm">
      <CardContent className="space-y-4 p-6">
        <h3 className="text-base font-semibold">{title}</h3>

        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={avatar} />
            <AvatarFallback>{name[0]}</AvatarFallback>
          </Avatar>

          <div>
            <p className="text-sm font-medium">{name}</p>
            <p className="text-xs text-muted-foreground">{role}</p>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Projects Progress</span>
            <span className="font-medium">{progress}%</span>
          </div>

          {/* ✅ THIS WORKS */}
          <ColoredProgress
            value={progress}
            indicatorClassName={progressColor}
          />
        </div>
      </CardContent>
    </Card>
  )
}
