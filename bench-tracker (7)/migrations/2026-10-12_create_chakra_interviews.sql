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
