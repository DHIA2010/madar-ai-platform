"use client"

import { ShoppingCart, Heart } from "lucide-react"

export function FeaturedProducts() {
  return (
    <div className="space-y-6">
      <h5 className="text-xl font-bold">Featured Products</h5>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
        {/* Product 1 */}
        <div className="rounded-3xl overflow-hidden bg-card border shadow hover:shadow-xl hover:-translate-y-2 transition-all duration-500">
          <div className="bg-indigo-100 dark:bg-indigo-500/10 p-8 flex items-center justify-center">
            <img
              src="/images/cards/eComm/01.png"
              alt="Wireless Headphones"
              className="h-40 object-contain"
            />
          </div>

          <div className="p-6 space-y-4">
            <h3 className="text-xl font-semibold">Wireless Headphones</h3>

            <p className="text-sm text-muted-foreground">
              Noise-cancelling over-ear headphones with long-lasting battery life.
            </p>

            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-indigo-600">$129.00</span>
              <span className="text-xs px-3 py-1 rounded-full bg-green-500 text-white">
                In Stock
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                className="flex-1 flex items-center justify-center gap-2
                rounded-full px-4 py-2 text-white
                bg-gradient-to-r from-indigo-500 to-purple-600
                shadow-md shadow-purple-500/30
                hover:-translate-y-0.5 hover:shadow-purple-500/50
                transition-all duration-300"
              >
                <ShoppingCart className="h-4 w-4" />
                Add to Cart
              </button>

              <button className="p-2 rounded-full border hover:bg-muted transition">
                <Heart className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Product 2 */}
        <div className="rounded-3xl overflow-hidden bg-card border shadow hover:shadow-xl hover:-translate-y-2 transition-all duration-500">
          <div className="bg-cyan-100 dark:bg-cyan-500/10 p-8 flex items-center justify-center">
            <img
              src="/images/cards/eComm/02.png"
              alt="Smartwatch Pro"
              className="h-40 object-contain"
            />
          </div>

          <div className="p-6 space-y-4">
            <h3 className="text-xl font-semibold">Smartwatch Pro</h3>

            <p className="text-sm text-muted-foreground">
              Fitness tracking, heart rate monitoring, and smart notifications.
            </p>

            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-indigo-600">$89.00</span>
              <span className="text-xs px-3 py-1 rounded-full bg-orange-500 text-white">
                Limited
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                className="flex-1 flex items-center justify-center gap-2
                rounded-full px-4 py-2 text-indigo-600 border border-indigo-500
                hover:bg-indigo-600 hover:text-white
                transition-all duration-300"
              >
                <ShoppingCart className="h-4 w-4" />
                Add to Cart
              </button>

              <button className="p-2 rounded-full border hover:bg-muted transition">
                <Heart className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Product 3 */}
        <div className="rounded-3xl overflow-hidden bg-card border shadow hover:shadow-xl hover:-translate-y-2 transition-all duration-500">
          <div className="bg-pink-100 dark:bg-pink-500/10 p-8 flex items-center justify-center">
            <img
              src="/images/cards/eComm/03.png"
              alt="Portable Speaker"
              className="h-40 object-contain"
            />
          </div>

          <div className="p-6 space-y-4">
            <h3 className="text-xl font-semibold">Portable Speaker</h3>

            <p className="text-sm text-muted-foreground">
              Compact wireless speaker with immersive sound and deep bass.
            </p>

            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-indigo-600">$59.00</span>
              <span className="text-xs px-3 py-1 rounded-full bg-blue-500 text-white">New</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                className="flex-1 flex items-center justify-center gap-2
                rounded-full px-4 py-2 text-white
                bg-gradient-to-r from-pink-500 to-rose-500
                shadow-md shadow-pink-500/30
                hover:-translate-y-0.5 hover:shadow-pink-500/50
                transition-all duration-300"
              >
                <ShoppingCart className="h-4 w-4" />
                Add to Cart
              </button>

              <button className="p-2 rounded-full border hover:bg-muted transition">
                <Heart className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Product 4 */}
        <div className="rounded-3xl overflow-hidden bg-card border shadow hover:shadow-xl hover:-translate-y-2 transition-all duration-500">
          <div className="bg-amber-100 dark:bg-amber-500/10 p-8 flex items-center justify-center">
            <img
              src="/images/cards/eComm/04.png"
              alt="Noise Cancelling Earbuds"
              className="h-40 object-contain"
            />
          </div>

          <div className="p-6 space-y-4">
            <h3 className="text-xl font-semibold">Noise Cancelling Earbuds</h3>

            <p className="text-sm text-muted-foreground">
              Lightweight wireless earbuds with active noise cancellation and crystal clear audio.
            </p>

            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-indigo-600">$79.00</span>
              <span className="text-xs px-3 py-1 rounded-full bg-red-500 text-white">Sale</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                className="flex-1 flex items-center justify-center gap-2
                rounded-full px-4 py-2 text-white
                bg-gradient-to-r from-amber-400 to-orange-500
                shadow-md shadow-orange-500/30
                hover:-translate-y-0.5 hover:shadow-orange-500/50
                transition-all duration-300"
              >
                <ShoppingCart className="h-4 w-4" />
                Add to Cart
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
