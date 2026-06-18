import { MapPin, Briefcase, Clock } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
export function JobCards() {
  return (
    <div className="space-y-6">

      <h5 className="text-xl font-bold mt-4">Job Listings</h5>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

        {/* Job 1 */}
        <Card className="rounded-xl shadow-lg hover:-translate-y-2 hover:shadow-2xl transition-all duration-300">
          <CardContent className="p-6 space-y-4">

            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-semibold">
                  Senior UI/UX Designer
                </h3>
                <p className="text-muted-foreground text-sm">
                  Pulse Technologies
                </p>
              </div>
              <span className="px-3 py-1 text-xs rounded-full bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400">
                $90k - $120k
              </span>
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Remote
              </div>
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Full Time
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Posted 2 days ago
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <span className="text-xs px-3 py-1 rounded-full bg-muted">
                Figma
              </span>
              <span className="text-xs px-3 py-1 rounded-full bg-muted">
                React
              </span>
              <span className="text-xs px-3 py-1 rounded-full bg-muted">
                Tailwind
              </span>
            </div>

            <Button
              className="w-full rounded-full text-white
              bg-gradient-to-r from-indigo-500 to-purple-600
              hover:-translate-y-0.5 hover:shadow-lg
              transition-all duration-300"
            >
              Apply Now
            </Button>

          </CardContent>
        </Card>

        {/* Job 2 */}
        <Card className="rounded-xl shadow-lg hover:-translate-y-2 hover:shadow-2xl transition-all duration-300">
          <CardContent className="p-6 space-y-4">

            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-semibold">
                  Frontend Developer
                </h3>
                <p className="text-muted-foreground text-sm">
                  Nova Labs
                </p>
              </div>
              <span className="px-3 py-1 text-xs rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400">
                $70k - $95k
              </span>
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                New York
              </div>
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Hybrid
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Posted 4 days ago
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <span className="text-xs px-3 py-1 rounded-full bg-muted">
                React
              </span>
              <span className="text-xs px-3 py-1 rounded-full bg-muted">
                Next.js
              </span>
              <span className="text-xs px-3 py-1 rounded-full bg-muted">
                TypeScript
              </span>
            </div>

            <Button
              className="w-full rounded-full text-white
              bg-gradient-to-r from-green-400 to-emerald-600
              hover:-translate-y-0.5 hover:shadow-lg
              transition-all duration-300"
            >
              Apply Now
            </Button>

          </CardContent>
        </Card>

        {/* Job 3 */}
        <Card className="rounded-xl shadow-lg hover:-translate-y-2 hover:shadow-2xl transition-all duration-300">
          <CardContent className="p-6 space-y-4">

            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-semibold">
                  Product Manager
                </h3>
                <p className="text-muted-foreground text-sm">
                  BrightStart Inc.
                </p>
              </div>
              <span className="px-3 py-1 text-xs rounded-full bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400">
                $100k - $140k
              </span>
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                London
              </div>
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Full Time
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Posted 1 week ago
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <span className="text-xs px-3 py-1 rounded-full bg-muted">
                Strategy
              </span>
              <span className="text-xs px-3 py-1 rounded-full bg-muted">
                Agile
              </span>
              <span className="text-xs px-3 py-1 rounded-full bg-muted">
                Leadership
              </span>
            </div>

            <Button
              className="w-full rounded-full text-white
              bg-gradient-to-r from-orange-400 to-red-500
              hover:-translate-y-0.5 hover:shadow-lg
              transition-all duration-300"
            >
              Apply Now
            </Button>

          </CardContent>
        </Card>

      </div>
    </div>
  )
}
