"use client"

import { Calendar, Clock, ArrowRight } from "lucide-react"

export function BlogCards() {
  return (
    <div className="space-y-6 blog-cards">

      <h5 className="text-xl font-bold">Latest Blog Posts</h5>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">

        {/* Blog Card 1 */}
        <div className="group rounded-2xl overflow-hidden bg-card border shadow flex flex-col">

          <div className="relative">
            <img
              src="/pulse-ui-next/images/cards/blog/01.jpeg"
              alt="AI in SaaS"
              className="w-full h-48 object-cover transition-transform duration-700 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

            <span className="absolute top-4 left-4 text-xs px-3 py-1 rounded-full bg-indigo-500 text-white">
              AI
            </span>
          </div>

          <div className="p-6 flex flex-col flex-1 space-y-4">
            <h3 className="text-xl font-semibold">
              The Future of AI in SaaS Platforms
            </h3>

            <p className="text-md text-muted-foreground flex-1">
              Discover how artificial intelligence is transforming SaaS products
              and creating smarter user experiences.
            </p>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Jan 20, 2026
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                5 min read
              </div>
            </div>

            <button className="group flex items-center gap-2 text-indigo-500 font-medium mt-2">
              Read More
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </button>
          </div>
        </div>

        {/* Blog Card 2 */}
        <div className="group rounded-2xl overflow-hidden bg-card border shadow flex flex-col">

          <div className="relative">
            <img
              src="/pulse-ui-next/images/cards/blog/02.jpeg"
              alt="Web3 Growth"
              className="w-full h-48 object-cover transition-transform duration-700 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

            <span className="absolute top-4 left-4 text-xs px-3 py-1 rounded-full bg-green-500 text-white">
              Web3
            </span>
          </div>

          <div className="p-6 flex flex-col flex-1 space-y-4">
            <h3 className="text-xl font-semibold">
              Scaling Web3 Applications Securely
            </h3>

            <p className="text-md text-muted-foreground flex-1">
              Learn best practices for building scalable and secure blockchain
              applications in today’s ecosystem.
            </p>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Feb 02, 2026
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                6 min read
              </div>
            </div>

            <button className="group flex items-center gap-2 text-green-500 font-medium mt-2">
              Read More
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </button>
          </div>
        </div>

        {/* Blog Card 3 */}
        <div className="group rounded-2xl overflow-hidden bg-card border shadow flex flex-col">

          <div className="relative">
            <img
              src="/pulse-ui-next/images/cards/blog/03.jpeg"
              alt="UI Trends"
              className="w-full h-48 object-cover transition-transform duration-700 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

            <span className="absolute top-4 left-4 text-xs px-3 py-1 rounded-full bg-blue-500 text-white">
              Design
            </span>
          </div>

          <div className="p-6 flex flex-col flex-1 space-y-4">
            <h3 className="text-xl font-semibold">
              Modern UI Trends for 2026
            </h3>

            <p className="text-md text-muted-foreground flex-1">
              Explore the latest interface trends shaping dashboards,
              applications, and digital products.
            </p>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Feb 10, 2026
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                4 min read
              </div>
            </div>

            <button className="group flex items-center gap-2 text-blue-500 font-medium mt-2">
              Read More
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </button>
          </div>
        </div>

        {/* Blog Card 4 */}
        <div className="group rounded-2xl overflow-hidden bg-card border shadow flex flex-col">

          <div className="relative">
            <img
              src="/pulse-ui-next/images/cards/blog/05.jpeg"
              alt="Startup Growth"
              className="w-full h-48 object-cover transition-transform duration-700 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

            <span className="absolute top-4 left-4 text-xs px-3 py-1 rounded-full bg-orange-500 text-white">
              Startup
            </span>
          </div>

          <div className="p-6 flex flex-col flex-1 space-y-4">
            <h3 className="text-xl font-semibold">
              Growth Strategies for Startups
            </h3>

            <p className="text-md text-muted-foreground flex-1">
              Discover proven marketing and product strategies to accelerate
              startup growth in competitive markets.
            </p>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Feb 15, 2026
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                7 min read
              </div>
            </div>

            <button className="group flex items-center gap-2 text-orange-500 font-medium mt-2">
              Read More
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
