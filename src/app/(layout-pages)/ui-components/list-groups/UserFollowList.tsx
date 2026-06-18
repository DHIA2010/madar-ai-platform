import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MapPin, MessageCircle } from "lucide-react"

export function UserFollowList() {
  return (
    <Card className="overflow-hidden">
      
      {/* Optional Header */}
      <CardHeader className="border-b py-4">
        <CardTitle className="text-xl font-medium">User Suggestions</CardTitle>
      </CardHeader>

      {/* Scroll Area */}
      <CardContent className="p-0">
        <div className="max-h-[480px] overflow-y-auto">
          <ul className="divide-y">

            {/* User 1 */}
            <li className="flex items-center justify-between gap-4 p-4 hover:bg-muted/40 transition">
              <div className="flex items-center gap-4 min-w-0">
                <img
                  src="https://randomuser.me/api/portraits/men/32.jpg"
                  alt="John Doe"
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
                <div className="min-w-0">
                  <p className="font-semibold">John Doe</p>
                  <div className="flex items-center text-sm text-muted-foreground">
                    <MapPin className="mr-1 h-4 w-4 shrink-0" />
                    New York, USA
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline">
                  <MessageCircle/>
                </Button>
                <Button size="sm">Follow</Button>
              </div>
            </li>

            {/* User 2 */}
            <li className="flex items-center justify-between gap-4 p-4 hover:bg-muted/40 transition">
              <div className="flex items-center gap-4 min-w-0">
                <img
                  src="https://randomuser.me/api/portraits/women/45.jpg"
                  alt="Emma Johnson"
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
                <div className="min-w-0">
                  <p className="font-semibold">Emma Johnson</p>
                  <div className="flex items-center text-sm text-muted-foreground">
                    <MapPin className="mr-1 h-4 w-4 shrink-0" />
                    London, UK
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                 <Button size="sm" variant="outline">
                  <MessageCircle/>
                </Button>
                <Button size="sm">Follow</Button>
              </div>
            </li>

            {/* User 3 */}
            <li className="flex items-center justify-between gap-4 p-4 hover:bg-muted/40 transition">
              <div className="flex items-center gap-4 min-w-0">
                <img
                  src="https://randomuser.me/api/portraits/men/55.jpg"
                  alt="David Smith"
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
                <div className="min-w-0">
                  <p className="font-semibold">David Smith</p>
                  <div className="flex items-center text-sm text-muted-foreground">
                    <MapPin className="mr-1 h-4 w-4 shrink-0" />
                    Toronto, Canada
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                 <Button size="sm" variant="outline">
                  <MessageCircle/>
                </Button>
                <Button size="sm">Follow</Button>
              </div>
            </li>

            {/* User 4 */}
            <li className="flex items-center justify-between gap-4 p-4 hover:bg-muted/40 transition">
              <div className="flex items-center gap-4 min-w-0">
                <img
                  src="https://randomuser.me/api/portraits/women/66.jpg"
                  alt="Sophia Brown"
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
                <div className="min-w-0">
                  <p className="font-semibold">Sophia Brown</p>
                  <div className="flex items-center text-sm text-muted-foreground">
                    <MapPin className="mr-1 h-4 w-4 shrink-0" />
                    Sydney, Australia
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                 <Button size="sm" variant="outline">
                  <MessageCircle/>
                </Button>
                <Button size="sm">Follow</Button>
              </div>
            </li>

            {/* User 5 */}
            <li className="flex items-center justify-between gap-4 p-4 hover:bg-muted/40 transition">
              <div className="flex items-center gap-4 min-w-0">
                <img
                  src="https://randomuser.me/api/portraits/men/12.jpg"
                  alt="Michael Lee"
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
                <div className="min-w-0">
                  <p className="font-semibold">Michael Lee</p>
                  <div className="flex items-center text-sm text-muted-foreground">
                    <MapPin className="mr-1 h-4 w-4 shrink-0" />
                    San Francisco, USA
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                 <Button size="sm" variant="outline">
                  <MessageCircle/>
                </Button>
                <Button size="sm">Follow</Button>
              </div>
            </li>
            {/* User 6 */}
            <li className="flex items-center justify-between gap-4 p-4 hover:bg-muted/40 transition">
                <div className="flex items-center gap-4 min-w-0">
                    <img
                        src="https://randomuser.me/api/portraits/women/25.jpg"
                        alt="Lily Chen"
                        className="h-10 w-10 shrink-0 rounded-full object-cover"
                    />
                    <div className="min-w-0">
                        <p className="font-semibold">Lily Chen</p>
                        <div className="flex items-center text-sm text-muted-foreground">
                            <MapPin className="mr-1 h-4 w-4 shrink-0" />
                            Singapore
                        </div>
                    </div>
                </div>
                <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline">
                        <MessageCircle />
                    </Button>
                    <Button size="sm">Follow</Button>
                </div>
            </li>
            {/* User 7 */}
            <li className="flex items-center justify-between gap-4 p-4 hover:bg-muted/40 transition">
                <div className="flex items-center gap-4 min-w-0">
                    <img
                        src="https://randomuser.me/api/portraits/men/41.jpg"
                        alt="Daniel Carter"
                        className="h-10 w-10 shrink-0 rounded-full object-cover"
                    />
                    <div className="min-w-0">
                        <p className="font-semibold">Daniel Carter</p>
                        <div className="flex items-center text-sm text-muted-foreground">
                            <MapPin className="mr-1 h-4 w-4 shrink-0" />
                            Berlin, Germany
                        </div>
                    </div>
                </div>
                <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline">
                        <MessageCircle />
                    </Button>
                    <Button size="sm">Follow</Button>
                </div>
            </li>
            {/* User 8 */}
            <li className="flex items-center justify-between gap-4 p-4 hover:bg-muted/40 transition">
                <div className="flex items-center gap-4 min-w-0">
                    <img
                        src="https://randomuser.me/api/portraits/women/52.jpg"
                        alt="Olivia Martinez"
                        className="h-10 w-10 shrink-0 rounded-full object-cover"
                    />
                    <div className="min-w-0">
                        <p className="font-semibold">Olivia Martinez</p>
                        <div className="flex items-center text-sm text-muted-foreground">
                            <MapPin className="mr-1 h-4 w-4 shrink-0" />
                            Madrid, Spain
                        </div>
                    </div>
                </div>
                <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline">
                        <MessageCircle />
                    </Button>
                    <Button size="sm">Follow</Button>
                </div>
            </li>

          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
