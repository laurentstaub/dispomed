SELECT i.status, i.start_date, i.end_date, i.calculated_end_date, i.mise_a_jour
FROM incidents i
WHERE i.product_id = $1
ORDER BY i.start_date DESC