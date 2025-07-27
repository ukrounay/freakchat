// db.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://nemeleon_user:urIoOJzib3cEDMrhKtKNp465bXPXNqEY@dpg-d22juondiees73dg7lu0-a.oregon-postgres.render.com/nemeleon',
});

module.exports = { pool };
