import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

import { AppButton } from "@/components/app/button"
import { AppEmpty } from "@/components/app/feedback"

import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export function AppTable({ className, children, ...props }: React.ComponentProps<typeof Table>) {
  return (
    <Table className={cn("rtl:[&_th]:text-start", className)} {...props}>
      {children}
    </Table>
  )
}

export function AppTableHeader(props: React.ComponentProps<typeof TableHeader>) {
  return <TableHeader {...props} />
}

export function AppTableBody(props: React.ComponentProps<typeof TableBody>) {
  return <TableBody {...props} />
}

export function AppTableRow(props: React.ComponentProps<typeof TableRow>) {
  return <TableRow {...props} />
}

export function AppTableHead(props: React.ComponentProps<typeof TableHead>) {
  return <TableHead {...props} />
}

export function AppTableCell(props: React.ComponentProps<typeof TableCell>) {
  return <TableCell {...props} />
}

export function AppTableCaption(props: React.ComponentProps<typeof TableCaption>) {
  return <TableCaption {...props} />
}

export interface AppTableToolbarProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  filters?: React.ReactNode
}

export function AppTableToolbar({
  title,
  description,
  actions,
  filters,
  className,
  ...props
}: AppTableToolbarProps) {
  return (
    <div
      data-slot="app-table-toolbar"
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-card p-4 md:flex-row md:items-center md:justify-between",
        className
      )}
      {...props}
    >
      <div className="space-y-1">
        {title ? <div className="font-medium leading-none">{title}</div> : null}
        {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {filters}
        {actions}
      </div>
    </div>
  )
}

export interface AppTablePaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  className?: string
  pageLabel?: (page: number, isActive: boolean) => React.ReactNode
  siblingCount?: number
}

function getVisiblePages(page: number, totalPages: number, siblingCount: number) {
  const pages = new Set<number>()
  pages.add(1)
  pages.add(totalPages)

  for (let index = page - siblingCount; index <= page + siblingCount; index += 1) {
    if (index >= 1 && index <= totalPages) {
      pages.add(index)
    }
  }

  return [...pages].sort((left, right) => left - right)
}

export function AppTablePagination({
  page,
  totalPages,
  onPageChange,
  className,
  pageLabel,
  siblingCount = 1,
}: AppTablePaginationProps) {
  const pages = getVisiblePages(page, totalPages, siblingCount)

  if (totalPages <= 1) {
    return null
  }

  return (
    <Pagination className={className}>
      <PaginationContent className="flex-wrap">
        <PaginationItem>
          <AppButton
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            icon={<ChevronLeft className="size-4 rtl:rotate-180" />}
            iconPosition="start"
          >
            Previous
          </AppButton>
        </PaginationItem>

        {pages.map((visiblePage, index) => {
          const previousPage = pages[index - 1]
          const shouldShowGap = previousPage && visiblePage - previousPage > 1

          return (
            <React.Fragment key={visiblePage}>
              {shouldShowGap ? (
                <PaginationItem>
                  <span className="flex size-8 items-center justify-center text-muted-foreground">
                    ...
                  </span>
                </PaginationItem>
              ) : null}
              <PaginationItem>
                <AppButton
                  variant={visiblePage === page ? "outline" : "ghost"}
                  size="sm"
                  onClick={() => onPageChange(visiblePage)}
                  aria-current={visiblePage === page ? "page" : undefined}
                >
                  {pageLabel ? pageLabel(visiblePage, visiblePage === page) : visiblePage}
                </AppButton>
              </PaginationItem>
            </React.Fragment>
          )
        })}

        <PaginationItem>
          <AppButton
            variant="ghost"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            icon={<ChevronRight className="size-4 rtl:rotate-180" />}
            iconPosition="end"
          >
            Next
          </AppButton>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}

export type AppTableEmptyProps = React.ComponentProps<typeof AppEmpty>

export function AppTableEmpty(props: AppTableEmptyProps) {
  return <AppEmpty {...props} />
}
