"use client"

import { MapPin, Plane, Heart } from "lucide-react"

export function TravelCards() {
  return (
    <div className="space-y-6">
      <h5 className="text-xl font-bold">Travel Cards</h5>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Card 1 */}
        <div className="rounded-3xl overflow-hidden bg-card border shadow hover:-translate-y-2 hover:shadow-2xl transition-all duration-500">
          <div className="relative">
            <img
              src="/images/cards/travel/01.jpeg"
              alt="San Francisco"
              className="w-full h-80 object-cover"
            />
          </div>

          <div className="p-6 space-y-4">
            <div>
              <h3 className="text-xl font-semibold">San Francisco</h3>
              <p className="text-muted-foreground text-sm">Premium economy</p>
            </div>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span>
                  from <span className="font-semibold text-foreground">$240</span>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Plane className="h-4 w-4" />
                <span>SFO</span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                className="flex-1 rounded-full py-2 text-white
                bg-gradient-to-r from-indigo-500 to-purple-600
                shadow-md shadow-purple-500/30
                hover:-translate-y-0.5 hover:shadow-purple-500/50
                transition-all duration-300"
              >
                Search flight
              </button>

              <button className="p-2 rounded-full border hover:bg-muted transition">
                <Heart className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Card 2 */}
        <div className="rounded-3xl overflow-hidden bg-card border shadow hover:-translate-y-2 hover:shadow-2xl transition-all duration-500">
          <img
            src="/images/cards/travel/02.jpeg"
            alt="Paris"
            className="w-full h-80 object-cover"
          />

          <div className="p-6 space-y-4">
            <div>
              <h3 className="text-xl font-semibold">Paris</h3>
              <p className="text-muted-foreground text-sm">Business class</p>
            </div>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span>
                  from <span className="font-semibold text-foreground">$560</span>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Plane className="h-4 w-4" />
                <span>CDG</span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                className="flex-1 rounded-full py-2 text-white
                bg-green-500
                shadow-md shadow-green-500/30
                hover:-translate-y-0.5 hover:shadow-green-500/50
                transition-all duration-300"
              >
                Search flight
              </button>

              <button className="p-2 rounded-full border hover:bg-muted transition">
                <Heart className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Card 3 */}
        <div className="rounded-3xl overflow-hidden bg-card border shadow hover:-translate-y-2 hover:shadow-2xl transition-all duration-500">
          <img
            src="/images/cards/travel/03.jpeg"
            alt="Tokyo"
            className="w-full h-80 object-cover"
          />

          <div className="p-6 space-y-4">
            <div>
              <h3 className="text-xl font-semibold">Tokyo</h3>
              <p className="text-muted-foreground text-sm">First class</p>
            </div>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span>
                  from <span className="font-semibold text-foreground">$920</span>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Plane className="h-4 w-4" />
                <span>NRT</span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                className="flex-1 rounded-full py-2 text-white
                bg-red-500
                shadow-md shadow-red-500/30
                hover:-translate-y-0.5 hover:shadow-red-500/50
                transition-all duration-300"
              >
                Search flight
              </button>

              <button className="p-2 rounded-full border hover:bg-muted transition">
                <Heart className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
