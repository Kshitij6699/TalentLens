import type { HackerRankExam, ChakraInterview, AssessmentPath, InterviewReadiness, AssessmentSkipAudit } from '../types.ts';

export interface ReadinessEvaluation {
  readiness: InterviewReadiness;
  reasons: string[];
  assessmentPath: AssessmentPath;
  hackerRankStatus: 'Passed' | 'Failed' | 'In Progress' | 'Invited' | 'Pending' | 'Review required';
  chakraStatus: 'Passed' | 'Failed' | 'In Progress' | 'Invited' | 'Pending';
  hackerRankOutcome: 'Passed' | 'Failed' | 'Review required' | null;
  chakraRecommendation: string | null;
  canMarkReady: boolean;
  failedCount: number;
  escalationRequired: boolean;
  retryAllowed: boolean;
  skipAudit?: AssessmentSkipAudit | null;
}

export function parseEmployeeAssessmentSettings(previousProjectHistory?: string | null): {
  projectHistory: string;
  assessmentPath?: AssessmentPath;
  skipAudit?: AssessmentSkipAudit | null;
} {
  if (!previousProjectHistory) {
    return { projectHistory: '' };
  }
  const trimmed = previousProjectHistory.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      return {
        projectHistory: typeof parsed.projectHistory === 'string' ? parsed.projectHistory : '',
        assessmentPath: parsed.assessmentPath,
        skipAudit: parsed.skipAudit || null,
      };
    } catch {
      return { projectHistory: previousProjectHistory };
    }
  }
  return { projectHistory: previousProjectHistory };
}

export function serializeEmployeeAssessmentSettings(
  projectHistory: string,
  assessmentPath?: AssessmentPath,
  skipAudit?: AssessmentSkipAudit | null
): string {
  if (!assessmentPath && !skipAudit) {
    return projectHistory;
  }
  return JSON.stringify({
    projectHistory: projectHistory || '',
    assessmentPath,
    skipAudit: skipAudit || null,
  });
}

export function evaluateCandidateReadiness(
  emp: {
    id: number;
    status: string;
    currentProject?: string | null;
    previousProjectHistory?: string | null;
    overallScore?: number | null;
  },
  exams: HackerRankExam[] = [],
  chakraInterviews: ChakraInterview[] = []
): ReadinessEvaluation {
  const { assessmentPath: explicitPath, skipAudit } = parseEmployeeAssessmentSettings(emp.previousProjectHistory);

  // 1. Analyze HackerRank assessments (exclude legacy simulated records)
  const validExams = (exams || []).filter(e => {
    try {
      const parsed = e.rawResponse ? JSON.parse(e.rawResponse) : {};
      return parsed.simulated !== true;
    } catch { return true; }
  }).sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime());

  let hackerRankStatus: 'Passed' | 'Failed' | 'In Progress' | 'Invited' | 'Pending' | 'Review required' = 'Pending';
  let hackerRankOutcome: 'Passed' | 'Failed' | 'Review required' | null = null;
  let failedCount = 0;

  for (const e of validExams) {
    let outcome: string | null = null;
    try {
      const parsed = e.rawResponse ? JSON.parse(e.rawResponse) : {};
      outcome = parsed.providerAssessmentOutcome ?? parsed.assessmentOutcome ?? parsed.outcome ?? null;
      if (!outcome && parsed.candidate) {
        const ats = Number(parsed.candidate.ats_state);
        if (ats === 2) outcome = 'Passed';
        else if (ats === 3) outcome = 'Failed';
        else if (ats === 1) outcome = 'Review required';
      }
    } catch {}

    const isFail = outcome === 'Failed' || e.status === 'Failed' || e.status === 'Expired';
    if (isFail) failedCount++;
  }

  if (validExams.length > 0) {
    const latest = validExams[0];
    let latestOutcome: string | null = null;
    try {
      const parsed = latest.rawResponse ? JSON.parse(latest.rawResponse) : {};
      latestOutcome = parsed.providerAssessmentOutcome ?? parsed.assessmentOutcome ?? parsed.outcome ?? null;
      if (!latestOutcome && parsed.candidate) {
        const ats = Number(parsed.candidate.ats_state);
        if (ats === 2) latestOutcome = 'Passed';
        else if (ats === 3) latestOutcome = 'Failed';
        else if (ats === 1) latestOutcome = 'Review required';
      }
    } catch {}

    if (latestOutcome === 'Passed') {
      hackerRankStatus = 'Passed';
      hackerRankOutcome = 'Passed';
    } else if (latestOutcome === 'Failed' || latest.status === 'Failed' || latest.status === 'Expired') {
      hackerRankStatus = 'Failed';
      hackerRankOutcome = 'Failed';
    } else if (latest.status === 'Completed') {
      hackerRankStatus = 'Review required';
      hackerRankOutcome = 'Review required';
    } else if (['In Progress', 'Processing', 'Submitted - Reports Pending'].includes(latest.status)) {
      hackerRankStatus = 'In Progress';
    } else if (latest.status === 'Invited') {
      hackerRankStatus = 'Invited';
    } else {
      hackerRankStatus = 'Pending';
    }
  }

  // 2. Analyze Chakra interviews (exclude unconfirmed Invite Prepared)
  const validChakra = (chakraInterviews || []).filter(c => c.status !== 'Invite Prepared')
    .sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime());

  let chakraStatus: 'Passed' | 'Failed' | 'In Progress' | 'Invited' | 'Pending' = 'Pending';
  let chakraRecommendation: string | null = null;

  if (validChakra.length > 0) {
    const latest = validChakra[0];
    chakraRecommendation = latest.recommendation || null;
    const status = String(latest.status || '').trim().toLowerCase();
    const rec = String(latest.recommendation || '').toLowerCase();
    const score = latest.score;

    if (status === 'completed') {
      if (rec.includes('no hire') || rec.includes('fail') || rec.includes('not recommended') || (score !== null && score !== undefined && score < 2.5)) {
        chakraStatus = 'Failed';
      } else if (rec.includes('hire') || rec.includes('pass') || rec.includes('recommended') || (score !== null && score !== undefined && score >= 3.0)) {
        chakraStatus = 'Passed';
      } else {
        chakraStatus = 'Passed';
      }
    } else if (status === 'in progress') {
      chakraStatus = 'In Progress';
    } else if (status === 'invited') {
      chakraStatus = 'Invited';
    } else if (status === 'failed' || status === 'expired') {
      chakraStatus = 'Failed';
    } else {
      chakraStatus = 'Pending';
    }
  }

  // 3. Determine Effective Assessment Path
  let assessmentPath: AssessmentPath = explicitPath || 'hackerrank';
  if (!explicitPath) {
    if (validExams.length > 0 && validChakra.length > 0) {
      assessmentPath = 'both';
    } else if (validChakra.length > 0 && validExams.length === 0) {
      assessmentPath = 'chakra';
    } else {
      assessmentPath = 'hackerrank';
    }
  }

  const escalationRequired = failedCount >= 2;
  const retryAllowed = failedCount === 1;
  const reasons: string[] = [];

  // 4. Derive Interview Readiness
  let readiness: InterviewReadiness = 'Assessment Pending';
  let canMarkReady = false;

  if (assessmentPath === 'skip') {
    readiness = 'Ready for Interview';
    canMarkReady = true;
    reasons.push(skipAudit?.reason ? `Assessments bypassed: ${skipAudit.reason}` : 'Assessments explicitly bypassed by recruiter.');
    return {
      readiness,
      reasons,
      assessmentPath,
      hackerRankStatus,
      chakraStatus,
      hackerRankOutcome,
      chakraRecommendation,
      canMarkReady,
      failedCount,
      escalationRequired,
      retryAllowed,
      skipAudit,
    };
  }

  // Check failures first
  const hrRequired = assessmentPath === 'hackerrank' || assessmentPath === 'both';
  const chakraRequired = assessmentPath === 'chakra' || assessmentPath === 'both';

  const isFailed = (hrRequired && hackerRankStatus === 'Failed') || (chakraRequired && chakraStatus === 'Failed');
  if (isFailed) {
    readiness = 'Assessment Failed';
    canMarkReady = false;
    if (hrRequired && hackerRankStatus === 'Failed') {
      reasons.push(escalationRequired
        ? 'HackerRank assessment failed multiple times — manager escalation required.'
        : 'HackerRank assessment not passed — candidate eligible for retry.');
    }
    if (chakraRequired && chakraStatus === 'Failed') {
      reasons.push('Chakra AI interview evaluation not passed.');
    }
    return {
      readiness,
      reasons,
      assessmentPath,
      hackerRankStatus,
      chakraStatus,
      hackerRankOutcome,
      chakraRecommendation,
      canMarkReady,
      failedCount,
      escalationRequired,
      retryAllowed,
      skipAudit,
    };
  }

  // Check in progress or invited
  const isInProgress = (hrRequired && (hackerRankStatus === 'In Progress' || hackerRankStatus === 'Invited' || hackerRankStatus === 'Review required')) ||
    (chakraRequired && (chakraStatus === 'In Progress' || chakraStatus === 'Invited'));

  if (isInProgress) {
    readiness = 'Assessment In Progress';
    canMarkReady = false;
    if (hrRequired) {
      if (hackerRankStatus === 'Invited') reasons.push('HackerRank invitation sent — candidate attempt pending.');
      else if (hackerRankStatus === 'In Progress') reasons.push('HackerRank assessment in progress.');
      else if (hackerRankStatus === 'Review required') reasons.push('HackerRank assessment completed — recruiter review required.');
    }
    if (chakraRequired && (chakraStatus === 'Invited' || chakraStatus === 'In Progress')) {
      reasons.push('Chakra AI interview invitation sent / attempt in progress.');
    }
    return {
      readiness,
      reasons,
      assessmentPath,
      hackerRankStatus,
      chakraStatus,
      hackerRankOutcome,
      chakraRecommendation,
      canMarkReady,
      failedCount,
      escalationRequired,
      retryAllowed,
      skipAudit,
    };
  }

  // Check path-specific completion
  if (assessmentPath === 'hackerrank') {
    if (hackerRankStatus === 'Passed') {
      readiness = 'Ready for Interview';
      canMarkReady = true;
      reasons.push('Authoritative HackerRank assessment passed.');
    } else {
      readiness = 'Assessment Pending';
      canMarkReady = false;
      reasons.push('HackerRank assessment has not been triggered yet.');
    }
  } else if (assessmentPath === 'chakra') {
    if (chakraStatus === 'Passed') {
      readiness = 'Ready for Interview';
      canMarkReady = true;
      reasons.push('Chakra AI interview successfully completed.');
    } else {
      readiness = 'Chakra Pending';
      canMarkReady = false;
      reasons.push('Chakra AI interview pending invitation.');
    }
  } else if (assessmentPath === 'both') {
    if (hackerRankStatus === 'Passed' && chakraStatus === 'Passed') {
      readiness = 'Ready for Interview';
      canMarkReady = true;
      reasons.push('Both HackerRank assessment and Chakra AI interview passed.');
    } else if (hackerRankStatus === 'Passed' && chakraStatus !== 'Passed') {
      readiness = 'Chakra Pending';
      canMarkReady = false;
      reasons.push('HackerRank passed — awaiting Chakra AI interview completion.');
    } else {
      readiness = 'Assessment Pending';
      canMarkReady = false;
      reasons.push('HackerRank assessment must be passed before progressing.');
    }
  }

  return {
    readiness,
    reasons,
    assessmentPath,
    hackerRankStatus,
    chakraStatus,
    hackerRankOutcome,
    chakraRecommendation,
    canMarkReady,
    failedCount,
    escalationRequired,
    retryAllowed,
    skipAudit,
  };
}
