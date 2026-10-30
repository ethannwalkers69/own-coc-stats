const { Pool } = require('pg');
const config = require('./env');

// Neon requires SSL; the connection string already contains sslmode=require.
const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: { rejectUnauthorized: true },
  max: 5,
  idleTimeoutMillis: 30000,
});
pool.on('error', (e) => console.error('[db] idle client error:', e.message));
module.exports = pool;
