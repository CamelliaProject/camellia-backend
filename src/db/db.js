import pg from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const { Pool } = pg;

// Create a connection pool using your local .env DATABASE_URL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// Test connection logging
pool.on('connect', () => {
    console.log('New PostgreSQL client connected safely!');
});

export default pool;