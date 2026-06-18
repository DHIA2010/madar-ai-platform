"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export function ToolCards() {
  return (
    <div className="space-y-6">

      <h5 className="text-xl font-bold mt-4">Tool Cards</h5>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3 gap-6">

        {/* Card 1 - Figma */}
        <Card className="p-6 hover:shadow-lg">
          <CardContent className="p-0 space-y-4">

            <div className="flex justify-between items-center">
              <img
                src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/figma/figma-original.svg"
                alt="Figma"
                className="w-10 h-10"
              />
              <small className="text-muted-foreground">2 Days Ago</small>
            </div>

            <h3 className="font-semibold text-xl">
              Figma Design Tool
            </h3>

            <p className="text-muted-foreground text-md">
              Our elite teams build apps, responsive websites, bots — any digital product that interacts with users worldwide.
            </p>

            <div className="flex justify-between items-center pt-2">

              <div className="flex gap-2">
                <button className="w-9 h-9 rounded-full bg-red-600 text-white flex items-center justify-center hover:scale-110 transition">
                  <i className="bi bi-youtube"></i>
                </button>
                <button className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center hover:scale-110 transition">
                  <i className="bi bi-behance"></i>
                </button>
              </div>

              <Button variant="outline" className="rounded-full gap-2">
                Learn more
                <i className="bi bi-arrow-right"></i>
              </Button>

            </div>

          </CardContent>
        </Card>

        {/* Card 2 - Notion */}
        <Card className="p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
          <CardContent className="p-0 space-y-4">

            <div className="flex justify-between items-center">
              <img
                src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/notion/notion-original.svg"
                alt="Notion"
                className="w-10 h-10"
              />
              <small className="text-muted-foreground">5 Days Ago</small>
            </div>

            <h3 className="font-semibold text-xl">
              Notion Workspace
            </h3>

            <p className="text-muted-foreground text-md">
              Centralize your notes, tasks, databases, and wikis with Notion. Ideal for individuals and teams collaborating.
            </p>

            <div className="flex justify-between items-center pt-2">

              <div className="flex gap-2">
                <button className="w-9 h-9 rounded-full bg-pink-500 text-white flex items-center justify-center hover:scale-110 transition">
                  <i className="bi bi-instagram"></i>
                </button>
                <button className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center hover:scale-110 transition">
                  <i className="bi bi-twitter-x"></i>
                </button>
              </div>

              <Button variant="outline" className="rounded-full gap-2">
                Learn more
                <i className="bi bi-arrow-right"></i>
              </Button>

            </div>

          </CardContent>
        </Card>

        {/* Card 3 - Slack */}
        <Card className="p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
          <CardContent className="p-0 space-y-4">

            <div className="flex justify-between items-center">
              <img
                src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/slack/slack-original.svg"
                alt="Slack"
                className="w-10 h-10"
              />
              <small className="text-muted-foreground">1 Week Ago</small>
            </div>

            <h3 className="font-semibold text-xl">
              Slack Team Chat
            </h3>

            <p className="text-muted-foreground text-md">
              Keep your team in sync with real-time messaging, file sharing, and integrations to tools you already use.
            </p>

            <div className="flex justify-between items-center pt-2">

              <div className="flex gap-2">
                <button className="w-9 h-9 rounded-full bg-red-500 text-white flex items-center justify-center hover:scale-110 transition">
                  <i className="bi bi-pinterest"></i>
                </button>
                <button className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center hover:scale-110 transition">
                  <i className="bi bi-facebook"></i>
                </button>
              </div>

              <Button variant="outline" className="rounded-full gap-2">
                Learn more
                <i className="bi bi-arrow-right"></i>
              </Button>

            </div>

          </CardContent>
        </Card>

        {/* Card 4 - Trello */}
        <Card className="p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
          <CardContent className="p-0 space-y-4">

            <div className="flex justify-between items-center">
              <img
                src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/trello/trello-plain.svg"
                alt="Trello"
                className="w-10 h-10"
              />
              <small className="text-muted-foreground">3 Days Ago</small>
            </div>

            <h3 className="font-semibold text-xl">
              Trello Boards
            </h3>

            <p className="text-muted-foreground text-md">
              Organize your workflow with flexible kanban boards and intuitive task tracking for agile teams.
            </p>

            <div className="flex justify-between items-center pt-2">

              <div className="flex gap-2">
                <button className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center hover:scale-110 transition">
                  <i className="bi bi-apple"></i>
                </button>
                <button className="w-9 h-9 rounded-full bg-blue-700 text-white flex items-center justify-center hover:scale-110 transition">
                  <i className="bi bi-linkedin"></i>
                </button>
              </div>

              <Button variant="outline" className="rounded-full gap-2">
                Learn more
                <i className="bi bi-arrow-right"></i>
              </Button>

            </div>

          </CardContent>
        </Card>

        {/* Card 5 - GitHub */}
<Card className="p-6 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
  <CardContent className="p-0 space-y-4">

    <div className="flex justify-between items-center">
      <img
        src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/github/github-original.svg"
        alt="GitHub"
        className="w-10 h-10"
      />
      <small className="text-muted-foreground">4 Days Ago</small>
    </div>

    <h3 className="font-semibold text-lg">
      GitHub Code Platform
    </h3>

    <p className="text-muted-foreground text-sm">
      Collaborate on code, review pull requests, and manage repositories efficiently with GitHub.
    </p>

    <div className="flex justify-between items-center pt-2">

      <div className="flex gap-2">
        <button className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center hover:scale-110 transition">
          <i className="bi bi-github"></i>
        </button>
        <button className="w-9 h-9 rounded-full bg-blue-500 text-white flex items-center justify-center hover:scale-110 transition">
          <i className="bi bi-globe"></i>
        </button>
      </div>

      <Button variant="outline" className="rounded-full gap-2">
        Learn more
        <i className="bi bi-arrow-right"></i>
      </Button>

    </div>

  </CardContent>
</Card>

{/* Card 6 - Adobe XD */}
<Card className="p-6 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
  <CardContent className="p-0 space-y-4">

    <div className="flex justify-between items-center">
      <img
        src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/xd/xd-plain.svg"
        alt="Adobe XD"
        className="w-10 h-10"
      />
      <small className="text-muted-foreground">6 Days Ago</small>
    </div>

    <h3 className="font-semibold text-lg">
      Adobe XD Prototyping
    </h3>

    <p className="text-muted-foreground text-sm">
      Design interactive prototypes and collaborate seamlessly with teams using Adobe XD.
    </p>

    <div className="flex justify-between items-center pt-2">

      <div className="flex gap-2">
        <button className="w-9 h-9 rounded-full bg-purple-600 text-white flex items-center justify-center hover:scale-110 transition">
          <i className="bi bi-play-fill"></i>
        </button>
        <button className="w-9 h-9 rounded-full bg-red-600 text-white flex items-center justify-center hover:scale-110 transition">
          <i className="bi bi-youtube"></i>
        </button>
      </div>

      <Button variant="outline" className="rounded-full gap-2">
        Learn more
        <i className="bi bi-arrow-right"></i>
      </Button>

    </div>

  </CardContent>
</Card>


      </div>
    </div>
  )
}
