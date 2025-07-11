SELECT p.id, p.name, p.accented_name, p.cis_codes
FROM produits p
WHERE unaccent(lower(p.name)) = unaccent(lower($1))