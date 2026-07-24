-- Min/max year currently present in the pre-computed sales table.
-- Used to show the real data range in the UI (incl. the empty-state), which
-- doubles as a quick check that the front end is reading live sales data.
SELECT MIN(year) AS min_year, MAX(year) AS max_year
FROM public.product_sales;
