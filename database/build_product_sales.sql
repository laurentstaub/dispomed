-- build_product_sales.sql
--
-- Rebuilds public.product_sales: a small, app-ready aggregate of Open Medic
-- "ville" sales for the products dispomed displays.
--
-- The dispomed sales feature reads ONLY this table (see
-- sql/products/get_sales_by_cis_codes.sql), so the app never needs the heavy
-- open_medic / dbpm reference schemas at request time. Those schemas live only
-- in the local incidents_json database and are not deployed to Heroku; this
-- pre-computed table ships in the normal dump and works in production.
--
-- Run locally via:  npm run build-sales   (re-run after each Open Medic reload,
-- before taking the production dump).

DROP TABLE IF EXISTS public.product_sales;

CREATE TABLE public.product_sales AS
SELECT
    c.code_cis::text AS code_cis,
    p.cip13,
    p.l_cip13        AS product_label,
    s.year,
    SUM(s.boites)    AS total_boxes
FROM open_medic.sales s
JOIN open_medic.cip13_products p ON s.cip13 = p.cip13
JOIN dbpm.cis_cip_bdpm c         ON p.cip13 = c.code_cip13::bigint
WHERE c.code_cis::text IN (
    -- restrict to the CIS the app actually shows (from produits.cis_codes JSONB).
    -- Remove this WHERE to materialize every bridged CIS instead.
    SELECT DISTINCT jsonb_array_elements_text(cis_codes)
    FROM public.produits
    WHERE cis_codes IS NOT NULL AND jsonb_typeof(cis_codes) = 'array'
)
GROUP BY c.code_cis, p.cip13, p.l_cip13, s.year;

CREATE INDEX idx_product_sales_cis ON public.product_sales (code_cis);
