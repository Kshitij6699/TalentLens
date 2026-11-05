import fs from 'node:fs';
import path from 'node:path';
import * as XLSXModule from 'xlsx';
const XLSX = (XLSXModule as any).default || XLSXModule;
import { db } from './index.ts';
import { employees, mentors } from './schema.ts';

export type SeedStatus = {
  status: 'idle' | 'failed' | 'success' | 'files-not-found';
  timestamp: string | null;
  errorMessage: string;
  resolvedEmployeePath: string | null;
  resolvedMentorPath: string | null;
  triedPaths: string[];
  mentorsStats?: { totalInFile: number; inserted: number; skipped: number };
  employeesStats?: { totalInFile: number; inserted: number; skipped: number };
};

export type SeedResult = {
  totalInFile: number;
  inserted: number;
  skipped: number;
};

let seedStatus: SeedStatus = {
  status: 'idle',
  timestamp: null,
  errorMessage: '',
  resolvedEmployeePath: null,
  resolvedMentorPath: null,
  triedPaths: [],
};

export const getSeedStatus = (): SeedStatus => ({ ...seedStatus });

export const mapExcelLevelToDesignation = (level: unknown): string => {
  const raw = String(level ?? '').trim();
  const lower = raw.toLowerCase();
  if (lower.includes('director')) return 'Director';
  if (lower.includes('senior manager')) return 'Senior Manager';
  if (lower.includes('manager')) return 'Manager';
  if (lower.includes('assistant manager') || lower.includes('.am')) return 'Assistant Manager';
  if (lower.includes('senior') || lower.includes('lead')) return 'Senior Consultant';
  if (lower.includes('analyst') || lower.includes('associate')) return 'Associate Consultant';
  if (lower.includes('consultant')) return 'Consultant';
  return raw.replace(/^[0-9]+\./, '') || 'Consultant';
};

export const getDesignationRank = (designation: unknown): number => {
  const value = String(designation ?? '').toLowerCase();
  if (value.includes('manager') && value.includes('senior')) return 6;
  if (value.includes('manager')) return 5;
  if (value.includes('assistant manager') || value === 'am') return 4;
  if (value.includes('senior') || value.includes('consultant') || value === 'con') return 3;
  if (value.includes('executive') || value.includes('associate consultant') || value === 'acon') return 2;
  return 1;
};

export function findSeedFile(filename: string): string | null {
  const candidatePaths = [
    path.join(process.cwd(), 'assets', filename),
    path.join(process.cwd(), filename),
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

/**
 * Seed mentors independently from Mentors_list.xlsx.
 * Uses atomic ON CONFLICT (employee_id) DO NOTHING and verifies both employeeId and email
 * so duplicate IDs and duplicate emails are safely skipped without overwriting.
 */
export const seedMentorsFromExcel = async (targetDb = db): Promise<SeedResult> => {
  const filename = 'Mentors_list.xlsx';
  const filePath = findSeedFile(filename);

  if (!filePath) {
    console.warn(`[Seed] Mentors file not found: ${filename}`);
    return { totalInFile: 0, inserted: 0, skipped: 0 };
  }

  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames[0];
  const rawMentors: any[] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);

  const existing = await targetDb.select({ employeeId: mentors.employeeId, email: mentors.email }).from(mentors);
  const existingIdSet = new Set(existing.map((m: any) => String(m.employeeId).trim().toUpperCase()));
  const existingEmailSet = new Set(existing.map((m: any) => String(m.email || '').trim().toLowerCase()));

  let insertedCount = 0;
  let skippedCount = 0;

  for (const row of rawMentors) {
    const id = String(row['Mentor ID'] || row['Mentor Id'] || row['ID'] || '').trim();
    const name = String(row['Mentor Name'] || row['Name'] || '').trim();
    if (!id || !name) continue;

    const email = `${name.toLowerCase().replace(/[^a-z0-9]/g, '.')}@talentlens.com`;

    if (existingIdSet.has(id.toUpperCase()) || existingEmailSet.has(email.toLowerCase())) {
      skippedCount++;
      continue;
    }

    const designation = mapExcelLevelToDesignation(row['Level'] || row['Designation']);
    const location = String(row['Location'] || 'Bengaluru').trim();

    try {
      await targetDb
        .insert(mentors)
        .values({
          employeeId: id,
          name,
          email,
          phone: null,
          designation,
          domainExpertise: JSON.stringify(['Data Engineering', 'Python', 'SQL', 'Cloud']),
          yearsOfExperience: 6,
          maxCapacity: 4,
          status: 'Active',
          location,
        })
        .onConflictDoNothing({ target: mentors.employeeId });

      existingIdSet.add(id.toUpperCase());
      existingEmailSet.add(email.toLowerCase());
      insertedCount++;
    } catch (err: any) {
      console.warn(`[Seed] Notice: skipped mentor ${id} due to constraint:`, err.message);
      skippedCount++;
    }
  }

  console.log(`[Seed:Mentors] Processed ${rawMentors.length} in workbook: ${insertedCount} newly inserted, ${skippedCount} existing/skipped.`);
  return { totalInFile: rawMentors.length, inserted: insertedCount, skipped: skippedCount };
};

/**
 * Seed employees independently from Dashboard_source_bench_updated.xlsx.
 * Uses atomic ON CONFLICT (employee_id) DO NOTHING and verifies both employeeId and email
 * so duplicate IDs and duplicate emails are safely skipped without overwriting.
 */
export const seedEmployeesFromExcel = async (targetDb = db): Promise<SeedResult> => {
  const filename = 'Dashboard_source_bench_updated.xlsx';
  const filePath = findSeedFile(filename);

  if (!filePath) {
    console.warn(`[Seed] Employees file not found: ${filename}`);
    return { totalInFile: 0, inserted: 0, skipped: 0 };
  }

  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames[0];
  const rawEmployees: any[] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);

  const existing = await targetDb.select({ employeeId: employees.employeeId, email: employees.email }).from(employees);
  const existingIdSet = new Set(existing.map((e: any) => String(e.employeeId).trim().toUpperCase()));
  const existingEmailSet = new Set(existing.map((e: any) => String(e.email || '').trim().toLowerCase()));

  let insertedCount = 0;
  let skippedCount = 0;

  for (const row of rawEmployees) {
    const id = String(row['Emp No'] || row['Emp Id'] || row['Employee ID'] || '').trim();
    const name = String(row['Emp Name'] || row['Name'] || '').trim();
    if (!id || !name) continue;

    const email = `${name.toLowerCase().replace(/[^a-z0-9]/g, '.')}@talentlens.com`;

    if (existingIdSet.has(id.toUpperCase()) || existingEmailSet.has(email.toLowerCase())) {
      skippedCount++;
      continue;
    }

    const designation = mapExcelLevelToDesignation(row['Level']);
    const location = String(row['Location'] || 'Bengaluru').trim();
    const rawSkills = String(row['Misc. Skill'] || 'Python, SQL').split(',').map((s: string) => s.trim()).filter(Boolean);
    const module = String(row['Module'] || 'Data Engineering').trim();
    const secondaryModule = row['SecondaryModule'] ? String(row['SecondaryModule']).trim() : null;
    const skillGroup = String(row['SkillGroup'] || 'Data Engineering').trim();
    const status = String(row['Deployment Status'] || 'Available').trim();

    try {
      await targetDb
        .insert(employees)
        .values({
          employeeId: id,
          name,
          email,
          joiningDate: '2026-01-15',
          designation,
          employeeType: 'Bench',
          status: status === 'Available' ? 'Available' : 'Enrolled',
          skillGroup,
          persona: 'Data Engineer',
          skills: JSON.stringify(rawSkills),
          benchAgingDays: 14,
          yearsOfExperience: 3.5,
          currentProject: 'Bench',
          pythonLevel: 'Intermediate',
          sqlLevel: 'Intermediate',
          sparkLevel: 'Beginner',
          pysparkLevel: 'Beginner',
          programEnrollmentDate: '2026-09-01',
          location,
          module,
          secondaryModule,
          excelSourceActive: true,
          overallScore: 78.5,
        })
        .onConflictDoNothing({ target: employees.employeeId });

      existingIdSet.add(id.toUpperCase());
      existingEmailSet.add(email.toLowerCase());
      insertedCount++;
    } catch (err: any) {
      console.warn(`[Seed] Notice: skipped employee ${id} due to constraint:`, err.message);
      skippedCount++;
    }
  }

  console.log(`[Seed:Employees] Processed ${rawEmployees.length} in workbook: ${insertedCount} newly inserted, ${skippedCount} existing/skipped.`);
  return { totalInFile: rawEmployees.length, inserted: insertedCount, skipped: skippedCount };
};

/**
 * Seeds the demo test candidate (KSHITIJ-TEST) separately from the 100 Excel candidates.
 * Completely idempotent and conflict-safe on both employeeId and email.
 */
export const seedDemoCandidate = async (targetDb = db): Promise<{ inserted: boolean; employeeId: string }> => {
  const demoEmail = 'kshitijmankar06@gmail.com';
  const demoEmployeeId = 'KSHITIJ-TEST';

  const existing = await targetDb.select({ employeeId: employees.employeeId, email: employees.email }).from(employees);
  const exists = existing.some((e: any) =>
    String(e.email || '').trim().toLowerCase() === demoEmail.toLowerCase() ||
    String(e.employeeId || '').trim().toUpperCase() === demoEmployeeId.toUpperCase()
  );

  if (exists) {
    return { inserted: false, employeeId: demoEmployeeId };
  }

  await targetDb
    .insert(employees)
    .values({
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
    })
    .onConflictDoNothing({ target: employees.employeeId });

  console.log(`[Seed:Demo] Seeded demo candidate ${demoEmployeeId} (${demoEmail}).`);
  return { inserted: true, employeeId: demoEmployeeId };
};

/**
 * Unified Excel seed function that runs mentors and employees independently.
 * Neither failure of one nor partial completion prevents retrying or completing the other.
 */
export const seedFromExcelFiles = async (_force = false, targetDb = db): Promise<void> => {
  const empPath = findSeedFile('Dashboard_source_bench_updated.xlsx');
  const mentorPath = findSeedFile('Mentors_list.xlsx');

  seedStatus.triedPaths = [
    path.join(process.cwd(), 'assets', 'Dashboard_source_bench_updated.xlsx'),
    path.join(process.cwd(), 'assets', 'Mentors_list.xlsx'),
  ];
  seedStatus.resolvedEmployeePath = empPath;
  seedStatus.resolvedMentorPath = mentorPath;
  seedStatus.timestamp = new Date().toISOString();

  if (!empPath && !mentorPath) {
    seedStatus.status = 'files-not-found';
    seedStatus.errorMessage = 'Excel source files not found in assets directory.';
    console.warn(`[Seed] ${seedStatus.errorMessage}`);
    return;
  }

  try {
    const mentorsStats = await seedMentorsFromExcel(targetDb);
    const employeesStats = await seedEmployeesFromExcel(targetDb);

    seedStatus.mentorsStats = mentorsStats;
    seedStatus.employeesStats = employeesStats;
    seedStatus.status = 'success';
    seedStatus.errorMessage = '';
  } catch (err: any) {
    seedStatus.status = 'failed';
    seedStatus.errorMessage = err.message || 'Error occurred during Excel seeding.';
    console.error('[Seed] Error seeding from Excel:', err);
    throw err;
  }
};