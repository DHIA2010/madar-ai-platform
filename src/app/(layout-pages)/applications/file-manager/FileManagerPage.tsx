"use client"

import {
  Folder,
  FileText,
  Image,
  Video,
  Music,
  Archive,
  Search,
  MoreHorizontal,
  Plus,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const SIDEBAR_ITEMS: Array<[string, typeof Folder]> = [
  ["All Files", Folder],
  ["My Devices", Folder],
  ["Recents", Folder],
  ["Important", Folder],
  ["Deleted Files", Folder],
  ["Documents", FileText],
  ["Images", Image],
  ["Videos", Video],
  ["Audio", Music],
  ["Zip Files", Archive],
]

const STORAGE_ITEMS: Array<[string, string, string, number]> = [
  ["Google Drive", "45.5 GB", "50 GB", 90],
  ["Dropbox", "1.2 GB", "3 GB", 40],
  ["OneDrive", "2.5 GB", "3 GB", 80],
]

export default function FileManagerPage() {
  return (
    <div className="flex flex-col xl:flex-row gap-6">
      {/* ================= LEFT SIDEBAR ================= */}
      <aside className="w-full xl:w-64 rounded-xl border bg-background p-4 space-y-4">
        <Button className="w-full h-9">
          <Plus className="mr-2 h-4 w-4" /> Add File
        </Button>

        <div className="space-y-1 text-sm">
          <p className="font-semibold">My Drive</p>

          {SIDEBAR_ITEMS.map(([label, Icon]) => (
            <div
              key={label}
              className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted cursor-pointer"
            >
              <Icon className="h-4 w-4" />
              {label}
            </div>
          ))}
        </div>

        {/* Storage */}
        <div className="pt-4 border-t space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">45.5 GB</span>
            <span className="text-muted-foreground">50 GB</span>
          </div>
          <Progress value={90} />
          <p className="text-xs text-muted-foreground">Used</p>
        </div>
      </aside>

      {/* ================= MAIN CONTENT ================= */}
      <main className="flex-1 space-y-6">
        {/* Search */}
        <div className="flex items-center gap-2 relative">
          <Search className="h-4 w-4 text-muted-foreground absolute left-4 top-1/2 transform -translate-y-1/2" />
          <Input placeholder="Search the files" className="pl-10 h-10" />
        </div>

        {/* Cloud Storage */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {STORAGE_ITEMS.map(([name, used, total, percent]) => (
            <div key={name} className="rounded-xl border bg-background p-4 space-y-2">
              <div className="flex justify-between">
                <p className="font-medium">{name}</p>
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">
                {used} / {total}
              </p>
              <Progress value={percent} />
            </div>
          ))}
        </div>

        {/* Folders */}
        <div>
          <h3 className="mb-3 font-semibold">Folders</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              ["Analytics", "15 files"],
              ["Assets", "345 files"],
              ["Marketing", "143 files"],
            ].map(([name, count]) => (
              <div
                key={name}
                className="flex items-center justify-between rounded-xl border bg-background p-4"
              >
                <div className="flex items-center gap-3">
                  <Folder className="h-6 w-6 text-primary" />
                  <div>
                    <p className="font-medium">{name}</p>
                    <p className="text-xs text-muted-foreground">{count}</p>
                  </div>
                </div>
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
              </div>
            ))}
          </div>
        </div>

        {/* Recent Files */}
        <div>
          <div className="flex flex-wrap gap-2 justify-between mb-3">
            <h3 className="font-semibold">Recent Files</h3>
            <Button variant="outline" size="sm">
              View all
            </Button>
          </div>

          <div className="rounded-xl border bg-background overflow-x-auto">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Last Modified</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>

              <TableBody>
                {[
                  ["Competitor Analysis Template", "Only you", "Sep 3, 2019"],
                  ["How to Create a Case Study", "3 members", "Jun 12, 2019"],
                  ["Landing Page Structure", "10 members", "Jul 17, 2019"],
                  ["Meeting Report", "5 members", "Aug 28, 2019"],
                ].map(([name, members, date]) => (
                  <TableRow key={name}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell>{members}</TableCell>
                    <TableCell>{date}</TableCell>
                    <TableCell className="text-right">
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>
    </div>
  )
}
