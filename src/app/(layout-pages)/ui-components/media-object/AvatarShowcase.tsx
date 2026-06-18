import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function AvatarShowcase() {
  return (
    <div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* LEFT COLUMN */}
        <div className="space-y-6">

          {/* Basic Avatars */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Avatars</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 flex-wrap">
                <img src="https://randomuser.me/api/portraits/women/1.jpg" className="h-24 w-24 rounded-full shadow p-1" />
                <img src="https://randomuser.me/api/portraits/men/2.jpg" className="h-24 w-24 rounded-full shadow p-1" />
                <img src="https://randomuser.me/api/portraits/men/3.jpg" className="h-24 w-24 rounded-full shadow p-1" />
              </div>
            </CardContent>
          </Card>

          {/* Avatars with bg colors */}
          <Card>
            <CardHeader>
              <CardTitle>Avatars with Bg Colors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 flex-wrap">
                <img src="https://randomuser.me/api/portraits/women/8.jpg" className="h-24 w-24 rounded-full shadow p-1 bg-blue-500" />
                <img src="https://randomuser.me/api/portraits/men/9.jpg" className="h-24 w-24 rounded-full shadow p-1 bg-red-500" />
                <img src="https://randomuser.me/api/portraits/women/10.jpg" className="h-24 w-24 rounded-full shadow p-1 bg-green-500" />
              </div>
            </CardContent>
          </Card>

          {/* Image Avatar Sizing & Shapes */}
          <Card>
            <CardHeader>
              <CardTitle>Sizing</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 flex-wrap">
                <img src="https://randomuser.me/api/portraits/women/8.jpg" className="h-[35px] w-[35px] rounded-full shadow border" />
                <img src="https://randomuser.me/api/portraits/men/9.jpg" className="h-[40px] w-[40px] rounded-full shadow border" />
                <img src="https://randomuser.me/api/portraits/women/10.jpg" className="h-[45px] w-[45px] rounded-full shadow border" />
                <img src="https://randomuser.me/api/portraits/men/18.jpg" className="h-[50px] w-[50px] rounded-full shadow border" />
              </div>

              <CardTitle className="mt-6">Shapes</CardTitle>

              <div className="flex items-center gap-4 flex-wrap mt-4">
                <img src="https://randomuser.me/api/portraits/women/8.jpg" className="h-[35px] w-[35px] rounded-none shadow" />
                <img src="https://randomuser.me/api/portraits/men/9.jpg" className="h-[40px] w-[40px] rounded-lg shadow" />
                <img src="https://randomuser.me/api/portraits/women/10.jpg" className="h-[45px] w-[45px] rounded-full shadow" />
                <img src="https://randomuser.me/api/portraits/women/19.jpg" className="h-[50px] w-[50px] rounded-full shadow" />
              </div>
            </CardContent>
          </Card>

        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">

          <Card>
            <CardHeader>
              <CardTitle>Avatar Group</CardTitle>
            </CardHeader>

            <CardContent>
              <div className="flex items-center">

                <img
                  src="https://randomuser.me/api/portraits/women/1.jpg"
                  className="h-12 w-12 rounded-full border-2 border-white shadow"
                />

                <img
                  src="https://randomuser.me/api/portraits/men/2.jpg"
                  className="h-12 w-12 rounded-full border-2 border-white shadow -ml-3"
                />

                <img
                  src="https://randomuser.me/api/portraits/men/3.jpg"
                  className="h-12 w-12 rounded-full border-2 border-white shadow -ml-3"
                />

                {/* +More */}
                <div className="h-12 w-12 rounded-full border-2 border-white shadow -ml-3 bg-muted flex items-center justify-center text-sm font-semibold">
                  +3
                </div>

              </div>

            </CardContent>
          </Card>

    

          {/* Label Avatars */}
          <Card>
            <CardHeader>
              <CardTitle>Label Avatars</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6 flex-wrap">
                <div className="h-24 w-24 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-4xl font-bold text-blue-600">VJ</span>
                </div>
                <div className="h-24 w-24 rounded-full bg-green-100 flex items-center justify-center">
                  <span className="text-4xl font-bold text-green-600">PK</span>
                </div>
                <div className="h-24 w-24 rounded-full bg-red-100 flex items-center justify-center">
                  <span className="text-4xl font-bold text-red-600">JY</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Solid Bg Avatars */}
          <Card>
            <CardHeader>
              <CardTitle>Bg Colors Avatars</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6 flex-wrap">
                <div className="h-24 w-24 rounded-full bg-blue-600 flex items-center justify-center">
                  <span className="text-4xl font-bold text-white">MK</span>
                </div>
                <div className="h-24 w-24 rounded-full bg-green-600 flex items-center justify-center">
                  <span className="text-4xl font-bold text-white">PK</span>
                </div>
                <div className="h-24 w-24 rounded-full bg-red-600 flex items-center justify-center">
                  <span className="text-4xl font-bold text-white">JY</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Letter Avatar Sizing & Shapes */}
          <Card>
            <CardHeader>
              <CardTitle>Sizing</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="h-[35px] w-[35px] rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="font-bold text-blue-600">H</span>
                </div>
                <div className="h-[40px] w-[40px] rounded-full bg-yellow-100 flex items-center justify-center">
                  <span className="font-bold text-yellow-600">P</span>
                </div>
                <div className="h-[45px] w-[45px] rounded-full bg-red-100 flex items-center justify-center">
                  <span className="font-bold text-red-600">S</span>
                </div>
                <div className="h-[50px] w-[50px] relative rounded-full bg-cyan-100 flex items-center justify-center">
                  <span className="font-bold text-cyan-600">S</span>
                  <span className="absolute bottom-1 right-1 h-3 w-3 bg-green-500 rounded-full border-2 border-white"></span>
                </div>
              </div>

              <CardTitle className="mt-6">Shapes</CardTitle>

              <div className="flex items-center gap-4 flex-wrap mt-4">
                <div className="h-[35px] w-[35px] bg-blue-600 rounded-none flex items-center justify-center">
                  <span className="font-bold text-white">H</span>
                </div>
                <div className="h-[40px] w-[40px] bg-yellow-500 rounded-lg flex items-center justify-center">
                  <span className="font-bold text-white">P</span>
                </div>
                <div className="h-[45px] w-[45px] bg-red-500 rounded-full flex items-center justify-center">
                  <span className="font-bold text-white">S</span>
                </div>
                <div className="h-[50px] w-[50px] bg-cyan-500 rounded-full flex items-center justify-center relative">
                  <span className="font-bold text-white">S</span>
                  <span className="absolute bottom-1 right-1 h-3 w-3 bg-green-500 rounded-full border-2 border-white"></span>
                </div>
              </div>

            </CardContent>
          </Card>

        </div>

      </div>
    </div>
  )
}
