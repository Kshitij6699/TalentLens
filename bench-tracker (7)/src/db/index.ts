import { createRequire } from 'node:module';
import * as schema from './schema.ts';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('[Database] DATABASE_URL is missing. Add it to your project-root .env file.');
}

// A real PostgreSQL connection. Data persists in the local PostgreSQL data directory.
export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (error: Error) => {
  console.error('[Database] Unexpected PostgreSQL pool error:', error.message);
});

export const db = drizzle(pool, { schema });

// Idempotently create the tables used by the demo. This does not delete existing records.
export const initDatabase = async () => {
  try {
    await pool.query('SELECT 1');
    await pool.query(`
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
  `);
    console.log('[Database] PostgreSQL connection verified and tables are ready.');
  } catch (error: any) {
    console.error('[Database] Failed to initialize PostgreSQL. Verify DATABASE_URL, credentials, and that PostgreSQL is running.');
    throw error;
  }
};

export const closeDatabase = async () => {
  await pool.end();
};
