const { Pool } = require('pg');
require('dotenv').config();

// PostgreSQL Connection Pool
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'pathology_saas',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

// Helper function to execute queries
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('📊 Executed query', { text: text.substring(0, 100), duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('❌ Query error:', error);
    throw error;
  }
};

// Helper function to get a client from the pool (for transactions)
const getClient = async () => {
  const client = await pool.connect();
  const query = client.query.bind(client);
  const release = client.release.bind(client);
  
  // Set a timeout of 5 seconds, after which we will log this client's last query
  const timeout = setTimeout(() => {
    console.error('⚠️ A client has been checked out for more than 5 seconds!');
  }, 5000);
  
  // Monkey patch the query method to keep track of the last query executed
  client.query = (...args) => {
    client.lastQuery = args;
    return query(...args);
  };
  
  client.release = () => {
    clearTimeout(timeout);
    // Set the methods back to their old un-monkey-patched version
    client.query = query;
    client.release = release;
    return release();
  };
  
  return client;
};

// Transaction helper
const transaction = async (callback) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Set lab context for Row-Level Security
const setLabContext = async (client, labId) => {
  if (labId) {
    await client.query(`SET LOCAL app.current_lab_id = '${labId}'`);
  }
};

// Initialize database (run schema if needed)
const initializeDatabase = async () => {
  try {
    console.log('🔄 Checking database connection...');
    const result = await query('SELECT NOW()');
    console.log('✅ Database connected at:', result.rows[0].now);
    
    // Check if tables exist
    const tablesCheck = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'labs'
    `);
    
    if (tablesCheck.rows.length === 0) {
      console.log('⚠️ Tables not found. Please run the schema migration:');
      console.log('   psql -U postgres -d pathology_saas -f back-end/database/postgres-schema.sql');
    } else {
      console.log('✅ Database tables exist');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Database initialization error:', error.message);
    return false;
  }
};

module.exports = {
  pool,
  query,
  getClient,
  transaction,
  setLabContext,
  initializeDatabase
};

