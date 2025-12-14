import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load env vars
const envPath = path.resolve('.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

async function runMigration() {
  console.log('🛠 Starting Schema Fix...');
  
  if (!process.env.DIRECT_URL) {
      console.error('❌ DIRECT_URL is missing in .env');
      return;
  }

  const client = new Client({
    connectionString: process.env.DIRECT_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('✅ Connected to Database.');

    // 1. Add 'poll'
    try {
        console.log('🔄 Adding "poll" to post_type...');
        await client.query("ALTER TYPE post_type ADD VALUE IF NOT EXISTS 'poll'");
        console.log('   ✔ Done.');
    } catch (e: any) {
        console.log(`   ℹ️ Note: ${e.message}`);
    }

    // 2. Add 'document'
    try {
        console.log('🔄 Adding "document" to post_type...');
        await client.query("ALTER TYPE post_type ADD VALUE IF NOT EXISTS 'document'");
        console.log('   ✔ Done.');
    } catch (e: any) {
        console.log(`   ℹ️ Note: ${e.message}`);
    }

    console.log('✨ Schema updated successfully.');

  } catch (err: any) {
    console.error('❌ Migration Failed:', err.message);
  } finally {
    await client.end();
  }
}

runMigration();