import pg from 'pg';
const { Pool } = pg;
import { drizzle as drizzleNodePostgres } from 'drizzle-orm/node-postgres';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePgLite } from 'drizzle-orm/pglite';
import * as schema from './schema.ts';

export const DDL_STATEMENTS = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    uid TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS mentors (
    id SERIAL PRIMARY KEY,
    employee_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    designation TEXT,
    domain_expertise TEXT NOT NULL DEFAULT '[]',
    years_of_experience REAL,
    max_capacity INTEGER NOT NULL DEFAULT 4,
    status TEXT NOT NULL DEFAULT 'Active',
    profile_photo TEXT,
    location TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    employee_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    joining_date TEXT NOT NULL,
    designation TEXT NOT NULL DEFAULT 'Consultant',
    employee_type TEXT NOT NULL,
    status TEXT NOT NULL,
    skill_group TEXT,
    persona TEXT NOT NULL DEFAULT 'Data Engineer',
    skills TEXT NOT NULL DEFAULT '[]',
    bench_aging_days INTEGER DEFAULT 0,
    years_of_experience REAL NOT NULL,
    previous_project_history TEXT,
    assigned_mentor TEXT,
    current_project TEXT NOT NULL,
    python_level TEXT NOT NULL DEFAULT 'Beginner',
    sql_level TEXT NOT NULL DEFAULT 'Beginner',
    spark_level TEXT NOT NULL DEFAULT 'Beginner',
    pyspark_level TEXT NOT NULL DEFAULT 'Beginner',
    program_enrollment_date TEXT,
    location TEXT,
    module TEXT,
    secondary_module TEXT,
    excel_source_active BOOLEAN NOT NULL DEFAULT TRUE,
    overall_score REAL,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS mock_interviews (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    date TEXT NOT NULL,
    mentor_name TEXT NOT NULL,
    mock_number TEXT NOT NULL,
    topic TEXT NOT NULL,
    tech_accuracy INTEGER NOT NULL,
    problem_solving_speed INTEGER NOT NULL,
    code_quality INTEGER NOT NULL,
    communication INTEGER NOT NULL,
    conceptual_understanding INTEGER NOT NULL,
    confidence_level INTEGER NOT NULL,
    overall_score REAL NOT NULL,
    feedback TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    session_name TEXT NOT NULL,
    session_date TEXT NOT NULL,
    topic TEXT NOT NULL,
    subtopic TEXT,
    status TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS mentor_sessions (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    session_number INTEGER NOT NULL,
    session_date TEXT NOT NULL,
    duration TEXT NOT NULL,
    mode TEXT NOT NULL,
    topics TEXT NOT NULL,
    sub_topics TEXT NOT NULL,
    resources TEXT NOT NULL,
    mentor_notes TEXT NOT NULL,
    prev_session_id INTEGER,
    q1_completed TEXT,
    q2_retained TEXT,
    q3_readiness TEXT,
    follow_up_remarks TEXT,
    resources_overdue INTEGER DEFAULT 0,
    retention_issue INTEGER DEFAULT 0,
    python_tech_accuracy INTEGER,
    python_problem_solving INTEGER,
    python_code_quality INTEGER,
    python_conceptual INTEGER,
    python_communication INTEGER,
    python_avg_score REAL,
    sql_tech_accuracy INTEGER,
    sql_problem_solving INTEGER,
    sql_code_quality INTEGER,
    sql_conceptual INTEGER,
    sql_communication INTEGER,
    sql_avg_score REAL,
    spark_tech_accuracy INTEGER,
    spark_problem_solving INTEGER,
    spark_code_quality INTEGER,
    spark_conceptual INTEGER,
    spark_communication INTEGER,
    spark_avg_score REAL,
    overall_score REAL NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS hackerrank_exams (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    test_id TEXT NOT NULL,
    test_name TEXT NOT NULL,
    triggered_at TIMESTAMP DEFAULT NOW(),
    triggered_by TEXT NOT NULL,
    status TEXT NOT NULL,
    completed_at TIMESTAMP,
    score REAL,
    raw_response TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS chakra_interviews (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    interviewer_id TEXT NOT NULL,
    interviewer_name TEXT NOT NULL,
    invitation_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Invite Prepared',
    triggered_at TIMESTAMP DEFAULT NOW(),
    triggered_by TEXT NOT NULL,
    invited_at TIMESTAMP,
    completed_at TIMESTAMP,
    score REAL,
    recommendation TEXT,
    report_url TEXT,
    raw_response TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  );
`;

let pgliteInstance: PGlite | null = null;
let pool: pg.Pool | null = null;
let activeDb: any = null;

// Proxy db to the active Drizzle instance
export const db: any = new Proxy({} as any, {
  get(_target, prop) {
    if (!activeDb) {
      if (!pgliteInstance) {
        pgliteInstance = new PGlite();
      }
      activeDb = drizzlePgLite(pgliteInstance, { schema });
    }
    const val = activeDb[prop];
    if (typeof val === 'function') {
      return val.bind(activeDb);
    }
    return val;
  }
});

/**
 * Creates connection pool configuration for PostgreSQL.
 * For Neon and remote production databases, enables TLS encryption with standard
 * certificate authority verification (rejectUnauthorized remains true).
 */
export function createPoolConfig(connectionString: string, defaultMax = 10): pg.PoolConfig {
  const isSslRequired = connectionString.includes('sslmode=require') 
    || connectionString.includes('neon.tech') 
    || process.env.NODE_ENV === 'production';

  const max = Number(process.env.DB_POOL_MAX) || defaultMax;

  return {
    connectionString,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Enable TLS with standard CA validation (Let's Encrypt / Amazon Root CA verified by Node.js runtime)
    ssl: isSslRequired ? true : undefined,
  };
}

export type InitDatabaseOptions = {
  runDdl?: boolean;
  connectionString?: string;
};

export const initDatabase = async (options?: InitDatabaseOptions) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const connectionString = options?.connectionString || process.env.DATABASE_URL;

  if (isProduction && process.env.TEST_DB !== 'true') {
    // Production requirement: strict PostgreSQL via DATABASE_URL; fail clearly if connection fails.
    if (!connectionString) {
      throw new Error('[Database] DATABASE_URL environment variable is required in production. Please configure your production PostgreSQL connection string.');
    }

    try {
      console.log('[Database] Connecting to production PostgreSQL database...');
      const prodPool = new Pool(createPoolConfig(connectionString, 10));

      await prodPool.query('SELECT 1');

      // Stage B runtime separation:
      // If runDdl is explicitly true or DB_AUTO_DDL=true (Stage A admin mode), run DDL.
      // Otherwise (standard Cloud Run application runtime with talentlens_app), skip DDL
      // and verify table presence via a read query so restricted permissions are never violated.
      const shouldRunDdl = options?.runDdl ?? (process.env.DB_AUTO_DDL === 'true');

      if (shouldRunDdl) {
        console.log('[Database] Executing idempotent DDL schema check...');
        await prodPool.query(DDL_STATEMENTS);
        console.log('[Database] DDL schema verified.');
      } else {
        // Application runtime mode: non-destructive table validation
        try {
          await prodPool.query('SELECT 1 FROM employees LIMIT 1');
          console.log('[Database] Verified existing schema for runtime user (talentlens_app).');
        } catch (schemaErr: any) {
          if (schemaErr.code === '42P01') {
            throw new Error('[Database] Required tables do not exist in the production database. Please execute Stage A administrative initialisation (npm run db:admin:init) with neondb_owner credentials first.');
          }
          throw schemaErr;
        }
      }

      pool = prodPool;
      activeDb = drizzleNodePostgres(pool, { schema });
      console.log('[Database] Production PostgreSQL connection active.');
      return;
    } catch (err: any) {
      console.error('[Database] Production PostgreSQL connection failed:', err.message);
      throw new Error(`[Database] Production PostgreSQL connection failed: ${err.message}. Refusing to fall back to an ephemeral database in production.`);
    }
  }

  // Non-production (development / test) environment:
  // If an external DATABASE_URL is configured and not pointing to localhost, try connecting.
  if (connectionString && !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1')) {
    try {
      const devPool = new Pool(createPoolConfig(connectionString, 5));
      await devPool.query('SELECT 1');
      const shouldRunDdl = options?.runDdl ?? (process.env.DB_AUTO_DDL === 'true');
      if (shouldRunDdl) {
        await devPool.query(DDL_STATEMENTS);
      } else {
        await devPool.query('SELECT 1 FROM employees LIMIT 1');
      }
      pool = devPool;
      activeDb = drizzleNodePostgres(pool, { schema });
      console.log('[Database] Connected to external PostgreSQL database.');
      return;
    } catch (err: any) {
      console.warn('[Database] External PostgreSQL connection failed in development:', err.message, '- falling back to embedded PGlite.');
    }
  }

  // Development fallback to embedded PGlite
  try {
    if (!pgliteInstance) {
      pgliteInstance = new PGlite();
    }
    await pgliteInstance.exec(DDL_STATEMENTS);
    activeDb = drizzlePgLite(pgliteInstance, { schema });
    console.log('[Database] Initialized embedded PostgreSQL (PGlite) for development. Tables are ready.');
  } catch (error: any) {
    console.error('[Database] Failed to initialize PGlite:', error);
    throw error;
  }
};

export const closeDatabase = async () => {
  if (pool) {
    await pool.end();
  } else if (pgliteInstance) {
    await pgliteInstance.close();
  }
};
