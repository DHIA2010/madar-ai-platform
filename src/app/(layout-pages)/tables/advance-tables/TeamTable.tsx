"use client"

import { useState } from "react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import { Search, Pencil, Trash2 } from "lucide-react"

const initialMembers = [
  {
    id: 1,
    name: "Olivia Rhye",
    username: "@olivia",
    role: "Product Designer",
    email: "olivia@untitledui.com",
    teams: ["Design", "Product", "Marketing"],
    status: "Active",
    avatar: "https://randomuser.me/api/portraits/women/1.jpg"
  },
  {
    id: 2,
    name: "Phoenix Baker",
    username: "@phoenix",
    role: "Product Manager",
    email: "phoenix@untitledui.com",
    teams: ["Design", "Product", "Marketing"],
    status: "Active",
    avatar: "https://randomuser.me/api/portraits/men/2.jpg"
  },
  {
    id: 3,
    name: "Lana Steiner",
    username: "@lana",
    role: "Frontend Developer",
    email: "lana@untitledui.com",
    teams: ["Design", "Product", "Marketing"],
    status: "Active",
    avatar: "https://randomuser.me/api/portraits/women/3.jpg"
  },
  {
    id: 4,
    name: "Dylan Patel",
    username: "@dylan",
    role: "Backend Developer",
    email: "dylan@untitledui.com",
    teams: ["Engineering"],
    status: "Inactive",
    avatar: "https://randomuser.me/api/portraits/men/4.jpg"
  },
  {
    id: 5,
    name: "Ava Chen",
    username: "@ava",
    role: "UX Researcher",
    email: "ava@untitledui.com",
    teams: ["Design", "Research"],
    status: "Active",
    avatar: "https://randomuser.me/api/portraits/women/5.jpg"
  },
  {
    id: 6,
    name: "Leo Kim",
    username: "@leo",
    role: "DevOps Engineer",
    email: "leo@untitledui.com",
    teams: ["Engineering", "Infrastructure"],
    status: "Active",
    avatar: "https://randomuser.me/api/portraits/men/6.jpg"
  },
  {
    id: 7,
    name: "Nina Singh",
    username: "@nina",
    role: "QA Analyst",
    email: "nina@untitledui.com",
    teams: ["Quality Assurance"],
    status: "Active",
    avatar: "https://randomuser.me/api/portraits/women/7.jpg"
  },
  {
    id: 8,
    name: "Ethan Wright",
    username: "@ethan",
    role: "Data Scientist",
    email: "ethan@untitledui.com",
    teams: ["Data", "Product"],
    status: "Active",
    avatar: "https://randomuser.me/api/portraits/men/8.jpg"
  },
  {
    id: 9,
    name: "Maya Kapoor",
    username: "@maya",
    role: "Marketing Lead",
    email: "maya@untitledui.com",
    teams: ["Marketing"],
    status: "Inactive",
    avatar: "https://randomuser.me/api/portraits/women/9.jpg"
  }
];

export default function TeamTable() {
  const [searchTerm, setSearchTerm] = useState("")

  const filteredMembers = initialMembers.filter((member) =>
    [member.name, member.username, member.role, member.email]
      .join(" ")
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  )

  return (
    <Card>
      
      {/* Header */}
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <CardTitle className="text-xl">Team Members</CardTitle>

        <div className="flex gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search members..."
              className="pl-9 rounded-full"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <Button className="rounded-full whitespace-nowrap">
            Add New Member
          </Button>
        </div>
      </CardHeader>

      {/* Table */}
      <CardContent className="space-y-6">
        <div className="overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Teams</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredMembers.map((member) => (
                <TableRow
                  key={member.id}
                  className="hover:bg-muted/40 transition"
                >
                  {/* Name */}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <img
                        src={member.avatar}
                        alt={member.name}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                      <div>
                        <p className="font-medium">
                          {member.name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {member.username}
                        </p>
                      </div>
                    </div>
                  </TableCell>

                  {/* Status */}
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        member.status === "Active"
                          ? "bg-green-500/10 text-green-600 border-green-500/20"
                          : "bg-muted text-muted-foreground"
                      }
                    >
                      {member.status}
                    </Badge>
                  </TableCell>

                  {/* Role */}
                  <TableCell>{member.role}</TableCell>

                  {/* Email */}
                  <TableCell>{member.email}</TableCell>

                  {/* Teams */}
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {member.teams.map((team, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="text-xs"
                        >
                          {team}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex justify-center items-center gap-3 pt-4">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious href="#" />
              </PaginationItem>

              <PaginationItem>
                <PaginationLink href="#" isActive>
                  1
                </PaginationLink>
              </PaginationItem>

              <PaginationItem>
                <PaginationLink href="#">2</PaginationLink>
              </PaginationItem>

              <PaginationItem>
                <PaginationLink href="#">3</PaginationLink>
              </PaginationItem>

              <PaginationItem>
                <PaginationNext href="#" />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>

      </CardContent>
    </Card>
  )
}