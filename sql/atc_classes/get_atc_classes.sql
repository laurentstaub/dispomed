WITH maxDate AS (
    SELECT MAX(calculated_end_date) AS max_end_date
    FROM incidents
)
SELECT DISTINCT
    ca.code AS atc_code,
    ca.description AS atc_description,
    m.id AS molecule_id,
    m.name AS molecule_name
FROM incidents i
CROSS JOIN maxDate
JOIN produits p ON i.product_id = p.id
LEFT JOIN produits_molecules pm ON p.id = pm.produit_id
LEFT JOIN molecules m ON pm.molecule_id = m.id
LEFT JOIN classe_atc ca ON p.classe_atc_id = ca.id
WHERE i.calculated_end_date >= (maxDate.max_end_date - INTERVAL '1 month' * $1)
    AND ca.code IS NOT NULL
ORDER BY ca.code, m.name
