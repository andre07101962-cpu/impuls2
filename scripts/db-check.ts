
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load env vars manually to be sure
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('📄 Loaded .env file');
} else {
  console.error('❌ .env file not found at:', envPath);
}

async function checkConnection(name: string, connectionString: string | undefined) {
  console.log(`\nTesting ${name}...`);
  
  if (!connectionString) {
    console.error(`❌ ${name} is missing in .env`);
    return;
  }

  // Mask password for log
  const masked = connectionString.replace(/:([^:@]+)@/, ':****@');
  console.log(`🔗 Connecting to: ${masked}`);

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }, // Required for Supabase
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    const res = await client.query('SELECT NOW() as now');
    console.log(`✅ ${name} SUCCESS! Database time: ${res.rows[0].now}`);
    await client.end();
  } catch (err: any) {
    console.error(`❌ ${name} FAILED:`);
    console.error(`   Code: ${err.code}`);
    console.error(`   Message: ${err.message}`);
    if (err.message.includes('Tenant or user not found')) {
        console.error('   💡 HINT: This usually means you are using the wrong Host (Pooler instead of Direct) or the project is paused.');
    }
    if (err.code === 'ECONNREFUSED') {
        console.error('   💡 HINT: Network blocked or wrong port.');
    }
  }
}

(async () => {
  console.log('--- 🛠️ DATABASE CONNECTION DIAGNOSTIC 🛠️ ---');
  
  // 1. Check Transaction Pooler (Port 6543)
  await checkConnection('DATABASE_URL (Pooler)', process.env.DATABASE_URL);

  // 2. Check Direct Connection (Port 5432)
  await checkConnection('DIRECT_URL (Session)', process.env.DIRECT_URL);
  
  console.log('\n--- END ---');
})();
