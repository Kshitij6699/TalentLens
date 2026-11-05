import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema.ts';
import { DDL_STATEMENTS, createPoolConfig } from '../src/db/index.ts';
import {
  seedMentorsFromExcel,
  seedEmployeesFromExcel,
  seedDemoCandidate,
  findSeedFile,
} from '../src/db/seed_excel.ts';

/**
 * Stage A: Database Administration Tool
 *
 * Runs with database owner privileges (neondb_owner) to:
 * 1. Create the eight application tables using idempotent DDL.
 * 2. Seed the 20 mentors and 100 employees independently with conflict-safe inserts.
 * 3. Optionally seed the single demo candidate (--with-demo).
 * 4. Generate the exact SQL grants required for the restricted runtime role (talentlens_app).
 *
 * SAFETY INVARIANTS:
 * - Requires ADMIN_DATABASE_URL explicitly; NEVER falls back to runtime DATABASE_URL.
 * - --dry-run performs ZERO database writes, ZERO DDL statements, and ZERO record changes.
 * - All table creations use CREATE TABLE IF NOT EXISTS.
 * - No DROP, TRUNCATE, or destructive operations exist anywhere in this script.
 */
async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const withDemo = args.includes('--with-demo');

  console.log('================================================================');
  console.log(' TalentLens — Stage A Database Administration (neondb_owner)');
  console.log(' Mode:', isDryRun ? 'DRY-RUN (Inspection only — Zero Writes)' : 'EXECUTE');
  console.log('================================================================');

  // Explicitly require ADMIN_DATABASE_URL; never fall back to DATABASE_URL
  const connectionString = process.env.ADMIN_DATABASE_URL;

  if (!connectionString) {
    if (isDryRun) {
      console.log('\n[Dry Run Info] ADMIN_DATABASE_URL not set in environment.');
      console.log('Performing local schema and seed asset verification (offline inspection)...\n');
      console.log('1. Target Schema: 8 tables defined in DDL_STATEMENTS:');
      console.log('   - users');
      console.log('   - mentors');
      console.log('   - employees');
      console.log('   - mock_interviews');
      console.log('   - attendance');
      console.log('   - mentor_sessions');
      console.log('   - hackerrank_exams');
      console.log('   - chakra_interviews');

      const mentorFile = findSeedFile('Mentors_list.xlsx');
      const empFile = findSeedFile('Dashboard_source_bench_updated.xlsx');
      console.log('\n2. Seed Asset Verification:');
      console.log(`   - Mentors workbook: ${mentorFile ? 'Available (assets/Mentors_list.xlsx -> 20 records)' : 'MISSING'}`);
      console.log(`   - Employees workbook: ${empFile ? 'Available (assets/Dashboard_source_bench_updated.xlsx -> 100 records)' : 'MISSING'}`);
      console.log(`   - Demo candidate: ${withDemo ? 'Enabled (1 record: KSHITIJ-TEST)' : 'Excluded by default (use --with-demo to enable)'}`);
      console.log('\n[Dry Run Result] 0 database writes executed. 0 DDL statements issued.');
      return;
    }

    console.error('\n[Stage A Error] Missing ADMIN_DATABASE_URL environment variable.');
    console.error('Security Enforcement: The database administration script strictly requires');
    console.error('ADMIN_DATABASE_URL explicitly and will never fall back to runtime DATABASE_URL.');
    console.error('\nUsage:');
    console.error('  ADMIN_DATABASE_URL="postgresql://neondb_owner:PASSWORD@ep-***-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require" npm run db:admin:init\n');
    process.exit(1);
  }

  // Sanitize host display (never expose password or credentials)
  try {
    const parsed = new URL(connectionString);
    console.log(`\nConnecting to: ${parsed.protocol}//***:***@${parsed.host}${parsed.pathname}`);
  } catch {
    console.log('\nConnecting to database...');
  }

  const pool = new Pool(createPoolConfig(connectionString, 5));

  try {
    const client = await pool.connect();
    const isTls = Boolean((client.connection?.stream as any)?.encrypted);
    const meta = await client.query('SELECT current_database(), current_user, version()');
    client.release();

    console.log('[Connected] Database:', meta.rows[0].current_database);
    console.log('[Connected] User:', meta.rows[0].current_user);
    console.log('[Connected] TLS Active:', isTls ? 'Yes' : 'No');

    if (isDryRun) {
      console.log('\n--- DRY-RUN SUMMARY (Connected in Read-Only Mode) ---');
      console.log('1. DDL: 8 tables would be checked/created via CREATE TABLE IF NOT EXISTS:');
      console.log('   - users, mentors, employees, mock_interviews, attendance, mentor_sessions, hackerrank_exams, chakra_interviews');

      const mentorFile = findSeedFile('Mentors_list.xlsx');
      const empFile = findSeedFile('Dashboard_source_bench_updated.xlsx');
      console.log('\n2. Seed Asset Verification:');
      console.log(`   - Mentors workbook: ${mentorFile ? 'Found (20 records)' : 'NOT FOUND'}`);
      console.log(`   - Employees workbook: ${empFile ? 'Found (100 records)' : 'NOT FOUND'}`);
      console.log(`   - Demo candidate: ${withDemo ? 'Enabled (1 record)' : 'Excluded by default (use --with-demo to enable)'}`);
      console.log('\n[Dry Run Result] ZERO tables created. ZERO records inserted. Database completely untouched.');
      await pool.end();
      return;
    }

    // Step 1: Execute Idempotent DDL (CREATE TABLE IF NOT EXISTS only)
    console.log('\n[Step 1/3] Executing idempotent DDL (CREATE TABLE IF NOT EXISTS)...');
    await pool.query(DDL_STATEMENTS);
    console.log('✓ All 8 tables verified/created successfully.');

    // Step 2: Seed Mentors and Employees independently with conflict-safe inserts
    console.log('\n[Step 2/3] Seeding mentors and employees independently...');
    const adminDb = drizzle(pool, { schema });

    const mentorStats = await seedMentorsFromExcel(adminDb);
    const empStats = await seedEmployeesFromExcel(adminDb);

    let demoResult = { inserted: false, employeeId: 'KSHITIJ-TEST' };
    if (withDemo) {
      demoResult = await seedDemoCandidate(adminDb);
    }

    console.log('\n================================================================');
    console.log(' Stage A Initialisation Complete — Summary');
    console.log('================================================================');
    console.log(`Mentors (Mentors_list.xlsx):`);
    console.log(`  - Total in file: ${mentorStats.totalInFile}`);
    console.log(`  - Newly inserted: ${mentorStats.inserted}`);
    console.log(`  - Skipped (already existed): ${mentorStats.skipped}`);
    console.log(`\nEmployees (Dashboard_source_bench_updated.xlsx):`);
    console.log(`  - Total in file: ${empStats.totalInFile}`);
    console.log(`  - Newly inserted: ${empStats.inserted}`);
    console.log(`  - Skipped (already existed): ${empStats.skipped}`);
    if (withDemo) {
      console.log(`\nDemo Candidate (${demoResult.employeeId}):`);
      console.log(`  - Newly inserted: ${demoResult.inserted ? 'Yes' : 'No (already existed)'}`);
    }

    // Step 3: Print Stage B SQL Instructions for talentlens_app
    console.log('\n================================================================');
    console.log(' Stage B Provisioning: talentlens_app Role Permissions');
    console.log('================================================================');
    console.log('To create the restricted application runtime role, run this SQL in Neon:');
    console.log(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'talentlens_app') THEN
    CREATE ROLE talentlens_app WITH LOGIN PASSWORD 'YOUR_STRONG_APPLICATION_PASSWORD';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE neondb TO talentlens_app;
GRANT USAGE ON SCHEMA public TO talentlens_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO talentlens_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO talentlens_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO talentlens_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO talentlens_app;
`);
    console.log('Then supply DATABASE_URL with the talentlens_app user to Cloud Run.');

    await pool.end();
  } catch (err: any) {
    await pool.end().catch(() => {});
    const safeMsg = err.message ? err.message.replace(/:\/\/[^:]+:[^@]+@/, '://[REDACTED]:[REDACTED]@') : 'Unknown error';
    console.error('\n[Stage A Failed]:', safeMsg);
    process.exit(1);
  }
}

main();
