import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load env vars
const envPath = path.resolve('.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

async function inspect() {
  console.log('🕵️‍♀️ STARTING DEEP DATABASE INSPECTION...');
  
  // Use Direct Connection for Schema Inspection
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

  if (!connectionString) {
      console.error('❌ No DB Connection String found in .env');
      return;
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    console.log('\n=== 1. CHECKING ENUM VALUES (CRITICAL) ===');
    // This query pulls the ACTUAL allowed values for enums from Postgres system tables
    const enumQuery = `
      SELECT t.typname as enum_name, e.enumlabel as value
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname IN ('post_type', 'post_type_enum', 'scheduled_publications_status_enum', 'pub_status_enum', 'publication_status')
      ORDER BY t.typname, e.enumsortorder;
    `;
    const enumRes = await client.query(enumQuery);
    
    const enums: Record<string, string[]> = {};
    enumRes.rows.forEach(row => {
        if (!enums[row.enum_name]) enums[row.enum_name] = [];
        enums[row.enum_name].push(row.value);
    });
    console.table(enums);

    console.log('\n=== 2. CHECKING CRITICAL COLUMNS ===');
    // Verify specific columns exist in scheduled_publications
    const columnsQuery = `
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name IN ('scheduled_publications', 'posts')
      AND column_name IN ('delete_at', 'delete_job_id', 'job_id', 'type', 'content_payload')
      ORDER BY table_name;
    `;
    const colRes = await client.query(columnsQuery);
    console.table(colRes.rows);

    console.log('\n=== 3. RAW JSON DUMP (For AI Analysis) ===');
    const dump = {
        enums_found: enums,
        columns_found: colRes.rows.map(r => `${r.table_name}.${r.column_name} (${r.data_type})`)
    };
    console.log(JSON.stringify(dump, null, 2));

  } catch (err: any) {
    console.error('❌ Inspection Failed:', err.message);
  } finally {
    await client.end();
  }
}

inspect();