"use client"

import { useState } from "react"
import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table"
import { ArrowUpDown, Printer, SlidersHorizontal } from "lucide-react"
import * as XLSX from "xlsx"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { saveAs } from "file-saver"

import {
  AppButton,
  AppSearchInput,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableEmpty,
  AppTableHead,
  AppTableHeader,
  AppTablePagination,
  AppTableRow,
  AppTableToolbar,
} from "@/components/app"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
}

export function DataTable<TData, TValue>({ columns, data }: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState("")
  const [rowSelection, setRowSelection] = useState({})
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  })
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
      rowSelection,
      pagination,
      columnFilters,
    },
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const exportToCSV = () => {
    const rows = table.getFilteredRowModel().rows

    const csvContent =
      "data:text/csv;charset=utf-8," +
      rows
        .map((row) =>
          row
            .getVisibleCells()
            .map((cell) => cell.getValue())
            .join(",")
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
    const rows = table.getFilteredRowModel().rows.map((row) => row.original)

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

    const rows = table
      .getFilteredRowModel()
      .rows.map((row) =>
        Object.values(row.original as Record<string, unknown>).map((value) => String(value ?? ""))
      )

    const headers =
      table.getFilteredRowModel().rows.length > 0
        ? Object.keys(table.getFilteredRowModel().rows[0].original as Record<string, unknown>)
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
      <AppTableToolbar
        search={
          <AppSearchInput
            aria-label="Search table"
            className="max-w-xs"
            onChange={(event) => setGlobalFilter(event.target.value)}
            placeholder="Search..."
            value={globalFilter}
            wrapperClassName="space-y-0"
          />
        }
        filters={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <AppButton size="sm" variant="outline">
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                Filter Status
              </AppButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {["Active", "Inactive"].map((status) => (
                <DropdownMenuCheckboxItem
                  key={status}
                  checked={table.getColumn("status")?.getFilterValue() === status}
                  onCheckedChange={(checked) =>
                    table.getColumn("status")?.setFilterValue(checked ? status : undefined)
                  }
                >
                  {status}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        }
        bulkActions={
          table.getFilteredSelectedRowModel().rows.length > 0 ? (
            <span className="text-sm text-muted-foreground">
              {table.getFilteredSelectedRowModel().rows.length} selected
            </span>
          ) : null
        }
        actions={
          <div className="ml-auto flex flex-wrap gap-2">
            <AppButton onClick={exportToCSV} size="sm" variant="outline">
              CSV
            </AppButton>
            <AppButton onClick={exportToExcel} size="sm" variant="outline">
              Excel
            </AppButton>
            <AppButton onClick={exportToPDF} size="sm" variant="outline">
              PDF
            </AppButton>
            <AppButton onClick={handlePrint} size="sm" variant="outline">
              <Printer className="mr-2 h-4 w-4" />
              Print
            </AppButton>
          </div>
        }
      />

      <div className="overflow-hidden rounded-xl border">
        <AppTable>
          <AppTableHeader className="bg-muted/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <AppTableRow key={headerGroup.id}>
                <AppTableHead className="w-[40px]">
                  <Checkbox
                    checked={table.getIsAllPageRowsSelected()}
                    onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                  />
                </AppTableHead>

                {headerGroup.headers.map((header) => (
                  <AppTableHead key={header.id}>
                    {header.isPlaceholder ? null : (
                      <div
                        className={
                          header.column.getCanSort()
                            ? "flex cursor-pointer select-none items-center gap-2"
                            : "flex items-center gap-2"
                        }
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() ? (
                          <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                        ) : null}
                      </div>
                    )}
                  </AppTableHead>
                ))}
              </AppTableRow>
            ))}
          </AppTableHeader>

          <AppTableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <AppTableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  <AppTableCell>
                    <Checkbox
                      checked={row.getIsSelected()}
                      onCheckedChange={(value) => row.toggleSelected(!!value)}
                    />
                  </AppTableCell>

                  {row.getVisibleCells().map((cell) => (
                    <AppTableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </AppTableCell>
                  ))}
                </AppTableRow>
              ))
            ) : (
              <AppTableRow>
                <AppTableCell className="py-8" colSpan={columns.length + 1}>
                  <AppTableEmpty
                    description="Try changing the search query or filters."
                    title="No results found"
                    variant="no-search-results"
                  />
                </AppTableCell>
              </AppTableRow>
            )}
          </AppTableBody>
        </AppTable>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          Page {table.getState().pagination.pageIndex + 1} of {Math.max(table.getPageCount(), 1)}
        </span>
        <AppTablePagination
          onPageChange={(nextPage) => table.setPageIndex(nextPage - 1)}
          page={table.getState().pagination.pageIndex + 1}
          totalPages={Math.max(table.getPageCount(), 1)}
        />
      </div>
    </div>
  )
}
