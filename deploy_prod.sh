#!/bin/bash
# ---------------------------------------------------------------------------
# deploy_prod.sh — déploiement dispomed vers Heroku (base de données + code).
#
#   ./deploy_prod.sh                    # app par défaut : dispomed
#   HEROKU_APP=autre ./deploy_prod.sh   # autre app
#
# Garde-fous :
#   - refuse d'avancer si DATABASE_URL est introuvable (jamais de pg_restore
#     avec une cible vide -> il taperait la base LOCALE par défaut) ;
#   - confirmation explicite avant d'écraser la prod, puis avant le push code.
#
# Le dump embarque les schémas servis par l'app : public (dont product_sales,
# ansm_info), dbpm, incidents_ema, substitution. Il EXCLUT open_medic (données
# de préparation, lourdes) et les tables de sauvegarde __prev du loader BDPM.
# ---------------------------------------------------------------------------
set -euo pipefail

APP="${HEROKU_APP:-dispomed}"
LOCAL_DB="${LOCAL_DB:-incidents_json}"
DUMP="/tmp/incidents_json_$(date +%Y%m%d_%H%M%S).dump"

echo "=== Déploiement dispomed → Heroku ($APP) ==="

# 1. Garde-fou : l'URL de la base prod DOIT être récupérable avant toute action
DB_URL="$(heroku config:get DATABASE_URL -a "$APP" 2>/dev/null || true)"
if [[ -z "$DB_URL" || "$DB_URL" != postgres* ]]; then
  echo "✗ Impossible de récupérer DATABASE_URL pour l'app « $APP »."
  echo "  Vérifie le nom : heroku apps    (ou lance HEROKU_APP=nom ./deploy_prod.sh)"
  exit 1
fi
echo "✓ Base prod identifiée pour « $APP »."

# 2. Dump de la base locale.
#    Exclusions : open_medic (préparation), tables __prev (sauvegardes loader),
#    et dbpm.cis_documents — 1,2 Go de HTML jamais lu par l'app (90 % du dump !).
echo "— Dump de $LOCAL_DB (sans open_medic, __prev, cis_documents)…"
pg_dump -Fc --no-owner --no-acl \
  --exclude-schema=open_medic \
  --exclude-table='dbpm.*__prev' \
  --exclude-table-data='dbpm.cis_documents' \
  -d "$LOCAL_DB" -f "$DUMP"
echo "✓ Dump créé : $DUMP ($(du -h "$DUMP" | cut -f1))"

# 3. Confirmation avant écrasement
echo
read -r -p "⚠ Écraser la base PROD de « $APP » avec ce dump ? (tape: oui) " REP
if [[ "$REP" != "oui" ]]; then echo "Abandon — la prod n'a pas été touchée."; exit 1; fi

# 4. Restore. --if-exists supprime le bruit des DROP sur objets absents.
#    Les erreurs « SET transaction_timeout » (dump PG17 vers PG plus ancien)
#    sont NORMALES et non bloquantes.
set +e
PGSSLMODE=require pg_restore --clean --if-exists --no-owner --no-acl \
  -d "$DB_URL" "$DUMP"
RC=$?
set -e
if [[ $RC -ne 0 ]]; then
  echo "⚠ pg_restore a signalé des erreurs (code $RC)."
  echo "  Si ce ne sont que des 'SET transaction_timeout' / objets système : OK."
  echo "  Sinon, relis la sortie ci-dessus avant de continuer."
else
  echo "✓ Restore terminé sans erreur."
fi

# 5. Push du code
echo
read -r -p "Pousser le code (git push heroku main) ? (tape: oui) " REP2
if [[ "$REP2" == "oui" ]]; then
  git push heroku main
  echo "✓ Code déployé."
else
  echo "Push code sauté (la base, elle, est déjà à jour)."
fi

echo
echo "=== Terminé. Contrôles suggérés ==="
echo "  https://$APP.herokuapp.com            (liste + marqueurs H/V/EU)"
echo "  une fiche produit                      (carte Situation ANSM, ventes)"
echo "  heroku logs --tail -a $APP             (en cas de doute)"
