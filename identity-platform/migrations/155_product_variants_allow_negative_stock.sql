-- Migration 079 let a sale take products.stock_quantity past zero (checkout is never blocked by a
-- stale stock figure; a negative number is informational) but left product_variants' own check in
-- place, so selling a variant with too little stock failed the whole sale with a constraint error
-- (a 500, which the cashier's offline queue then retried forever). Same rule for variants now.
alter table product_variants drop constraint if exists product_variants_stock_check;
