import pg from "pg";
const { Client } = pg;

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
    const result = await client.query(statement, parameters);
    return result;
  } catch (error) {
    console.error("Database query error:", error);
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
