"use client"

import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/data-table"
import { Badge } from "@/components/ui/badge"

type Member = {
  name: string
  email: string
  role: string
  status: string
}

const data = [
  {
    name: "Olivia Rhye",
    email: "olivia@untitledui.com",
    role: "Product Designer",
    status: "Active",
  },
  {
    name: "Phoenix Baker",
    email: "phoenix@untitledui.com",
    role: "Product Manager",
    status: "Active",
  },
  {
    name: "Lana Steiner",
    email: "lana@untitledui.com",
    role: "Frontend Developer",
    status: "Active",
  },
  {
    name: "Dylan Patel",
    email: "dylan@untitledui.com",
    role: "Backend Developer",
    status: "Inactive",
  },
  {
    name: "Ava Chen",
    email: "ava@untitledui.com",
    role: "UX Researcher",
    status: "Active",
  },
  {
    name: "Leo Kim",
    email: "leo@untitledui.com",
    role: "DevOps Engineer",
    status: "Active",
  },
  {
    name: "Nina Singh",
    email: "nina@untitledui.com",
    role: "QA Analyst",
    status: "Active",
  },
  {
    name: "Ethan Wright",
    email: "ethan@untitledui.com",
    role: "Data Scientist",
    status: "Active",
  },
  {
    name: "Maya Kapoor",
    email: "maya@untitledui.com",
    role: "Marketing Lead",
    status: "Inactive",
  },
  {
    name: "James Wilson",
    email: "james@untitledui.com",
    role: "UI Engineer",
    status: "Active",
  },
  
  { name: "James Wilson", email: "james@untitledui.com", role: "UI Engineer", status: "Active" },
  { name: "Sophia Martinez", email: "sophia@untitledui.com", role: "Product Designer", status: "Active" },
  { name: "Liam Johnson", email: "liam@untitledui.com", role: "Frontend Developer", status: "Inactive" },
  { name: "Olivia Brown", email: "olivia@untitledui.com", role: "UX Researcher", status: "Active" },
  { name: "Noah Davis", email: "noah@untitledui.com", role: "Backend Engineer", status: "Active" },
  { name: "Emma Thompson", email: "emma@untitledui.com", role: "QA Specialist", status: "Active" },
  { name: "William Garcia", email: "william@untitledui.com", role: "DevOps Engineer", status: "Inactive" },
  { name: "Ava Rodriguez", email: "ava@untitledui.com", role: "UI Engineer", status: "Active" },
  { name: "Ethan Miller", email: "ethan@untitledui.com", role: "Data Analyst", status: "Active" },
  { name: "Isabella Hernandez", email: "isabella@untitledui.com", role: "Project Manager", status: "Active" },
  { name: "Mason Clark", email: "mason@untitledui.com", role: "Software Engineer", status: "Inactive" },
  { name: "Mia Lewis", email: "mia@untitledui.com", role: "Content Strategist", status: "Active" },
  { name: "Alexander Walker", email: "alexander@untitledui.com", role: "UI Engineer", status: "Active" },
  { name: "Charlotte Hall", email: "charlotte@untitledui.com", role: "Marketing Specialist", status: "Active" },
  { name: "Benjamin Allen", email: "benjamin@untitledui.com", role: "Fullstack Developer", status: "Inactive" },
  { name: "Amelia Young", email: "amelia@untitledui.com", role: "UX Designer", status: "Active" },
  { name: "Lucas King", email: "lucas@untitledui.com", role: "UI Engineer", status: "Active" },
  { name: "Harper Scott", email: "harper@untitledui.com", role: "Business Analyst", status: "Active" },
  { name: "Elijah Adams", email: "elijah@untitledui.com", role: "Frontend Developer", status: "Inactive" },
  { name: "Evelyn Baker", email: "evelyn@untitledui.com", role: "UI Engineer", status: "Active" }

]

export const columns: ColumnDef<Member>[] = [
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "role",
    header: "Role",
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className={
          row.original.status === "Active"
            ? "bg-green-500/10 text-green-600"
            : "bg-muted"
        }
      >
        {row.original.status}
      </Badge>
    ),
  },
]

export default function DataTablePage() {
  return (
    <div className="data-table-page border rounded-xl p-6 shadow">
      <DataTable columns={columns} data={data} />
    </div>
  )
} 