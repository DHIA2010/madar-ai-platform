"use client"

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table"

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
import { Checkbox } from "@/components/ui/checkbox"

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

import { ArrowUpDown } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { SlidersHorizontal } from "lucide-react"

import { FileDown, Printer } from "lucide-react"
import * as XLSX from "xlsx"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { saveAs } from "file-saver"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
}

export function DataTable<TData, TValue>({
  columns,
  data,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState("")
  const [rowSelection, setRowSelection] = useState({})
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  })

  const [columnFilters, setColumnFilters] = useState([])

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
      rowSelection,
      pagination,
      columnFilters,   // 👈 add this
    },
    // onColumnFiltersChange: setColumnFilters, // 👈 add this
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })


  const exportToCSV = () => {
    const rows = table.getFilteredRowModel().rows

    const csvContent =
      "data:text/csv;charset=utf-8," +
      rows
        .map((row) =>
          row.getVisibleCells().map((cell) => cell.getValue()).join(",")
        )
        .join("\n")

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", "table-data.csv")
    document.body.appendChild(link)
    link.click()
  }

  const exportToExcel = () => {
    const rows = table.getFilteredRowModel().rows.map((row) =>
      row.original
    )

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data")

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    })

    const blob = new Blob([excelBuffer], {
      type: "application/octet-stream",
    })

    saveAs(blob, "table-data.xlsx")
  }

  const exportToPDF = () => {
    const doc = new jsPDF()

    const rows = table.getFilteredRowModel().rows.map((row) =>
      Object.values(
        row.original as Record<string, unknown>
      ).map((val) => String(val ?? ""))
    )

    const headers =
      table.getFilteredRowModel().rows.length > 0
        ? Object.keys(
          table.getFilteredRowModel().rows[0]
            .original as Record<string, unknown>
        )
        : []

    autoTable(doc, {
      head: [headers],
      body: rows,
    })

    doc.save("table-data.pdf")
  }

  const handlePrint = () => {
    const printContent = document.querySelector("table")?.outerHTML
    const win = window.open("", "", "width=900,height=700")

    if (win && printContent) {
      win.document.write(printContent)
      win.document.close()
      win.print()
    }
  }

  return (
    <div className="space-y-4">

      {/* Search + Selected Count */}
      <div className="flex items-center flex-wrap gap-3">
        <Input
          placeholder="Search..."
          value={globalFilter ?? ""}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-xs"
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              Filter Status
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end">
            {["Active", "Inactive"].map((status) => (
              <DropdownMenuCheckboxItem
                key={status}
                checked={
                  table
                    .getColumn("status")
                    ?.getFilterValue() === status
                }
                onCheckedChange={(checked) =>
                  table
                    .getColumn("status")
                    ?.setFilterValue(checked ? status : undefined)
                }
              >
                {status}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex flex-wrap gap-2 ml-auto">

          <Button
            variant="outline"
            size="sm"
            onClick={() => exportToCSV()}
          >
            CSV
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => exportToExcel()}
          >
            Excel
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => exportToPDF()}
          >
            PDF
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePrint()}
          >
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>

        </div>

      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>

                {/* Select All Checkbox */}
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={table.getIsAllPageRowsSelected()}
                    onCheckedChange={(value) =>
                      table.toggleAllPageRowsSelected(!!value)
                    }
                  />
                </TableHead>

                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : (
                      <div
                        className={`flex items-center gap-2 ${header.column.getCanSort()
                            ? "cursor-pointer select-none"
                            : ""
                          }`}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}

                        {header.column.getCanSort() && (
                          <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {/* Row Checkbox */}
                  <TableCell>
                    <Checkbox
                      checked={row.getIsSelected()}
                      onCheckedChange={(value) =>
                        row.toggleSelected(!!value)
                      }
                    />
                  </TableCell>

                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length + 1}
                  className="text-center py-8 text-muted-foreground"
                >
                  No results found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Page {table.getState().pagination.pageIndex + 1} of{" "}
          {table.getPageCount()}
        </span>

        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => table.previousPage()}
                className={
                  !table.getCanPreviousPage()
                    ? "pointer-events-none opacity-50"
                    : ""
                }
              />
            </PaginationItem>

            <PaginationItem>
              <PaginationNext
                onClick={() => table.nextPage()}
                className={
                  !table.getCanNextPage()
                    ? "pointer-events-none opacity-50"
                    : ""
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>

    </div>
  )
}