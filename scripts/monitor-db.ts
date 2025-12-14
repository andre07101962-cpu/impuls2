import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load env
const envPath = path.resolve('.env');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

async function monitor() {
  console.log('📊 DATABASE CONNECTION MONITOR');
  console.log('------------------------------');

  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
      console.error('❌ No DB URL found');
      return;
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();

    // 1. Total Connections
    const resTotal = await client.query(`
      SELECT count(*) as total_connections 
      FROM pg_stat_activity;
    `);

    // 2. Active vs Idle
    const resStates = await client.query(`
      SELECT state, count(*) 
      FROM pg_stat_activity 
      GROUP BY state;
    `);

    // 3. Max Configured
    const resMax = await client.query(`SHOW max_connections;`);

    console.log(`\n🔌 Active Connections: ${resTotal.rows[0].total_connections} / ${resMax.rows[0].max_connections}`);
    console.table(resStates.rows);

    if (parseInt(resTotal.rows[0].total_connections) > 80) {
        console.warn('⚠️ WARNING: DB is reaching connection limit! Consider using PgBouncer (Transaction Mode).');
    } else {
        console.log('✅ Status: Healthy');
    }

  } catch (e: any) {
    console.error('Check failed:', e.message);
  } finally {
    await client.end();
  }
}

monitor();