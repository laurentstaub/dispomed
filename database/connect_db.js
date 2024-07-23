// const { Client } = require('pg');
import pg from 'pg';
const { Client } = pg;

const CONNECTION = {
  user: 'laurentstaub',
  host: 'localhost',
  database: 'incidents',
  port: 5432,
}

const client = new Client(CONNECTION);

async function connectAndQuery() {
  try {
    // Connect to the database
    await client.connect();
    console.log('Connected to the database');

    // Perform a sample query
    const result = await client.query('SELECT * FROM incidents LIMIT 5');
    console.log('Query result:', result.rows);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Close the connection
    await client.end();
    console.log('Disconnected from the database');
  }
}
