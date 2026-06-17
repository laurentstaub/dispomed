/**
 * build_product_sales.js
 *
 * Rebuilds the public.product_sales aggregate from the Open Medic + BDPM
 * reference data in the LOCAL incidents_json database, so the dispomed app can
 * serve sales without those heavy schemas (which are not deployed to Heroku).
 *
 * Usage (local only):  npm run build-sales
 * Re-run after each Open Medic reload, before taking the production dump.
 *
 * It is a no-op-safe guard: if open_medic is not present (e.g. run against the
 * Heroku DB), it exits with a clear message instead of failing mid-query.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dbQuery, closePool } from './connect_db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function buildProductSales() {
  // Guard: the reference schemas only exist in the local data DB.
  const { rows: check } = await dbQuery(`SELECT to_regclass('open_medic.sales') AS sales`);
  if (!check[0].sales) {
    console.error(
      'open_medic.sales not found.\n' +
      'Run this against the LOCAL incidents_json database — open_medic / dbpm are\n' +
      'not present on Heroku. (Check DATABASE_URL in .env.)'
    );
    process.exit(1);
  }

  console.log('Rebuilding public.product_sales from open_medic ...');
  const sql = fs.readFileSync(path.join(__dirname, 'build_product_sales.sql'), 'utf8');
  await dbQuery(sql);

  const { rows } = await dbQuery(`
    SELECT count(*) AS rows,
           count(DISTINCT code_cis) AS cis,
           count(DISTINCT cip13) AS cip,
           min(year) AS first_year, max(year) AS last_year
    FROM public.product_sales
  `);
  const r = rows[0];
  console.log(`Done: ${r.rows} rows, ${r.cis} CIS, ${r.cip} CIP13, years ${r.first_year}-${r.last_year}.`);
  console.log('Re-dump the database to push product_sales to production.');
}

buildProductSales()
  .then(closePool)
  .catch(async (err) => {
    console.error('Build failed:', err.message || err);
    await closePool();
    process.exit(1);
  });
