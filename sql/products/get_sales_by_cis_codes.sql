SELECT
    c.code_cis,
    p.cip13,
    p.l_cip13 AS product_label,
    s.year,
    SUM(s.boites) AS total_boxes
FROM incidents_json.open_medic.sales s
JOIN incidents_json.open_medic.cip13_products p ON s.cip13 = p.cip13
JOIN incidents_json.dbpm.cis_cip_bdpm c ON p.cip13 = c.code_cip13::bigint
WHERE c.code_cis::TEXT = ANY($1)
GROUP BY
    c.code_cis,
    p.cip13,
    p.l_cip13,
    s.year
ORDER BY
    c.code_cis,
    s.year DESC,
    total_boxes DESC;
