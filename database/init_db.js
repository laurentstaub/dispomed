import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dbQuery } from './connect_db.js';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initializeDatabase() {
  try {
    console.log('Starting database initialization...');
    
    // Read the SQL file
    const sqlFilePath = path.join(__dirname, 'init_schema.sql');
    const sqlScript = fs.readFileSync(sqlFilePath, 'utf8');
    
    // Execute the SQL script
    await dbQuery(sqlScript);
    
    console.log('Database schema initialized successfully!');
  } catch (error) {
    console.error('Error initializing database schema:', error);
    process.exit(1);
  }
}

// Run the initialization
initializeDatabase();