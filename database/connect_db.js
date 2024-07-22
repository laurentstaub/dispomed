// const { Client } = require('pg');
import pg from 'pg';
const { Client } = pg;

const client = new Client({
  user: 'your_username',
  host: 'localhost',
  database: 'your_database',
  password: '***REMOVED***',
  port: 5432,
});
