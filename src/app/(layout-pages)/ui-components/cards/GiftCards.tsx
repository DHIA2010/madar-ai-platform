"use client"

import { Card, CardContent } from "@/components/ui/card"

export function GiftCards() {
  return (
    <div className="space-y-6">

      <h5 className="text-xl font-bold mt-4">Gift Cards</h5>

      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 2xl:grid-cols-5 gap-6">

        {/* Facebook */}
        <Card className="bg-gradient-to-br from-[#1877F2] to-[#0d47a1] text-white shadow-lg hover:-translate-y-2 hover:shadow-2xl transition-all duration-300 rounded-lg">
          <CardContent className="p-6 text-center space-y-3">
            <i className="bi bi-facebook text-4xl"></i>
            <h4 className="font-bold text-lg">Facebook</h4>
            <div className="font-semibold">$ 55.00</div>
          </CardContent>
        </Card>

        {/* Spotify */}
        <Card className="bg-gradient-to-br from-[#1DB954] to-[#0b7d3e] text-white shadow-lg hover:-translate-y-2 hover:shadow-2xl transition-all duration-300 rounded-lg">
          <CardContent className="p-6 text-center space-y-3">
            <i className="bi bi-spotify text-4xl"></i>
            <h4 className="font-bold text-lg">Spotify</h4>
            <div className="font-semibold">$ 24.00</div>
          </CardContent>
        </Card>

        {/* Amazon */}
        <Card className="bg-gradient-to-br from-gray-900 to-black text-white shadow-lg hover:-translate-y-2 hover:shadow-2xl transition-all duration-300 rounded-lg">
          <CardContent className="p-6 text-center space-y-3">
            <i className="bi bi-amazon text-4xl"></i>
            <h4 className="font-bold text-lg">Amazon</h4>
            <div className="font-semibold">$ 20.00</div>
          </CardContent>
        </Card>

        {/* YouTube */}
        <Card className="bg-gradient-to-br from-red-500 to-red-700 text-white shadow-lg hover:-translate-y-2 hover:shadow-2xl transition-all duration-300 rounded-lg">
          <CardContent className="p-6 text-center space-y-3">
            <i className="bi bi-youtube text-4xl"></i>
            <h4 className="font-bold text-lg">YouTube</h4>
            <div className="font-semibold">$ 68.00</div>
          </CardContent>
        </Card>

        {/* iTunes */}
        <Card className="bg-gradient-to-br from-gray-700 to-gray-900 text-white shadow-lg hover:-translate-y-2 hover:shadow-2xl transition-all duration-300 rounded-lg">
          <CardContent className="p-6 text-center space-y-3">
            <i className="bi bi-apple text-4xl"></i>
            <h4 className="font-bold text-lg">iTunes</h4>
            <div className="font-semibold">$ 37.00</div>
          </CardContent>
        </Card>

        {/* Google Play */}
        <Card className="bg-gradient-to-br from-[#34A853] to-[#1e7c3a] text-white shadow-lg hover:-translate-y-2 hover:shadow-2xl transition-all duration-300 rounded-lg">
          <CardContent className="p-6 text-center space-y-3">
            <i className="bi bi-google-play text-4xl"></i>
            <h4 className="font-bold text-lg">Google Play</h4>
            <div className="font-semibold">$ 96.00</div>
          </CardContent>
        </Card>

        {/* Xbox */}
        <Card className="bg-gradient-to-br from-green-500 to-green-700 text-white shadow-lg hover:-translate-y-2 hover:shadow-2xl transition-all duration-300 rounded-lg">
          <CardContent className="p-6 text-center space-y-3">
            <i className="bi bi-xbox text-4xl"></i>
            <h4 className="font-bold text-lg">Xbox</h4>
            <div className="font-semibold">$ 76.00</div>
          </CardContent>
        </Card>

        {/* Tencent QQ */}
        <Card className="bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-lg hover:-translate-y-2 hover:shadow-2xl transition-all duration-300 rounded-lg">
          <CardContent className="p-6 text-center space-y-3">
            <i className="bi bi-tencent-qq text-4xl"></i>
            <h4 className="font-bold text-lg">Tencent QQ</h4>
            <div className="font-semibold">$ 36.00</div>
          </CardContent>
        </Card>

        {/* Paypal */}
        <Card className="bg-gradient-to-br from-[#003087] to-[#001f5c] text-white shadow-lg hover:-translate-y-2 hover:shadow-2xl transition-all duration-300 rounded-lg">
          <CardContent className="p-6 text-center space-y-3">
            <i className="bi bi-paypal text-4xl"></i>
            <h4 className="font-bold text-lg">Paypal</h4>
            <div className="font-semibold">$ 20.00</div>
          </CardContent>
        </Card>

        {/* Gitlab */}
        <Card className="bg-gradient-to-br from-orange-500 to-orange-700 text-white shadow-lg hover:-translate-y-2 hover:shadow-2xl transition-all duration-300 rounded-lg">
          <CardContent className="p-6 text-center space-y-3">
            <i className="bi bi-gitlab text-4xl"></i>
            <h4 className="font-bold text-lg">Gitlab</h4>
            <div className="font-semibold">$ 20.00</div>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
