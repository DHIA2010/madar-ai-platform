import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"

export interface PosSettingsView {
  allowBelowCostSale: boolean
  allowOutOfStockSale: boolean
  confirmSale: boolean
  autoOpenCashDrawer: boolean
  allowManualPriceEdit: boolean
  applyDiscounts: boolean

  defaultPrinterDeviceId: string | null
  paperWidth: "58mm" | "80mm"
  autoPrintInvoice: boolean
  printKitchenCopy: boolean
  copiesCount: number

  showQuickPaymentScreen: boolean
  allowSplitPayment: boolean
  rememberLastPaymentMethod: boolean
  requirePaymentMethodSelection: boolean

  showProductImages: boolean
  useCompactMode: boolean
  showCategoryPanel: boolean
  showGridView: boolean
  showListView: boolean

  enableBarcodeScanner: boolean
  playScanSound: boolean

  updatedAt: string
}

export interface PosSettingsUpdateInput {
  allowBelowCostSale: boolean
  allowOutOfStockSale: boolean
  confirmSale: boolean
  autoOpenCashDrawer: boolean
  allowManualPriceEdit: boolean
  applyDiscounts: boolean
  defaultPrinterDeviceId: string | null
  paperWidth: "58mm" | "80mm"
  autoPrintInvoice: boolean
  printKitchenCopy: boolean
  copiesCount: number
  showQuickPaymentScreen: boolean
  allowSplitPayment: boolean
  rememberLastPaymentMethod: boolean
  requirePaymentMethodSelection: boolean
  showProductImages: boolean
  useCompactMode: boolean
  showCategoryPanel: boolean
  showGridView: boolean
  showListView: boolean
  enableBarcodeScanner: boolean
  playScanSound: boolean
}

// Every default here matches the platform's actual, already-shipped unconditional behavior --
// see migration 082's own comment. An organization that has never opened this settings page
// gets exactly this object back, so nothing changes underneath them until they act.
export const DEFAULT_POS_SETTINGS: Omit<PosSettingsView, "updatedAt"> = {
  allowBelowCostSale: true,
  allowOutOfStockSale: true,
  confirmSale: false,
  autoOpenCashDrawer: false,
  allowManualPriceEdit: true,
  applyDiscounts: true,
  defaultPrinterDeviceId: null,
  paperWidth: "80mm",
  autoPrintInvoice: true,
  printKitchenCopy: false,
  copiesCount: 1,
  showQuickPaymentScreen: false,
  allowSplitPayment: true,
  rememberLastPaymentMethod: false,
  requirePaymentMethodSelection: true,
  showProductImages: true,
  useCompactMode: false,
  showCategoryPanel: true,
  showGridView: true,
  showListView: true,
  enableBarcodeScanner: true,
  playScanSound: false,
}

function mapRow(row: Record<string, unknown>): PosSettingsView {
  return {
    allowBelowCostSale: Boolean(row.allow_below_cost_sale),
    allowOutOfStockSale: Boolean(row.allow_out_of_stock_sale),
    confirmSale: Boolean(row.confirm_sale),
    autoOpenCashDrawer: Boolean(row.auto_open_cash_drawer),
    allowManualPriceEdit: Boolean(row.allow_manual_price_edit),
    applyDiscounts: Boolean(row.apply_discounts),
    defaultPrinterDeviceId: (row.default_printer_device_id as string | null) ?? null,
    paperWidth: row.paper_width as "58mm" | "80mm",
    autoPrintInvoice: Boolean(row.auto_print_invoice),
    printKitchenCopy: Boolean(row.print_kitchen_copy),
    copiesCount: Number(row.copies_count),
    showQuickPaymentScreen: Boolean(row.show_quick_payment_screen),
    allowSplitPayment: Boolean(row.allow_split_payment),
    rememberLastPaymentMethod: Boolean(row.remember_last_payment_method),
    requirePaymentMethodSelection: Boolean(row.require_payment_method_selection),
    showProductImages: Boolean(row.show_product_images),
    useCompactMode: Boolean(row.use_compact_mode),
    showCategoryPanel: Boolean(row.show_category_panel),
    showGridView: Boolean(row.show_grid_view),
    showListView: Boolean(row.show_list_view),
    enableBarcodeScanner: Boolean(row.enable_barcode_scanner),
    playScanSound: Boolean(row.play_scan_sound),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  }
}

export class PosSettingsService {
  constructor(private readonly db: PostgresDatabase) {}

  async get(organizationId: string, workspaceId: string | null): Promise<PosSettingsView> {
    // "workspace_id IS NOT DISTINCT FROM $2" would be the natural null-safe equality here, but
    // pg-mem (the in-memory Postgres this project's test suite runs against) doesn't parse that
    // construct -- this OR form is the portable equivalent.
    const result = await this.db.query<Record<string, unknown>>(
      `select * from pos_settings
       where organization_id = $1
         and (workspace_id = $2 or (workspace_id is null and $2::uuid is null))
       limit 1`,
      [organizationId, workspaceId]
    )

    const row = result.rows[0]
    if (!row) {
      return { ...DEFAULT_POS_SETTINGS, updatedAt: new Date(0).toISOString() }
    }
    return mapRow(row)
  }

  async update(
    organizationId: string,
    workspaceId: string | null,
    actorUserId: string,
    input: PosSettingsUpdateInput
  ): Promise<PosSettingsView> {
    const result = await this.db.query<Record<string, unknown>>(
      `
      insert into pos_settings (
        id, organization_id, workspace_id,
        allow_below_cost_sale, allow_out_of_stock_sale, confirm_sale, auto_open_cash_drawer,
        allow_manual_price_edit, apply_discounts,
        default_printer_device_id, paper_width, auto_print_invoice, print_kitchen_copy, copies_count,
        show_quick_payment_screen, allow_split_payment, remember_last_payment_method, require_payment_method_selection,
        show_product_images, use_compact_mode, show_category_panel, show_grid_view, show_list_view,
        enable_barcode_scanner, play_scan_sound,
        created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$26,now(),now()
      )
      on conflict (organization_id, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'))
      do update set
        allow_below_cost_sale = excluded.allow_below_cost_sale,
        allow_out_of_stock_sale = excluded.allow_out_of_stock_sale,
        confirm_sale = excluded.confirm_sale,
        auto_open_cash_drawer = excluded.auto_open_cash_drawer,
        allow_manual_price_edit = excluded.allow_manual_price_edit,
        apply_discounts = excluded.apply_discounts,
        default_printer_device_id = excluded.default_printer_device_id,
        paper_width = excluded.paper_width,
        auto_print_invoice = excluded.auto_print_invoice,
        print_kitchen_copy = excluded.print_kitchen_copy,
        copies_count = excluded.copies_count,
        show_quick_payment_screen = excluded.show_quick_payment_screen,
        allow_split_payment = excluded.allow_split_payment,
        remember_last_payment_method = excluded.remember_last_payment_method,
        require_payment_method_selection = excluded.require_payment_method_selection,
        show_product_images = excluded.show_product_images,
        use_compact_mode = excluded.use_compact_mode,
        show_category_panel = excluded.show_category_panel,
        show_grid_view = excluded.show_grid_view,
        show_list_view = excluded.show_list_view,
        enable_barcode_scanner = excluded.enable_barcode_scanner,
        play_scan_sound = excluded.play_scan_sound,
        updated_by_user_id = excluded.updated_by_user_id,
        updated_at = now()
      returning *
      `,
      [
        randomUUID(),
        organizationId,
        workspaceId,
        input.allowBelowCostSale,
        input.allowOutOfStockSale,
        input.confirmSale,
        input.autoOpenCashDrawer,
        input.allowManualPriceEdit,
        input.applyDiscounts,
        input.defaultPrinterDeviceId,
        input.paperWidth,
        input.autoPrintInvoice,
        input.printKitchenCopy,
        input.copiesCount,
        input.showQuickPaymentScreen,
        input.allowSplitPayment,
        input.rememberLastPaymentMethod,
        input.requirePaymentMethodSelection,
        input.showProductImages,
        input.useCompactMode,
        input.showCategoryPanel,
        input.showGridView,
        input.showListView,
        input.enableBarcodeScanner,
        input.playScanSound,
        actorUserId,
      ]
    )

    return mapRow(result.rows[0])
  }
}
