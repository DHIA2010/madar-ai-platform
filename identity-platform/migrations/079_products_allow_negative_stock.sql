-- A sale now actually decrements products.stock_quantity (see PosInvoicesService.create()/
-- computeStockConsumption -- this was a known, pre-existing gap: a sale never touched stock at
-- all, so it could never have gone negative before). The business decision (explicitly asked and
-- confirmed) is to let a sale proceed even past zero rather than block checkout on insufficient
-- stock -- a negative stock_quantity is then purely informational (e.g. a new shipment arrived
-- but hasn't been entered into the system yet), not an error state. This constraint's job (never
-- let the stored quantity go negative) is therefore no longer this app's intended behavior.
alter table products drop constraint if exists products_stock_check;
