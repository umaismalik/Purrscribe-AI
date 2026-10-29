import sql from "mssql";
import dotenv from 'dotenv';

// Load .env from parent directory
import path from 'path';

import { fileURLToPath } from 'url';

// Polyfill __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const dbConfig = {
  server: process.env.AZURE_SQL_SERVER,
  database: process.env.AZURE_SQL_DATABASE,
  user: process.env.AZURE_SQL_USER,
  password: process.env.AZURE_SQL_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: false,
    enableArithAbort: true
  },
  pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
  }
};

let pool;
export async function getPool() {
  if (pool) return pool;
  try {
    pool = await sql.connect(dbConfig); 
    console.log("✅ Connected to Azure SQL Database");
    return pool;
  } catch (err) {
    console.error("❌ Database connection failed:", err);
    throw err;
  }
}

export { sql, dbConfig };
