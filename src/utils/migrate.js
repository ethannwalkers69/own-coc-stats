// Usage: npm run migrate  -> runs database/schema.sql against DATABASE_URL
const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

(async () => {
  try {
    const sql = fs.readFileSync(path.join(__dirname, '../../database/schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('Schema applied.');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
