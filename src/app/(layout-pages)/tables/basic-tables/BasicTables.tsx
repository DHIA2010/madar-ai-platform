"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default function BasicTables() {
  return (
    <div className="space-y-6">

      {/* Basic Table */}
      <div className="p-6 bg-card border rounded-2xl shadow-md">
        <h5 className="mb-4 text-lg font-semibold">Basic Table</h5>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>1</TableCell>
              <TableCell>Virendra</TableCell>
              <TableCell>Developer</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>2</TableCell>
              <TableCell>Priya</TableCell>
              <TableCell>Designer</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>3</TableCell>
              <TableCell>Ravi</TableCell>
              <TableCell>Tester</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* Hover Table */}
      <div className="p-6 bg-card border rounded-2xl shadow-md">
        <h5 className="mb-4 text-lg font-semibold">Hover Table</h5>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="hover:bg-muted/50 transition">
              <TableCell>1</TableCell>
              <TableCell>UI Revamp</TableCell>
              <TableCell>In Progress</TableCell>
            </TableRow>
            <TableRow className="hover:bg-muted/50 transition">
              <TableCell>2</TableCell>
              <TableCell>API Integration</TableCell>
              <TableCell>Completed</TableCell>
            </TableRow>
            <TableRow className="hover:bg-muted/50 transition">
              <TableCell>3</TableCell>
              <TableCell>Testing</TableCell>
              <TableCell>Pending</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* Dark Table */}
      <div className="p-6 bg-slate-950 text-white border rounded-2xl shadow-md">
        <h5 className="mb-4 text-lg font-semibold">Dark Table</h5>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-white">#</TableHead>
                <TableHead className="text-white">Student Name</TableHead>
                <TableHead className="text-white">Course</TableHead>
                <TableHead className="text-white">Email</TableHead>
                <TableHead className="text-white">Enrolled Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                ["John Smith", "Web Development", "john.smith@example.com", "2025-08-01"],
                ["Emily Johnson", "Data Science", "emily.johnson@example.com", "2025-08-05"],
                ["Michael Brown", "UI/UX Design", "michael.brown@example.com", "2025-08-10"],
                ["Sophia Davis", "Machine Learning", "sophia.davis@example.com", "2025-08-12"],
              ].map((item, i) => (
                <TableRow key={i} className="hover:bg-white/10 transition">
                  <TableCell>{i + 1}</TableCell>
                  <TableCell>{item[0]}</TableCell>
                  <TableCell>{item[1]}</TableCell>
                  <TableCell>{item[2]}</TableCell>
                  <TableCell>{item[3]}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Primary Styled Table */}
      <div className="p-6 bg-primary/5 border border-primary/20 rounded-2xl shadow-md">
        <h5 className="mb-4 text-lg font-semibold text-primary">
          Primary Table
        </h5>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="hover:bg-primary/10 transition">
              <TableCell>1</TableCell>
              <TableCell>Alice</TableCell>
              <TableCell>Developer</TableCell>
              <TableCell className="text-green-600 font-medium">
                Active
              </TableCell>
            </TableRow>
            <TableRow className="hover:bg-primary/10 transition">
              <TableCell>2</TableCell>
              <TableCell>Bob</TableCell>
              <TableCell>Designer</TableCell>
              <TableCell className="text-muted-foreground">
                Inactive
              </TableCell>
            </TableRow>
            <TableRow className="hover:bg-primary/10 transition">
              <TableCell>3</TableCell>
              <TableCell>Charlie</TableCell>
              <TableCell>Manager</TableCell>
              <TableCell className="text-green-600 font-medium">
                Active
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

    </div>
  )
}