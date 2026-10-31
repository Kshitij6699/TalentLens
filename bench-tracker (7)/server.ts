import 'dotenv/config';
import { createRequire } from 'node:module';
import express from 'express';
import path from 'path';
import { readFileSync } from 'node:fs';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import * as XLSXModule from 'xlsx';
const XLSX = (XLSXModule as any).default || XLSXModule;
import { db, initDatabase } from './src/db/index.ts';
import { users, employees, mockInterviews, attendance, mentorSessions, mentors, hackerrankExams, chakraInterviews } from './src/db/schema.ts';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from './firebase-applet-config.json';
import { seedFromExcelFiles, mapExcelLevelToDesignation, getDesignationRank, getSeedStatus } from './src/db/seed_excel.ts';

const require = createRequire(import.meta.url);
const { eq, desc, and } = require('drizzle-orm');

// Initialize Firebase Admin
if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}
const adminAuth = getAuth();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Type-safe Request customization
export interface AuthRequest extends express.Request {
  user?: {
    uid: string;
    email: string;
    name: string;
    role: string;
    id?: number; // DB serial primary key
  };
}

// Authentication Middleware
const authenticateUser = async (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  const mockRoleHeader = req.headers['x-mock-role'] || req.headers['x-simulated-role'];
  const mockEmailHeader = req.headers['x-mock-email'] || req.headers['x-simulated-email'];

  // 1. Support Mock Login for development/testing and seamless role-based navigation
  if (mockRoleHeader) {
    const role = String(mockRoleHeader).toLowerCase();
    const email = mockEmailHeader ? String(mockEmailHeader) : `${role}@example.com`;
    const name = mockEmailHeader 
      ? String(mockEmailHeader).split('@')[0].toUpperCase() 
      : `${role.toUpperCase()} (Mock User)`;

    // Check if user exists in database
    let dbUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
    let userId: number;

    if (dbUser.length === 0) {
      const inserted = await db.insert(users).values({
        uid: `mock_uid_${role}_${Date.now()}`,
        email,
        name,
        role,
      }).returning();
      userId = inserted[0].id;
    } else {
      userId = dbUser[0].id;
      // Keep role updated
      if (dbUser[0].role !== role) {
        await db.update(users).set({ role }).where(eq(users.id, userId));
      }
    }

    req.user = {
      uid: `mock_uid_${role}`,
      email,
      name,
      role,
      id: userId,
    };
    return next();
  }

  // 2. Real Google Sign-In / Firebase token verification
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    const email = decodedToken.email || '';
    const name = decodedToken.name || 'DE Resource';

    // Look up user in SQL database
    let dbUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
    let userRecord;

    if (dbUser.length === 0) {
      // Determine user role
      let role = 'mentor'; // default

      // Bootstrapped Admin check
      if (email === 'sharmisthasinghroy@gmail.com') {
        role = 'admin';
      }

      const inserted = await db.insert(users).values({
        uid: decodedToken.uid,
        email,
        name,
        role,
      }).returning();
      userRecord = inserted[0];
    } else {
      userRecord = dbUser[0];
    }

    req.user = {
      uid: decodedToken.uid,
      email,
      name,
      role: userRecord.role,
      id: userRecord.id,
    };
    next();
  } catch (error) {
    console.error('Firebase Auth verification failed:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

// ==========================================
// API ROUTES
// ==========================================

// Auth profile endpoint
app.get('/api/auth/me', authenticateUser, (req: AuthRequest, res) => {
  res.json({ user: req.user });
});

// Auth login endpoint
app.post('/api/auth/login', authenticateUser, (req: AuthRequest, res) => {
  res.json({ user: req.user });
});

// Update Role (for mock testing / admin commands)
app.post('/api/auth/role', authenticateUser, async (req: AuthRequest, res) => {
  const { role, email } = req.body;
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Only admins can alter user roles' });
  }

  try {
    await db.update(users).set({ role }).where(eq(users.email, email));
    res.json({ message: `Successfully updated ${email} to ${role}` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

function getLevelBaseline(level: string) {
  switch (level) {
    case 'Expert': return 4.5;
    case 'Advanced': return 3.5;
    case 'Intermediate': return 2.5;
    default: return 1.5;
  }
}

function getEnrollmentDuration(startValue: string | null | undefined, referenceDate = new Date()) {
  if (!startValue) return { weeksEnrolled: 0, daysEnrolled: 0 };

  // Treat YYYY-MM-DD values as calendar dates, not timezone-sensitive timestamps.
  const match = String(startValue).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { weeksEnrolled: 0, daysEnrolled: 0 };
  const [, year, month, day] = match;
  const startUtc = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const todayUtc = Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate());
  if (!Number.isFinite(startUtc) || !Number.isFinite(todayUtc)) return { weeksEnrolled: 0, daysEnrolled: 0 };

  const diffDays = Math.max(0, Math.floor((todayUtc - startUtc) / 86400000));
  return {
    weeksEnrolled: Math.floor(diffDays / 7),
    daysEnrolled: diffDays % 7,
  };
}

function computeClassificationTier(
  emp: any,
  empMocks: any[],
  empAttendance: any[],
  empSessions: any[]
) {
  const startStr = emp.programEnrollmentDate || emp.joiningDate;
  const { weeksEnrolled, daysEnrolled } = getEnrollmentDuration(startStr);

  // Classification stays N/A for employees outside the training/program flow, but
  // duration is still calculated so the profile can accurately show time on bench.
  const isEnrolledOrPast = emp.status === 'Enrolled' || emp.status === 'In Training' || emp.status === 'Interview Ready' || emp.status === 'Allocated' || !!emp.programEnrollmentDate;

  if (!isEnrolledOrPast) {
    return {
      classificationTier: 'N/A' as any,
      tierReasons: [],
      pythonScore: null,
      sqlScore: null,
      sparkScore: null,
      overallScore: null,
      attendanceRate: null,
      weeksEnrolled,
      daysEnrolled,
      consecutiveResourcesOverdueCount: 0,
      resourcesOverdue: false,
      retentionIssue: false,
    };
  }

  // Use the stored overallScore from employees table
  const overallScore = emp.overallScore !== null && emp.overallScore !== undefined
    ? Number(emp.overallScore)
    : null;

  // Determine Classification Tier and reasons
  let classificationTier: 'Client Ready' | 'Allocated' | 'Needs Support' | 'Interview Ready' | 'In Training' | 'N/A' = 'In Training';
  const tierReasons: string[] = [];

  if (emp.status === 'Interview Ready') {
    classificationTier = 'Client Ready';
  } else if (emp.status === 'Allocated') {
    classificationTier = 'Allocated';
  } else {
    // Under enrollment: binary in intent (Needs Support vs Interview Ready, otherwise neutral "In Training")
    
    // TIER 3 - NEEDS SUPPORT ⚠️
    let isNeedsSupport = false;
    if (overallScore !== null && overallScore < 2.5) {
      isNeedsSupport = true;
      tierReasons.push(`Overall HackerRank score < 2.5 (Current: ${overallScore})`);
    }
    if (weeksEnrolled > 12 && emp.status !== 'Interview Ready' && emp.status !== 'Allocated') {
      isNeedsSupport = true;
      tierReasons.push(`Enrolled > 12 weeks on bench (Current: ${weeksEnrolled} weeks)`);
    }

    // TIER 1 - INTERVIEW READY (Client Ready equivalent under enrollment) ✅
    const meetsInterviewReady = overallScore !== null && overallScore >= 4.0;

    if (isNeedsSupport) {
      classificationTier = 'Needs Support';
    } else if (meetsInterviewReady) {
      classificationTier = 'Interview Ready';
    } else {
      classificationTier = 'In Training';
    }
  }

  return {
    classificationTier,
    tierReasons,
    pythonScore: null,
    sqlScore: null,
    sparkScore: null,
    overallScore,
    attendanceRate: null,
    weeksEnrolled,
    daysEnrolled,
    consecutiveResourcesOverdueCount: 0,
    resourcesOverdue: false,
    retentionIssue: false,
  };
}

async function getEnrichedEmployees() {
  const allEmps = await db.select().from(employees);
  const allMocks = await db.select().from(mockInterviews);
  const allAttendance = await db.select().from(attendance);
  const allSessions = await db.select().from(mentorSessions).orderBy(mentorSessions.sessionNumber);
  const allExams = await db.select().from(hackerrankExams).orderBy(desc(hackerrankExams.triggeredAt));
  const allChakraInterviews = await db.select().from(chakraInterviews).orderBy(desc(chakraInterviews.triggeredAt));

  return allEmps.map(emp => {
    const empMocks = allMocks.filter(m => m.employeeId === emp.id);
    const empAttendance = allAttendance.filter(a => a.employeeId === emp.id);
    const empSessions = allSessions.filter(s => s.employeeId === emp.id);
    const empExams = allExams.filter(e => e.employeeId === emp.id);
    // Drafts are not invitations. Never expose unconfirmed Invite Prepared rows as history.
    const empChakraInterviews = allChakraInterviews.filter(e => e.employeeId === emp.id && e.status !== 'Invite Prepared');

    const {
      classificationTier,
      tierReasons,
      pythonScore,
      sqlScore,
      sparkScore,
      overallScore,
      attendanceRate,
      weeksEnrolled,
      daysEnrolled,
      consecutiveResourcesOverdueCount,
      resourcesOverdue,
      retentionIssue,
    } = computeClassificationTier(emp, empMocks, empAttendance, empSessions);

    // Flags from latest session
    let managerAttentionRequired = false;
    let latestSessionDate: string | null = null;

    if (empSessions.length > 0) {
      const sorted = [...empSessions].sort((a, b) => a.sessionNumber - b.sessionNumber);
      const latest = sorted[sorted.length - 1];
      latestSessionDate = latest.sessionDate;

      // both flags 2 sessions in a row
      if (sorted.length >= 2) {
        const last1 = sorted[sorted.length - 1];
        const last2 = sorted[sorted.length - 2];
        const bothFlagsLast1 = last1.q1Completed === 'Not Completed' && last1.q2Retained === 'Weak Retention';
        const bothFlagsLast2 = last2.q1Completed === 'Not Completed' && last2.q2Retained === 'Weak Retention';
        if (bothFlagsLast1 && bothFlagsLast2) {
          managerAttentionRequired = true;
        }
      }
    }

    const startStr = emp.programEnrollmentDate || emp.joiningDate;
    let nextSessionDate: string | null = null;
    if (latestSessionDate) {
      const lastDate = new Date(latestSessionDate);
      const nextDate = new Date(lastDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      nextSessionDate = nextDate.toISOString().split('T')[0];
    } else if (startStr) {
      const nextDate = new Date(new Date(startStr).getTime() + 7 * 24 * 60 * 60 * 1000);
      nextSessionDate = nextDate.toISOString().split('T')[0];
    }

    const avgMockScore = empMocks.length > 0
      ? Number((empMocks.reduce((sum, m) => sum + m.overallScore, 0) / empMocks.length).toFixed(2))
      : null;

    let scoreTrend: 'Improving' | 'Declining' | 'Stable' | 'None' = 'None';
    if (empMocks.length >= 2) {
      const sortedMocks = [...empMocks].sort((a, b) => a.date.localeCompare(b.date));
      const prevScore = sortedMocks[sortedMocks.length - 2].overallScore;
      const lastScore = sortedMocks[sortedMocks.length - 1].overallScore;
      if (lastScore > prevScore) scoreTrend = 'Improving';
      else if (lastScore < prevScore) scoreTrend = 'Declining';
      else scoreTrend = 'Stable';
    }

    let parsedSkills: string[] = [];
    try {
      parsedSkills = JSON.parse(emp.skills || '[]');
    } catch (err) {
      parsedSkills = [];
    }

    return {
      ...emp,
      skills: parsedSkills,
      avgMockScore,
      attendanceRate,
      totalMocks: empMocks.length,
      scoreTrend,
      pythonScore,
      sqlScore,
      sparkScore,
      overallScore,
      classificationTier,
      tierReasons,
      consecutiveResourcesOverdueCount,
      managerAttentionRequired,
      resourcesOverdue,
      retentionIssue,
      latestSessionDate,
      nextSessionDate,
      weeksEnrolled,
      daysEnrolled,
      sessions: empSessions,
      mocks: empMocks,
      hackerrankExams: empExams,
      chakraInterviews: empChakraInterviews,
    };
  });
}

// Fetch all employees with their metrics
app.get('/api/employees', authenticateUser, async (req: AuthRequest, res) => {
  try {
    let enriched = await getEnrichedEmployees();
    if (req.user?.role === 'mentor') {
      const mentorRecs = await db.select().from(mentors).where(eq(mentors.email, req.user.email)).limit(1);
      const mentorName = mentorRecs.length > 0 ? mentorRecs[0].name : req.user.name;
      enriched = enriched.filter(e => e.assignedMentor === mentorName);
    }
    res.json({ employees: enriched });
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// Fetch eligible mentors for a specific employee (capacity + seniority rules)
app.get('/api/employees/:id/eligible-mentors', authenticateUser, async (req, res) => {
  try {
    const empId = Number(req.params.id);
    const empRecord = await db.select().from(employees).where(eq(employees.id, empId)).limit(1);
    if (empRecord.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const emp = empRecord[0];
    const empRank = getDesignationRank(emp.designation);

    const allMentors = await db.select().from(mentors);
    const enrichedEmps = await getEnrichedEmployees();

    const eligible = allMentors.map(m => {
      // count active mentees
      const menteesList = enrichedEmps.filter(e => e.assignedMentor === m.name);
      const menteesCount = menteesList.length;
      return {
        ...m,
        menteesCount,
      };
    }).filter(m => {
      const mentorRank = getDesignationRank(m.designation);
      return mentorRank >= empRank && m.menteesCount < m.maxCapacity;
    });

    res.json({ mentors: eligible });
  } catch (error) {
    console.error('Error fetching eligible mentors:', error);
    res.status(500).json({ error: 'Failed to fetch eligible mentors' });
  }
});

// Excel data import/sync pipeline endpoint
app.post('/api/import-excel', authenticateUser, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'manager') {
    return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
  }

  const { fileType, base64 } = req.body;
  if (!fileType || !base64) {
    return res.status(400).json({ error: 'Missing fileType or base64 data' });
  }

  try {
    const buffer = Buffer.from(base64, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows: any[] = XLSX.utils.sheet_to_json(sheet);

    if (fileType === 'mentors') {
      let upsertedCount = 0;
      let insertedCount = 0;

      for (const row of rawRows) {
        const empId = String(row['Mentor ID'] || '').trim();
        const name = String(row['Mentor Name'] || '').trim();
        const level = String(row['Level'] || '').trim();
        const loc = String(row['Location'] || '').trim();

        if (!empId || !name) continue;

        const email = `${empId.toLowerCase()}@example.com`;
        const designation = mapExcelLevelToDesignation(level);

        const existing = await db.select().from(mentors).where(eq(mentors.employeeId, empId)).limit(1);
        if (existing.length > 0) {
          await db.update(mentors).set({
            name,
            designation,
            location: loc || 'N/A',
          }).where(eq(mentors.employeeId, empId));
          upsertedCount++;
        } else {
          await db.insert(mentors).values({
            employeeId: empId,
            name,
            email,
            phone: '+91 98765 43210',
            designation,
            domainExpertise: JSON.stringify(['Python', 'SQL', 'Spark']),
            yearsOfExperience: 8,
            maxCapacity: 4,
            status: 'Active',
            location: loc || 'N/A',
          });
          insertedCount++;

          const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
          if (existingUser.length === 0) {
            await db.insert(users).values({
              uid: `mentor_uid_${empId}`,
              email,
              name,
              role: 'mentor',
            });
          }
        }
      }
      return res.json({ success: true, message: `Successfully synchronized mentors. Inserted: ${insertedCount}, Updated: ${upsertedCount}` });
    } else if (fileType === 'employees') {
      let upsertedCount = 0;
      let insertedCount = 0;

      for (const row of rawRows) {
        const empNo = String(row['Emp No'] || '').trim();
        const name = String(row['Emp Name'] || '').trim();
        const level = String(row['Level'] || '').trim();
        const loc = String(row['Location'] || '').trim();
        const skillGroup = String(row['SkillGroup'] || '').trim();
        const moduleVal = String(row['Module'] || '').trim();
        const secModule = String(row['SecondaryModule'] || '').trim();
        const miscSkill = String(row['Misc. Skill'] || '').trim();

        if (!empNo || !name) continue;

        const email = `${empNo.toLowerCase()}@example.com`;
        const designation = mapExcelLevelToDesignation(level);
        const skillList = miscSkill ? miscSkill.split(',').map(s => s.trim()).filter(Boolean) : [];

        const existing = await db.select().from(employees).where(eq(employees.employeeId, empNo)).limit(1);
        if (existing.length > 0) {
          await db.update(employees).set({
            name,
            designation,
            location: loc || 'N/A',
            skillGroup,
            persona: skillGroup || 'Data Engineer',
            skills: JSON.stringify(skillList),
            module: moduleVal || 'N/A',
            secondaryModule: secModule || 'N/A',
          }).where(eq(employees.employeeId, empNo));
          upsertedCount++;
        } else {
          const hasPython = skillList.some(s => s.toLowerCase().includes('python'));
          const hasSql = skillList.some(s => s.toLowerCase().includes('sql'));
          const hasSpark = skillList.some(s => s.toLowerCase().includes('spark') || s.toLowerCase().includes('hive'));

          await db.insert(employees).values({
            employeeId: empNo,
            name,
            email,
            joiningDate: '2026-07-15',
            designation,
            employeeType: 'Bench',
            status: 'Enrolled',
            skillGroup,
            persona: skillGroup || 'Data Engineer',
            skills: JSON.stringify(skillList),
            benchAgingDays: 0,
            yearsOfExperience: 2.0,
            previousProjectHistory: 'Imported via Excel',
            assignedMentor: null,
            currentProject: 'Bench',
            pythonLevel: hasPython ? 'Intermediate' : 'Beginner',
            sqlLevel: hasSql ? 'Intermediate' : 'Beginner',
            sparkLevel: hasSpark ? 'Intermediate' : 'Beginner',
            pysparkLevel: hasSpark ? 'Intermediate' : 'Beginner',
            programEnrollmentDate: null,
            location: loc || 'N/A',
            module: moduleVal || 'N/A',
            secondaryModule: secModule || 'N/A',
          });
          insertedCount++;
        }
      }
      return res.json({ success: true, message: `Successfully synchronized employees. Inserted: ${insertedCount}, Updated: ${upsertedCount}` });
    } else {
      return res.status(400).json({ error: 'Invalid fileType. Must be employees or mentors' });
    }
  } catch (error: any) {
    console.error('Error importing Excel:', error);
    return res.status(500).json({ error: 'Failed to process Excel file', details: error.message });
  }
});

// Add new employee
app.post('/api/employees', authenticateUser, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'manager') {
    return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
  }

  const {
    employeeId, name, email, joiningDate, employeeType, status, skillGroup,
    yearsOfExperience, previousProjectHistory, assignedMentor, currentProject,
    pythonLevel, sqlLevel, sparkLevel, pysparkLevel, programEnrollmentDate, designation,
    persona, skills, benchAgingDays, overallScore
  } = req.body;

  if (!employeeId || !name || !email || !joiningDate || !employeeType) {
    return res.status(400).json({ error: 'Missing required employee fields' });
  }

  // Mentor Capacity Check
  if (assignedMentor) {
    try {
      const existingMentees = await db.select().from(employees).where(eq(employees.assignedMentor, assignedMentor));
      if (existingMentees.length >= 4) {
        return res.status(400).json({ error: 'This mentor has reached maximum mentee capacity (4/4)' });
      }
    } catch (e) {
      console.error('Error checking capacity:', e);
    }
  }

  try {
    const inserted = await db.insert(employees).values({
      employeeId,
      name,
      email,
      joiningDate,
      designation: designation || 'Consultant',
      employeeType,
      status: String(status || 'Enrolled'),
      skillGroup: skillGroup || null,
      persona: persona || 'Data Engineer',
      skills: Array.isArray(skills) ? JSON.stringify(skills) : (skills || '[]'),
      benchAgingDays: benchAgingDays !== undefined ? Number(benchAgingDays) : 0,
      yearsOfExperience: Number(yearsOfExperience),
      previousProjectHistory: previousProjectHistory || null,
      assignedMentor: assignedMentor || null,
      currentProject: currentProject || 'Bench',
      pythonLevel: pythonLevel || 'Beginner',
      sqlLevel: sqlLevel || 'Beginner',
      sparkLevel: sparkLevel || 'Beginner',
      pysparkLevel: pysparkLevel || 'Beginner',
      programEnrollmentDate: programEnrollmentDate || joiningDate,
      overallScore: overallScore !== undefined && overallScore !== null ? Number(overallScore) : null
    }).returning();

    res.status(201).json(inserted[0]);
  } catch (error: any) {
    console.error('Error creating employee:', error);
    if (error.code === '23505') {
      res.status(400).json({ error: 'Employee ID or Email already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create employee' });
    }
  }
});

// Update employee
app.put('/api/employees/:id', authenticateUser, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'manager' && req.user?.role !== 'mentor') {
    return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
  }

  const empId = Number(req.params.id);
  const data = req.body;

  // Mentor Capacity & Seniority Check for PUT
  if (data.assignedMentor) {
    try {
      const existingMentees = await db.select().from(employees).where(eq(employees.assignedMentor, data.assignedMentor));
      const otherMentees = existingMentees.filter(e => e.id !== empId);
      if (otherMentees.length >= 4) {
        return res.status(400).json({ error: 'This mentor has reached maximum mentee capacity (4/4)' });
      }

      // Seniority level validation
      const empRecord = await db.select().from(employees).where(eq(employees.id, empId)).limit(1);
      if (empRecord.length > 0) {
        const empDesignation = data.designation || empRecord[0].designation;
        const empRank = getDesignationRank(empDesignation);

        const mentorRecord = await db.select().from(mentors).where(eq(mentors.name, data.assignedMentor)).limit(1);
        if (mentorRecord.length > 0) {
          const mentorRank = getDesignationRank(mentorRecord[0].designation);
          if (mentorRank < empRank) {
            return res.status(400).json({ error: `Seniority rule violation: Mentor '${data.assignedMentor}' (${mentorRecord[0].designation}) cannot mentor a more senior employee '${empRecord[0].name}' (${empDesignation})` });
          }
        }
      }
    } catch (e: any) {
      console.error('Error checking capacity/seniority in edit:', e);
    }
  }

  try {
    // If they are a mentor, restrict updating major fields except status/assignedMentor
    let fieldsToUpdate: any = {};
    if (req.user?.role === 'mentor') {
      // Mentors can adjust status, skill levels
      if (data.status) fieldsToUpdate.status = data.status;
      if (data.pythonLevel) fieldsToUpdate.pythonLevel = data.pythonLevel;
      if (data.sqlLevel) fieldsToUpdate.sqlLevel = data.sqlLevel;
      if (data.sparkLevel) fieldsToUpdate.sparkLevel = data.sparkLevel;
      if (data.pysparkLevel) fieldsToUpdate.pysparkLevel = data.pysparkLevel;
    } else {
      // Admins/Managers can update anything
      fieldsToUpdate = {
        employeeId: data.employeeId,
        name: data.name,
        email: data.email,
        joiningDate: data.joiningDate,
        designation: data.designation,
        employeeType: data.employeeType,
        status: data.status,
        skillGroup: data.skillGroup,
        persona: data.persona,
        skills: Array.isArray(data.skills) ? JSON.stringify(data.skills) : data.skills,
        benchAgingDays: data.benchAgingDays !== undefined ? Number(data.benchAgingDays) : undefined,
        yearsOfExperience: data.yearsOfExperience !== undefined ? Number(data.yearsOfExperience) : undefined,
        previousProjectHistory: data.previousProjectHistory,
        assignedMentor: data.assignedMentor,
        currentProject: data.currentProject,
        pythonLevel: data.pythonLevel,
        sqlLevel: data.sqlLevel,
        sparkLevel: data.sparkLevel,
        pysparkLevel: data.pysparkLevel,
        programEnrollmentDate: data.programEnrollmentDate,
        overallScore: data.overallScore !== undefined ? (data.overallScore === null ? null : Number(data.overallScore)) : undefined
      };
    }

    // Filter out undefined keys
    Object.keys(fieldsToUpdate).forEach(key => fieldsToUpdate[key] === undefined && delete fieldsToUpdate[key]);

    const updated = await db.update(employees).set(fieldsToUpdate).where(eq(employees.id, empId)).returning();
    if (updated.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json(updated[0]);
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

// Delete employee
app.delete('/api/employees/:id', authenticateUser, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Only admins can delete resources' });
  }

  const empId = Number(req.params.id);
  try {
    // Cascade delete logs to prevent foreign key errors
    await db.delete(attendance).where(eq(attendance.employeeId, empId));
    await db.delete(mockInterviews).where(eq(mockInterviews.employeeId, empId));
    await db.delete(hackerrankExams).where(eq(hackerrankExams.employeeId, empId));
    
    const deleted = await db.delete(employees).where(eq(employees.id, empId)).returning();
    if (deleted.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json({ message: 'Employee profile deleted successfully', employee: deleted[0] });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ error: 'Failed to delete employee' });
  }
});

// ==========================================
// HACKERRANK INTEGRATION ENDPOINTS
// ==========================================

const HACKERRANK_V3_URL = 'https://www.hackerrank.com/x/api/v3';
const HACKERRANK_V2_URL = 'https://www.hackerrank.com/x/api/v2';
const HACKERRANK_TIMEZONE = process.env.HACKERRANK_TIMEZONE || 'Asia/Kolkata';

function getHackerRankHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

function unwrapHackerRankCandidate(payload: any): any {
  if (!payload || typeof payload !== 'object') return {};
  const data = payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data) ? payload.data : {};
  const candidate = payload?.candidate && typeof payload.candidate === 'object'
    ? payload.candidate
    : data?.candidate && typeof data.candidate === 'object'
      ? data.candidate
      : payload?.test_candidate && typeof payload.test_candidate === 'object'
        ? payload.test_candidate
        : data?.test_candidate && typeof data.test_candidate === 'object'
          ? data.test_candidate
          : data;
  // Preserve wrapper fields (some HackerRank responses place the id/status outside `candidate`).
  return { ...payload, ...data, ...candidate };
}

function getHackerRankCandidateId(payload: any): string | null {
  // The test-candidate id may be on the outer test-candidate row, or inside a nested candidate.
  // Prefer explicit test-candidate/candidate id fields before generic `id` fields.
  const objects = [
    payload,
    payload?.data,
    payload?.test_candidate,
    payload?.data?.test_candidate,
    payload?.candidate,
    payload?.data?.candidate,
    unwrapHackerRankCandidate(payload),
  ].filter((item) => item && typeof item === 'object' && !Array.isArray(item));
  const explicitKeys = ['test_candidate_id', 'testCandidateId', 'candidate_id', 'candidateId'];
  for (const key of explicitKeys) {
    for (const object of objects) {
      const value = object?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return String(value);
    }
  }
  for (const key of ['id', 'uuid']) {
    for (const object of objects) {
      const value = object?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return String(value);
    }
  }
  return null;
}

function getHackerRankCandidateEmail(row: any): string {
  const candidate = row?.candidate || row?.test_candidate || row?.data?.candidate || row?.data?.test_candidate || {};
  const profile = row?.user || row?.profile || candidate?.user || candidate?.profile || {};
  const value = row?.email ?? row?.candidate_email ?? row?.email_address ?? row?.email_id ??
    row?.candidateEmail ?? row?.data?.email ?? row?.data?.candidate_email ?? candidate?.email ??
    candidate?.candidate_email ?? candidate?.email_address ?? profile?.email ??
    row?.candidate_details?.email ?? candidate?.candidate_details?.email ?? '';
  return String(value).trim().toLowerCase();
}

function extractHackerRankCandidateRows(payload: any, depth = 0): any[] {
  if (depth > 5 || payload == null) return [];
  if (Array.isArray(payload)) return payload.filter((item) => item && typeof item === 'object');
  if (typeof payload !== 'object') return [];

  const listKeys = ['candidates', 'test_candidates', 'testCandidates', 'candidate_list', 'results', 'items', 'records'];
  for (const key of listKeys) {
    if (Array.isArray(payload[key])) return payload[key].filter((item: any) => item && typeof item === 'object');
  }
  for (const key of ['data', 'result', 'response', 'payload']) {
    if (payload[key] !== undefined) {
      const found = extractHackerRankCandidateRows(payload[key], depth + 1);
      if (found.length) return found;
    }
  }
  // A single-candidate response can be wrapped in a data object instead of a list.
  if (getHackerRankCandidateEmail(payload)) return [payload];
  return [];
}

function hasHackerRankResultFields(candidate: any): boolean {
  if (!candidate || typeof candidate !== 'object') return false;
  return ['status', 'ats_state', 'percentage_score', 'score', 'total_score', 'test_score', 'completed_at', 'submitted_at']
    .some((key) => candidate[key] !== undefined && candidate[key] !== null);
}

function parseHackerRankTimestamp(candidate: any): Date | null {
  const value = candidate?.completed_at ?? candidate?.completedAt ?? candidate?.submitted_at ??
    candidate?.finished_at ?? candidate?.date_completed ?? candidate?.test_completed_at ?? null;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getHackerRankScore(candidate: any): number | null {
  const rawScore = candidate?.percentage_score ?? candidate?.score ?? candidate?.total_score ?? candidate?.test_score;
  if (rawScore === null || rawScore === undefined || rawScore === '') return null;
  const score = Number(rawScore);
  return Number.isFinite(score) ? score : null;
}

function getHackerRankOutcome(candidate: any): 'Passed' | 'Failed' | 'Review required' | null {
  const atsState = Number(candidate?.ats_state);
  // HackerRank's ATS state is the source of truth. State 1 explicitly means review is needed.
  if (atsState === 2) return 'Passed';
  if (atsState === 3) return 'Failed';
  if (atsState === 1) return 'Review required';

  const explicit = candidate?.assessmentOutcome ?? candidate?.outcome ?? candidate?.verdict ?? candidate?.result;
  if (typeof explicit === 'string' && /^(passed?|qualified|failed?|not qualified)$/i.test(explicit.trim())) {
    return /^(pass|qualified)/i.test(explicit.trim()) ? 'Passed' : 'Failed';
  }
  const qualified = candidate?.is_qualified ?? candidate?.qualified ?? candidate?.passed;
  if (typeof qualified === 'boolean') return qualified ? 'Passed' : 'Failed';

  // Do not infer Pass/Fail from a score or a configured cutoff. The displayed outcome must be
  // one actually returned by HackerRank (ATS state or an explicit provider verdict).
  return null;
}

function mapHackerRankStatus(statusCode: unknown): string {
  if (statusCode === undefined || statusCode === null || statusCode === '') return 'Invited';
  const numeric = Number(statusCode);
  switch (numeric) {
    case -1: return 'Invited';
    case 0: return 'In Progress';
    case 1: return 'Submitted - Reports Pending';
    case 7: return 'Completed';
    case 2:
    case 3:
    case 4:
    case 5:
    case 6: return 'Processing';
    default: {
      const statusText = String(statusCode ?? '').toLowerCase();
      if (statusText.includes('expired')) return 'Expired';
      if (statusText.includes('fail')) return 'Failed';
      if (statusText.includes('complete') || statusText.includes('report ready')) return 'Completed';
      if (statusText.includes('progress') || statusText.includes('active')) return 'In Progress';
      if (statusText.includes('process') || statusText.includes('evaluat')) return 'Processing';
      if (statusText.includes('submit')) return 'Submitted - Reports Pending';
      return 'Invited';
    }
  }
}


function getHackerRankProviderError(payload: any): string | null {
  // HackerRank uses more than one error envelope. In particular, candidate-level
  // invite errors are returned under data.error_message even when the HTTP body
  // also contains a generic message such as "No candidates invited."
  const values = [
    payload?.data?.error_message,
    payload?.data?.errorMessage,
    payload?.data?.errors,
    payload?.errors,
    payload?.error_message,
    payload?.errorMessage,
    payload?.data?.detail,
    payload?.detail,
    payload?.data?.details,
    payload?.details,
    payload?.data?.message,
    payload?.message,
    payload?.data?.error,
    payload?.error,
  ];
  const messages: string[] = [];
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    const message = typeof value === 'string' ? value : Array.isArray(value)
      ? value.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join('; ')
      : typeof value === 'object'
        ? String(value.error_message ?? value.message ?? JSON.stringify(value))
        : String(value);
    if (message && !messages.includes(message)) messages.push(message);
  }
  if (messages.length) return messages.join(' | ').slice(0, 1200);
  if (payload && typeof payload === 'object') {
    const serialized = JSON.stringify(payload);
    if (serialized && serialized !== '{}') return serialized.slice(0, 1200);
  }
  return typeof payload === 'string' ? payload.slice(0, 1200) || null : null;
}

function mapHackerRankInviteError(providerMessage: string | null, testId: string, candidateEmail: string): string {
  const message = providerMessage || '';
  if (/already.{0,30}invited|invited.{0,30}same test/i.test(message)) {
    return `HackerRank says ${candidateEmail} has already been invited to test ${testId}. To send a fresh invite, cancel the existing invitation in HackerRank first, then try again. Provider details: ${message}`;
  }
  if (/no such test|test.{0,20}(not found|does not exist|invalid)/i.test(message)) {
    return `HackerRank could not find or grant access to test ${testId}. Check that the test ID is correct, the test is published, and your API user can access it. Provider details: ${message}`;
  }
  if (/email.{0,30}(invalid|required|missing)|invalid.{0,20}email/i.test(message)) {
    return `HackerRank rejected the candidate email address (${candidateEmail}). Correct the employee's Official Email and try again. Provider details: ${message}`;
  }
  if (/recruitment seat|recruiter.{0,30}(permission|privilege|access)|permission denied|not authorized|unauthori[sz]ed|forbidden/i.test(message)) {
    return `HackerRank rejected the invitation because the API/recruiter account may not have permission to invite candidates or access this test. Check for an active Recruiter license/Recruitment Seat and test access. Provider details: ${message || 'No specific permission message was returned.'}`;
  }
  if (/api key|access token|invalid token|authentication/i.test(message)) {
    return `HackerRank rejected the API credentials. Verify that the active token belongs to the correct HackerRank for Work account and has invitation permissions. Provider details: ${message}`;
  }
  return `HackerRank could not send the invitation. ${message ? `Provider details: ${message}` : 'HackerRank returned no detailed error message.'}`;
}

async function readHackerRankResponse(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`HackerRank returned a non-JSON response (HTTP ${response.status}). Check the API token and HackerRank API availability.`);
  }
}

async function findHackerRankCandidateByEmail(apiKey: string, testId: string, email: string): Promise<any | null> {
  const limit = 100;
  const wantedEmail = email.trim().toLowerCase();
  for (let offset = 0; offset < 2000; offset += limit) {
    const response = await fetch(`${HACKERRANK_V3_URL}/tests/${encodeURIComponent(testId)}/candidates?limit=${limit}&offset=${offset}`, {
      method: 'GET', headers: getHackerRankHeaders(apiKey),
    });
    const payload = await readHackerRankResponse(response);
    if (!response.ok) throw new Error(`HackerRank candidate lookup failed (HTTP ${response.status}).`);
    const rows = extractHackerRankCandidateRows(payload);
    const match = rows.find((row: any) => getHackerRankCandidateEmail(row) === wantedEmail);
    if (match) return match;
    if (rows.length < limit) break;
  }
  return null;
}

type HackerRankExperienceBand = '0-5' | '5-10';
type HackerRankAssessmentDifficulty = 'Beginner' | 'Intermediate';
type HackerRankTestCode = 'B1' | 'B2' | 'B3' | 'I1' | 'I2' | 'I3';
interface HackerRankTestCatalogEntry {
  testId: string;
  experienceBand: HackerRankExperienceBand;
  level: HackerRankAssessmentDifficulty;
  code: HackerRankTestCode;
}

function loadHackerRankTestCatalog(): Map<string, HackerRankTestCatalogEntry> {
  const catalogPath = path.join(process.cwd(), 'config', 'hackerrank-test-catalog.json');
  let parsed: any;
  try {
    parsed = JSON.parse(readFileSync(catalogPath, 'utf8'));
  } catch (error: any) {
    if (error?.code === 'ENOENT') return new Map();
    throw new Error(`Could not read ${catalogPath}: ${error.message}`);
  }
  const rows = Array.isArray(parsed) ? parsed : parsed?.tests;
  if (!Array.isArray(rows)) throw new Error('config/hackerrank-test-catalog.json must contain a "tests" array.');

  const catalog = new Map<string, HackerRankTestCatalogEntry>();
  const codeOwners = new Set<string>();
  for (const row of rows) {
    const testId = String(row?.testId ?? row?.id ?? '').trim();
    const experienceBand = row?.experienceBand;
    const level = row?.level;
    const code = String(row?.code ?? '').trim().toUpperCase();
    if (!testId || /^(paste|replace|your[-_])/i.test(testId)) continue;
    if (!['0-5', '5-10'].includes(experienceBand)) continue;
    if (!['Beginner', 'Intermediate'].includes(level)) continue;
    if (!/^[BI][123]$/.test(code)) continue;
    if ((code.startsWith('B') && level !== 'Beginner') || (code.startsWith('I') && level !== 'Intermediate')) continue;
    if (catalog.has(testId)) throw new Error(`Duplicate HackerRank test ID in catalog: ${testId}`);
    const bandCode = `${experienceBand}:${code}`;
    if (codeOwners.has(bandCode)) throw new Error(`Duplicate assessment code ${code} for ${experienceBand} YOE in catalog.`);
    codeOwners.add(bandCode);
    catalog.set(testId, { testId, experienceBand: experienceBand as HackerRankExperienceBand, level: level as HackerRankAssessmentDifficulty, code: code as HackerRankTestCode });
  }
  return catalog;
}

function getEmployeeExperienceBand(yearsValue: unknown): HackerRankExperienceBand | null {
  const years = Number(yearsValue);
  if (!Number.isFinite(years) || years < 0 || years > 10) return null;
  // Avoid overlapping bands: exactly 5 years belongs to 0-5; >5 through 10 belongs to 5-10.
  if (years <= 5) return '0-5';
  return '5-10';
}

function getExamWorkflowMetadata(exam: any): { experienceBand: HackerRankExperienceBand | null; difficulty: HackerRankAssessmentDifficulty | null; code: HackerRankTestCode | null } {
  let data: any = {};
  try { data = exam?.rawResponse ? JSON.parse(exam.rawResponse) : {}; } catch { data = {}; }
  const workflow = data?.assessmentWorkflow ?? {};
  const catalogEntry = loadHackerRankTestCatalog().get(String(exam?.testId ?? ''));
  const experienceBand = ['0-5', '5-10'].includes(workflow?.experienceBand) ? workflow.experienceBand : catalogEntry?.experienceBand ?? null;
  const difficulty = ['Beginner', 'Intermediate'].includes(workflow?.difficulty) ? workflow.difficulty : catalogEntry?.level ?? null;
  const code = /^(B[123]|I[123])$/.test(String(workflow?.code ?? '')) ? workflow.code : catalogEntry?.code ?? null;
  return { experienceBand, difficulty, code };
}

function getStoredHackerRankOutcome(exam: any): 'Passed' | 'Failed' | 'Review required' | null {
  let data: any = {};
  try { data = exam?.rawResponse ? JSON.parse(exam.rawResponse) : {}; } catch { data = {}; }
  if (data?.simulated === true) return null;

  // Prefer provider candidate fields (especially ats_state), not legacy TalentLens manual overrides.
  const candidate = unwrapHackerRankCandidate(data?.candidate ?? data?.invitationResponse?.candidate ?? data?.invitationResponse ?? data);
  const candidateOutcome = getHackerRankOutcome(candidate);
  if (candidateOutcome) return candidateOutcome;

  const providerOutcome = data?.providerAssessmentOutcome;
  if (typeof providerOutcome === 'string') {
    if (/^(passed?|qualified)$/i.test(providerOutcome.trim())) return 'Passed';
    if (/^(failed?|not qualified)$/i.test(providerOutcome.trim())) return 'Failed';
    if (/^review required$/i.test(providerOutcome.trim())) return 'Review required';
  }

  // Only respect older stored outcomes if they are not linked to a manual-review override.
  if (!data?.manualReview) {
    const storedOutcome = data?.assessmentOutcome ?? data?.outcome;
    if (typeof storedOutcome === 'string') {
      if (/^(passed?|qualified)$/i.test(storedOutcome.trim())) return 'Passed';
      if (/^(failed?|not qualified)$/i.test(storedOutcome.trim())) return 'Failed';
      if (/^review required$/i.test(storedOutcome.trim())) return 'Review required';
    }
  }
  return null;
}

// List published HackerRank tests for the assessment selector.
// This must be a backend route so the API token never reaches the browser.
app.get('/api/hackerrank/tests', authenticateUser, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'manager') {
    return res.status(403).json({ error: 'Forbidden: Only admins and managers can view HackerRank tests' });
  }

  const apiKey = process.env.HACKERRANK_API_KEY?.trim();
  if (!apiKey || apiKey === 'your_hackerrank_api_key_here') {
    return res.status(503).json({
      error: 'HACKERRANK_API_KEY is not configured. Add a valid HackerRank for Work API token to the root .env file and restart the server.'
    });
  }

  try {
    const limit = 100;
    const maxPages = 50;
    const allTests: any[] = [];

    for (let page = 0; page < maxPages; page++) {
      const offset = page * limit;
      const response = await fetch(`${HACKERRANK_V3_URL}/tests?limit=${limit}&offset=${offset}`, {
        method: 'GET',
        headers: {
          ...getHackerRankHeaders(apiKey),
          Accept: 'application/json',
        },
      });

      const responseText = await response.text();
      let payload: any;
      try {
        payload = responseText ? JSON.parse(responseText) : {};
      } catch {
        console.error(`[HackerRank] Test list returned non-JSON content (HTTP ${response.status}).`);
        return res.status(502).json({
          error: 'HackerRank returned an unexpected response while loading tests. Check the API token, account permissions, and HackerRank API availability.'
        });
      }

      if (!response.ok) {
        const upstreamMessage = typeof payload?.message === 'string' ? payload.message : '';
        console.error(`[HackerRank] Failed to list tests: HTTP ${response.status} ${upstreamMessage}`);
        return res.status(502).json({
          error: response.status === 401 || response.status === 403
            ? 'HackerRank rejected the API token or it does not have permission to list tests.'
            : `HackerRank could not load tests (HTTP ${response.status}).`
        });
      }

      // The Test API has returned several envelope shapes across API versions/accounts.
      // Normalize common wrappers so every published test reaches the dropdown.
      const possibleCollections = [
        payload,
        payload?.data,
        payload?.data?.data,
        payload?.result,
        payload?.results,
        payload?.data?.results,
      ];
      let pageTests: any[] = [];
      for (const collection of possibleCollections) {
        if (Array.isArray(collection)) { pageTests = collection; break; }
        if (collection && typeof collection === 'object') {
          const nested = collection.tests ?? collection.assessments ?? collection.items ?? collection.results;
          if (Array.isArray(nested)) { pageTests = nested; break; }
        }
      }

      allTests.push(...pageTests);
      const total = Number(payload?.total ?? payload?.data?.total ?? payload?.meta?.total ?? payload?.pagination?.total);
      if (
        pageTests.length < limit ||
        pageTests.length === 0 ||
        (Number.isFinite(total) && total > 0 && allTests.length >= total)
      ) break;
    }

    const catalog = loadHackerRankTestCatalog();
    const tests = allTests
      .filter((test: any) => {
        const draftValue = test?.draft;
        const status = String(test?.status ?? test?.test_status ?? '').toLowerCase();
        const isDraft = draftValue === true || String(draftValue).toLowerCase() === 'true' || status === 'draft';
        const isExplicitlyUnpublished = test?.published === false || ['unpublished', 'archived', 'deleted'].includes(status);
        const id = test?.id ?? test?.test_id ?? test?.testId ?? test?.assessment_id;
        const name = test?.name ?? test?.title ?? test?.test_name ?? test?.assessment_name;
        return !isDraft && !isExplicitlyUnpublished &&
          id !== undefined && id !== null && String(id).trim() !== '' &&
          Boolean(name);
      })
      .map((test: any) => {
        const id = String(test?.id ?? test?.test_id ?? test?.testId ?? test?.assessment_id);
        const displayName = test?.name ?? test?.title ?? test?.test_name ?? test?.assessment_name;
        const metadata = catalog.get(id);
        const duration = test.duration ?? test.duration_in_minutes;
        const cutoffScore = test.cutoff_score ?? test.cutoffScore;
        return {
          id,
          name: String(displayName),
          duration: duration !== null && duration !== '' && Number.isFinite(Number(duration)) ? Number(duration) : null,
          cutoffScore: cutoffScore !== null && cutoffScore !== '' && Number.isFinite(Number(cutoffScore)) ? Number(cutoffScore) : null,
          // Stable ID-to-level metadata comes from config, never from the changeable display name.
          experienceBand: metadata?.experienceBand ?? null,
          proficiencyLevel: metadata?.level ?? null,
          code: metadata?.code ?? null,
          configured: Boolean(metadata),
        };
      });

    if (tests.length === 0) {
      console.warn('[HackerRank] Test list returned zero published tests. Check the API token, team access, and response shape.');
    }
    return res.json({
      tests,
      message: tests.length === 0
        ? 'HackerRank returned no published tests for this API token. Test catalog mappings do not control the dropdown; verify the token, permissions, and that the tests are published.'
        : undefined,
    });
  } catch (error: any) {
    console.error('[HackerRank] Error loading tests:', error);
    return res.status(502).json({ error: 'Failed to connect to HackerRank while loading tests.' });
  }
});

// Trigger a real HackerRank assessment. No local simulation is allowed in this workflow.
app.post('/api/employees/:id/hackerrank/trigger', authenticateUser, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'manager') {
    return res.status(403).json({ error: 'Forbidden: Only admins and managers can trigger assessments' });
  }

  const empId = Number(req.params.id);
  const { testId } = req.body || {};
  if (!testId) return res.status(400).json({ error: 'Select a HackerRank test before triggering an assessment.' });

  const apiKey = process.env.HACKERRANK_API_KEY?.trim();
  if (!apiKey || apiKey === 'your_hackerrank_api_key_here') {
    return res.status(503).json({ error: 'HACKERRANK_API_KEY is not configured. Add a valid HackerRank for Work API token to the root .env file and restart the server. No invitation was sent.' });
  }

  try {
    const empRecord = await db.select().from(employees).where(eq(employees.id, empId)).limit(1);
    if (empRecord.length === 0) return res.status(404).json({ error: 'Employee not found' });
    const emp = empRecord[0];

    // Read the authoritative test metadata from HackerRank (including its configured cutoff).
    const testResponse = await fetch(`${HACKERRANK_V3_URL}/tests/${encodeURIComponent(String(testId))}`, {
      method: 'GET', headers: getHackerRankHeaders(apiKey),
    });
    const testPayload = await readHackerRankResponse(testResponse);
    if (!testResponse.ok) {
      console.error(`[HackerRank] Failed to verify selected test (HTTP ${testResponse.status}).`);
      return res.status(502).json({ error: `HackerRank could not verify the selected test (HTTP ${testResponse.status}). No invitation was sent.` });
    }
    const test = testPayload?.test ?? testPayload?.data?.test ?? testPayload?.data ?? testPayload;
    if (test?.draft === true || String(test?.status || '').toLowerCase() === 'draft') {
      return res.status(400).json({ error: 'This HackerRank test is still a draft. Publish it before sending an invitation.' });
    }
    const officialTestName = String(test?.name || test?.title || req.body?.testName || `HackerRank test ${testId}`);
    const rawCutoff = test?.cutoff_score ?? test?.cutoffScore;
    const cutoffScore = rawCutoff !== null && rawCutoff !== undefined && rawCutoff !== '' && Number.isFinite(Number(rawCutoff))
      ? Number(rawCutoff) : null;
    const testMapping = loadHackerRankTestCatalog().get(String(testId));
    const testBand = testMapping?.experienceBand ?? null;
    const testDifficulty = testMapping?.level ?? null;

    // Recruiters can trigger any published account test without workflow mapping.
    const priorSameTest = await db.select().from(hackerrankExams)
      .where(and(eq(hackerrankExams.employeeId, empId), eq(hackerrankExams.testId, String(testId))))
      .orderBy(desc(hackerrankExams.triggeredAt));
    const latestPreviousAttempt = priorSameTest[0];
    const latestPreviousOutcome = latestPreviousAttempt ? getStoredHackerRankOutcome(latestPreviousAttempt) : null;
    if (latestPreviousAttempt && ['Invited', 'In Progress', 'Submitted - Reports Pending', 'Processing'].includes(String(latestPreviousAttempt.status)) && !latestPreviousOutcome) {
      return res.status(409).json({ error: 'This test already has an active attempt. Sync that attempt before sending another invitation.' });
    }

    // HackerRank's v3 Test Candidate API can create the candidate and send the invitation in one request.
    const candidateEmail = String(emp.email ?? '').trim();
    if (!candidateEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateEmail)) {
      return res.status(400).json({ error: `Candidate email is missing or invalid: "${candidateEmail || '(empty)'}". Correct Official Email in the employee profile before inviting.` });
    }

    const inviteResponse = await fetch(`${HACKERRANK_V3_URL}/tests/${encodeURIComponent(String(testId))}/candidates`, {
      method: 'POST',
      headers: getHackerRankHeaders(apiKey),
      // send_email is explicit: without it some API configurations only add the candidate.
      body: JSON.stringify({
        full_name: emp.name,
        email: candidateEmail,
        send_email: true,
      }),
    });
    const invitePayload = await readHackerRankResponse(inviteResponse);
    const upstreamDetails = getHackerRankProviderError(invitePayload);
    // HackerRank documents candidate errors inside data.error_message; those can
    // accompany a generic message and should never be mistaken for success.
    const providerRejected = invitePayload?.status === false || invitePayload?.data?.status === false || Boolean(invitePayload?.data?.error_message);
    if (!inviteResponse.ok || providerRejected) {
      const message = mapHackerRankInviteError(upstreamDetails, String(testId), candidateEmail);
      console.error(`[HackerRank] Invitation failed (HTTP ${inviteResponse.status})${upstreamDetails ? `: ${upstreamDetails}` : ''}`);
      const duplicate = /already.{0,30}invited|invited.{0,30}same test/i.test(upstreamDetails || '');
      return res.status(duplicate ? 409 : inviteResponse.status === 400 ? 400 : 502).json({
        error: `${message} (HTTP ${inviteResponse.status}).`,
        providerStatus: inviteResponse.status,
        providerError: upstreamDetails,
      });
    }

    let candidate = unwrapHackerRankCandidate(invitePayload);
    let candidateId = getHackerRankCandidateId(invitePayload);
    if (!candidateId) {
      // Some account/API responses omit the candidate id from the invite response. Locate the real record by email.
      try {
        const found = await findHackerRankCandidateByEmail(apiKey, String(testId), emp.email);
        if (found) {
          candidate = found;
          candidateId = getHackerRankCandidateId(found);
        }
      } catch (lookupError: any) {
        console.warn('[HackerRank] Invitation succeeded but candidate id lookup could not complete:', lookupError.message);
      }
    }

    const initialOutcome = getHackerRankOutcome(candidate);
    const rawResponse = JSON.stringify({
      source: 'HackerRank',
      simulated: false,
      candidateId,
      testCutoffScore: cutoffScore,
      assessmentOutcome: initialOutcome,
      assessmentOutcomeRecordedAt: initialOutcome ? new Date().toISOString() : null,
      assessmentWorkflow: testMapping
        ? { experienceBand: testBand, difficulty: testDifficulty, code: testMapping.code }
        : null,
      testMetadata: { name: officialTestName, code: testMapping?.code ?? null },
      candidate,
      invitationResponse: invitePayload,
      invitedAt: new Date().toISOString(),
    });
    const initialStatus = candidate?.status !== undefined ? mapHackerRankStatus(candidate.status) : 'Invited';
    const initialScore = getHackerRankScore(candidate);
    const initialCompletedAt = parseHackerRankTimestamp(candidate);

    const inserted = await db.insert(hackerrankExams).values({
      employeeId: empId,
      testId: String(testId),
      testName: officialTestName,
      triggeredAt: new Date(),
      triggeredBy: req.user?.name || req.user?.email || 'Administrator',
      status: initialStatus,
      completedAt: initialCompletedAt,
      score: initialScore,
      rawResponse,
    }).returning();

    return res.status(201).json({ ...inserted[0], invitationSent: true, candidateId });
  } catch (error: any) {
    console.error('Error triggering HackerRank assessment:', error.message || error);
    return res.status(502).json({ error: error.message || 'Failed to trigger the HackerRank assessment. No simulated invitation was created.' });
  }
});

// Import/reconcile an already-existing HackerRank attempt without sending another invitation.
// Useful after restarting local dev: the app uses an in-memory database, but the HackerRank attempt persists.
app.post('/api/employees/:id/hackerrank/reconcile', authenticateUser, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'manager') {
    return res.status(403).json({ error: 'Forbidden: Only admins and managers can reconcile HackerRank attempts' });
  }
  const empId = Number(req.params.id);
  const testId = String(req.body?.testId ?? '').trim();
  if (!testId) return res.status(400).json({ error: 'Select the HackerRank test to find an existing attempt.' });
  const apiKey = process.env.HACKERRANK_API_KEY?.trim();
  if (!apiKey || apiKey === 'your_hackerrank_api_key_here') {
    return res.status(503).json({ error: 'HACKERRANK_API_KEY is not configured. No invitation was sent.' });
  }

  try {
    const empRecord = await db.select().from(employees).where(eq(employees.id, empId)).limit(1);
    if (empRecord.length === 0) return res.status(404).json({ error: 'Employee not found' });
    const emp = empRecord[0];
    const matchingRow = await findHackerRankCandidateByEmail(apiKey, testId, emp.email);
    if (!matchingRow) {
      return res.status(404).json({
        error: `No candidate was found for ${emp.email} on the selected HackerRank test. Check that exact email in the test's Candidates tab. No invitation was sent.`,
      });
    }

    let candidateId = getHackerRankCandidateId(matchingRow);
    let candidate = unwrapHackerRankCandidate(matchingRow);
    if (candidateId) {
      try {
        const detailResponse = await fetch(`${HACKERRANK_V3_URL}/tests/${encodeURIComponent(testId)}/candidates/${encodeURIComponent(candidateId)}`, {
          method: 'GET', headers: getHackerRankHeaders(apiKey),
        });
        const detailPayload = await readHackerRankResponse(detailResponse);
        if (detailResponse.ok) candidate = unwrapHackerRankCandidate(detailPayload);
        else if (!hasHackerRankResultFields(candidate)) {
          return res.status(502).json({ error: `HackerRank found the candidate but could not retrieve the detail record (HTTP ${detailResponse.status}). No invitation was sent.` });
        }
      } catch (detailError: any) {
        if (!hasHackerRankResultFields(candidate)) throw detailError;
        console.warn('[HackerRank] Using candidate-list result during reconcile because the detail response was unavailable.');
      }
    }
    if (!hasHackerRankResultFields(candidate)) {
      return res.status(409).json({ error: 'HackerRank found the candidate, but has not returned status/report fields yet. Retry after report processing finishes. No invitation was sent.' });
    }

    const testResponse = await fetch(`${HACKERRANK_V3_URL}/tests/${encodeURIComponent(testId)}`, {
      method: 'GET', headers: getHackerRankHeaders(apiKey),
    });
    let testCutoffScore: number | null = null;
    let testName = `HackerRank test ${testId}`;
    if (testResponse.ok) {
      const testPayload = await readHackerRankResponse(testResponse);
      const test = testPayload?.test ?? testPayload?.data?.test ?? testPayload?.data ?? testPayload;
      testName = String(test?.name || test?.title || testName);
      const rawCutoff = test?.cutoff_score ?? test?.cutoffScore;
      if (rawCutoff !== null && rawCutoff !== undefined && rawCutoff !== '' && Number.isFinite(Number(rawCutoff))) {
        testCutoffScore = Number(rawCutoff);
      }
    }

    const currentStatus = mapHackerRankStatus(candidate?.status);
    const currentScore = getHackerRankScore(candidate);
    const completedAt = parseHackerRankTimestamp(candidate);
    const reconciledOutcome = getHackerRankOutcome(candidate);
    const workflowMapping = loadHackerRankTestCatalog().get(String(testId));
    const rawResponse = JSON.stringify({
      source: 'HackerRank', simulated: false, candidateId: candidateId ? String(candidateId) : null,
      testCutoffScore, assessmentOutcome: reconciledOutcome,
      assessmentOutcomeRecordedAt: reconciledOutcome ? new Date().toISOString() : null,
      assessmentWorkflow: workflowMapping ? { experienceBand: workflowMapping.experienceBand, difficulty: workflowMapping.level, code: workflowMapping.code } : null,
      testMetadata: { name: testName, code: workflowMapping?.code ?? null }, candidate, reconciledAt: new Date().toISOString(),
      reconciliationMethod: candidateId ? 'candidate-detail-by-email-match' : 'candidate-list-by-exact-email',
    });

    const existing = await db.select().from(hackerrankExams)
      .where(and(eq(hackerrankExams.employeeId, empId), eq(hackerrankExams.testId, testId)))
      .orderBy(desc(hackerrankExams.triggeredAt)).limit(1);
    let saved: any;
    if (existing.length) {
      // Replace stale local/recruiter overrides with the provider's current candidate record.
      const savedCompletedAt = parseHackerRankTimestamp(candidate) || existing[0].completedAt || (currentStatus === 'Completed' ? new Date() : null);
      const updated = await db.update(hackerrankExams).set({
        testName, status: currentStatus, score: currentScore, completedAt: savedCompletedAt, rawResponse,
      }).where(eq(hackerrankExams.id, existing[0].id)).returning();
      saved = updated[0];
    } else {
      const inserted = await db.insert(hackerrankExams).values({
        employeeId: empId, testId, testName, triggeredAt: new Date(),
        triggeredBy: req.user?.name || req.user?.email || 'HackerRank sync',
        status: currentStatus, score: currentScore, completedAt, rawResponse,
      }).returning();
      saved = inserted[0];
    }
    return res.json({ ...saved, reconciled: true, invitationSent: false, candidateId, outcome: getHackerRankOutcome(candidate) });
  } catch (error: any) {
    console.error('[HackerRank] Existing attempt reconciliation failed:', error.message || error);
    return res.status(502).json({ error: error.message || 'Could not reconcile the existing HackerRank attempt. No invitation was sent.' });
  }
});

// Sync one assessment record against HackerRank's candidate API.
app.post('/api/employees/:id/hackerrank/sync/:examId', authenticateUser, async (req: AuthRequest, res) => {
  const empId = Number(req.params.id);
  const examId = Number(req.params.examId);
  const apiKey = process.env.HACKERRANK_API_KEY?.trim();
  if (!apiKey || apiKey === 'your_hackerrank_api_key_here') {
    return res.status(503).json({ error: 'HACKERRANK_API_KEY is not configured. Cannot sync real candidate results.' });
  }

  try {
    const empRecord = await db.select().from(employees).where(eq(employees.id, empId)).limit(1);
    if (empRecord.length === 0) return res.status(404).json({ error: 'Employee not found' });
    const emp = empRecord[0];
    const examRecord = await db.select().from(hackerrankExams)
      .where(and(eq(hackerrankExams.id, examId), eq(hackerrankExams.employeeId, empId))).limit(1);
    if (examRecord.length === 0) return res.status(404).json({ error: 'HackerRank assessment history record not found' });
    const exam = examRecord[0];

    let stored: any = {};
    try { stored = exam.rawResponse ? JSON.parse(exam.rawResponse) : {}; } catch { stored = {}; }
    if (stored?.simulated === true) {
      return res.status(409).json({ error: 'This is a legacy simulated assessment record, not a real HackerRank result. Trigger a new assessment to test the real integration.' });
    }

    let candidateId = stored?.candidateId ?? getHackerRankCandidateId(stored?.candidate) ?? getHackerRankCandidateId(stored?.invitationResponse);
    let matchedCandidateRow: any = null;
    let candidate: any = null;

    // Refresh the exact test/candidate row each time. This is important because recruiters may
    // change the candidate's ATS state in HackerRank itself after the last TalentLens sync.
    // If lookup is unavailable but we already have an ID, continue to the candidate-detail call.
    try {
      matchedCandidateRow = await findHackerRankCandidateByEmail(apiKey, String(exam.testId), emp.email);
      if (matchedCandidateRow) {
        const freshCandidateId = getHackerRankCandidateId(matchedCandidateRow);
        if (freshCandidateId) candidateId = freshCandidateId;
        candidate = unwrapHackerRankCandidate(matchedCandidateRow);
      }
    } catch (lookupError: any) {
      if (!candidateId) throw lookupError;
      console.warn('[HackerRank] Fresh candidate-list lookup failed; continuing with the saved candidate ID.');
    }

    // If HackerRank's exact-email candidate row includes status/result fields but no ID, use it.
    if (!candidateId) {
      if (!matchedCandidateRow || !hasHackerRankResultFields(candidate)) {
        return res.status(502).json({
          error: `HackerRank did not return a usable candidate ID or result row for ${emp.email} on test ${exam.testId}. Confirm this exact email is listed under that test's Candidates tab in HackerRank, then retry Sync. No local result was changed.`,
        });
      }
    } else {
      const candidateResponse = await fetch(`${HACKERRANK_V3_URL}/tests/${encodeURIComponent(String(exam.testId))}/candidates/${encodeURIComponent(String(candidateId))}`, {
        method: 'GET', headers: getHackerRankHeaders(apiKey),
      });
      let candidatePayload: any = null;
      try {
        candidatePayload = await readHackerRankResponse(candidateResponse);
      } catch (detailReadError) {
        if (!(matchedCandidateRow && hasHackerRankResultFields(unwrapHackerRankCandidate(matchedCandidateRow)))) throw detailReadError;
        console.warn('[HackerRank] Candidate detail response was not readable; using the matching candidate-list record.');
      }
      if (candidateResponse.ok && candidatePayload !== null) {
        candidate = { ...(candidate || {}), ...unwrapHackerRankCandidate(candidatePayload) };
      } else if (matchedCandidateRow && hasHackerRankResultFields(unwrapHackerRankCandidate(matchedCandidateRow))) {
        // Preserve usable data from the list endpoint if the detail endpoint doesn't accept its ID shape.
        candidate = unwrapHackerRankCandidate(matchedCandidateRow);
        console.warn(`[HackerRank] Candidate detail endpoint returned HTTP ${candidateResponse.status}; using the matching candidate-list record for ${emp.email}.`);
      } else {
        console.error(`[HackerRank] Candidate result fetch failed (HTTP ${candidateResponse.status}).`);
        return res.status(502).json({ error: `Could not fetch the candidate result from HackerRank (HTTP ${candidateResponse.status}). Confirm the candidate row in the test's Candidates tab and retry.` });
      }
    }

    const status = mapHackerRankStatus(candidate?.status);
    const score = getHackerRankScore(candidate);
    const syncedAt = new Date();
    const providerCompletedAt = parseHackerRankTimestamp(candidate);
    // HackerRank can report status=7 (report ready) without including a completion timestamp.
    // Persist the first time TalentLens confirms that completed state instead of showing a blank date.
    const completedAt = providerCompletedAt || exam.completedAt || (status === 'Completed' ? syncedAt : null);
    const completionTimestampSource = providerCompletedAt
      ? 'HackerRank'
      : exam.completedAt
        ? (stored?.completionTimestampSource || 'previously recorded')
        : status === 'Completed'
          ? 'TalentLens first confirmed completion during sync'
          : null;
    const testCutoffScore = stored?.testCutoffScore ?? null;
    const providerAssessmentOutcome = getHackerRankOutcome(candidate);
    const workflowMetadata = getExamWorkflowMetadata(exam);
    // Remove legacy manualReview metadata and always display the latest outcome reported by HackerRank.
    const storedWithoutManualReview = { ...(stored || {}) };
    delete storedWithoutManualReview.manualReview;
    const updatedRawResponse = JSON.stringify({
      ...storedWithoutManualReview,
      source: 'HackerRank',
      simulated: false,
      candidateId: candidateId ? String(candidateId) : null,
      testCutoffScore,
      assessmentOutcome: providerAssessmentOutcome,
      providerAssessmentOutcome,
      assessmentOutcomeRecordedAt: providerAssessmentOutcome ? syncedAt.toISOString() : null,
      assessmentWorkflow: workflowMetadata,
      completionTimestampSource,
      completionConfirmedAt: status === 'Completed' && !providerCompletedAt ? completedAt?.toISOString() : stored?.completionConfirmedAt ?? null,
      candidate,
      lastSyncedAt: syncedAt.toISOString(),
    });

    const updated = await db.update(hackerrankExams).set({
      status,
      score,
      completedAt,
      rawResponse: updatedRawResponse,
    }).where(eq(hackerrankExams.id, examId)).returning();

    return res.json({ ...updated[0], outcome: providerAssessmentOutcome, outcomeSource: 'HackerRank' });
  } catch (error: any) {
    console.error('Error synchronizing HackerRank assessment:', error.message || error);
    return res.status(502).json({ error: error.message || 'Failed to synchronize the real HackerRank assessment.' });
  }
});

// Manual Pass/Fail overrides are disabled. Sync retrieves the latest provider outcome from HackerRank.
app.put('/api/employees/:id/hackerrank/outcome/:examId', authenticateUser, async (_req: AuthRequest, res) => {
  return res.status(410).json({
    error: 'Manual Pass/Fail overrides are disabled. Use Sync now to retrieve the latest outcome from HackerRank.',
  });
});

// Optional webhook receiver. Local development uses authenticated polling because localhost
// is not publicly reachable by HackerRank. If this endpoint is exposed, require a shared secret.
app.post('/api/webhooks/hackerrank', async (req, res) => {
  const expectedSecret = process.env.HACKERRANK_WEBHOOK_SECRET?.trim();
  if (!expectedSecret) {
    return res.status(503).json({ error: 'Webhook receiver is disabled until HACKERRANK_WEBHOOK_SECRET is configured. Use the local Sync action/polling flow for development.' });
  }
  if (req.headers.authorization !== `Bearer ${expectedSecret}`) {
    return res.status(401).json({ error: 'Unauthorized webhook request.' });
  }

  const payload = req.body || {};
  const candidate = unwrapHackerRankCandidate(payload);
  const candidateEmail = candidate?.email || payload?.candidate?.email || payload?.email;
  const testId = payload?.test?.id ?? payload?.test_id ?? candidate?.test_id ?? candidate?.testId;
  if (!candidateEmail || !testId) {
    return res.status(400).json({ error: 'Invalid webhook payload: candidate email and test ID are required.' });
  }

  try {
    const empRecord = await db.select().from(employees).where(eq(employees.email, String(candidateEmail).toLowerCase())).limit(1);
    if (empRecord.length === 0) return res.status(404).json({ error: 'No employee matches this candidate email.' });
    const emp = empRecord[0];
    const matchingExams = await db.select().from(hackerrankExams)
      .where(and(eq(hackerrankExams.employeeId, emp.id), eq(hackerrankExams.testId, String(testId))))
      .orderBy(desc(hackerrankExams.triggeredAt)).limit(1);
    if (matchingExams.length === 0) return res.status(404).json({ error: 'No matching assessment history record was found.' });
    const exam = matchingExams[0];
    let previous: any = {};
    try { previous = exam.rawResponse ? JSON.parse(exam.rawResponse) : {}; } catch { previous = {}; }
    const cutoff = previous?.testCutoffScore ?? null;
    const status = mapHackerRankStatus(candidate?.status ?? payload?.status);
    const score = getHackerRankScore(candidate);
    const completedAt = parseHackerRankTimestamp(candidate) || exam.completedAt || null;
    const providerAssessmentOutcome = getHackerRankOutcome(candidate);
    const workflowMetadata = getExamWorkflowMetadata(exam);
    const webhookAt = new Date();
    const finalCompletedAt = completedAt || (status === 'Completed' ? exam.completedAt || webhookAt : null);
    const previousWithoutManualReview = { ...(previous || {}) };
    delete previousWithoutManualReview.manualReview;
    const rawResponse = JSON.stringify({
      ...previousWithoutManualReview,
      source: 'HackerRank',
      simulated: false,
      candidateId: getHackerRankCandidateId(candidate) ?? previous?.candidateId ?? null,
      testCutoffScore: cutoff,
      assessmentOutcome: providerAssessmentOutcome,
      providerAssessmentOutcome,
      assessmentOutcomeRecordedAt: providerAssessmentOutcome ? webhookAt.toISOString() : null,
      assessmentWorkflow: workflowMetadata,
      completionTimestampSource: parseHackerRankTimestamp(candidate) ? 'HackerRank' : (status === 'Completed' && !exam.completedAt ? 'TalentLens first confirmed completion from webhook' : previous?.completionTimestampSource ?? null),
      completionConfirmedAt: status === 'Completed' && !parseHackerRankTimestamp(candidate) ? finalCompletedAt?.toISOString() : previous?.completionConfirmedAt ?? null,
      candidate,
      webhookReceivedAt: webhookAt.toISOString(),
    });
    await db.update(hackerrankExams).set({ status, score, completedAt: finalCompletedAt, rawResponse }).where(eq(hackerrankExams.id, exam.id));
    return res.json({ success: true, status, outcome: providerAssessmentOutcome, outcomeSource: 'HackerRank' });
  } catch (error: any) {
    console.error('[HackerRank webhook] Failed to process payload:', error.message || error);
    return res.status(500).json({ error: 'Failed to process the HackerRank webhook.' });
  }
});

// ==========================================
// CHAKRA AI INTERVIEWER INTEGRATION
// ==========================================
// Chakra supports interviewer share links, official candidate-report CSV export, and API
// access for candidate/report retrieval. The publicly accessible help pages don't expose
// the exact API endpoint/auth/payload contract for invitation delivery, so this implementation
// uses the official share link for recruiter-reviewed invites and only enables API sync when
// the workspace administrator supplies the exact endpoint/auth details issued by HackerRank.

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

app.get('/api/chakra/config', authenticateUser, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'manager') {
    return res.status(403).json({ error: 'Forbidden: Only admins and managers can configure assessments' });
  }
  const inviteLinkConfigured = isHttpsUrl(process.env.CHAKRA_INTERVIEW_URL?.trim());
  const apiSyncConfigured = Boolean(
    process.env.CHAKRA_API_RESULTS_URL_TEMPLATE?.trim() &&
    process.env.CHAKRA_API_TOKEN?.trim() &&
    process.env.CHAKRA_API_AUTH_HEADER?.trim()
  );
  res.json({
    interviewerName: process.env.CHAKRA_INTERVIEW_NAME?.trim() || 'Chakra Data Engineer Interview',
    interviewerId: process.env.CHAKRA_INTERVIEWER_ID?.trim() || '',
    inviteLinkConfigured,
    apiSyncConfigured,
    apiSyncNote: apiSyncConfigured
      ? 'Chakra result API configured using the explicit endpoint/auth settings supplied by the workspace administrator.'
      : 'Chakra API result sync is not enabled. Set the exact results endpoint and auth format supplied by HackerRank Support, or import the official Chakra candidate-report CSV.',
  });
});

app.post('/api/employees/:id/chakra/prepare', authenticateUser, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'manager') {
    return res.status(403).json({ error: 'Forbidden: Only admins and managers can prepare interviews' });
  }
  const empId = Number(req.params.id);
  const invitationUrl = process.env.CHAKRA_INTERVIEW_URL?.trim() || '';
  if (!isHttpsUrl(invitationUrl)) {
    return res.status(503).json({
      error: 'Chakra interview link is not configured. Copy the shareable link from Chakra > My Interviewers > Invite candidates and set CHAKRA_INTERVIEW_URL in the project-root .env. No invitation was sent.',
    });
  }
  try {
    const empRecord = await db.select().from(employees).where(eq(employees.id, empId)).limit(1);
    if (!empRecord.length) return res.status(404).json({ error: 'Employee not found' });
    const emp = empRecord[0];
    const interviewerName = process.env.CHAKRA_INTERVIEW_NAME?.trim() || 'Chakra Data Engineer Interview';
    const interviewerId = process.env.CHAKRA_INTERVIEWER_ID?.trim() || 'configured-share-link';

    // Preparing/opening a mail draft is not an invitation. Do not write an attempt yet.
    return res.json({
      candidate: { name: emp.name, email: emp.email },
      interviewerName,
      interviewerId,
      invitationUrl,
      invitationSent: false,
      message: 'Draft prepared only. TalentLens will save history only after you confirm that you sent it.',
    });
  } catch (error: any) {
    console.error('[Chakra] Failed to prepare interview link:', error.message || error);
    return res.status(500).json({ error: 'Failed to prepare Chakra invitation', message: error.message });
  }
});

// Create a history entry only after the recruiter confirms the email/invitation was actually sent.
app.post('/api/employees/:id/chakra/confirm-invitation', authenticateUser, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'manager') {
    return res.status(403).json({ error: 'Forbidden: Only admins and managers can confirm invitations' });
  }
  const empId = Number(req.params.id);
  const invitationUrl = process.env.CHAKRA_INTERVIEW_URL?.trim() || '';
  if (!isHttpsUrl(invitationUrl)) return res.status(503).json({ error: 'Chakra invitation URL is not configured.' });
  try {
    const empRecord = await db.select().from(employees).where(eq(employees.id, empId)).limit(1);
    if (!empRecord.length) return res.status(404).json({ error: 'Employee not found' });
    const emp = empRecord[0];
    const interviewerName = process.env.CHAKRA_INTERVIEW_NAME?.trim() || 'Chakra Data Engineer Interview';
    const interviewerId = process.env.CHAKRA_INTERVIEWER_ID?.trim() || 'configured-share-link';
    const now = new Date();
    const inserted = await db.insert(chakraInterviews).values({
      employeeId: empId,
      interviewerId,
      interviewerName,
      invitationUrl,
      status: 'Invited',
      triggeredAt: now,
      invitedAt: now,
      triggeredBy: req.user?.name || req.user?.email || 'Administrator',
      rawResponse: JSON.stringify({
        source: 'Chakra', simulated: false, invitationSent: true,
        note: 'Recruiter confirmed the invitation was sent externally.',
        confirmedAt: now.toISOString(),
        confirmedBy: req.user?.name || req.user?.email || 'Administrator',
      }),
    }).returning();
    return res.status(201).json(inserted[0]);
  } catch (error: any) {
    console.error('[Chakra] Failed to record sent invitation:', error.message || error);
    return res.status(500).json({ error: 'Failed to record sent Chakra invitation', message: error.message });
  }
});

app.post('/api/employees/:id/chakra/mark-invited/:interviewId', authenticateUser, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'manager') {
    return res.status(403).json({ error: 'Forbidden: Only admins and managers can update assessment status' });
  }
  const empId = Number(req.params.id);
  const interviewId = Number(req.params.interviewId);
  try {
    const rows = await db.select().from(chakraInterviews)
      .where(and(eq(chakraInterviews.id, interviewId), eq(chakraInterviews.employeeId, empId))).limit(1);
    if (!rows.length) return res.status(404).json({ error: 'Chakra interview record not found' });
    const row = rows[0];
    if (row.status !== 'Invite Prepared') {
      return res.status(409).json({ error: `Only an Invite Prepared record can be marked Invited. Current status: ${row.status}` });
    }
    let previous: any = {};
    try { previous = row.rawResponse ? JSON.parse(row.rawResponse) : {}; } catch { /* preserve an empty audit envelope */ }
    const updated = await db.update(chakraInterviews).set({
      status: 'Invited', invitedAt: new Date(),
      rawResponse: JSON.stringify({ ...previous, invitationSent: true,
        confirmedBy: req.user?.name || req.user?.email || 'Administrator',
        confirmedAt: new Date().toISOString(), confirmationMode: 'recruiter-confirmed-after-external-send' }),
    }).where(eq(chakraInterviews.id, interviewId)).returning();
    return res.json(updated[0]);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to update Chakra invitation status', message: error.message });
  }
});

function collectChakraJsonObjects(value: any, depth = 0, out: any[] = []): any[] {
  if (depth > 8 || value === null || typeof value !== 'object') return out;
  if (!Array.isArray(value)) out.push(value);
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    if (child && typeof child === 'object') collectChakraJsonObjects(child, depth + 1, out);
  }
  return out;
}
function normalizeChakraEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
function chakraRowEmail(row: any): string {
  for (const value of [row?.email, row?.candidate_email, row?.candidateEmail, row?.email_address, row?.candidate?.email, row?.applicant?.email, row?.participant?.email]) {
    const email = normalizeChakraEmail(value);
    if (email) return email;
  }
  return '';
}
function chakraStatus(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const v = String(value).trim().toLowerCase().replace(/[ _-]+/g, ' ');
  if (/^(invited|invite sent|sent|pending invitation)$/.test(v)) return 'Invited';
  if (/^(in progress|incomplete|started|ongoing|active|scheduled|listening|thinking)$/.test(v)) return 'In Progress';
  if (/^(completed|complete|finished|submitted|evaluated|report ready)$/.test(v)) return 'Completed';
  if (/^(expired|expired invite|invite expired)$/.test(v)) return 'Expired';
  if (/^(failed|cancelled|canceled|disqualified)$/.test(v)) return 'Failed';
  return null;
}
function isChakraInterviewCompletedRecord(interview: any): boolean {
  const completedAt = interview?.completedAt ? new Date(interview.completedAt).getTime() : Number.NaN;
  if (Number.isFinite(completedAt)) return true;
  return chakraStatus(interview?.status) === 'Completed';
}

function firstChakraValue(row: any, keys: string[]): any {
  for (const key of keys) if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== '') return row[key];
  return undefined;
}

// CSV parser that handles quoted commas, escaped quotes, and CRLF line endings.
function parseChakraCsv(textValue: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  const input = textValue.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); if (row.some(v => v.trim())) rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, '')); if (row.some(v => v.trim())) rows.push(row); }
  return rows;
}
function normalizeChakraHeader(header: string): string {
  return header.trim().replace(/^\uFEFF/, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function chakraCsvField(row: Record<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[normalizeChakraHeader(key)];
    if (value !== undefined && value.trim()) return value.trim();
  }
  return undefined;
}

// Real API report sync: runs server-to-server using the shared credential in the server's
// private environment. Recruiters need only TalentLens access, not individual Chakra accounts.
// Do not hard-code an undocumented endpoint: supply the exact vendor-issued URL template;
// placeholders {interviewerId} and {email} are optional. Auth header/prefix are configurable
// because public Chakra help pages announce API access but don't specify its endpoint/auth scheme.
app.post('/api/employees/:id/chakra/sync/:interviewId', authenticateUser, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'manager') return res.status(403).json({ error: 'Forbidden' });
  const empId = Number(req.params.id); const interviewId = Number(req.params.interviewId);
  const urlTemplate = process.env.CHAKRA_API_RESULTS_URL_TEMPLATE?.trim() || '';
  const apiToken = process.env.CHAKRA_API_TOKEN?.trim() || '';
  const authHeader = process.env.CHAKRA_API_AUTH_HEADER?.trim() || '';
  const authPrefix = process.env.CHAKRA_API_AUTH_PREFIX ?? '';
  if (!urlTemplate || !apiToken || !authHeader) {
    return res.status(503).json({ error: 'Chakra API sync is not configured. Obtain the exact result endpoint and auth format from your Chakra workspace/HackerRank Support, then set CHAKRA_API_RESULTS_URL_TEMPLATE, CHAKRA_API_AUTH_HEADER, CHAKRA_API_AUTH_PREFIX, and CHAKRA_API_TOKEN. Alternatively import the official Chakra candidate-report CSV. No result was changed.' });
  }
  try {
    const empRows = await db.select().from(employees).where(eq(employees.id, empId)).limit(1);
    if (!empRows.length) return res.status(404).json({ error: 'Employee not found' });
    const records = await db.select().from(chakraInterviews)
      .where(and(eq(chakraInterviews.id, interviewId), eq(chakraInterviews.employeeId, empId))).limit(1);
    if (!records.length) return res.status(404).json({ error: 'Chakra interview record not found' });
    const interview = records[0]; const email = normalizeChakraEmail(empRows[0].email);
    const finalUrl = urlTemplate.replaceAll('{interviewerId}', encodeURIComponent(interview.interviewerId)).replaceAll('{email}', encodeURIComponent(email));
    let parsedUrl: URL;
    try { parsedUrl = new URL(finalUrl); } catch { return res.status(503).json({ error: 'Configured Chakra results URL template is not a valid absolute URL. No result was changed.' }); }
    if (parsedUrl.protocol !== 'https:') return res.status(503).json({ error: 'The configured Chakra result URL must use HTTPS. No result was changed.' });
    const apiHost = parsedUrl.hostname.toLowerCase();
    if (apiHost !== 'hackerrank.com' && !apiHost.endsWith('.hackerrank.com')) {
      return res.status(503).json({ error: 'The Chakra result endpoint must use an official hackerrank.com host so the API token cannot be sent to an unrelated domain. No result was changed.' });
    }
    if (urlTemplate.includes('{interviewerId}') && !process.env.CHAKRA_INTERVIEWER_ID?.trim()) {
      return res.status(503).json({ error: 'The configured results URL needs {interviewerId}, but CHAKRA_INTERVIEWER_ID is empty. No result was changed.' });
    }
    const headers: Record<string, string> = { Accept: 'application/json' };
    headers[authHeader] = authPrefix.trim() ? `${authPrefix.trim()} ${apiToken}` : apiToken;
    const response = await fetch(parsedUrl.toString(), { method: 'GET', headers });
    const body = await response.text(); let payload: any;
    try { payload = body ? JSON.parse(body) : {}; }
    catch { return res.status(502).json({ error: `Configured Chakra API returned non-JSON content (HTTP ${response.status}). Verify the official URL/auth settings. No result was changed.` }); }
    if (!response.ok) return res.status(502).json({ error: `Configured Chakra API returned HTTP ${response.status}. Verify endpoint, token, permissions and auth format. No result was changed.` });
    const match = collectChakraJsonObjects(payload).find(row => chakraRowEmail(row) === email);
    if (!match) return res.status(404).json({ error: `API response had no exact candidate-email match for ${email}. No result was changed.` });
    const nestedPayload = [match.candidate, match.interview, match.report, match.result, match.data].find(value => value && typeof value === 'object');
    const candidate = nestedPayload ? { ...match, ...nestedPayload } : match;
    const status = chakraStatus(firstChakraValue(candidate, ['status', 'candidate_status', 'candidateStatus', 'interview_status', 'interviewStatus', 'state']));
    const rawScore = firstChakraValue(candidate, ['overall_score', 'overallScore', 'score', 'overall_recommendation_score', 'recommendation_score', 'recommendationScore']);
    const parsedScore = rawScore !== undefined && Number.isFinite(Number(rawScore)) ? Number(rawScore) : undefined;
    const score = parsedScore !== undefined && parsedScore >= 0 && parsedScore <= 5 ? parsedScore : undefined;
    const rec = firstChakraValue(candidate, ['recommendation', 'overall_recommendation', 'overallRecommendation', 'outcome', 'verdict']);
    const completedRaw = firstChakraValue(candidate, ['completed_at', 'completedAt', 'finished_at', 'finishedAt', 'submitted_at', 'submittedAt', 'completion_date', 'completionDate']);
    const completedDate = completedRaw ? new Date(completedRaw) : null;
    const reportRaw = firstChakraValue(candidate, ['report_url', 'reportUrl', 'candidate_report_url', 'candidateReportUrl', 'url']);
    const updates: any = { rawResponse: JSON.stringify({ source: 'Chakra API', syncedAt: new Date().toISOString(), payload: candidate }) };
    if (status) updates.status = status;
    if (score !== undefined) updates.score = score;
    if (typeof rec === 'string' && rec.trim()) updates.recommendation = rec.trim();
    if (completedDate && !Number.isNaN(completedDate.getTime())) updates.completedAt = completedDate;
    if (isHttpsUrl(reportRaw)) updates.reportUrl = reportRaw;
    if (Object.keys(updates).length === 1) return res.status(422).json({ error: 'A candidate matched, but the response has no recognizable result fields. Configure field mappings according to HackerRank documentation. No result values were changed.' });
    const updated = await db.update(chakraInterviews).set(updates).where(eq(chakraInterviews.id, interviewId)).returning();
    return res.json(updated[0]);
  } catch (error: any) {
    console.error('[Chakra] Result sync failed:', error.message || error);
    return res.status(502).json({ error: 'Failed to synchronize the real Chakra result. No simulated score was generated.', message: error.message });
  }
});

// Fallback sync via Chakra's official Export CSV action (My Interviewers > Candidates > Export CSV).
app.post('/api/employees/:id/chakra/import-csv/:interviewId', authenticateUser, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'manager') return res.status(403).json({ error: 'Forbidden' });
  const empId = Number(req.params.id); const interviewId = Number(req.params.interviewId);
  const csvText = typeof req.body?.csvText === 'string' ? req.body.csvText : '';
  if (!csvText.trim()) return res.status(400).json({ error: 'Upload the official Chakra candidate-report CSV.' });
  try {
    const empRows = await db.select().from(employees).where(eq(employees.id, empId)).limit(1);
    if (!empRows.length) return res.status(404).json({ error: 'Employee not found' });
    const records = await db.select().from(chakraInterviews).where(and(eq(chakraInterviews.id, interviewId), eq(chakraInterviews.employeeId, empId))).limit(1);
    if (!records.length) return res.status(404).json({ error: 'Chakra interview record not found' });
    if (!isChakraInterviewCompletedRecord(records[0])) {
      return res.status(409).json({ error: 'CSV import is available only after Chakra reports the interview as Completed. Fetch result (API) first to refresh the status.' });
    }
    const parsed = parseChakraCsv(csvText);
    if (parsed.length < 2) return res.status(422).json({ error: 'CSV must contain a header and candidate row.' });
    const headers = parsed[0].map(normalizeChakraHeader);
    const emailIndex = headers.findIndex(h => ['email', 'candidate email', 'candidate email address', 'email address', 'candidate email id'].includes(h));
    if (emailIndex < 0) return res.status(422).json({ error: 'No candidate email column was found. Use Chakra’s official candidate-report export.' });
    const values = parsed.slice(1).find(row => normalizeChakraEmail(row[emailIndex]) === normalizeChakraEmail(empRows[0].email));
    if (!values) return res.status(404).json({ error: `No CSV row exactly matched ${empRows[0].email}. No result was changed.` });
    const csvRow: Record<string, string> = {};
    headers.forEach((header, index) => { if (header) csvRow[header] = values[index] ?? ''; });
    const status = chakraStatus(chakraCsvField(csvRow, ['status', 'candidate status', 'interview status', 'interview state']));
    const scoreRaw = chakraCsvField(csvRow, ['overall score', 'score', 'overall recommendation score', 'recommendation score']);
    const parsedScore = scoreRaw !== undefined && Number.isFinite(Number(scoreRaw)) ? Number(scoreRaw) : undefined;
    const score = parsedScore !== undefined && parsedScore >= 0 && parsedScore <= 5 ? parsedScore : undefined;
    const rec = chakraCsvField(csvRow, ['overall recommendation', 'recommendation', 'outcome', 'verdict', 'hiring recommendation']);
    const completedRaw = chakraCsvField(csvRow, ['completed at', 'completion date', 'finished at', 'submitted at', 'completed date', 'finished date']);
    const completedDate = completedRaw ? new Date(completedRaw) : null;
    const reportRaw = chakraCsvField(csvRow, ['report url', 'candidate report url', 'report link', 'candidate report', 'report']);
    const updates: any = { rawResponse: JSON.stringify({ source: 'Chakra official report CSV', importedAt: new Date().toISOString(), row: csvRow }) };
    if (status) updates.status = status;
    if (score !== undefined) updates.score = score;
    if (rec) updates.recommendation = rec;
    if (completedDate && !Number.isNaN(completedDate.getTime())) updates.completedAt = completedDate;
    if (isHttpsUrl(reportRaw)) updates.reportUrl = reportRaw;
    if (Object.keys(updates).length === 1) return res.status(422).json({ error: 'The matched CSV row did not have recognizable result fields. No result values were changed.' });
    const updated = await db.update(chakraInterviews).set(updates).where(eq(chakraInterviews.id, interviewId)).returning();
    return res.json(updated[0]);
  } catch (error: any) {
    console.error('[Chakra] CSV import failed:', error.message || error);
    return res.status(500).json({ error: 'Failed to import Chakra report CSV', message: error.message });
  }
});

app.get('/api/mocks', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const list = await db.select().from(mockInterviews).orderBy(desc(mockInterviews.date));
    res.json({ mocks: list });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch mock interviews' });
  }
});

// Submit mock interview feedback
app.post('/api/mocks', authenticateUser, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'mentor' && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Only mentors or admins can log mock sessions' });
  }

  const {
    employeeId, date, mentorName, mockNumber, topic,
    techAccuracy, problemSolvingSpeed, codeQuality,
    communication, conceptualUnderstanding, confidenceLevel,
    feedback, status
  } = req.body;

  if (!employeeId || !date || !mentorName || !mockNumber || !topic || !status) {
    return res.status(400).json({ error: 'Missing required mock feedback fields' });
  }

  // Auto-calculate overall average
  const scores = [
    Number(techAccuracy),
    Number(problemSolvingSpeed),
    Number(codeQuality),
    Number(communication),
    Number(conceptualUnderstanding),
    Number(confidenceLevel)
  ];
  const overallScore = Number((scores.reduce((sum, s) => sum + s, 0) / scores.length).toFixed(2));

  try {
    const inserted = await db.insert(mockInterviews).values({
      employeeId: Number(employeeId),
      date,
      mentorName,
      mockNumber,
      topic,
      techAccuracy: Number(techAccuracy),
      problemSolvingSpeed: Number(problemSolvingSpeed),
      codeQuality: Number(codeQuality),
      communication: Number(communication),
      conceptualUnderstanding: Number(conceptualUnderstanding),
      confidenceLevel: Number(confidenceLevel),
      overallScore,
      feedback,
      status
    }).returning();

    res.status(201).json(inserted[0]);
  } catch (error) {
    console.error('Error creating mock session:', error);
    res.status(500).json({ error: 'Failed to log mock session' });
  }
});

// ==========================================
// MENTORS CRUD API
// ==========================================

// Fetch all mentors
app.get('/api/mentors', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const allMentors = await db.select().from(mentors);
    const enrichedEmps = await getEnrichedEmployees();
    
    const results = allMentors.map(m => {
      const menteesList = enrichedEmps.filter(e => e.assignedMentor === m.name);
      const menteesCount = menteesList.length;
      const avgTeamScore = menteesCount > 0
        ? Number((menteesList.reduce((sum, e) => sum + (e.overallScore || 0), 0) / menteesCount).toFixed(2))
        : 0;
      return {
        ...m,
        menteesCount,
        avgTeamScore
      };
    });
    res.json({ mentors: results });
  } catch (error) {
    console.error('Error fetching mentors:', error);
    res.status(500).json({ error: 'Failed to fetch mentors' });
  }
});

// Add new mentor
app.post('/api/mentors', authenticateUser, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'manager') {
    return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
  }

  const {
    employeeId, name, email, phone, designation, domainExpertise,
    yearsOfExperience, maxCapacity, status, profilePhoto
  } = req.body;

  if (!employeeId || !name || !email) {
    return res.status(400).json({ error: 'Missing required mentor fields' });
  }

  try {
    // Check if user exists in user table, insert if not to allow login
    let dbUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (dbUser.length === 0) {
      await db.insert(users).values({
        uid: `mentor_uid_${Date.now()}`,
        email,
        name,
        role: 'mentor',
      });
    }

    const inserted = await db.insert(mentors).values({
      employeeId,
      name,
      email,
      phone: phone || null,
      designation: designation || null,
      domainExpertise: typeof domainExpertise === 'string' ? domainExpertise : JSON.stringify(domainExpertise || []),
      yearsOfExperience: yearsOfExperience !== undefined ? Number(yearsOfExperience) : null,
      maxCapacity: maxCapacity !== undefined ? Number(maxCapacity) : 4,
      status: status || 'Active',
      profilePhoto: profilePhoto || null,
    }).returning();

    res.status(201).json(inserted[0]);
  } catch (error: any) {
    console.error('Error creating mentor:', error);
    if (error.code === '23505') {
      res.status(400).json({ error: 'Mentor ID or Email already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create mentor' });
    }
  }
});

// Update mentor
app.put('/api/mentors/:id', authenticateUser, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'manager') {
    return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
  }

  const mentorId = Number(req.params.id);
  const data = req.body;

  try {
    const fieldsToUpdate: any = {
      employeeId: data.employeeId,
      name: data.name,
      email: data.email,
      phone: data.phone,
      designation: data.designation,
      domainExpertise: typeof data.domainExpertise === 'string' ? data.domainExpertise : JSON.stringify(data.domainExpertise || []),
      yearsOfExperience: data.yearsOfExperience !== undefined ? Number(data.yearsOfExperience) : undefined,
      maxCapacity: data.maxCapacity !== undefined ? Number(data.maxCapacity) : undefined,
      status: data.status,
      profilePhoto: data.profilePhoto,
    };

    Object.keys(fieldsToUpdate).forEach(key => fieldsToUpdate[key] === undefined && delete fieldsToUpdate[key]);

    const updated = await db.update(mentors).set(fieldsToUpdate).where(eq(mentors.id, mentorId)).returning();
    if (updated.length === 0) {
      return res.status(404).json({ error: 'Mentor not found' });
    }

    // Ensure we sync or update users role and name
    if (data.email) {
      let dbUser = await db.select().from(users).where(eq(users.email, data.email)).limit(1);
      if (dbUser.length === 0) {
        await db.insert(users).values({
          uid: `mentor_uid_${Date.now()}`,
          email: data.email,
          name: data.name || updated[0].name,
          role: 'mentor',
        });
      } else {
        await db.update(users).set({ name: data.name || updated[0].name }).where(eq(users.id, dbUser[0].id));
      }
    }

    res.json(updated[0]);
  } catch (error) {
    console.error('Error updating mentor:', error);
    res.status(500).json({ error: 'Failed to update mentor' });
  }
});

// Patch status
app.patch('/api/mentors/:id/status', authenticateUser, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'manager') {
    return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
  }

  const mentorId = Number(req.params.id);
  const { status } = req.body;

  try {
    const updated = await db.update(mentors).set({ status }).where(eq(mentors.id, mentorId)).returning();
    res.json(updated[0]);
  } catch (error) {
    console.error('Error patching mentor status:', error);
    res.status(500).json({ error: 'Failed to update mentor status' });
  }
});

// Fetch attendance logs
app.get('/api/attendance', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const list = await db.select().from(attendance).orderBy(desc(attendance.sessionDate));
    res.json({ attendance: list });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch attendance logs' });
  }
});

// Bulk submit attendance
app.post('/api/attendance', authenticateUser, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'mentor' && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Only mentors or admins can track attendance' });
  }

  const { sessionName, sessionDate, topic, subtopic, records } = req.body;
  // records: Array of { employeeId: number, status: 'Present' | 'Absent' | 'Late' }

  if (!sessionName || !sessionDate || !topic || !Array.isArray(records)) {
    return res.status(400).json({ error: 'Invalid attendance submission payload' });
  }

  try {
    const insertedLogs = [];
    for (const record of records) {
      const inserted = await db.insert(attendance).values({
        employeeId: Number(record.employeeId),
        sessionName,
        sessionDate,
        topic,
        subtopic: subtopic || null,
        status: record.status
      }).returning();
      insertedLogs.push(inserted[0]);
    }
    res.status(201).json({ message: 'Attendance tracked successfully', logs: insertedLogs });
  } catch (error) {
    console.error('Error saving attendance:', error);
    res.status(500).json({ error: 'Failed to log attendance' });
  }
});

// Fetch mentor sessions
app.get('/api/sessions', authenticateUser, async (req: AuthRequest, res) => {
  const { employeeId } = req.query;
  try {
    let q = db.select().from(mentorSessions);
    if (employeeId) {
      q = q.where(eq(mentorSessions.employeeId, Number(employeeId))) as any;
    }
    const list = await q.orderBy(desc(mentorSessions.sessionDate));
    res.json({ sessions: list });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Submit a mentor session log with 3-domain rating
app.post('/api/employees/:id/sessions', authenticateUser, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'mentor' && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Only mentors or admins can log sessions' });
  }

  const empId = Number(req.params.id);
  const data = req.body;

  if (!data.sessionDate || !data.duration || !data.mode || !data.topics) {
    return res.status(400).json({ error: 'Missing required session fields' });
  }

  try {
    const inserted = await db.insert(mentorSessions).values({
      employeeId: empId,
      sessionNumber: Number(data.sessionNumber),
      sessionDate: data.sessionDate,
      duration: data.duration,
      mode: data.mode,
      topics: typeof data.topics === 'string' ? data.topics : JSON.stringify(data.topics || []),
      subTopics: typeof data.subTopics === 'string' ? data.subTopics : JSON.stringify(data.subTopics || []),
      resources: typeof data.resources === 'string' ? data.resources : JSON.stringify(data.resources || []),
      mentorNotes: data.mentorNotes || '',
      
      prevSessionId: data.prevSessionId ? Number(data.prevSessionId) : null,
      q1Completed: data.q1Completed || null,
      q2Retained: data.q2Retained || null,
      q3Readiness: data.q3Readiness || null,
      followUpRemarks: data.followUpRemarks || null,
      resourcesOverdue: data.resourcesOverdue ? 1 : 0,
      retentionIssue: data.retentionIssue ? 1 : 0,
      
      pythonTechAccuracy: data.pythonTechAccuracy !== undefined ? Number(data.pythonTechAccuracy) : null,
      pythonProblemSolving: data.pythonProblemSolving !== undefined ? Number(data.pythonProblemSolving) : null,
      pythonCodeQuality: data.pythonCodeQuality !== undefined ? Number(data.pythonCodeQuality) : null,
      pythonConceptual: data.pythonConceptual !== undefined ? Number(data.pythonConceptual) : null,
      pythonCommunication: data.pythonCommunication !== undefined ? Number(data.pythonCommunication) : null,
      pythonAvgScore: data.pythonAvgScore !== undefined ? Number(data.pythonAvgScore) : null,
      
      sqlTechAccuracy: data.sqlTechAccuracy !== undefined ? Number(data.sqlTechAccuracy) : null,
      sqlProblemSolving: data.sqlProblemSolving !== undefined ? Number(data.sqlProblemSolving) : null,
      sqlCodeQuality: data.sqlCodeQuality !== undefined ? Number(data.sqlCodeQuality) : null,
      sqlConceptual: data.sqlConceptual !== undefined ? Number(data.sqlConceptual) : null,
      sqlCommunication: data.sqlCommunication !== undefined ? Number(data.sqlCommunication) : null,
      sqlAvgScore: data.sqlAvgScore !== undefined ? Number(data.sqlAvgScore) : null,
      
      sparkTechAccuracy: data.sparkTechAccuracy !== undefined ? Number(data.sparkTechAccuracy) : null,
      sparkProblemSolving: data.sparkProblemSolving !== undefined ? Number(data.sparkProblemSolving) : null,
      sparkCodeQuality: data.sparkCodeQuality !== undefined ? Number(data.sparkCodeQuality) : null,
      sparkConceptual: data.sparkConceptual !== undefined ? Number(data.sparkConceptual) : null,
      sparkCommunication: data.sparkCommunication !== undefined ? Number(data.sparkCommunication) : null,
      sparkAvgScore: data.sparkAvgScore !== undefined ? Number(data.sparkAvgScore) : null,
      
      overallScore: Number(data.overallScore),
    }).returning();

    // Dynamically upgrade employee levels based on average session scores if high
    const updateFields: any = {};
    if (data.pythonAvgScore && data.pythonAvgScore >= 4.0) updateFields.pythonLevel = 'Expert';
    else if (data.pythonAvgScore && data.pythonAvgScore >= 3.0) updateFields.pythonLevel = 'Advanced';
    else if (data.pythonAvgScore && data.pythonAvgScore >= 2.0) updateFields.pythonLevel = 'Intermediate';

    if (data.sqlAvgScore && data.sqlAvgScore >= 4.0) updateFields.sqlLevel = 'Expert';
    else if (data.sqlAvgScore && data.sqlAvgScore >= 3.0) updateFields.sqlLevel = 'Advanced';
    else if (data.sqlAvgScore && data.sqlAvgScore >= 2.0) updateFields.sqlLevel = 'Intermediate';

    if (data.sparkAvgScore && data.sparkAvgScore >= 4.0) updateFields.sparkLevel = 'Expert';
    else if (data.sparkAvgScore && data.sparkAvgScore >= 3.0) updateFields.sparkLevel = 'Advanced';
    else if (data.sparkAvgScore && data.sparkAvgScore >= 2.0) updateFields.sparkLevel = 'Intermediate';

    if (Object.keys(updateFields).length > 0) {
      await db.update(employees).set(updateFields).where(eq(employees.id, empId));
    }

    res.status(201).json(inserted[0]);
  } catch (error) {
    console.error('Error creating mentor session:', error);
    res.status(500).json({ error: 'Failed to log mentor session' });
  }
});

// Dashboard Statistics Overview
app.get(['/api/dashboard-stats', '/api/dashboard/stats'], authenticateUser, async (req: AuthRequest, res) => {
  try {
    let enriched = await getEnrichedEmployees();

    if (req.user?.role === 'mentor') {
      const mentorRecs = await db.select().from(mentors).where(eq(mentors.email, req.user.email)).limit(1);
      const mentorName = mentorRecs.length > 0 ? mentorRecs[0].name : req.user.name;
      enriched = enriched.filter(e => e.assignedMentor === mentorName);
    }

    // Compute metrics
    const totalBench = enriched.filter(e => e.employeeType === 'Bench' && e.status !== 'Allocated').length;
    const deployedCount = enriched.filter(e => e.status === 'Allocated').length;
    const totalNewJoiners = enriched.filter(e => e.employeeType === 'New Joiner').length;
    const totalLaterals = enriched.filter(e => e.employeeType === 'Lateral Entry').length;
    const interviewReady = enriched.filter(e => e.status === 'Interview Ready' || e.classificationTier === 'Client Ready').length;
    const needsSupportCount = enriched.filter(e => e.classificationTier === 'Needs Support').length;
    const benchAlertsCount = enriched.filter(e => e.weeksEnrolled > 12 && e.classificationTier !== 'Client Ready').length;

    // Top 10 Performers Leaderboard
    const leaderboard = [...enriched]
      .sort((a, b) => (b.overallScore || 0) - (a.overallScore || 0))
      .slice(0, 10)
      .map(e => ({
        id: e.id,
        name: e.name,
        skillGroup: e.skillGroup,
        avgScore: e.overallScore || 0,
        employeeType: e.employeeType,
        attendanceRate: e.attendanceRate
      }));

    // Flagged resources
    const flagged = enriched
      .filter(e => e.classificationTier === 'Needs Support' || e.managerAttentionRequired)
      .map(e => ({
        id: e.id,
        name: e.name,
        employeeType: e.employeeType,
        attendanceRate: e.attendanceRate,
        trend: e.scoreTrend || 'Stable',
        avgScore: e.overallScore || 0,
        reason: e.managerAttentionRequired 
          ? '🔴 Manager Attention Required (2 consecutive failed reviews)'
          : (e.tierReasons && e.tierReasons.length > 0 ? e.tierReasons[0] : 'Needs support')
      }));

    // Bench skill strength distribution (e.g. counts per skill group)
    const skillStrength = {
      Python: enriched.filter(e => e.skillGroup === 'Python').length,
      SQL: enriched.filter(e => e.skillGroup === 'SQL').length,
      Spark: enriched.filter(e => e.skillGroup === 'Spark').length,
      PySpark: enriched.filter(e => e.skillGroup === 'PySpark').length,
      General: enriched.filter(e => e.skillGroup === 'Data Engineering General').length,
    };

    // Mentor Performance calculations for Section 6.2
    const mentorsMap: { [name: string]: { name: string; mentees: number; totalScore: number; clientReady: number } } = {};
    enriched.forEach(e => {
      if (e.assignedMentor) {
        const mName = e.assignedMentor;
        if (!mentorsMap[mName]) {
          mentorsMap[mName] = { name: mName, mentees: 0, totalScore: 0, clientReady: 0 };
        }
        mentorsMap[mName].mentees += 1;
        mentorsMap[mName].totalScore += e.overallScore || 0;
        if (e.classificationTier === 'Client Ready') {
          mentorsMap[mName].clientReady += 1;
        }
      }
    });

    const mentorPerformance = Object.values(mentorsMap).map(m => ({
      name: m.name,
      mentees: m.mentees,
      avgTeamScore: m.mentees > 0 ? Number((m.totalScore / m.mentees).toFixed(2)) : 0,
      clientReadyCount: m.clientReady,
    }));

    res.json({
      stats: {
        overview: {
          totalEmployees: enriched.length,
          totalBench,
          totalNewJoiners,
          totalLaterals,
          interviewReady,
          needsSupport: needsSupportCount,
          benchAlerts: benchAlertsCount,
          deployed: deployedCount,
        },
        skillStrength,
        leaderboard,
        flagged,
        mentorPerformance,
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics', message: 'Failed to fetch dashboard statistics' });
  }
});

// Explicit recruiter action: mark a candidate Interview Ready and persist the status.
app.post('/api/employees/:id/mark-interview-ready', authenticateUser, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'manager') {
    return res.status(403).json({ error: 'Only admins and managers can change interview readiness.' });
  }
  const empId = Number(req.params.id);
  const requestedStatus = String(req.body?.status ?? 'Interview Ready');
  if (!['Enrolled', 'Interview Ready'].includes(requestedStatus)) {
    return res.status(400).json({ error: 'Status must be Enrolled or Interview Ready.' });
  }
  try {
    const updated = await db.update(employees).set({ status: requestedStatus }).where(eq(employees.id, empId)).returning();
    if (!updated.length) return res.status(404).json({ error: 'Employee not found.' });
    console.log(`[AUDIT] Employee ${empId} status set to ${requestedStatus} by ${req.user?.email || req.user?.name || 'Admin'}.`);
    return res.json(updated[0]);
  } catch (error: any) {
    console.error('Failed to update candidate interview status:', error.message || error);
    return res.status(500).json({ error: `Could not update candidate status: ${error.message || 'Unexpected server error.'}` });
  }
});

// Update employee status quickly
app.patch('/api/employees/:id/status', authenticateUser, async (req: AuthRequest, res) => {
  const empId = Number(req.params.id);
  const { status, forceOverride, overrideReason } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Missing status field', message: 'Missing status field' });
  }

  try {
    const empRecs = await db.select().from(employees).where(eq(employees.id, empId)).limit(1);
    if (empRecs.length === 0) {
      return res.status(404).json({ error: 'Employee not found', message: 'Employee not found' });
    }
    const emp = empRecs[0];

    const allMocks = await db.select().from(mockInterviews).where(eq(mockInterviews.employeeId, empId));
    const allAttendance = await db.select().from(attendance).where(eq(attendance.employeeId, empId));
    const allSessions = await db.select().from(mentorSessions).where(eq(mentorSessions.employeeId, empId)).orderBy(mentorSessions.sessionNumber);

    const { classificationTier, tierReasons } = computeClassificationTier(emp, allMocks, allAttendance, allSessions);

    if (status === 'Interview Ready' || status === 'Allocated') {
      if (classificationTier !== 'Interview Ready' && classificationTier !== 'Client Ready' && classificationTier !== 'Allocated') {
        const isAdmin = req.user?.role === 'admin';
        if (forceOverride && isAdmin) {
          console.log(`[AUDIT] Override applied for employee ID ${empId} to move to status ${status} by admin ${req.user?.email || 'Unknown'}. Reason: ${overrideReason || 'No reason provided'}`);
        } else {
          let detailMessage = `Cannot move to ${status === 'Interview Ready' ? 'Client Ready' : 'Deployed'} — employee is currently classified as '${classificationTier}'`;
          if (classificationTier === 'Needs Support' && tierReasons.length > 0) {
            detailMessage += `: ${tierReasons.join(', ')}`;
          } else if (classificationTier === 'In Training') {
            detailMessage += `: Overall score and domain scores do not meet Client Ready thresholds (overall score >= 4.0, Python/SQL/Spark >= 3.5, attendance rate >= 75%, and no overdue resources/retention issues).`;
          }
          return res.status(400).json({
            error: 'Not eligible',
            message: detailMessage
          });
        }
      }
    }

    const updated = await db.update(employees).set({ status }).where(eq(employees.id, empId)).returning();
    if (updated.length === 0) {
      return res.status(404).json({ error: 'Employee not found', message: 'Employee not found' });
    }

    const enrichedList = await getEnrichedEmployees();
    const freshlyEnriched = enrichedList.find(e => e.id === empId);
    res.json(freshlyEnriched || updated[0]);
  } catch (error: any) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Failed to update employee status', message: error.message || 'Failed to update employee status' });
  }
});

// Update attendance log status
app.patch('/api/attendance/:id', authenticateUser, async (req: AuthRequest, res) => {
  const logId = Number(req.params.id);
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Missing status field', message: 'Missing status field' });
  }

  try {
    const updated = await db.update(attendance).set({ status }).where(eq(attendance.id, logId)).returning();
    if (updated.length === 0) {
      return res.status(404).json({ error: 'Attendance log not found', message: 'Attendance log not found' });
    }
    res.json(updated[0]);
  } catch (error: any) {
    console.error('Error updating attendance log:', error);
    res.status(500).json({ error: 'Failed to update attendance log', message: error.message || 'Failed to update attendance log' });
  }
});

// Get Excel data-sync / seed status
app.get('/api/seed-status', authenticateUser, (req, res) => {
  res.json(getSeedStatus());
});

// Force re-seed / data sync from Excel files on demand
app.post('/api/reseed-from-excel', authenticateUser, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'manager') {
    return res.status(403).json({ error: 'Unauthorized', message: 'Only administrators or managers can trigger manual Excel sync.' });
  }

  try {
    console.log(`[Excel Sync] Manual sync requested by user: ${req.user.email}`);
    await seedFromExcelFiles();
    const status = getSeedStatus();
    if (status.status === 'success') {
      res.json({ message: 'Excel data synchronization successful!', status });
    } else if (status.status === 'files-not-found') {
      res.status(404).json({ error: 'Files Not Found', message: status.errorMessage, status });
    } else {
      res.status(500).json({ error: 'Sync Failed', message: status.errorMessage || 'An error occurred during synchronization.', status });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message || 'Failed to sync data.', status: getSeedStatus() });
  }
});

// ==========================================
// VITE DEV SERVER / PRODUCTION SERVING
// ==========================================

async function seedDatabaseIfEmpty() {
  try {
    // Never force a fresh seed on restart: doing so would erase changes and assessment history.
    const existingEmployees = await db.select({ id: employees.id }).from(employees).limit(1);
    if (existingEmployees.length > 0) {
      console.log('[Seed] Existing PostgreSQL data detected; skipping automatic Excel reseed.');
      return;
    }

    console.log('[Seed] No employee records found. Importing initial demo data from Excel once...');
    await seedFromExcelFiles(false);
    const seededEmployees = await db.select({ id: employees.id }).from(employees).limit(1);
    if (seededEmployees.length === 0) {
      console.warn('[Seed] No employee records were imported. Check Excel seed status and source files.');
    }
  } catch (error) {
    console.error('[Seed] Failed to initialize initial demo data:', error);
    throw error;
  }
}

async function ensureDemoTestCandidate() {
  // Add the requested local demo candidate only if neither email nor employee ID exists.
  // This does not create a HackerRank attempt or send an invitation.
  const existingEmployees = await db.select().from(employees);
  const demoEmail = 'kshitijmankar06@gmail.com';
  const demoEmployeeId = 'KSHITIJ-TEST';
  const existing = existingEmployees.find((employee: any) =>
    String(employee.email || '').toLowerCase() === demoEmail ||
    String(employee.employeeId || '').toUpperCase() === demoEmployeeId
  );
  if (existing) return;

  await db.insert(employees).values({
    employeeId: demoEmployeeId,
    name: 'Kshitij Mankar',
    email: demoEmail,
    joiningDate: '2026-10-12',
    designation: 'Consultant',
    employeeType: 'Bench',
    status: 'Enrolled',
    skillGroup: 'Data Engineering',
    persona: 'Data Engineer',
    skills: JSON.stringify(['Python', 'SQL', 'Spark', 'PySpark']),
    benchAgingDays: 0,
    yearsOfExperience: 5,
    previousProjectHistory: '',
    assignedMentor: null,
    currentProject: 'Bench',
    pythonLevel: 'Intermediate',
    sqlLevel: 'Intermediate',
    sparkLevel: 'Intermediate',
    pysparkLevel: 'Beginner',
    programEnrollmentDate: '2026-10-12',
    location: 'Bengaluru',
    module: 'Data Engineering',
    secondaryModule: null,
    excelSourceActive: false,
  });
  console.log('[Seed] Added local demo candidate KSHITIJ-TEST. No HackerRank invitation was sent.');
}

async function startServer() {
  // Initialize persistent PostgreSQL tables (safe to call on every start).
  await initDatabase();

  // Seed from Excel only if PostgreSQL has no employee records; never wipe existing data on restart.
  await seedDatabaseIfEmpty();
  await ensureDemoTestCandidate();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
