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
 * Route handler for the home page
 * 
 * Fetches ATC data for the last 12 months and renders the chart view
 * with ATC classes and molecules data.
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @returns {Promise<void>} - Renders the chart view or sends an error response
 */
app.get("/", async (req, res) => {
  try {
    await ATCDataManager.fetchAndInitialize(12); // 12 for 12 months as default report time length
    const atcClasses = ATCDataManager.getATCClasses();
    const molecules = ATCDataManager.getMolecules();

    res.render("chart", {
      ATCClasses: atcClasses,
      molecules: molecules,
      selectedAtcClass: "",
    });
  } catch (error) {
    console.error("Error loading home page:", error);
    if (error.message && error.message.includes("database") && error.message.includes("does not exist")) {
      res.status(500).send(`
        <h1>Database Setup Required</h1>
        <p>The application database has not been set up correctly.</p>
        <h2>Please follow these steps:</h2>
        <ol>
          <li>Create the database: <code>createdb dispomed</code></li>
          <li>Create a .env file with: <code>DATABASE_URL=postgres://localhost:5432/dispomed</code></li>
          <li>Initialize the database schema: <code>npm run init-db</code></li>
        </ol>
        <p>For more details, please refer to the README.md file.</p>
      `);
    } else {
      res.status(500).send("An error occurred while loading the application. Please check the server logs for details.");
    }
  }
});


/**
 * Route handler for the product detail page
 *
 * Fetches the global report date and renders the product detail page
 * with the product ID and global report date.
 *
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {Object} req.params - URL parameters
 * @param {string} req.params.productId - ID of the product to retrieve
 * @returns {Promise<void>} - Renders the product page or sends an error response
 */

app.get("/product/:productId", async (req, res) => {
  try {
    const { productId } = req.params;

    // Fetch the global report date (max calculated_end_date from all incidents)
    const { rows: reportRows } = await dbQuery(loadSqlFile('sql/incidents/get_max_report_date.sql'));
    const reportData = reportRows[0] || {};
    const globalReportDate = reportData.max_report_date;

    res.render('product', { productId, globalReportDate });
  } catch (error) {
    console.error("Error loading product page:", error);
    // Check if it's a database connection error
    if (error.message && error.message.includes("database") && error.message.includes("does not exist")) {
      res.status(500).send(`
        <h1>Database Setup Required</h1>
        <p>The application database has not been set up correctly.</p>
        <h2>Please follow these steps:</h2>
        <ol>
          <li>Create the database: <code>createdb dispomed</code></li>
          <li>Create a .env file with: <code>DATABASE_URL=postgres://localhost:5432/dispomed</code></li>
          <li>Initialize the database schema: <code>npm run init-db</code></li>
        </ol>
        <p>For more details, please refer to the README.md file.</p>
      `);
    } else {
      res.status(500).send("An error occurred while loading the product page. Please check the server logs for details.");
    }
  }
});

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
 * API endpoint for fetching incidents with filtering options
 * 
 * Retrieves incident data based on various query parameters for filtering.
 * Also fetches and associates CIS (drug identification) codes with their names.
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {Object} req.query - Query parameters
 * @param {string} req.query.monthsToShow - Number of months of data to retrieve
 * @param {string} [req.query.product] - Optional product name filter
 * @param {string} [req.query.atcClass] - Optional ATC class code filter
 * @param {string} [req.query.molecule] - Optional molecule ID filter (can be comma-separated)
 * @param {string} [req.query.vaccinesOnly] - If 'true', filters for vaccines only (ATC code J07)
 * @returns {Promise<void>} - Sends a JSON response with incident data
 */

app.get("/api/incidents", async (req, res) => {
  const { monthsToShow, product, atcClass, molecule } = req.query;

  try {
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

    // 1. Récupérer tous les codes CIS uniques
    const allCisCodes = [ ...new Set (incidents.flatMap(incident => incident.cis_codes || []))];

    // 2. Aller chercher les noms correspondants dans dbpm.cis_bdpm
    let cisNamesMap = {};
    if (allCisCodes.length > 0) {
      const { rows: cisNamesRows } = await dbQuery(
        loadSqlFile('sql/products/get_cis_names.sql'), [allCisCodes]
      );
      cisNamesRows.forEach(row => {
        cisNamesMap[row.code_cis] = row.denomination_medicament;
      });
    }

    // 3. Associer à chaque incident le mapping code_cis -> nom
    incidents.forEach(incident => {
      incident.cis_names = {};
      (incident.cis_codes || []).forEach(code => {
        incident.cis_names[code] = cisNamesMap[code] || '';
      });
    });

    res.json(incidents);
  } catch (error) {
    console.error("Error fetching incidents:", error);

    // Check if it's a database connection error
    if (error.code === '3D000' || (error.message && error.message.includes("database") && error.message.includes("does not exist"))) {
      res.status(500).json({ 
        error: "Database Setup Required", 
        message: "The application database has not been set up correctly. Please follow these steps:\n1. Create the database: createdb dispomed\n2. Create a .env file with: DATABASE_URL=postgres://localhost:5432/dispomed\n3. Initialize the database schema: npm run init-db\nFor more details, please refer to the README.md file."
      });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

/**
 * API endpoint for searching products without time filter
 * 
 * Searches for products across the entire database without time constraints
 * Returns product information including whether they're in the current filter range
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {Object} req.query - Query parameters
 * @param {string} req.query.searchTerm - Search term for product/molecule name
 * @param {string} req.query.monthsToShow - Current filter months to determine if results are in range
 * @returns {Promise<void>} - Sends a JSON response with search results
 */
app.get("/api/search", async (req, res) => {
  const { searchTerm, monthsToShow = 12 } = req.query;
  
  if (!searchTerm || searchTerm.length < 2) {
    return res.json([]);
  }

  try {
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
  } catch (error) {
    console.error("Error in search:", error);
    res.status(500).json({ error: "Search failed", details: error.message });
  }
});

/**
 * API endpoint for fetching therapeutic substitutions for a medication
 * 
 * Retrieves potential therapeutic substitutions for a given medication
 * identified by its CIS code. Returns both substitutions where the
 * medication is the source and where it is the target.
 */
app.get('/api/substitutions/:code_cis', async (req, res) => {
  const { code_cis } = req.params;

  try {
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
  } catch (error) {
    console.error(`Error fetching substitutions for CIS ${code_cis}:`, error);

    // Check if it's a database connection error
    if (error.code === '3D000' || (error.message && error.message.includes("database") && error.message.includes("does not exist"))) {
      res.status(500).json({ 
        error: "Database Setup Required", 
        message: "The application database has not been set up correctly. Please follow these steps:\n1. Create the database: createdb dispomed\n2. Create a .env file with: DATABASE_URL=postgres://localhost:5432/dispomed\n3. Initialize the database schema: npm run init-db\nFor more details, please refer to the README.md file."
      });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

/**
 * API endpoint for fetching ATC (Anatomical Therapeutic Chemical) classes
 * 
 * Retrieves ATC classification data for medications based on the specified
 * time period.
 * @returns {Promise<void>} - Sends a JSON response with ATC classes data
 */
app.get("/api/incidents/ATCClasses", async (req, res) => {
  const { monthsToShow } = req.query;

  try {
    const query = loadSqlFile('sql/atc_classes/get_atc_classes.sql');
    const result = await dbQuery(query, monthsToShow);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching ATC classes:", error);

    // Check if it's a database connection error
    if (error.code === '3D000' || (error.message && error.message.includes("database") && error.message.includes("does not exist"))) {
      res.status(500).json({ 
        error: "Database Setup Required", 
        message: "The application database has not been set up correctly. Please follow these steps:\n1. Create the database: createdb dispomed\n2. Create a .env file with: DATABASE_URL=postgres://localhost:5432/dispomed\n3. Initialize the database schema: npm run init-db\nFor more details, please refer to the README.md file."
      });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

/**
 * API endpoint for fetching product details by product name
 * 
 * Retrieves detailed information about a product, including all associated
 * incidents. The product is identified by its name.
 */
app.get('/api/product/:productName', async (req, res) => {
  const { productName } = req.params;
  try {
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
  } catch (error) {
    console.error('Error fetching product detail:', error);

    // Check if it's a database connection error
    if (error.code === '3D000' || (error.message && error.message.includes("database") && error.message.includes("does not exist"))) {
      res.status(500).json({ 
        error: "Database Setup Required", 
        message: "The application database has not been set up correctly. Please follow these steps:\n1. Create the database: createdb dispomed\n2. Create a .env file with: DATABASE_URL=postgres://localhost:5432/dispomed\n3. Initialize the database schema: npm run init-db\nFor more details, please refer to the README.md file."
      });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

/**
 * API endpoint for fetching incidents related to a specific product
 * 
 * Retrieves all incidents associated with a product identified by its ID.
 * Also fetches and associates CIS (drug identification) codes with their names.
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {Object} req.params - URL parameters
 * @param {string} req.params.productId - ID of the product to retrieve incidents for
 * @returns {Promise<void>} - Sends a JSON response with incident data
 */
app.get("/api/incidents/product/:productId", async (req, res) => {
  const { productId } = req.params;

  try {
    const query = loadSqlFile('sql/incidents/get_incidents_by_product_id.sql');
    const params = [productId];

    const result = await dbQuery(query, ...params);
    const incidents = result.rows;

    // 1. Récupérer tous les codes CIS uniques
    const allCisCodes = [ ...new Set (incidents.flatMap(incident => incident.cis_codes || []))];

    // 2. Aller chercher les noms correspondants dans dbpm.cis_bdpm
    let cisNamesMap = {};
    if (allCisCodes.length > 0) {
      const { rows: cisNamesRows } = await dbQuery(
        loadSqlFile('sql/products/get_cis_names.sql'), [allCisCodes]
      );
      cisNamesRows.forEach(row => {
        cisNamesMap[row.code_cis] = row.denomination_medicament;
      });
    }

    // 3. Associer à chaque incident le mapping code_cis -> nom
    incidents.forEach(incident => {
      incident.cis_names = {};
      (incident.cis_codes || []).forEach(code => {
        incident.cis_names[code] = cisNamesMap[code] || '';
      });
    });

    res.json(incidents);
  } catch (error) {
    console.error("Error fetching product incidents:", error);

    // Check if it's a database connection error
    if (error.code === '3D000' || (error.message && error.message.includes("database") && error.message.includes("does not exist"))) {
      res.status(500).json({ 
        error: "Database Setup Required", 
        message: "The application database has not been set up correctly. Please follow these steps:\n1. Create the database: createdb dispomed\n2. Create a .env file with: DATABASE_URL=postgres://localhost:5432/dispomed\n3. Initialize the database schema: npm run init-db\nFor more details, please refer to the README.md file."
      });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

/**
 * API endpoint for fetching EMA (European Medicines Agency) incidents
 * 
 * Retrieves incidents from the EMA database that are associated with
 * the specified CIS codes. Includes details and French translations.
 */
app.get('/api/ema-incidents', async (req, res) => {
  const { cis_codes } = req.query;
  if (!cis_codes) {
    return res.status(400).json({ error: 'cis_codes query param required' });
  }
  const codes = cis_codes.split(',').map(code => code.trim());
  try {
    // Find all EMA incidents that have any of the given CIS codes, with details and French translations
    const query = loadSqlFile('sql/ema/get_incidents_by_cis.sql');
    const { rows } = await dbQuery(query, [codes]);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching EMA incidents:', error);

    // Check if it's a database connection error
    if (error.code === '3D000' || (error.message && error.message.includes("database") && error.message.includes("does not exist"))) {
      res.status(500).json({ 
        error: "Database Setup Required", 
        message: "The application database has not been set up correctly. Please follow these steps:\n1. Create the database: createdb dispomed\n2. Create a .env file with: DATABASE_URL=postgres://localhost:5432/dispomed\n3. Initialize the database schema: npm run init-db\nFor more details, please refer to the README.md file."
      });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

/**
 * API endpoint for fetching sales data by CIS codes
 * 
 * Retrieves sales data for each CIP13 per year (2021-2024) associated with
 * the specified CIS codes.
 */
app.get('/api/sales-by-cis', async (req, res) => {
  const { cis_codes } = req.query;
  if (!cis_codes) {
    return res.status(400).json({ error: 'cis_codes query param required' });
  }
  const codes = cis_codes.split(',').map(code => code.trim());
  try {
    // Find sales data for the given CIS codes
    const query = loadSqlFile('sql/products/get_sales_by_cis_codes.sql');
    const { rows } = await dbQuery(query, [codes]);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching sales data:', error);

    // Check if it's a database connection error
    if (error.code === '3D000' || (error.message && error.message.includes("database") && error.message.includes("does not exist"))) {
      res.status(500).json({ 
        error: "Database Setup Required", 
        message: "The application database has not been set up correctly. Please follow these steps:\n1. Create the database: createdb dispomed\n2. Create a .env file with: DATABASE_URL=postgres://localhost:5432/dispomed\n3. Initialize the database schema: npm run init-db\nFor more details, please refer to the README.md file."
      });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

/**
 * Route handler for the substitutions page
 * 
 * Renders a page showing therapeutic substitutions for a medication
 * identified by its CIS code. Fetches the medication name to display
 * alongside the substitution information.
 */
app.get("/substitutions/:cis_code", async (req, res) => {
  const { cis_code } = req.params;
  // We need to fetch the name for this CIS code to display it.
  try {
    const { rows } = await dbQuery(
      loadSqlFile('sql/products/get_denomination_by_cis.sql'), [cis_code]
    );
    const denomination = rows.length > 0 ? rows[0].denomination_medicament : cis_code;

    res.render('substitutions', { 
      cis_code: cis_code,
      denomination: denomination 
    });
  } catch (error) {
    console.error('Error fetching CIS denomination for substitutions page:', error);

    // Check if it's a database connection error
    if (error.code === '3D000' || (error.message && error.message.includes("database") && error.message.includes("does not exist"))) {
      res.status(500).send(`
        <h1>Database Setup Required</h1>
        <p>The application database has not been set up correctly.</p>
        <h2>Please follow these steps:</h2>
        <ol>
          <li>Create the database: <code>createdb dispomed</code></li>
          <li>Create a .env file with: <code>DATABASE_URL=postgres://localhost:5432/dispomed</code></li>
          <li>Initialize the database schema: <code>npm run init-db</code></li>
        </ol>
        <p>For more details, please refer to the README.md file.</p>
      `);
    } else {
      res.status(500).render('error', { message: 'Error loading page' });
    }
  }
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
