import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, './.env') });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is not set in .env');
  process.exit(1);
}

if (connectionString.includes('<your_windows_pg_password>')) {
  console.error('\n[Error] Please replace "<your_windows_pg_password>" in your .env file with your actual Windows PostgreSQL password.');
  process.exit(1);
}

// Parse the connection string to connect to the default 'postgres' database first
const url = new URL(connectionString);
url.pathname = '/postgres'; // Connect to default database

async function createDb() {
  console.log(`Connecting to PostgreSQL to create "jobagent" database...`);
  const client = new pg.Client({ connectionString: url.toString() });
  
  await client.connect();
  
  try {
    const { rows } = await client.query("SELECT 1 FROM pg_database WHERE datname = 'jobagent'");
    if (rows.length > 0) {
      console.log('Database "jobagent" already exists.');
    } else {
      await client.query('CREATE DATABASE jobagent');
      console.log('Successfully created database "jobagent"!');
    }
  } catch (err) {
    console.error('Failed to create database:', err);
  } finally {
    await client.end();
  }
}

createDb();
