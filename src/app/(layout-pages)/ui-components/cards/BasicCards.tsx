"use client"
import { ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardTitle,
} from "@/components/ui/card"

export function BasicCards() {
    return (
        <div className="space-y-6">

            <h5 className="text-xl font-bold">Basic Cards</h5>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">

                {/* Card 1 */}
                <Card className="overflow-hidden rounded-2xl">
                    <img
                        src="/pulse-ui-next/images/cards/basic/01.jpeg"
                        alt="Solana Community"
                        className="w-full h-48 object-cover"
                    />
                    <CardContent className="p-6 space-y-4">
                        <CardTitle className="text-xl font-semibold">
                            Solana Community
                        </CardTitle>
                        <p className="text-muted-foreground text-md">
                            Join a thriving global community. Connect on Discord, explore updates,
                            and discover what we’re building together.
                        </p>

                        <Button
                            className="h-9 w-full rounded-full gap-2 text-white
  bg-gradient-to-r from-indigo-500 to-purple-600
  hover:opacity-95 hover:-translate-y-0.5
  shadow-md shadow-purple-500/20 hover:shadow-purple-500/40
  transition-all duration-300"
                        >
                            Learn more
                            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                        </Button>
                    </CardContent>
                </Card>

                {/* Card 2 */}
                <Card className="overflow-hidden rounded-2xl">
                    <img
                        src="/pulse-ui-next/images/cards/basic/02.jpeg"
                        alt="Validator"
                        className="w-full h-48 object-cover"
                    />
                    <CardContent className="p-6 space-y-4">
                        <CardTitle className="text-xl font-semibold">
                            Become a Validator
                        </CardTitle>
                        <p className="text-muted-foreground text-md">
                            Help secure the network by running decentralized infrastructure
                            and contributing to ecosystem growth worldwide.
                        </p>

                        <Button
                            className="h-9 w-full rounded-full gap-2 text-white
  bg-gradient-to-r from-green-400 to-emerald-600
  hover:opacity-95 hover:-translate-y-0.5
  shadow-md shadow-emerald-500/20 hover:shadow-emerald-500/40
  transition-all duration-300"
                        >
                            Get started
                            <ArrowRight className="h-4 w-4" />
                        </Button>


                    </CardContent>
                </Card>

                {/* Card 3 */}
                <Card className="overflow-hidden rounded-2xl">
                    <img
                        src="/pulse-ui-next/images/cards/basic/03.jpeg"
                        alt="Developer Resources"
                        className="w-full h-48 object-cover"
                    />
                    <CardContent className="p-6 space-y-4">
                        <CardTitle className="text-xl font-semibold">
                            Developer Resources
                        </CardTitle>
                        <p className="text-muted-foreground text-md">
                            Access guides, tutorials, SDKs, and reference implementations
                            designed to help developers build powerful applications.
                        </p>

                        <Button
                            className="h-9 w-full rounded-full gap-2 text-white
  bg-gradient-to-r from-sky-400 to-blue-600
  hover:opacity-95 hover:-translate-y-0.5
  shadow-md shadow-blue-500/20 hover:shadow-blue-500/40
  transition-all duration-300"
                        >
                            Start building
                            <ArrowRight className="h-4 w-4" />
                        </Button>


                    </CardContent>
                </Card>

                {/* Card 4 */}
                <Card className="overflow-hidden rounded-2xl">
                    <img
                        src="/pulse-ui-next/images/cards/basic/04.jpeg"
                        alt="Events"
                        className="w-full h-48 object-cover"
                    />
                    <CardContent className="p-6 space-y-4">
                        <CardTitle className="text-xl font-semibold">
                            Events & Meetups
                        </CardTitle>
                        <p className="text-muted-foreground text-md">
                            Attend upcoming events and community meetups around
                            the world to collaborate and share ideas.
                        </p>

                        <Button
                            className="h-9 w-full rounded-full gap-2 text-white
  bg-gradient-to-r from-orange-400 to-red-500
  hover:opacity-95 hover:-translate-y-0.5
  shadow-md shadow-orange-500/20 hover:shadow-orange-500/40
  transition-all duration-300"
                        >
                            View events
                            <ArrowRight className="h-4 w-4" />
                        </Button>


                    </CardContent>
                </Card>

            </div>
        </div>
    )
}
