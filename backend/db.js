// db.js - Shared PostgreSQL pool for all routers
const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	throw new Error('DATABASE_URL is required. Set it in your environment before starting the backend.');
}

const sslDisabled = String(process.env.PGSSLMODE || '').trim().toLowerCase() === 'disable';
const rejectUnauthorized = String(process.env.PGSSL_REJECT_UNAUTHORIZED || '').trim().toLowerCase() === 'false'
	? false
	: process.env.NODE_ENV === 'production';

const poolConfig = {
	connectionString: DATABASE_URL
};

if (!sslDisabled) {
	poolConfig.ssl = { rejectUnauthorized };
}

const pool = new Pool(poolConfig);

module.exports = pool;
