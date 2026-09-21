-- The cashier screen's products-column has its own local grid/cart-list view switcher (two small
-- buttons: "عرض المنتجات" / "عرض عناصر السلة", CashierPage.tsx's isCartPreviewOpen) -- these two
-- columns let an organization hide either button independently. Both default true (both
-- switchable, today's unconditional behavior); if one is turned off, the cashier screen forces
-- the other view instead of leaving a switch with no way back.
alter table pos_settings
  add column if not exists show_grid_view boolean not null default true,
  add column if not exists show_list_view boolean not null default true;
