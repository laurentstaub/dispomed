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

export async function dbQuery(statement, ...parameters) {
  const client = new Client(CONNECTION);

  try {
    await client.connect();
    logQuery(statement, parameters);
    const result = await client.query(statement, parameters);
    return result;
  } finally {
    await client.end();
  }
}

function logQuery(statement, parameters) {
  console.log('Executing query:', statement);
  if (parameters.length > 0) {
    console.log('Parameters:', parameters);
  }
}
