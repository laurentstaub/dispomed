SELECT
  s.code_cis_origine,
  s.denomination_origine,
  s.code_cis_cible,
  s.denomination_cible,
  s.score_similarite,
  s.type_equivalence,
  s.raison
FROM substitution.equivalences_therapeutiques s
WHERE s.code_cis_origine::TEXT = $1 OR s.code_cis_cible::TEXT = $1
ORDER BY s.score_similarite DESC;