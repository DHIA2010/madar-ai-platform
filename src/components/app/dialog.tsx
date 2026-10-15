"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

import { AppButton } from "@/components/app/button"

export interface AppDialogProps extends React.ComponentProps<typeof DialogPrimitive.Root> {
  title?: React.ReactNode
  description?: React.ReactNode
  footer?: React.ReactNode
  children?: React.ReactNode
  contentClassName?: string
  showCloseButton?: boolean
}

export function AppDialog({
  title,
  description,
  footer,
  children,
  contentClassName,
  showCloseButton = true,
  ...props
}: AppDialogProps) {
  return (
    <DialogPrimitive.Root {...props}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/10 backdrop-blur-xs" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 grid w-[90vw] max-w-[44rem] max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_minmax(0,1fr)_auto] gap-4 overflow-hidden rounded-xl bg-background p-4 text-sm ring-1 ring-foreground/10 outline-none sm:w-full",
            contentClassName
          )}
        >
          {showCloseButton ? (
            <DialogPrimitive.Close asChild>
              <AppButton
                variant="ghost"
                size="icon-sm"
                className="absolute end-2 top-2 rounded-full text-muted-foreground outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-0 focus-visible:border-transparent"
                aria-label="Close dialog"
              >
                <XIcon className="size-4" />
              </AppButton>
            </DialogPrimitive.Close>
          ) : null}
          {title || description ? (
            <div className="space-y-1.5 pe-8">
              {title ? (
                <DialogPrimitive.Title className="text-base font-medium leading-none">
                  {title}
                </DialogPrimitive.Title>
              ) : null}
              {description ? (
                <DialogPrimitive.Description className="text-sm text-muted-foreground">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
          ) : null}
          <div className="min-h-0 overflow-y-auto pe-1">{children}</div>
          {footer ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">{footer}</div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export interface AppConfirmDialogProps extends Omit<
  AppDialogProps,
  "footer" | "children" | "title" | "description"
> {
  title: React.ReactNode
  description?: React.ReactNode
  confirmLabel?: React.ReactNode
  cancelLabel?: React.ReactNode
  confirmTone?: "default" | "destructive"
  loading?: boolean
  onConfirm: () => void | Promise<void>
  onCancel?: () => void
  children?: React.ReactNode
  // Lets a caller apply a one-off accent (e.g. a specific app's brand color) to the confirm
  // button without inventing a new confirmTone per accent -- twMerge resolves the overlap with
  // the variant's own bg/text classes.
  confirmButtonClassName?: string
  cancelButtonClassName?: string
}

export function AppConfirmDialog({
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmTone = "default",
  loading = false,
  onConfirm,
  onCancel,
  children,
  confirmButtonClassName,
  cancelButtonClassName,
  ...props
}: AppConfirmDialogProps) {
  return (
    <AppDialog
      title={title}
      description={description}
      footer={
        <>
          <AppButton
            variant="outline"
            onClick={onCancel}
            disabled={loading}
            className={cn(
              "h-10 rounded-full border-[#e1e7f0] px-5 text-[13px] font-semibold text-[#5b6b85] hover:bg-[#f7f9fd]",
              cancelButtonClassName
            )}
          >
            {cancelLabel}
          </AppButton>
          <AppButton
            variant={confirmTone === "destructive" ? "destructive" : "default"}
            loading={loading}
            onClick={onConfirm}
            className={cn(
              "h-10 rounded-full px-5 text-[13px] font-semibold text-white shadow-[0_4px_12px_rgba(0,0,0,0.12)]",
              confirmTone === "destructive"
                ? "bg-rose-600 hover:bg-rose-700 hover:text-white"
                : "bg-[#2878ff] hover:bg-[#1f63d6] hover:text-white",
              confirmButtonClassName
            )}
          >
            {confirmLabel}
          </AppButton>
        </>
      }
      {...props}
    >
      {children}
    </AppDialog>
  )
}
