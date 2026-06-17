-- Reads from the pre-computed public.product_sales table (built locally by
-- incident_scraper/sql/build_product_sales.sql). This keeps the dispomed app
-- independent of the heavy open_medic / dbpm reference schemas, so sales work
-- in production (Heroku) where those schemas are not loaded.
SELECT
    code_cis,
    cip13,
    product_label,
    year,
    total_boxes
FROM public.product_sales
WHERE code_cis = ANY($1)
ORDER BY
    code_cis,
    year DESC,
    total_boxes DESC;
