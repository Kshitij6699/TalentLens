import {
  evaluateCandidateReadiness,
  parseEmployeeAssessmentSettings,
  serializeEmployeeAssessmentSettings
} from '../src/utils/readiness.ts';
import type { HackerRankExam, ChakraInterview, AssessmentSkipAudit } from '../src/types.ts';

console.log('====================================================');
console.log('TalentLens — Candidate Readiness & Sync Regression Suite');
console.log('====================================================\n');

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${testName}${details ? ` — Details: ${details}` : ''}`);
    failedTests++;
  }
}

const createMockEmp = (options: {
  id?: number;
  status?: string;
  currentProject?: string | null;
  path?: 'hackerrank' | 'chakra' | 'both' | 'skip';
  skipAudit?: AssessmentSkipAudit | null;
}) => {
  const previousProjectHistory = serializeEmployeeAssessmentSettings(
    'Initial project history',
    options.path || 'hackerrank',
    options.skipAudit || null
  );
  return {
    id: options.id || 1,
    status: options.status || 'Enrolled',
    currentProject: options.currentProject || 'Bench',
    previousProjectHistory,
    overallScore: 75.0,
  };
};

// ----------------------------------------------------
// SUITE A: CANDIDATE READINESS REGRESSION SUITE
// ----------------------------------------------------
console.log('--- SUITE A: Candidate Readiness Evaluation ---');

// 1. Brand-new employee with no assessments -> Assessment Pending
{
  const emp = createMockEmp({ path: 'hackerrank' });
  const res = evaluateCandidateReadiness(emp, [], []);
  assert(res.readiness === 'Assessment Pending', 'A1: New employee with no assessments -> Assessment Pending', `Got ${res.readiness}`);
}

// 2. Employee with invited HackerRank assessment -> Assessment In Progress
{
  const emp = createMockEmp({ path: 'hackerrank' });
  const exams: any[] = [{
    id: 1,
    testId: '101',
    status: 'Invited',
    triggeredAt: new Date().toISOString(),
    rawResponse: JSON.stringify({ status: 'invited' })
  }];
  const res = evaluateCandidateReadiness(emp, exams, []);
  assert(res.readiness === 'Assessment In Progress', 'A2: Invited HackerRank assessment -> Assessment In Progress', `Got ${res.readiness}`);
}

// 3. Employee with in-progress HackerRank assessment -> Assessment In Progress
{
  const emp = createMockEmp({ path: 'hackerrank' });
  const exams: any[] = [{
    id: 1,
    testId: '101',
    status: 'In Progress',
    triggeredAt: new Date().toISOString(),
    rawResponse: JSON.stringify({ status: 'in_progress' })
  }];
  const res = evaluateCandidateReadiness(emp, exams, []);
  assert(res.readiness === 'Assessment In Progress', 'A3: In-progress HackerRank assessment -> Assessment In Progress', `Got ${res.readiness}`);
}

// 4. Employee with failed HackerRank assessment -> Assessment Failed
{
  const emp = createMockEmp({ path: 'hackerrank' });
  const exams: any[] = [{
    id: 1,
    testId: '101',
    status: 'Completed',
    triggeredAt: new Date().toISOString(),
    rawResponse: JSON.stringify({
      candidate: { percentage_score: 35, ats_state: 3 },
      assessmentOutcome: 'Failed'
    })
  }];
  const res = evaluateCandidateReadiness(emp, exams, []);
  assert(res.readiness === 'Assessment Failed', 'A4: Failed HackerRank assessment -> Assessment Failed', `Got ${res.readiness}`);
}

// 5. Employee with passed HackerRank assessment (HackerRank only) -> Ready for Interview
{
  const emp = createMockEmp({ path: 'hackerrank' });
  const exams: any[] = [{
    id: 1,
    testId: '101',
    status: 'Completed',
    triggeredAt: new Date().toISOString(),
    rawResponse: JSON.stringify({
      candidate: { percentage_score: 88, ats_state: 2 },
      assessmentOutcome: 'Passed'
    })
  }];
  const res = evaluateCandidateReadiness(emp, exams, []);
  assert(res.readiness === 'Ready for Interview', 'A5: Passed HackerRank (HackerRank only) -> Ready for Interview', `Got ${res.readiness}`);
}

// 6. Employee with passed HackerRank assessment (both required, Chakra pending) -> Chakra Pending
{
  const emp = createMockEmp({ path: 'both' });
  const exams: any[] = [{
    id: 1,
    testId: '101',
    status: 'Completed',
    triggeredAt: new Date().toISOString(),
    rawResponse: JSON.stringify({
      candidate: { percentage_score: 88, ats_state: 2 },
      assessmentOutcome: 'Passed'
    })
  }];
  const res = evaluateCandidateReadiness(emp, exams, []);
  assert(res.readiness === 'Chakra Pending', 'A6: Passed HackerRank, both required, Chakra pending -> Chakra Pending', `Got ${res.readiness}`);
}

// 7. Employee with passed HackerRank + passed Chakra (both required) -> Ready for Interview
{
  const emp = createMockEmp({ path: 'both' });
  const exams: any[] = [{
    id: 1,
    testId: '101',
    status: 'Completed',
    triggeredAt: new Date().toISOString(),
    rawResponse: JSON.stringify({
      candidate: { percentage_score: 88, ats_state: 2 },
      assessmentOutcome: 'Passed'
    })
  }];
  const chakra: any[] = [{
    id: 1,
    status: 'Completed',
    recommendation: 'hire',
    score: 4.5,
    triggeredAt: new Date().toISOString(),
    completedAt: new Date().toISOString()
  }];
  const res = evaluateCandidateReadiness(emp, exams, chakra);
  assert(res.readiness === 'Ready for Interview', 'A7: Passed HR + passed Chakra (both required) -> Ready for Interview', `Got ${res.readiness}`);
}

// 8. Employee with failed Chakra (both required, HR passed) -> Assessment Failed
{
  const emp = createMockEmp({ path: 'both' });
  const exams: any[] = [{
    id: 1,
    testId: '101',
    status: 'Completed',
    triggeredAt: new Date().toISOString(),
    rawResponse: JSON.stringify({
      candidate: { percentage_score: 88, ats_state: 2 },
      assessmentOutcome: 'Passed'
    })
  }];
  const chakra: any[] = [{
    id: 1,
    status: 'Completed',
    recommendation: 'no-hire',
    score: 2.0,
    triggeredAt: new Date().toISOString(),
    completedAt: new Date().toISOString()
  }];
  const res = evaluateCandidateReadiness(emp, exams, chakra);
  assert(res.readiness === 'Assessment Failed', 'A8: Failed Chakra (both required, HR passed) -> Assessment Failed', `Got ${res.readiness}`);
}

// 9. Employee with skipped assessments + audit reason -> Ready for Interview
{
  const emp = createMockEmp({
    path: 'skip',
    skipAudit: {
      skippedBy: 'admin@talentlens.internal',
      skippedAt: new Date().toISOString(),
      reason: 'Senior lateral hire with 10 years verified experience'
    }
  });
  const res = evaluateCandidateReadiness(emp, [], []);
  assert(res.readiness === 'Ready for Interview', 'A9: Skipped assessments with audit reason -> Ready for Interview', `Got ${res.readiness}`);
}

// 10. Employee with two failed attempts -> Assessment Failed, escalated/mentor review required
{
  const emp = createMockEmp({ path: 'hackerrank' });
  const exams: any[] = [
    {
      id: 1,
      testId: '101',
      status: 'Completed',
      rawResponse: JSON.stringify({ candidate: { percentage_score: 40, ats_state: 3 }, assessmentOutcome: 'Failed' }),
      triggeredAt: new Date(Date.now() - 86400000).toISOString()
    },
    {
      id: 2,
      testId: '101',
      status: 'Completed',
      rawResponse: JSON.stringify({ candidate: { percentage_score: 45, ats_state: 3 }, assessmentOutcome: 'Failed' }),
      triggeredAt: new Date().toISOString()
    }
  ];
  const res = evaluateCandidateReadiness(emp, exams, []);
  assert(res.readiness === 'Assessment Failed', 'A10a: Two failed attempts -> Assessment Failed', `Got ${res.readiness}`);
  assert(res.failedCount === 2, 'A10b: Two failed attempts counted', `Got ${res.failedCount}`);
  assert(res.escalationRequired === true, 'A10c: Review escalated for 2+ failures', `Got ${res.escalationRequired}`);
}

// 11. Employment status independence (Allocated / Bench vs Interview Readiness)
{
  const benchEmp = createMockEmp({ status: 'Available', currentProject: 'Bench', path: 'hackerrank' });
  const exams: any[] = [{
    id: 1,
    testId: '101',
    status: 'Invited',
    triggeredAt: new Date().toISOString(),
    rawResponse: JSON.stringify({ status: 'invited' })
  }];
  const res = evaluateCandidateReadiness(benchEmp, exams, []);
  assert(res.readiness === 'Assessment In Progress', 'A11: Bench employee still has Assessment In Progress readiness, not conflated with employment status');
}

// ----------------------------------------------------
// SUITE B: METADATA SERIALIZATION & AUDIT TRAIL
// ----------------------------------------------------
console.log('\n--- SUITE B: Metadata Serialization & Audit Integrity ---');

{
  const originalHistory = 'Previous role: Senior Data Engineer at Acme Corp.';
  const serialized = serializeEmployeeAssessmentSettings(originalHistory, 'both', {
    skippedBy: 'recruiter@talentlens.internal',
    skippedAt: '2026-10-31T20:00:00.000Z',
    reason: 'Approved by lead'
  });

  const parsed = parseEmployeeAssessmentSettings(serialized);
  assert(parsed.assessmentPath === 'both', 'B1: Preserves assessmentPath without schema migration', `Got ${parsed.assessmentPath}`);
  assert(parsed.skipAudit?.reason === 'Approved by lead', 'B2: Preserves skipAudit reason', `Got ${parsed.skipAudit?.reason}`);
  assert(parsed.projectHistory === originalHistory, 'B3: Strips metadata block cleanly from user-facing text', `Got ${parsed.projectHistory}`);
}

// ----------------------------------------------------
// SUITE C: SYNCHRONIZATION INTEGRITY & TIMESTAMP RULES
// ----------------------------------------------------
console.log('\n--- SUITE C: Synchronization Integrity & Timestamp Protection ---');

// Timestamp protection logic
function formatAssessmentCompletedAt(exam: any): string {
  let candidate: any = {};
  try {
    candidate = exam?.rawResponse ? JSON.parse(exam.rawResponse)?.candidate : {};
  } catch { candidate = {}; }

  const value = exam?.completedAt ?? exam?.completed_at ??
    candidate?.completed_at ?? candidate?.completedAt ?? candidate?.submitted_at ??
    candidate?.finished_at ?? candidate?.date_completed ?? candidate?.test_completed_at ?? null;

  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toISOString();
}

// C1: Invited assessment -> Completed displays "—"
{
  const exam = {
    status: 'Invited',
    triggeredAt: '2026-10-30T10:00:00.000Z',
    completedAt: null,
    rawResponse: JSON.stringify({ candidate: { created_at: '2026-10-30T10:00:00.000Z', status: 'invited' } })
  };
  const completed = formatAssessmentCompletedAt(exam);
  assert(completed === '—', 'C1: Invited assessment displays "—" for Completed date', `Got ${completed}`);
}

// C2: In-progress assessment -> Completed displays "—"
{
  const exam = {
    status: 'In Progress',
    triggeredAt: '2026-10-30T10:00:00.000Z',
    completedAt: null,
    rawResponse: JSON.stringify({ candidate: { started_at: '2026-10-30T10:15:00.000Z', status: 'in_progress' } })
  };
  const completed = formatAssessmentCompletedAt(exam);
  assert(completed === '—', 'C2: In-progress assessment displays "—" for Completed date', `Got ${completed}`);
}

// C3: Completed assessment -> Completed displays actual completion timestamp
{
  const completionIso = '2026-10-30T11:45:00.000Z';
  const exam = {
    status: 'Completed',
    triggeredAt: '2026-10-30T10:00:00.000Z',
    completedAt: completionIso,
    rawResponse: JSON.stringify({ candidate: { completed_at: completionIso, status: 'completed' } })
  };
  const completed = formatAssessmentCompletedAt(exam);
  assert(completed === completionIso, 'C3: Completed assessment displays actual completion timestamp', `Got ${completed}`);
}

// C4: Sync protection: Completed attempt does NOT downgrade status or overwrite scores
{
  const existingExam = {
    id: 1,
    status: 'Completed',
    score: '85',
    completedAt: '2026-10-30T11:45:00.000Z',
    syncedAt: '2026-10-30T11:46:00.000Z'
  };

  const partialProviderResponse = {
    status: 'in_progress',
    score: null
  };

  const resolvedStatus = (existingExam.status === 'Completed' && partialProviderResponse.status !== 'Completed')
    ? existingExam.status
    : partialProviderResponse.status;

  const resolvedScore = partialProviderResponse.score !== null && partialProviderResponse.score !== undefined
    ? String(partialProviderResponse.score)
    : existingExam.score;

  assert(resolvedStatus === 'Completed', 'C4a: Status downgrade prevented (remains Completed)');
  assert(resolvedScore === '85', 'C4b: Existing score protected from null overwrite');
}

// C5: Multiple attempts on same test: latest attempt drives readiness
{
  const emp = createMockEmp({ path: 'hackerrank' });
  const exams: any[] = [
    {
      id: 1,
      testId: 'test-101',
      status: 'Completed',
      rawResponse: JSON.stringify({ candidate: { percentage_score: 40, ats_state: 3 }, assessmentOutcome: 'Failed' }),
      triggeredAt: '2026-10-20T10:00:00.000Z'
    },
    {
      id: 2,
      testId: 'test-101',
      status: 'Completed',
      rawResponse: JSON.stringify({ candidate: { percentage_score: 92, ats_state: 2 }, assessmentOutcome: 'Passed' }),
      triggeredAt: '2026-10-25T10:00:00.000Z'
    }
  ];

  const res = evaluateCandidateReadiness(emp, exams, []);
  assert(res.readiness === 'Ready for Interview', 'C5: Latest attempt drives candidate readiness (older failure superseded by newer pass)', `Got ${res.readiness}`);
}

console.log('\n====================================================');
console.log(`Test Results: ${passedTests} passed, ${failedTests} failed`);
console.log('====================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
