#!/bin/bash
# ---------------------------------------------------------------------------
# deploy_prod.sh — déploiement dispomed vers Heroku (base de données + code).
#
#   ./deploy_prod.sh                    # quotidien : les incidents (public, incidents_ema)
#   ./deploy_prod.sh --mensuel          # mensuel : la BDPM (dbpm, ref, substitution)
#   HEROKU_APP=autre ./deploy_prod.sh   # autre app
#
# Deux rythmes, parce que la base est partagée avec Médipile (même add-on
# Postgres) : le quotidien ne touche que ce que run_update.js écrit chaque jour ;
# la BDPM, qui change une fois par mois, n'est rechargée qu'avec --mensuel. Un
# rechargement de dbpm.cis_bdpm supprime puis recrée la table : le faire chaque
# jour couperait Médipile quelques secondes, pour une table qui n'a pas bougé.
# Les tables propres à Médipile (dbpm.cis_documents, cis_compo_bdpm,
# cis_cip_bdpm, schéma docs) ne partent jamais d'ici : Médipile les charge
# lui-même (docs/deploiement-heroku.md du dépôt Médipile).
#
# Garde-fous :
#   - refuse d'avancer si DATABASE_URL est introuvable (jamais de pg_restore
#     avec une cible vide -> il taperait la base LOCALE par défaut) ;
#   - confirmation explicite avant d'écraser la prod, puis avant le push code.
#
# Contenu des dumps (le 23 octobre 2026) : quotidien, les tables de public
# (incidents, produits, molécules, product_sales, ansm_info) et d'incidents_ema,
# environ 400 Ko ; mensuel, dbpm (BDPM sans les tables de Médipile ni __prev),
# ref (ATC) et substitution, environ 4 Mo. Jamais open_medic ni docs. Détail
# dans les options du § 2 et dans incident_scraper/README-fr.md §6.
# ---------------------------------------------------------------------------
set -euo pipefail

MODE=quotidien
case "${1:-}" in
  "") ;;
  --mensuel) MODE=mensuel ;;
  *) echo "Usage : ./deploy_prod.sh [--mensuel]"; exit 1 ;;
esac

APP="${HEROKU_APP:-dispomed}"
LOCAL_DB="${LOCAL_DB:-incidents_json}"
DUMP="/tmp/incidents_json_$(date +%Y%m%d_%H%M%S).dump"

echo "=== Déploiement dispomed → Heroku ($APP), $MODE ==="

# Délai de garde portable : `timeout` vient de coreutils, absent de macOS par
# défaut (il s'y appelle `gtimeout` une fois brew coreutils installé). Sans lui,
# on exécute sans garde plutôt que d'échouer.
if command -v timeout >/dev/null 2>&1; then
  avec_delai() { timeout "$@"; }
elif command -v gtimeout >/dev/null 2>&1; then
  avec_delai() { gtimeout "$@"; }
else
  avec_delai() { shift; "$@"; }
fi

# 0. Authentification. Les sessions Heroku expirent (~1 mois) et le CLI ne le dit
#    pas : `heroku config:get` reste simplement suspendu, sans message. On vérifie
#    donc d'abord, avec un délai de garde pour ne jamais rester bloqué.
echo "— Authentification Heroku…"
if ! avec_delai 20 heroku auth:whoami >/dev/null 2>&1; then
  echo "  Session expirée ou absente → ouverture de « heroku login »."
  heroku login || { echo "✗ Connexion Heroku échouée."; exit 1; }
  avec_delai 20 heroku auth:whoami >/dev/null 2>&1 || { echo "✗ Toujours pas authentifié."; exit 1; }
fi
echo "✓ Connecté à Heroku ($(heroku auth:whoami 2>/dev/null))."

# 1. Garde-fou : l'URL de la base prod DOIT être récupérable avant toute action
DB_URL="$(avec_delai 30 heroku config:get DATABASE_URL -a "$APP" 2>/dev/null || true)"
if [[ -z "$DB_URL" || "$DB_URL" != postgres* ]]; then
  echo "✗ Impossible de récupérer DATABASE_URL pour l'app « $APP »."
  echo "  Vérifie le nom : heroku apps    (ou lance HEROKU_APP=nom ./deploy_prod.sh)"
  exit 1
fi
echo "✓ Base prod identifiée pour « $APP »."

# 1bis. Contrôle SQL : chaque requête de sql/ est analysée par PostgreSQL contre
#   le schéma LOCAL (PREPARE, sans lire une ligne). Une requête invalide ici est
#   une page cassée en prod — autant l'apprendre avant le dump qu'après le push.
echo "— Contrôle des requêtes SQL…"
if ! node scripts/check_sql.js; then
  echo "✗ Déploiement interrompu : corrige les requêtes ci-dessus."
  exit 1
fi

# 2. Dump de la base locale, selon le rythme.
#
#    Quotidien : les TABLES de public et d'incidents_ema (-t), pas le schéma
#    entier : public porte aussi les extensions, f_unaccent et la configuration
#    french_nu dont dépendent les index de Médipile ; --clean tenterait de les
#    supprimer. ansm_info_archive : historique local des fiches ANSM, structure
#    seule en prod (l'app lit ansm_info, jamais l'archive).
#
#    Mensuel : la BDPM commune (dbpm, ref, substitution). Exclusions : tables
#    __prev (sauvegardes du loader) et tables propres à Médipile (cis_documents*,
#    cis_compo_bdpm, cis_cip_bdpm), qu'il charge lui-même. Jamais open_medic ni
#    docs (préparation, lourds).
#
#    Avant d'ajouter une table, vérifier : grep -r 'dbpm\.' sql/ app.js
if [[ "$MODE" == quotidien ]]; then
  echo "— Dump des incidents de $LOCAL_DB (tables de public et incidents_ema)…"
  pg_dump -Fc --no-owner --no-acl \
    --table='public.*' --table='incidents_ema.*' \
    --exclude-table-data='public.ansm_info_archive' \
    -d "$LOCAL_DB" -f "$DUMP"
else
  echo "— Dump de la BDPM de $LOCAL_DB (dbpm, ref, substitution ; sans les tables de Médipile)…"
  pg_dump -Fc --no-owner --no-acl \
    --schema=dbpm --schema=ref --schema=substitution \
    --exclude-table='dbpm.*__prev' \
    --exclude-table='dbpm.cis_documents*' \
    --exclude-table='dbpm.cis_compo_bdpm' \
    --exclude-table='dbpm.cis_cip_bdpm' \
    -d "$LOCAL_DB" -f "$DUMP"
fi

# Garde-fou volume : un dump de prod normal pèse quelques Mo. Au-delà, une grosse
# table est repartie dans le lot — mieux vaut le voir AVANT d'écraser la prod
# (plafond de lignes du plan Heroku).
DUMP_MB=$(du -m "$DUMP" | cut -f1)
if (( DUMP_MB > 50 )); then
  echo "⚠ Dump de ${DUMP_MB} Mo — inhabituel (attendu : < 50 Mo)."
  echo "  Les 15 plus grosses tables locales :"
  psql -d "$LOCAL_DB" -c "SELECT schemaname||'.'||relname AS \"table\",
      pg_size_pretty(pg_total_relation_size(relid)) AS taille, n_live_tup AS lignes
    FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 15"
  read -r -p "  Continuer quand même ? (tape: oui) " REP_VOL
  [[ "$REP_VOL" == "oui" ]] || { echo "Abandon."; exit 1; }
fi
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

# 4bis. VÉRIFICATION — le seul juge est la donnée arrivée, pas le code de retour.
#   pg_restore rend 0 ou 1 pour des raisons cosmétiques, et surtout : au-delà du
#   plafond du plan, Heroku RÉVOQUE les INSERT. Les COPY échouent alors une à une
#   (« permission denied ») pendant que le reste passe — la base garde sa date
#   d'avant et personne ne le voit. Cas réel : prod figée au 8 août 2026.
# Trois nombres, pas un : la date maximale seule ne distingue pas deux états qui
# partagent leur dernier incident — la prod a déjà semblé « à jour » alors qu'elle
# portait encore 17 doublons supprimés en local le jour même.
if [[ "$MODE" == quotidien ]]; then
  REQ="SELECT max(calculated_end_date)||' | '||count(*)||' incidents | '||(SELECT count(*) FROM produits)||' produits' FROM incidents"
else
  REQ="SELECT (SELECT count(*) FROM dbpm.cis_bdpm)||' spécialités | '||(SELECT count(*) FROM dbpm.cis_gener_bdpm)||' génériques | '||(SELECT count(*) FROM ref.cis_atc_mapping)||' ATC'"
fi
LOCAL_MAX="$(psql -tAX -d "$LOCAL_DB" -c "$REQ" 2>/tmp/deploy_local_err || true)"
PROD_ERR=/tmp/deploy_prod_err
PROD_MAX="$(PGSSLMODE=require psql -tAX -d "$DB_URL" -c "$REQ" 2>"$PROD_ERR" || true)"
echo
echo "— Vérification ($MODE)"
echo "   local : ${LOCAL_MAX:-vide}"
echo "   prod  : ${PROD_MAX:-vide}"
if [[ -s "$PROD_ERR" ]]; then
  echo "   erreur renvoyée par la prod :"
  sed 's/^/     /' "$PROD_ERR"
fi
if [[ "$LOCAL_MAX" != "$PROD_MAX" ]]; then
  echo "✗ LES DEUX DIFFÈRENT — le restore n'a PAS abouti."
  echo "  · prod vide  -> les COPY ont échoué : plan dépassé (INSERT révoqués) ?"
  echo "                  heroku pg:info -a $APP"
  echo "  · erreur SQL -> lire le message ci-dessus (table absente, droits, SSL)."
  echo "  Le push du code est bloqué : pousser du code sur une base périmée casse la prod."
  exit 1
fi
echo "✓ Base prod à jour ($PROD_MAX)."
if [[ "$MODE" == mensuel ]]; then
  echo "  Médipile : recharger aussi ses tables (dbpm.cis_documents, cis_compo_bdpm,"
  echo "  cis_cip_bdpm, docs) — docs/deploiement-heroku.md, « Mises à jour mensuelles »."
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
