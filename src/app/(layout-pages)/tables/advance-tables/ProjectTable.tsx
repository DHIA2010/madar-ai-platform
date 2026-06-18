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
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

import { MoreHorizontal, Search } from "lucide-react"

const projects = [
  {
    name: "BGC eCommerce App",
    type: "React Project",
    leader: "Eileen",
    team: [
      "https://randomuser.me/api/portraits/men/1.jpg",
      "https://randomuser.me/api/portraits/men/2.jpg",
      "https://randomuser.me/api/portraits/men/4.jpg"
    ],
    more: 3,
    progress: 78,
    icon: "https://upload.wikimedia.org/wikipedia/commons/a/a7/React-icon.svg"
  },
  {
    name: "Falcon Logo Design",
    type: "Figma Project",
    leader: "Owen",
    team: [
      "https://randomuser.me/api/portraits/men/4.jpg",
      "https://randomuser.me/api/portraits/men/5.jpg",
      "https://randomuser.me/api/portraits/men/6.jpg"
    ],
    more: 0,
    progress: 32,
    icon: "https://upload.wikimedia.org/wikipedia/commons/3/33/Figma-logo.svg"
  },
  {
    name: "Dashboard Design",
    type: "VueJs Project",
    leader: "Keith",
    team: [
      "https://randomuser.me/api/portraits/men/7.jpg",
      "https://randomuser.me/api/portraits/men/8.jpg",
      "https://randomuser.me/api/portraits/men/9.jpg"
    ],
    more: 0,
    progress: 62,
    icon: "https://upload.wikimedia.org/wikipedia/commons/9/95/Vue.js_Logo_2.svg"
  },
  {
    name: "Foodista Mobile App",
    type: "Xamarin Project",
    leader: "Merline",
    team: [
      "https://randomuser.me/api/portraits/men/10.jpg",
      "https://randomuser.me/api/portraits/men/11.jpg",
      "https://randomuser.me/api/portraits/men/12.jpg"
    ],
    more: 8,
    progress: 46,
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/behance/behance-original.svg"
  },
  {
    name: "Blockchain Website",
    type: "Sketch Project",
    leader: "Allyson",
    team: [
      "https://randomuser.me/api/portraits/men/13.jpg",
      "https://randomuser.me/api/portraits/men/14.jpg",
      "https://randomuser.me/api/portraits/men/15.jpg"
    ],
    more: 0,
    progress: 92,
    icon: "https://js.devexpress.com/Content/Images/Frameworks/Angular.png"
  }
];

export default function ProjectTable() {
  const [searchTerm, setSearchTerm] = useState("")

  const filteredProjects = projects.filter((project) =>
    [project.name, project.type, project.leader]
      .join(" ")
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  )

  return (
    <Card>
      {/* Header */}
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-xl">Project List</CardTitle>

        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search project..."
            className="pl-9 rounded-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </CardHeader>

      {/* Body */}
      <CardContent className="space-y-4">

        {filteredProjects.length === 0 ? (
          <div className="text-center text-muted-foreground py-10">
            No matching projects found.
          </div>
        ) : (
          <div className="overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>
                    <Checkbox />
                  </TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Leader</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredProjects.map((project, i) => (
                  <TableRow key={i} className="hover:bg-muted/40 transition">
                    
                    {/* Checkbox */}
                    <TableCell>
                      <Checkbox />
                    </TableCell>

                    {/* Project */}
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <img
                          src={project.icon}
                          alt={project.name}
                          className="w-11 h-11 rounded-full border p-1 bg-muted/20"
                        />
                        <div>
                          <p className="font-medium">
                            {project.name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {project.type}
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    {/* Leader */}
                    <TableCell>{project.leader}</TableCell>

                    {/* Team */}
                    <TableCell>
                      <div className="flex items-center">
                        {project.team.map((member, idx) => (
                          <img
                            key={idx}
                            src={member}
                            alt="member"
                            className={`w-8 h-8 rounded-full border-2 border-background ${
                              idx !== 0 ? "-ml-3" : ""
                            }`}
                          />
                        ))}

                        {project.more > 0 && (
                          <Badge
                            variant="secondary"
                            className="ml-2"
                          >
                            +{project.more}
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    {/* Progress */}
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Progress
                          value={project.progress}
                          className="h-1.5 w-[120px]"
                        />
                        <span className="text-md font-medium text-muted-foreground">
                          {project.progress}%
                        </span>
                      </div>
                    </TableCell>

                    {/* Action */}
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="rounded-full"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600">
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>

                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-4">
          <p className="text-sm text-muted-foreground">
            Showing {filteredProjects.length} of {projects.length} entries
          </p>

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
                <PaginationNext href="#" />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>

      </CardContent>
    </Card>
  )
}