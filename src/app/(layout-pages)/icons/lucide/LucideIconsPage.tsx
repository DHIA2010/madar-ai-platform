import {
  Home,
  User,
  Heart,
  Bell,
  Mail,
  Settings,
  Camera,
  ShoppingCart,
  Book,
  Calendar,
  MessageCircle,
  Search,
  Lock,
  Globe,
  Star,
  Map,
  Phone,
  CreditCard,
  BarChart3,
  Folder,
  Activity,
  Shield,
  Database,
  Users,
  Settings2,
  FileText,
  PieChart,
  Trash2,
  Upload,
  Download
} from "lucide-react"

import { Button } from "@/components/ui/button"

export default function LucideIconsPage() {
  return (
    <div className="p-8">

      <h5 className="text-2xl font-bold mb-6">
        Lucide Icons Gallery
      </h5>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-6">

        {/* Home */}
        <div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <Home className="w-8 h-8 mx-auto mb-3" />
          <p className="text-md font-medium">Home</p>
        </div>

        {/* User */}
        <div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <User className="w-8 h-8 mx-auto mb-3" />
          <p className="text-md font-medium">User</p>
        </div>

        {/* Heart */}
        <div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <Heart className="w-8 h-8 mx-auto mb-3" />
          <p className="text-md font-medium">Heart</p>
        </div>

        {/* Bell */}
        <div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <Bell className="w-8 h-8 mx-auto mb-3" />
          <p className="text-md font-medium">Bell</p>
        </div>

        {/* Mail */}
        <div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <Mail className="w-8 h-8 mx-auto mb-3" />
          <p className="text-md font-medium">Mail</p>
        </div>

        {/* Settings */}
        <div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <Settings className="w-8 h-8 mx-auto mb-3" />
          <p className="text-md font-medium">Settings</p>
        </div>

        {/* Camera */}
        <div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <Camera className="w-8 h-8 mx-auto mb-3" />
          <p className="text-md font-medium">Camera</p>
        </div>

        {/* Cart */}
        <div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <ShoppingCart className="w-8 h-8 mx-auto mb-3" />
          <p className="text-md font-medium">Cart</p>
        </div>

        {/* Book */}
        <div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <Book className="w-8 h-8 mx-auto mb-3" />
          <p className="text-md font-medium">Book</p>
        </div>

        {/* Calendar */}
        <div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <Calendar className="w-8 h-8 mx-auto mb-3" />
          <p className="text-md font-medium">Calendar</p>
        </div>

        {/* Message */}
        <div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <MessageCircle className="w-8 h-8 mx-auto mb-3" />
          <p className="text-md font-medium">Message</p>
        </div>

        {/* Search */}
        <div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <Search className="w-8 h-8 mx-auto mb-3" />
          <p className="text-md font-medium">Search</p>
        </div>

        {/* Lock */}
        <div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <Lock className="w-8 h-8 mx-auto mb-3" />
          <p className="text-md font-medium">Lock</p>
        </div>

        {/* Globe */}
        <div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <Globe className="w-8 h-8 mx-auto mb-3" />
          <p className="text-md font-medium">Globe</p>
        </div>

        {/* Star */}
        <div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <Star className="w-8 h-8 mx-auto mb-3" />
          <p className="text-md font-medium">Star</p>
        </div>

        {/* Map */}
        <div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <Map className="w-8 h-8 mx-auto mb-3" />
          <p className="text-md font-medium">Map</p>
        </div>

        {/* Phone */}
        <div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <Phone className="w-8 h-8 mx-auto mb-3" />
          <p className="text-md font-medium">Phone</p>
        </div>

        {/* Credit Card */}
        <div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <CreditCard className="w-8 h-8 mx-auto mb-3" />
          <p className="text-md font-medium">Credit Card</p>
        </div>

        {/* Bar Chart */}
        <div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <BarChart3 className="w-8 h-8 mx-auto mb-3" />
          <p className="text-md font-medium">Bar Chart</p>
        </div>

        {/* Folder */}
        <div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <Folder className="w-8 h-8 mx-auto mb-3" />
          <p className="text-md font-medium">Folder</p>
        </div>

        {/* Activity */}
<div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
  <Activity className="w-8 h-8 mx-auto mb-3" />
  <p className="text-md font-medium">Activity</p>
</div>

{/* Shield */}
<div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
  <Shield className="w-8 h-8 mx-auto mb-3" />
  <p className="text-md font-medium">Shield</p>
</div>

{/* Database */}
<div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
  <Database className="w-8 h-8 mx-auto mb-3" />
  <p className="text-md font-medium">Database</p>
</div>

{/* Users */}
<div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
  <Users className="w-8 h-8 mx-auto mb-3" />
  <p className="text-md font-medium">Users</p>
</div>

{/* Settings2 */}
<div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
  <Settings2 className="w-8 h-8 mx-auto mb-3" />
  <p className="text-md font-medium">Settings 2</p>
</div>

{/* FileText */}
<div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
  <FileText className="w-8 h-8 mx-auto mb-3" />
  <p className="text-md font-medium">File Text</p>
</div>

{/* PieChart */}
<div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
  <PieChart className="w-8 h-8 mx-auto mb-3" />
  <p className="text-md font-medium">Pie Chart</p>
</div>

{/* Trash2 */}
<div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
  <Trash2 className="w-8 h-8 mx-auto mb-3" />
  <p className="text-md font-medium">Trash</p>
</div>

{/* Upload */}
<div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
  <Upload className="w-8 h-8 mx-auto mb-3" />
  <p className="text-md font-medium">Upload</p>
</div>

{/* Download */}
<div className="rounded-2xl border bg-card p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
  <Download className="w-8 h-8 mx-auto mb-3" />
  <p className="text-md font-medium">Download</p>
</div>


      </div>

      {/* View More Button */}
      <div className="mx-auto mt-8 w-[200px] text-center">
        <Button asChild className="w-full">
          <a
            href="https://lucide.dev/icons/"
            target="_blank"
            rel="noopener noreferrer"
          >
            View More Icons
          </a>
        </Button>
      </div>

    </div>
  )
}
