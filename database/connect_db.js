import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const { Client } = pg;

// Get the directory name of the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Function to load SQL from file
export function loadSqlFile(filePath) {
  const fullPath = path.resolve(__dirname, '..', filePath);
  return fs.readFileSync(fullPath, 'utf8');
}

const isProduction = process.env.NODE_ENV === "production";

const CONNECTION = {
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
};

export async function dbQuery(statement, ...parameters) {
  const client = new Client(CONNECTION);

  try {
    await client.connect();
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
    await client.end();
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
  connectionString: CONNECTION.connectionString,
  sslEnabled: !!CONNECTION.ssl,
});
