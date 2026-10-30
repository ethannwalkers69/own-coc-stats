const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config/env');
const pool = require('./config/database');
const playerRoutes = require('./routes/player');
const { syncSnapshot } = require('./services/playerService');

const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy

// CSP allows only the CDNs the frontend uses.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://cdn.tailwindcss.com', 'https://unpkg.com', 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      upgradeInsecureRequests: null,
    },
  },
}));

// Health check for Render (does not call the Clash API).
app.get('/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', db: 'up' }); }
  catch (e) { res.status(503).json({ status: 'degraded', db: 'down' }); }
});

app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false }), playerRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use(express.static(path.join(__dirname, '../public')));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Internal server error' }); });

app.listen(config.port, () => {
  console.log(`Clash Stats on port ${config.port} for ${config.playerTag}`);
  if (!config.token || !config.databaseUrl) return;
  // Snapshot shortly after boot, then on an interval (Render free instances sleep; see README).
  setTimeout(() => syncSnapshot('startup'), 5000);
  setInterval(() => syncSnapshot('schedule'), config.snapshotHours * 3600 * 1000);
});
