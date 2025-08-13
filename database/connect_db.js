import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const { Client, Pool } = pg;

// Get the directory name of the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Loads SQL query from a file
 * @param {string} filePath - The path to the SQL file, relative to the project root
 * @returns {string} - The SQL query as a string
 */
export function loadSqlFile(filePath) {
  const fullPath = path.resolve(__dirname, '..', filePath);
  return fs.readFileSync(fullPath, 'utf8');
}

const isProduction = process.env.NODE_ENV === "production";

const CONNECTION_CONFIG = {
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  // Connection pool configuration
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection cannot be established
};

// Create a connection pool for better performance
let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool(CONNECTION_CONFIG);
    
    // Handle pool errors
    pool.on('error', (err, client) => {
      console.error('Unexpected error on idle client', err);
    });
  }
  return pool;
}

/**
 * Executes a SQL query against the database using connection pooling
 * @param {string} statement - The SQL query to execute
 * @param {...any} parameters - The parameters to pass to the query
 * @returns {Promise<{rows: Array<Object>, rowCount: number}>} - The query result object
 *   with rows property containing the query results as an array of objects
 *   where each object has properties corresponding to the column names in the query
 */
export async function dbQuery(statement, ...parameters) {
  const poolInstance = getPool();
  const client = await poolInstance.connect();

  try {
    logQuery(statement, parameters);
    return await client.query(statement, parameters);
  } catch (error) {
    console.error("Database query error:", error);

    // Check if the error is "database does not exist"
    if (error.code === '3D000') {
      console.error("\n\n========== DATABASE SETUP REQUIRED ==========");
      console.error("The database 'dispomed' does not exist. Please follow these steps to set it up:");
      console.error("1. Create the database: createdb dispomed");
      console.error("2. Create a .env file with: DATABASE_URL=postgres://localhost:5432/dispomed");
      console.error("3. Initialize the database schema: npm run init-db");
      console.error("For more details, please refer to the README.md file.");
      console.error("===========================================\n\n");
    }

    throw error;
  } finally {
    client.release();
  }
}

/**
 * Gracefully closes the connection pool
 * Should be called on application shutdown
 */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

function logQuery(statement, parameters) {
  console.log("Executing query:", statement);
  if (parameters.length > 0) {
    console.log("Parameters:", parameters);
  }
}

// Optional: Log the current configuration
console.log("Database Configuration:", {
  isProduction,
  connectionString: CONNECTION_CONFIG.connectionString,
  sslEnabled: !!CONNECTION_CONFIG.ssl,
  poolSize: CONNECTION_CONFIG.max,
});
