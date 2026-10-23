/**
 * check_sql.js — valide TOUTES les requêtes de sql/ contre le schéma réel.
 *
 * Chaque fichier est soumis à PostgreSQL via PREPARE : le serveur analyse la
 * requête (identifiants, types, jointures, fonctions) et en calcule le plan,
 * SANS lire la moindre ligne. Les paramètres n'ont pas besoin de valeurs, leur
 * type est inféré du contexte.
 *
 * Attrape ce qui nous a coûté trois pannes en août 2026 :
 *   - colonne inexistante (« d.code_statut does not exist ») ;
 *   - incompatibilité de type (« operator does not exist: character varying = text[] ») ;
 *   - requête lisant une colonne pas encore créée en base.
 *
 *   node scripts/check_sql.js            (ou: npm run check-sql)
 *   node scripts/check_sql.js --verbose  affiche aussi les requêtes valides
 *
 * Sortie : 0 si tout passe, 1 sinon — utilisable en pré-déploiement.
 * Env : DATABASE_URL (défaut postgres://localhost:5432/incidents_json).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.join(__dirname, '..', 'sql');
const VERBOSE = process.argv.includes('--verbose');

/** Tous les .sql du dossier, en profondeur. */
function listSqlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listSqlFiles(p) : (e.name.endsWith('.sql') ? [p] : []);
  });
}

/**
 * Prépare la requête pour l'analyse : les filtres additionnels sont injectés à
 * l'exécution par app.js, le gabarit les remplace par du vide. On valide donc la
 * requête de base — les filtres, eux, sont du SQL littéral trivial.
 */
const nettoyer = sql => sql.replace('/* ADDITIONAL_FILTERS */', '');

async function run() {
  const files = listSqlFiles(SQL_DIR).sort();
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL || 'postgres://localhost:5432/incidents_json',
  });
  await client.connect();

  let ko = 0;
  for (const [i, file] of files.entries()) {
    const rel = path.relative(path.join(__dirname, '..'), file);
    const nom = `chk_${i}`;
    try {
      await client.query(`PREPARE ${nom} AS ${nettoyer(fs.readFileSync(file, 'utf8'))}`);
      await client.query(`DEALLOCATE ${nom}`);
      if (VERBOSE) console.log(`  ok   ${rel}`);
    } catch (e) {
      ko++;
      console.error(`\n✗ ${rel}`);
      console.error(`  ${e.message}`);
      // La position pointe le caractère fautif : on montre la ligne concernée.
      if (e.position) {
        const avant = nettoyer(fs.readFileSync(file, 'utf8')).slice(0, Number(e.position));
        const ligne = avant.split('\n').length;
        const texte = fs.readFileSync(file, 'utf8').split('\n')[ligne - 1] || '';
        console.error(`  ligne ${ligne} : ${texte.trim()}`);
      }
      if (e.hint) console.error(`  indice : ${e.hint}`);
    }
  }
  await client.end();

  console.log(`\n${files.length - ko}/${files.length} requête(s) valides contre le schéma courant.`);
  if (ko) {
    console.error('Corrige avant de déployer : une requête invalide ici = une page cassée en prod.');
    process.exit(1);
  }
}

run().catch(e => {
  console.error('Échec du contrôle SQL :', e.message || e);
  console.error('La base est-elle joignable ? DATABASE_URL =', process.env.DATABASE_URL || '(défaut local)');
  process.exit(1);
});
