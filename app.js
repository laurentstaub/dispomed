/**
 * @fileoverview Main application server for Dispomed
 *
 * This file sets up an Express.js server that provides API endpoints and page routes
 * for the Dispomed application. It handles database queries, error handling, and
 * rendering views for the frontend.
 *
 * The server provides endpoints for:
 * - Fetching incident data with various filtering options
 * - Retrieving product information
 * - Getting ATC (Anatomical Therapeutic Chemical) classification data
 * - Accessing EMA (European Medicines Agency) incident data
 * - Finding therapeutic substitutions for medications
 *
 * @module app
 * @requires express
 * @requires cors
 * @requires ./library/config.js
 * @requires ./database/connect_db
 * @requires ./public/js/fetch_first_atcdata
 */

// noinspection JSUnusedLocalSymbols

import express from "express";
import cors from "cors";
import "./library/config.js";
import { dbQuery, loadSqlFile } from "./database/connect_db.js";
import ATCDataManager from "./public/js/fetch_first_atcdata.js";

/**
 * Express application instance
 * @type {import('express').Application}
 */
const app = express();

/**
 * Port number for the server to listen on
 * @type {number}
 */
const PORT = process.env.PORT || 3000;

/**
 * Configure view engine settings
 */
app.set("views", "./views");
app.set("view engine", "pug");

/**
 * Set up middleware
 * - Serve static files from the 'public' directory
 * - Enable CORS (Cross-Origin Resource Sharing)
 */
app.use(express.static("public"));
app.use(cors());

/**
 * Wraps an async route handler so that any rejected promise is forwarded to
 * Express's error-handling middleware via next(). This removes the need for a
 * try/catch block in every route.
 *
 * @param {Function} fn - An async (req, res, next) route handler
 * @returns {Function} A route handler that forwards errors to next()
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Route handler for the home page
 *
 * Fetches ATC data for the last 12 months and renders the chart view
 * with ATC classes and molecules data.
 *
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @returns {Promise<void>} - Renders the chart view
 */
app.get("/", asyncHandler(async (req, res) => {
  await ATCDataManager.fetchAndInitialize(12); // 12 for 12 months as default report time length
  const atcClasses = ATCDataManager.getATCClasses();
  const molecules = ATCDataManager.getMolecules();

  res.render("chart", {
    ATCClasses: atcClasses,
    molecules: molecules,
    selectedAtcClass: "",
  });
}));

/**
 * Route handler for the product detail page
 *
 * Fetches the global report date and renders the product detail page
 * with the product ID and global report date.
 *
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {string} req.params.productId - ID of the product to retrieve
 * @returns {Promise<void>} - Renders the product page
 */
app.get("/product/:productId", asyncHandler(async (req, res) => {
  const { productId } = req.params;

  // Fetch the global report date (max calculated_end_date from all incidents)
  const { rows: reportRows } = await dbQuery(loadSqlFile('sql/incidents/get_max_report_date.sql'));
  const reportData = reportRows[0] || {};
  const globalReportDate = reportData.max_report_date;

  res.render('product', { productId, globalReportDate });
}));

/**
 * API endpoint for client-side configuration
 *
 * Returns configuration values needed by the client-side application,
 * such as the API base URL.
 *
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @returns {void} - Sends a JSON response with configuration values
 */
app.get("/api/config", (req, res) => {
  res.json({
    API_BASE_URL: process.env.API_BASE_URL || "http://localhost:3000",
  });
});

/**
 * Enriches a list of incidents with a code_cis -> denomination mapping.
 *
 * For each incident, builds an `cis_names` object mapping every CIS code found
 * on the incident to its denomination (or an empty string when unknown). The
 * names are resolved in a single query for all unique codes across the list.
 *
 * @param {Array<Object>} incidents - Incidents, each optionally with `cis_codes`
 * @returns {Promise<void>} - Mutates each incident in place, adding `cis_names`
 */
async function attachCisNames(incidents) {
  const allCisCodes = [...new Set(incidents.flatMap(incident => incident.cis_codes || []))];

  let cisNamesMap = {};
  if (allCisCodes.length > 0) {
    const { rows: cisNamesRows } = await dbQuery(
      loadSqlFile('sql/products/get_cis_names.sql'), [allCisCodes]
    );
    cisNamesRows.forEach(row => {
      cisNamesMap[row.code_cis] = row.denomination_medicament;
    });
  }

  incidents.forEach(incident => {
    incident.cis_names = {};
    (incident.cis_codes || []).forEach(code => {
      incident.cis_names[code] = cisNamesMap[code] || '';
    });
  });
}

/**
 * API endpoint for fetching incidents with filtering options
 *
 * Retrieves incident data based on various query parameters for filtering.
 * Also fetches and associates CIS (drug identification) codes with their names.
 *
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {string} req.query.monthsToShow - Number of months of data to retrieve
 * @param {string} [req.query.product] - Optional product name filter
 * @param {string} [req.query.atcClass] - Optional ATC class code filter
 * @param {string} [req.query.molecule] - Optional molecule ID filter (can be comma-separated)
 * @param {string} [req.query.vaccinesOnly] - If 'true', filters for vaccines only (ATC code J07)
 * @returns {Promise<void>} - Sends a JSON response with incident data
 */
app.get("/api/incidents", asyncHandler(async (req, res) => {
  const { monthsToShow, product, atcClass, molecule } = req.query;

  let query = loadSqlFile('sql/incidents/get_incidents.sql');
  const params = [monthsToShow];
  let paramIndex = 2;
  let additionalFilters = '';

  if (product) {
    additionalFilters += ` AND (p.name ILIKE $${paramIndex} OR m.name ILIKE $${paramIndex})`;
    params.push(`%${product}%`);
    paramIndex++;
  }

  if (req.query.vaccinesOnly === 'true') {
    additionalFilters += ` AND p.atc_code LIKE 'J07%'`;
  }

  if (atcClass) {
    additionalFilters += ` AND ca.code = $${paramIndex}`;
    params.push(atcClass);
    paramIndex++;
  }

  if (molecule) {
    // Handle comma-separated molecule IDs
    if (molecule.includes(',')) {
      const moleculeIds = molecule.split(',').map(id => id.trim());
      additionalFilters += ` AND m.id = ANY($${paramIndex}::int[])`;
      params.push(moleculeIds);
    } else {
      additionalFilters += ` AND m.id = $${paramIndex}`;
      params.push(molecule);
    }
    paramIndex++;
  }

  // Replace the placeholder with the additional filters
  query = query.replace('/* ADDITIONAL_FILTERS */', additionalFilters);

  const result = await dbQuery(query, ...params);
  const incidents = result.rows;

  await attachCisNames(incidents);

  res.json(incidents);
}));

/**
 * API endpoint for searching products without time filter
 *
 * Searches for products across the entire database without time constraints
 * Returns product information including whether they're in the current filter range
 *
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {string} req.query.searchTerm - Search term for product/molecule name
 * @param {string} req.query.monthsToShow - Current filter months to determine if results are in range
 * @returns {Promise<void>} - Sends a JSON response with search results
 */
app.get("/api/search", asyncHandler(async (req, res) => {
  const { searchTerm, monthsToShow = 12 } = req.query;

  if (!searchTerm || searchTerm.length < 2) {
    return res.json([]);
  }

  // Query for all matching products without time filter
  const searchQuery = `
    WITH max_date AS (
      SELECT MAX(calculated_end_date) AS max_date FROM incidents
    ),
    search_results AS (
      SELECT DISTINCT
        p.id AS product_id,
        p.name AS product,
        p.accented_name AS accented_product,
        MAX(i.calculated_end_date) AS latest_end_date,
        MAX(i.start_date) AS latest_start_date,
        STRING_AGG(DISTINCT i.status, ', ' ORDER BY i.status) AS statuses,
        bool_or(i.status = 'Arret' AND i.end_date IS NULL) AS is_discontinued,
        bool_or(i.calculated_end_date >= (md.max_date - INTERVAL '1 month' * $2)) AS in_current_filter
      FROM produits p
      LEFT JOIN incidents i ON p.id = i.product_id
      LEFT JOIN produits_molecules pm ON p.id = pm.produit_id
      LEFT JOIN molecules m ON pm.molecule_id = m.id
      CROSS JOIN max_date md
      WHERE (p.name ILIKE $1 OR p.accented_name ILIKE $1 OR m.name ILIKE $1)
      GROUP BY p.id, p.name, p.accented_name
    ),
    with_current_status AS (
      SELECT *,
        CASE
          WHEN is_discontinued THEN 'Arret'
          WHEN statuses LIKE '%Rupture%' AND in_current_filter THEN 'Rupture'
          WHEN statuses LIKE '%Tension%' AND in_current_filter THEN 'Tension'
          ELSE 'Disponible'
        END AS current_status
      FROM search_results
    )
    SELECT * FROM with_current_status
    ORDER BY
      in_current_filter DESC,
      is_discontinued ASC,
      product ASC
    LIMIT 20
  `;

  const { rows } = await dbQuery(searchQuery, `%${searchTerm}%`, monthsToShow);
  res.json(rows);
}));

/**
 * API endpoint for fetching therapeutic substitutions for a medication
 *
 * Retrieves potential therapeutic substitutions for a given medication
 * identified by its CIS code. Returns both substitutions where the
 * medication is the source and where it is the target.
 */
app.get('/api/substitutions/:code_cis', asyncHandler(async (req, res) => {
  const { code_cis } = req.params;

  const query = `
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
  `;

  const result = await dbQuery(query, code_cis);
  res.json(result.rows);
}));

/**
 * API endpoint for fetching ATC (Anatomical Therapeutic Chemical) classes
 *
 * Retrieves ATC classification data for medications based on the specified
 * time period.
 * @returns {Promise<void>} - Sends a JSON response with ATC classes data
 */
app.get("/api/incidents/ATCClasses", asyncHandler(async (req, res) => {
  const { monthsToShow } = req.query;

  const query = loadSqlFile('sql/atc_classes/get_atc_classes.sql');
  const result = await dbQuery(query, monthsToShow);
  res.json(result.rows);
}));

/**
 * API endpoint for fetching product details by product name
 *
 * Retrieves detailed information about a product, including all associated
 * incidents. The product is identified by its name.
 */
app.get('/api/product/:productName', asyncHandler(async (req, res) => {
  const { productName } = req.params;

  // 1. Find the product by name
  const productResult = await dbQuery(
    loadSqlFile('sql/products/get_product_by_name.sql'),
    ...[productName.toLowerCase()]
  );
  if (productResult.rows.length === 0) {
    return res.status(404).json({ error: 'Product not found' });
  }
  const product = productResult.rows[0];

  // 2. Get all incidents for this product (by product_id)
  const incidentsResult = await dbQuery(
    loadSqlFile('sql/incidents/get_incidents_by_product.sql'),
    ...[product.id]
  );

  // 3. Attach incidents to product
  product.incidents = incidentsResult.rows;

  res.json(product);
}));

/**
 * API endpoint for fetching incidents related to a specific product
 *
 * Retrieves all incidents associated with a product identified by its ID.
 * Also fetches and associates CIS (drug identification) codes with their names.
 *
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {string} req.params.productId - ID of the product to retrieve incidents for
 * @returns {Promise<void>} - Sends a JSON response with incident data
 */
app.get("/api/incidents/product/:productId", asyncHandler(async (req, res) => {
  const { productId } = req.params;

  const query = loadSqlFile('sql/incidents/get_incidents_by_product_id.sql');
  const params = [productId];

  const result = await dbQuery(query, ...params);
  const incidents = result.rows;

  await attachCisNames(incidents);

  res.json(incidents);
}));

/**
 * API endpoint for fetching EMA (European Medicines Agency) incidents
 *
 * Retrieves incidents from the EMA database that are associated with
 * the specified CIS codes. Includes details and French translations.
 */
app.get('/api/ema-incidents', asyncHandler(async (req, res) => {
  const { cis_codes } = req.query;
  if (!cis_codes) {
    return res.status(400).json({ error: 'cis_codes query param required' });
  }
  const codes = cis_codes.split(',').map(code => code.trim());

  // Find all EMA incidents that have any of the given CIS codes, with details and French translations
  const query = loadSqlFile('sql/ema/get_incidents_by_cis.sql');
  const { rows } = await dbQuery(query, [codes]);
  res.json(rows);
}));

/**
 * API endpoint for fetching sales data by CIS codes
 *
 * Retrieves sales data for each CIP13 per year (2021-2024) associated with
 * the specified CIS codes.
 */
app.get('/api/sales-by-cis', asyncHandler(async (req, res) => {
  const { cis_codes } = req.query;
  if (!cis_codes) {
    return res.status(400).json({ error: 'cis_codes query param required' });
  }
  const codes = cis_codes.split(',').map(code => code.trim());

  // Find sales data for the given CIS codes
  const query = loadSqlFile('sql/products/get_sales_by_cis_codes.sql');
  const { rows } = await dbQuery(query, [codes]);
  res.json(rows);
}));

/**
 * Route handler for the substitutions page
 *
 * Renders a page showing therapeutic substitutions for a medication
 * identified by its CIS code. Fetches the medication name to display
 * alongside the substitution information.
 */
app.get("/substitutions/:cis_code", asyncHandler(async (req, res) => {
  const { cis_code } = req.params;
  // We need to fetch the name for this CIS code to display it.
  const { rows } = await dbQuery(
    loadSqlFile('sql/products/get_denomination_by_cis.sql'), [cis_code]
  );
  const denomination = rows.length > 0 ? rows[0].denomination_medicament : cis_code;

  res.render('substitutions', {
    cis_code: cis_code,
    denomination: denomination
  });
}));

/**
 * HTML shown when the database has not been set up. Reused by the error handler
 * for page (non-API) routes.
 * @type {string}
 */
const DB_SETUP_HTML = `
  <h1>Database Setup Required</h1>
  <p>The application database has not been set up correctly.</p>
  <h2>Please follow these steps:</h2>
  <ol>
    <li>Create the database: <code>createdb dispomed</code></li>
    <li>Create a .env file with: <code>DATABASE_URL=postgres://localhost:5432/dispomed</code></li>
    <li>Initialize the database schema: <code>npm run init-db</code></li>
  </ol>
  <p>For more details, please refer to the README.md file.</p>
`;

/**
 * JSON payload shown when the database has not been set up. Reused by the error
 * handler for API routes.
 * @type {{error: string, message: string}}
 */
const DB_SETUP_JSON = {
  error: "Database Setup Required",
  message: "The application database has not been set up correctly. Please follow these steps:\n1. Create the database: createdb dispomed\n2. Create a .env file with: DATABASE_URL=postgres://localhost:5432/dispomed\n3. Initialize the database schema: npm run init-db\nFor more details, please refer to the README.md file.",
};

/**
 * Determines whether an error indicates that the target database does not exist.
 *
 * @param {Error & {code?: string}} error - The error thrown by a query/connection
 * @returns {boolean} True if this is a "database does not exist" setup error
 */
function isDbSetupError(error) {
  return error.code === '3D000' ||
    (error.message && error.message.includes("database") && error.message.includes("does not exist"));
}

/**
 * 404 handler for unmatched routes.
 * Returns JSON for API routes and renders the 404 view for page routes.
 */
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(404).render('404', { title: 'Page introuvable' });
});

/**
 * Centralized error-handling middleware.
 *
 * Replaces the per-route try/catch blocks that previously duplicated the same
 * database-setup messaging across every handler. API routes receive JSON;
 * page routes receive HTML / the error view.
 *
 * @param {Error & {code?: string}} err - The error forwarded via next()
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next function
 */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(`Error on ${req.method} ${req.originalUrl}:`, err);

  const wantsJson = req.path.startsWith('/api');
  res.status(500);

  if (isDbSetupError(err)) {
    return wantsJson ? res.json(DB_SETUP_JSON) : res.send(DB_SETUP_HTML);
  }

  if (wantsJson) {
    return res.json({ error: "Internal server error" });
  }

  res.render('error', { title: 'Erreur', error: { message: "Une erreur est survenue lors du chargement de la page." } });
});

/**
 * Start the Express server and listen for incoming connections
 *
 * @listens {number} PORT - The port number to listen on
 * @returns {import('http').Server} - The HTTP server instance
 */
const server = app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`),
);

// Graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function shutdown() {
  console.log('Received shutdown signal, closing connections...');

  server.close(() => {
    console.log('HTTP server closed');
  });

  // Close database connection pool
  const { closePool } = await import('./database/connect_db.js');
  await closePool();
  console.log('Database connection pool closed');

  process.exit(0);
}
