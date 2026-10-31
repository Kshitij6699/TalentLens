import React, { useState } from 'react';
import { 
  X, Play, User, RefreshCw, CheckCircle2, ExternalLink, Upload, Bot
} from 'lucide-react';
import { Employee, STATUS_LABELS, ChakraInterview } from '../types.ts';

type AssessmentExperienceBand = '0-5' | '5-10';
type AssessmentDifficulty = 'Beginner' | 'Intermediate';
type AssessmentTestCode = 'B1' | 'B2' | 'B3' | 'I1' | 'I2' | 'I3';

interface HackerRankTestOption {
  id: string;
  name: string;
  duration: number | null;
  cutoffScore: number | null;
  experienceBand: AssessmentExperienceBand | null;
  proficiencyLevel: AssessmentDifficulty | null;
  code: AssessmentTestCode | null;
  configured?: boolean;
}

const readApiJson = async (response: Response): Promise<any> => {
  const body = await response.text();
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html') || /<!doctype html|<html/i.test(body.slice(0, 200))) {
      throw new Error('The server returned a webpage instead of API JSON. Restart `npm run dev` so the updated server.ts route is loaded.');
    }
    throw new Error('The server returned an invalid response while processing this request.');
  }
};

const parseExamResponse = (rawResponse?: string | null): any => {
  if (!rawResponse) return {};
  try { return JSON.parse(rawResponse); } catch { return {}; }
};

const getRawCandidate = (rawResponse?: string | null): any => {
  const data = parseExamResponse(rawResponse);
  return data?.candidate ?? data?.apiResponse?.candidate ?? data?.invitationResponse?.candidate ?? data?.invitationResponse ?? data;
};

const isSimulatedExam = (rawResponse?: string | null): boolean => parseExamResponse(rawResponse)?.simulated === true;

const getAssessmentOutcome = (rawResponse?: string | null): 'Passed' | 'Failed' | 'Review required' | null => {
  if (!rawResponse || isSimulatedExam(rawResponse)) return null;
  const data = parseExamResponse(rawResponse);
  const candidate = getRawCandidate(rawResponse);
  const atsState = Number(candidate?.ats_state);
  // Current HackerRank ATS state is authoritative. State 1 means the provider needs review.
  if (atsState === 2) return 'Passed';
  if (atsState === 3) return 'Failed';
  if (atsState === 1) return 'Review required';
  const providerOutcome = data?.providerAssessmentOutcome;
  if (typeof providerOutcome === 'string') {
    if (/^(passed?|qualified)$/i.test(providerOutcome.trim())) return 'Passed';
    if (/^(failed?|not qualified)$/i.test(providerOutcome.trim())) return 'Failed';
    if (/^review required$/i.test(providerOutcome.trim())) return 'Review required';
  }
  // Old records may contain a TalentLens-only manual override. Ignore it until Sync refreshes from HackerRank.
  const storedOutcome = data?.manualReview ? null : (data?.assessmentOutcome ?? data?.outcome);
  if (typeof storedOutcome === 'string') {
    if (/^(passed?|qualified)$/i.test(storedOutcome.trim())) return 'Passed';
    if (/^(failed?|not qualified)$/i.test(storedOutcome.trim())) return 'Failed';
    if (/^review required$/i.test(storedOutcome.trim())) return 'Review required';
  }
  const outcome = candidate?.assessmentOutcome ?? candidate?.outcome ?? candidate?.verdict ?? candidate?.result;
  if (typeof outcome === 'string' && /^(passed?|qualified|failed?|not qualified)$/i.test(outcome.trim())) {
    return /^(pass|qualified)/i.test(outcome.trim()) ? 'Passed' : 'Failed';
  }
  const qualified = candidate?.is_qualified ?? candidate?.qualified ?? candidate?.passed;
  if (typeof qualified === 'boolean') return qualified ? 'Passed' : 'Failed';
  // Never infer Pass/Fail from a score. Show only an outcome reported by HackerRank.
  return null;
};

const getAssessmentScoreDisplay = (exam: any): string => {
  if (isSimulatedExam(exam.rawResponse)) return 'Test data — not real';
  const candidate = getRawCandidate(exam.rawResponse);
  const percentage = candidate?.percentage_score;
  if (percentage !== null && percentage !== undefined && Number.isFinite(Number(percentage))) {
    return `${Number(percentage).toFixed(1)}%`;
  }
  const score = candidate?.score ?? candidate?.total_score ?? candidate?.test_score ?? exam.score;
  const maxScore = candidate?.max_score ?? candidate?.maxScore ?? candidate?.total_max_score;
  if (score !== null && score !== undefined && Number.isFinite(Number(score))) {
    return maxScore !== null && maxScore !== undefined && Number.isFinite(Number(maxScore))
      ? `${Number(score).toFixed(1)} / ${Number(maxScore).toFixed(1)}`
      : `${Number(score).toFixed(1)} points`;
  }
  return '—';
};

const getAssessmentReportUrl = (rawResponse?: string | null): string | null => {
  if (!rawResponse || isSimulatedExam(rawResponse)) return null;
  const candidate = getRawCandidate(rawResponse);
  const data = parseExamResponse(rawResponse);
  const url = candidate?.report_url ?? candidate?.reportUrl ?? candidate?.test_result_url ?? candidate?.test_report_url ??
    candidate?.candidate_report_url ?? candidate?.result_url ?? data?.report_url ?? data?.reportUrl ?? null;
  return typeof url === 'string' && /^https:\/\//i.test(url) ? url : null;
};

const getAssessmentCompletionDate = (exam: any): string => {
  const candidate = getRawCandidate(exam.rawResponse);
  const data = parseExamResponse(exam.rawResponse);
  const value = exam.completedAt ?? candidate?.completed_at ?? candidate?.completedAt ?? candidate?.submitted_at ??
    candidate?.finished_at ?? candidate?.date_completed ?? candidate?.test_completed_at ?? data?.completionConfirmedAt ?? data?.lastSyncedAt ?? null;
  if (!value) return String(exam.status) === 'Completed' ? 'Completed · time not returned' : '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(exam.status) === 'Completed' ? 'Completed · time not returned' : '—';
  const formatted = date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const completionSource = String(data?.completionTimestampSource ?? '');
  if (completionSource.includes('during sync')) return `${formatted} · confirmed at sync`;
  if (completionSource.includes('during recruiter review')) return `${formatted} · confirmed during review`;
  if (completionSource.includes('from webhook')) return `${formatted} · confirmed by webhook`;
  return formatted;
};

const toFiniteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const getAssessmentQuestionSummary = (exam: any): { correct: number | null; total: number | null; attempted: number | null } => {
  const root = parseExamResponse(exam.rawResponse);
  const candidate = getRawCandidate(exam.rawResponse);
  const sources = [candidate, candidate?.summary, candidate?.performance_summary, candidate?.performanceSummary,
    candidate?.report, root?.report, root?.result, root?.details, root];
  const firstValue = (keys: string[]): unknown => {
    for (const source of sources) {
      if (!source || typeof source !== 'object') continue;
      for (const key of keys) if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
    }
    return undefined;
  };

  let correct = toFiniteNumber(firstValue(['correct_answers', 'correctAnswers', 'questions_correct', 'questionsCorrect', 'correct_count', 'correctCount', 'num_correct']));
  let total = toFiniteNumber(firstValue(['total_questions', 'totalQuestions', 'question_count', 'questionCount', 'num_questions', 'numQuestions']));
  let attempted = toFiniteNumber(firstValue(['questions_attempted', 'questionsAttempted', 'attempted_questions', 'attemptedQuestions', 'num_attempted']));

  const questionArrayKeys = ['question_results', 'questionResults', 'questions', 'question_scores', 'questionScores', 'question_details', 'questionDetails'];
  let questionRows: any[] | null = null;
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const key of questionArrayKeys) {
      if (Array.isArray(source[key])) { questionRows = source[key]; break; }
    }
    if (questionRows) break;
  }

  if (questionRows) {
    total = total ?? questionRows.length;
    const explicitCorrectness = questionRows.map((row) => {
      if (!row || typeof row !== 'object') return null;
      for (const key of ['is_correct', 'isCorrect', 'correct', 'passed', 'is_passed', 'isPassed', 'all_test_cases_passed', 'allTestCasesPassed']) {
        if (typeof row[key] === 'boolean') return row[key];
      }
      const state = String(row.status ?? row.result ?? row.verdict ?? '').trim().toLowerCase();
      if (/^(correct|passed|pass|accepted|fully correct)$/.test(state)) return true;
      if (/^(incorrect|failed|fail|wrong|rejected|not passed)$/.test(state)) return false;
      return null;
    });
    if (correct === null && explicitCorrectness.some((value) => value !== null)) {
      correct = explicitCorrectness.filter((value) => value === true).length;
    }
    if (attempted === null) {
      const answeredFlags = questionRows.map((row) => {
        if (!row || typeof row !== 'object') return null;
        for (const key of ['is_answered', 'isAnswered', 'answered', 'attempted']) {
          if (typeof row[key] === 'boolean') return row[key];
        }
        return null;
      });
      if (answeredFlags.some((value) => value !== null)) attempted = answeredFlags.filter((value) => value === true).length;
    }
  }

  return {
    correct: correct !== null && correct >= 0 ? correct : null,
    total: total !== null && total >= 0 ? total : (questionRows ? questionRows.length : null),
    attempted: attempted !== null && attempted >= 0 ? attempted : null,
  };
};

const getAssessmentDetails = (exam: any): Array<[string, string]> => {
  const candidate = getRawCandidate(exam.rawResponse);
  const data = parseExamResponse(exam.rawResponse);
  const questionSummary = getAssessmentQuestionSummary(exam);
  const hasQuestionCount = questionSummary.correct !== null && questionSummary.total !== null;
  const rawQuestionDetails = candidate?.question_results ?? candidate?.questionResults ?? candidate?.questions ??
    candidate?.question_scores ?? candidate?.questionScores ?? candidate?.test_case_results ?? candidate?.testCaseResults ?? data?.report?.questions;

  const formatQuestionDetails = (value: any): string | null => {
    if (value === null || value === undefined || value === '') return null;
    if (Array.isArray(value)) {
      const entries = value.map((row: any, index: number) => {
        if (!row || typeof row !== 'object') return `Item ${index + 1}: ${String(row)}`;
        const id = row.question_id ?? row.questionId ?? row.id ?? row.name ?? `#${index + 1}`;
        const score = row.question_score ?? row.questionScore ?? row.score ?? row.points ?? row.percentage_score;
        const status = row.status ?? row.result ?? row.verdict;
        const facts: string[] = [];
        if (score !== undefined && score !== null && score !== '') facts.push(`score ${score}`);
        if (status !== undefined && status !== null && status !== '') facts.push(String(status));
        return facts.length ? `Question ${id}: ${facts.join(', ')}` : `Question ${id}: see official report`;
      });
      return entries.length ? entries.join('; ') : null;
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, any>);
      if (!entries.length) return null;
      // Some candidate responses provide a map of question IDs to raw scores, e.g. {"1521637": 0}.
      // Format the data readably; do not imply a score of zero means a question count or a pass/fail verdict.
      return entries.slice(0, 20).map(([id, item]) => {
        if (item && typeof item === 'object') {
          const score = (item as any).question_score ?? (item as any).score ?? (item as any).points;
          const status = (item as any).status ?? (item as any).result ?? (item as any).verdict;
          const facts: string[] = [];
          if (score !== undefined && score !== null && score !== '') facts.push(`score ${score}`);
          if (status !== undefined && status !== null && status !== '') facts.push(String(status));
          return facts.length ? `Question ${id}: ${facts.join(', ')}` : `Question ${id}: see official report`;
        }
        return `Question ${id} score: ${String(item)}`;
      }).join('; ');
    }
    return String(value);
  };

  const questionDetails = formatQuestionDetails(rawQuestionDetails);
  const pairs: Array<[string, unknown]> = [
    ['Questions correct', hasQuestionCount ? `${questionSummary.correct} / ${questionSummary.total}` : undefined],
    ['Questions attempted', questionSummary.attempted !== null ? questionSummary.attempted : candidate?.questions_attempted ?? candidate?.questionsAttempted],
    ['Total questions', questionSummary.total],
    ['Percentage score', candidate?.percentage_score],
    ['Score', candidate?.score ?? candidate?.total_score ?? candidate?.test_score ?? exam.score],
    ['Maximum score', candidate?.max_score ?? candidate?.maxScore ?? candidate?.total_max_score],
    ['Time taken', candidate?.time_taken ?? candidate?.timeTaken ?? candidate?.duration],
    ['Language', candidate?.language ?? candidate?.programming_language],
    ['Skill breakdown', candidate?.skill_scores ?? candidate?.skillScores ?? candidate?.domain_scores ?? candidate?.domainScores ?? candidate?.section_scores ?? candidate?.sectionScores ?? candidate?.sub_scores],
    ['Question scores', questionDetails],
  ];
  return pairs.flatMap(([label, value]) => {
    if (value === null || value === undefined || value === '') return [];
    const formatted = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return [[label, formatted.length > 800 ? `${formatted.slice(0, 797)}…` : formatted] as [string, string]];
  });
};

const isChakraInterviewCompleted = (interview: ChakraInterview): boolean => {
  const status = String(interview.status ?? '').trim().toLowerCase().replace(/[ _-]+/g, ' ');
  const completedStatuses = new Set(['completed', 'complete', 'finished', 'evaluated', 'report ready']);
  const completedAt = interview.completedAt ? new Date(interview.completedAt).getTime() : Number.NaN;
  return completedStatuses.has(status) || Number.isFinite(completedAt);
};

const formatExperience = (value: number | null | undefined) => {
  const years = Number(value);
  if (!Number.isFinite(years)) return '—';
  return `${Number(years.toFixed(1))} years`;
};

const formatDisplayDate = (value?: string | null): string => {
  if (!value) return '—';
  const datePart = value.slice(0, 10);
  const date = new Date(`${datePart}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatDuration = (weeksValue?: number, daysValue?: number): string => {
  const weeks = Number.isFinite(Number(weeksValue)) ? Math.max(0, Number(weeksValue)) : 0;
  const days = Number.isFinite(Number(daysValue)) ? Math.max(0, Number(daysValue)) : 0;
  if (weeks === 0 && days === 0) return '0 days';
  if (weeks === 0) return `${days} ${days === 1 ? 'day' : 'days'}`;
  return days > 0 ? `${weeks}w ${days}d` : `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
};

const getExamWorkflowMetadata = (exam: any, availableTests: HackerRankTestOption[]) => {
  const data = parseExamResponse(exam?.rawResponse);
  const workflow = data?.assessmentWorkflow || {};
  const matchingTest = availableTests.find((test) => String(test.id) === String(exam.testId));
  const experienceBand = ['0-5', '5-10'].includes(String(workflow.experienceBand)) ? workflow.experienceBand : null;
  const difficulty = ['Beginner', 'Intermediate'].includes(String(workflow.difficulty)) ? workflow.difficulty : null;
  const code = /^(B[123]|I[123])$/.test(String(workflow.code || '')) ? workflow.code : null;
  return {
    experienceBand: (experienceBand || matchingTest?.experienceBand || null) as AssessmentExperienceBand | null,
    difficulty: (difficulty || matchingTest?.proficiencyLevel || null) as AssessmentDifficulty | null,
    code: (code || matchingTest?.code || null) as AssessmentTestCode | null,
  };
};

interface EmployeeDetailModalProps {
  employee: Employee;
  userRole: 'admin' | 'manager' | 'mentor';
  onClose: () => void;
  onRefresh: () => void;
  token: string | null;
  simulatedRole: string;
}

export default function EmployeeDetailModal({
  employee,
  userRole,
  onClose,
  onRefresh,
  token,
  simulatedRole
}: EmployeeDetailModalProps) {
  const [enrollmentDate, setEnrollmentDate] = useState(employee.programEnrollmentDate || employee.joiningDate);
  const [isUpdatingDate, setIsUpdatingDate] = useState(false);
  const [dateError, setDateError] = useState('');
  const [dateSuccess, setDateSuccess] = useState('');
  const [statusError, setStatusError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isMarkingReady, setIsMarkingReady] = useState(false);
  const [statusOverride, setStatusOverride] = useState<string | null>(null);

  const [chakraConfig, setChakraConfig] = useState<{ inviteLinkConfigured: boolean; apiSyncConfigured: boolean; apiSyncNote?: string } | null>(null);
  const [isPreparingChakra, setIsPreparingChakra] = useState(false);
  const [isSyncingChakraId, setIsSyncingChakraId] = useState<number | null>(null);
  const [isImportingChakraId, setIsImportingChakraId] = useState<number | null>(null);
  const [chakraError, setChakraError] = useState('');
  const [chakraMessage, setChakraMessage] = useState('');
  const [preparedChakraDraft, setPreparedChakraDraft] = useState<{ invitationUrl: string; interviewerName: string } | null>(null);
  const [isConfirmingChakraSent, setIsConfirmingChakraSent] = useState(false);
  const [selectedTestId, setSelectedTestId] = useState('');
  const [availableTests, setAvailableTests] = useState<HackerRankTestOption[]>([]);
  const [isLoadingTests, setIsLoadingTests] = useState(false);
  const [testListError, setTestListError] = useState('');
  const [isTriggering, setIsTriggering] = useState(false);
  const [isReconcilingExistingAttempt, setIsReconcilingExistingAttempt] = useState(false);
  const [triggerError, setTriggerError] = useState('');
  const [triggerSuccess, setTriggerSuccess] = useState('');
  const [isSyncingExamId, setIsSyncingExamId] = useState<number | null>(null);

  const canTrigger = userRole === 'admin' || userRole === 'manager';
  React.useEffect(() => {
    setSelectedTestId((current) => availableTests.some((test) => test.id === current) ? current : '');
  }, [availableTests]);

  // Poll HackerRank for this candidate's active attempts while the detail modal is open.
  // Localhost cannot receive external callbacks from HackerRank, so polling keeps local testing useful.
  React.useEffect(() => {
    const activeExams = (employee.hackerrankExams || []).filter((exam: any) =>
      ['Invited', 'In Progress', 'Submitted - Reports Pending', 'Processing'].includes(exam.status) && !isSimulatedExam(exam.rawResponse)
    );
    if (activeExams.length === 0) return;
    let cancelled = false;
    const poll = async () => {
      let refreshed = false;
      for (const exam of activeExams) {
        if (cancelled) return;
        try {
          const headers: Record<string, string> = { 'x-simulated-role': simulatedRole };
          if (token) headers.Authorization = `Bearer ${token}`;
          const response = await fetch(`/api/employees/${employee.id}/hackerrank/sync/${exam.id}`, { method: 'POST', headers });
          if (response.ok) refreshed = true;
        } catch (error) {
          console.warn('Automatic HackerRank status refresh failed:', error);
        }
      }
      if (!cancelled && refreshed) onRefresh();
    };
    const timer = window.setInterval(poll, 60000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [employee.id, employee.hackerrankExams, token, simulatedRole, onRefresh]);

  React.useEffect(() => {
    if (!canTrigger) return;
    let cancelled = false;
    const loadChakraConfig = async () => {
      try {
        const headers: Record<string, string> = { 'x-simulated-role': simulatedRole };
        if (token) headers.Authorization = `Bearer ${token}`;
        const response = await fetch('/api/chakra/config', { headers });
        const data = await readApiJson(response);
        if (response.ok && !cancelled) setChakraConfig(data);
      } catch (error) {
        console.warn('Could not load Chakra configuration:', error);
      }
    };
    loadChakraConfig();
    return () => { cancelled = true; };
  }, [canTrigger, token, simulatedRole]);

  React.useEffect(() => {
    if (!canTrigger) return;
    const loadTests = async () => {
      setIsLoadingTests(true);
      setTestListError('');
      try {
        const headers: Record<string, string> = { 'x-simulated-role': simulatedRole };
        if (token) headers.Authorization = `Bearer ${token}`;
        const response = await fetch('/api/hackerrank/tests', { headers });
        const data = await readApiJson(response);
        if (!response.ok) throw new Error(data.error || 'Unable to load HackerRank tests.');
        const tests: HackerRankTestOption[] = Array.isArray(data.tests) ? data.tests : [];
        setAvailableTests(tests);
        if (tests.length === 0) setTestListError(data.message || 'No published HackerRank tests were returned. Check the API token and test permissions.');
      } catch (error: any) {
        setAvailableTests([]);
        setSelectedTestId('');
        setTestListError(error.message || 'Unable to load HackerRank tests.');
      } finally {
        setIsLoadingTests(false);
      }
    };
    loadTests();
  }, [canTrigger, token, simulatedRole]);

  const handleTriggerExam = async () => {
    setIsTriggering(true);
    setTriggerError('');
    setTriggerSuccess('');
    try {
      const selectedTest = availableTests.find((test) => test.id === selectedTestId);
      if (!selectedTest) throw new Error('Select a HackerRank test before triggering an assessment.');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-simulated-role': simulatedRole
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/employees/${employee.id}/hackerrank/trigger`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          testId: selectedTestId,
          testName: selectedTest?.name || selectedTestId,
          cutoffScore: selectedTest?.cutoffScore ?? null
        })
      });

      if (res.ok) {
        setTriggerSuccess(`Invitation sent for ${selectedTest?.code || selectedTest?.name || selectedTestId}.`);
        onRefresh();
      } else {
        const data = await readApiJson(res);
        setTriggerError(data.error || 'Failed to trigger assessment.');
      }
    } catch (err: any) {
      setTriggerError(err.message || 'An error occurred.');
    } finally {
      setIsTriggering(false);
    }
  };

  const handleReconcileExistingAttempt = async () => {
    if (!selectedTestId) return;
    setIsReconcilingExistingAttempt(true);
    setTriggerError('');
    setTriggerSuccess('');
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-simulated-role': simulatedRole,
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const response = await fetch(`/api/employees/${employee.id}/hackerrank/reconcile`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ testId: selectedTestId }),
      });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.error || 'Could not sync the existing HackerRank attempt.');
      setTriggerSuccess('Existing HackerRank attempt synced. No invitation was sent.');
      onRefresh();
    } catch (error: any) {
      setTriggerError(error.message || 'Could not sync the existing HackerRank attempt.');
    } finally {
      setIsReconcilingExistingAttempt(false);
    }
  };

  const handleSyncExam = async (examId: number) => {
    setIsSyncingExamId(examId);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-simulated-role': simulatedRole
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/employees/${employee.id}/hackerrank/sync/${examId}`, {
        method: 'POST',
        headers
      });

      if (res.ok) {
        onRefresh();
      } else {
        const data = await readApiJson(res);
        setTriggerError(data.error || 'Failed to sync exam status.');
      }
    } catch (err: any) {
      setTriggerError(err.message || 'An error occurred while syncing the assessment.');
    } finally {
      setIsSyncingExamId(null);
    }
  };



  const handlePrepareChakra = async () => {
    setIsPreparingChakra(true);
    setChakraError('');
    setChakraMessage('');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-simulated-role': simulatedRole };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`/api/employees/${employee.id}/chakra/prepare`, { method: 'POST', headers, body: JSON.stringify({}) });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.error || 'Unable to prepare Chakra invitation.');

      // Keep this draft local to the open modal. It is not a sent invite and is not saved to history.
      setPreparedChakraDraft({ invitationUrl: data.invitationUrl, interviewerName: data.interviewerName || 'Chakra AI Interviewer' });
      setChakraMessage('Email draft opened. Confirm only after you actually send it; unsent drafts are not saved to history.');
      const subject = `Chakra Data Engineer interview invitation`;
      const body = `Hi ${employee.name},\n\nPlease complete this Data Engineer interview using the link below:\n${data.invitationUrl}\n\nRegards`;
      window.location.href = `mailto:${employee.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    } catch (error: any) {
      setChakraError(error.message || 'Could not prepare Chakra invitation.');
    } finally {
      setIsPreparingChakra(false);
    }
  };

  const handleConfirmChakraSent = async () => {
    if (!preparedChakraDraft) return;
    if (!window.confirm(`Confirm that you sent the Chakra invitation to ${employee.email}? Only confirm if it was actually sent.`)) return;
    setIsConfirmingChakraSent(true);
    setChakraError('');
    setChakraMessage('');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-simulated-role': simulatedRole };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`/api/employees/${employee.id}/chakra/confirm-invitation`, {
        method: 'POST', headers, body: JSON.stringify({})
      });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.error || 'Could not save the sent invitation.');
      setPreparedChakraDraft(null);
      setChakraMessage('Invitation recorded as sent.');
      onRefresh();
    } catch (error: any) {
      setChakraError(error.message || 'Could not save the sent invitation.');
    } finally {
      setIsConfirmingChakraSent(false);
    }
  };

  const handleMarkChakraInvited = async (interviewId: number) => {
    setChakraError('');
    setChakraMessage('');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-simulated-role': simulatedRole };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`/api/employees/${employee.id}/chakra/mark-invited/${interviewId}`, { method: 'POST', headers, body: JSON.stringify({}) });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.error || 'Could not update invitation status.');
      setChakraMessage('Invitation status marked as sent by recruiter.');
      onRefresh();
    } catch (error: any) {
      setChakraError(error.message || 'Could not update invitation status.');
    }
  };

  const handleSyncChakra = async (interviewId: number) => {
    setIsSyncingChakraId(interviewId);
    setChakraError('');
    setChakraMessage('');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-simulated-role': simulatedRole };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`/api/employees/${employee.id}/chakra/sync/${interviewId}`, { method: 'POST', headers, body: JSON.stringify({}) });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.error || 'Chakra result sync failed.');
      setChakraMessage('Latest Chakra result synchronized from the configured API.');
      onRefresh();
    } catch (error: any) {
      setChakraError(error.message || 'Chakra result sync failed.');
    } finally {
      setIsSyncingChakraId(null);
    }
  };

  const handleImportChakraCsv = async (interviewId: number, file: File | undefined) => {
    if (!file) return;
    setIsImportingChakraId(interviewId);
    setChakraError('');
    setChakraMessage('');
    try {
      const csvText = await file.text();
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-simulated-role': simulatedRole };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`/api/employees/${employee.id}/chakra/import-csv/${interviewId}`, {
        method: 'POST', headers, body: JSON.stringify({ csvText })
      });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.error || 'Could not import Chakra results CSV.');
      setChakraMessage('Result imported from the official Chakra candidate-report CSV.');
      onRefresh();
    } catch (error: any) {
      setChakraError(error.message || 'Could not import Chakra results CSV.');
    } finally {
      setIsImportingChakraId(null);
    }
  };

  const handleMarkInterviewReady = async () => {
    const currentStatus = statusOverride || employee.status;
    const targetStatus = currentStatus === 'Interview Ready' ? 'Enrolled' : 'Interview Ready';
    const actionText = targetStatus === 'Interview Ready' ? 'mark as ready for interview' : 'return to Enrolled';
    if (!window.confirm(`Are you sure you want to ${actionText}: ${employee.name}?`)) return;
    setIsMarkingReady(true);
    setStatusError('');
    setStatusMessage('');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-simulated-role': simulatedRole };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`/api/employees/${employee.id}/mark-interview-ready`, {
        method: 'POST', headers, body: JSON.stringify({ status: targetStatus })
      });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.error || 'Could not update status.');
      setStatusOverride(targetStatus);
      setStatusMessage(targetStatus === 'Interview Ready' ? 'Status saved.' : 'Status reset to Enrolled.');
      onRefresh();
    } catch (error: any) {
      setStatusError(error.message || 'Could not update status.');
    } finally {
      setIsMarkingReady(false);
    }
  };

  React.useEffect(() => {
    setStatusOverride(null);
  }, [employee.id, employee.status]);

  const handleUpdateEnrollmentDate = async () => {
    setIsUpdatingDate(true);
    setDateError('');
    setDateSuccess('');
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-simulated-role': simulatedRole
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/employees/${employee.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ programEnrollmentDate: enrollmentDate })
      });
      if (res.ok) {
        setDateSuccess('Enrollment date updated successfully!');
        onRefresh();
      } else {
        const data = await res.json();
        setDateError(data.error || 'Failed to update enrollment date.');
      }
    } catch (e: any) {
      setDateError(e.message || 'Error occurred.');
    } finally {
      setIsUpdatingDate(false);
    }
  };



  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 w-full max-w-3xl h-[85vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in duration-200">
        
        {/* Modal Top Header */}
        <div className="px-8 py-5 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <User className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{employee.name}</h2>
                <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500">{employee.employeeId}</span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{employee.email} • {employee.skillGroup || 'General'} Focus</p>
            </div>
          </div>
          
          <button 
            id="close-detail-modal"
            onClick={onClose}
            className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          
          {/* Compact candidate overview */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 min-w-0">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Company joining date</span>
              <p className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{formatDisplayDate(employee.joiningDate)}</p>
              {employee.programEnrollmentDate && employee.programEnrollmentDate !== employee.joiningDate && (
                <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">Program start: {formatDisplayDate(employee.programEnrollmentDate)}</p>
              )}
              {(userRole === 'admin' || userRole === 'manager') && (
                <button
                  onClick={() => setIsUpdatingDate((editing) => !editing)}
                  className="mt-2 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  {isUpdatingDate ? 'Close editor' : 'Edit program date'}
                </button>
              )}
              {isUpdatingDate && (userRole === 'admin' || userRole === 'manager') && (
                <div className="mt-2 space-y-2">
                  <input
                    type="date"
                    value={enrollmentDate}
                    onChange={(e) => setEnrollmentDate(e.target.value)}
                    className="w-full text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 text-zinc-800 dark:text-zinc-200 focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEnrollmentDate(employee.programEnrollmentDate || employee.joiningDate); setIsUpdatingDate(false); }}
                      className="px-2 py-1 border border-zinc-200 dark:border-zinc-700 rounded text-[10px] font-bold text-zinc-500 cursor-pointer"
                    >Cancel</button>
                    <button
                      onClick={handleUpdateEnrollmentDate}
                      className="px-2 py-1 bg-indigo-600 text-white rounded text-[10px] font-bold cursor-pointer"
                    >Save</button>
                  </div>
                </div>
              )}
              {dateSuccess && <span className="mt-1 text-[10px] text-emerald-500 block">{dateSuccess}</span>}
              {dateError && <span className="mt-1 text-[10px] text-red-500 block">{dateError}</span>}
            </div>

            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 min-w-0">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Experience</span>
              <p className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{formatExperience(employee.yearsOfExperience)}</p>
            </div>

            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 min-w-0">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Operational status</span>
              <p className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{STATUS_LABELS[statusOverride || employee.status] || statusOverride || employee.status}</p>
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">{employee.currentProject === 'Bench' ? 'On Bench' : employee.currentProject || 'No project assigned'}</p>
              {canTrigger && (
                <button type="button" onClick={handleMarkInterviewReady} disabled={isMarkingReady} className="mt-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-3 py-2 text-[10px] font-bold text-white">
                  {isMarkingReady ? 'Saving…' : (statusOverride || employee.status) === 'Interview Ready' ? 'Undo · Set Enrolled' : 'Mark ready for interview'}
                </button>
              )}
              {statusMessage && <p className="mt-1 text-[10px] text-emerald-600">{statusMessage}</p>}
              {statusError && <p className="mt-1 text-[10px] text-red-600">{statusError}</p>}
            </div>

            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 min-w-0">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Time on bench</span>
              <p className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{employee.currentProject === 'Bench' ? formatDuration(employee.weeksEnrolled, employee.daysEnrolled) : '—'}</p>
            </div>
          </div>

          {/* HackerRank Assessment Section */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">HackerRank Standardized Benchmarking</h3>
                
              </div>
            </div>

            {/* Assessment Trigger Controls */}
            <div className="bg-zinc-50 dark:bg-zinc-800/40 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800/50 space-y-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">Test</span>
                {canTrigger ? (
                  <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
                    <select
                      id="hackerrank-test-selector"
                      value={selectedTestId}
                      onChange={(e) => setSelectedTestId(e.target.value)}
                      disabled={isLoadingTests || availableTests.length === 0}
                      className="bg-white dark:bg-zinc-900 text-xs border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
                    >
                      <option value="">{isLoadingTests ? 'Loading tests…' : 'Choose a test'}</option>
                      {availableTests.map((test) => (
                        <option key={test.id} value={test.id}>
                          {test.name}{test.duration ? ` · ${test.duration} min` : ''}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      id="reconcile-existing-assessment-btn"
                      onClick={handleReconcileExistingAttempt}
                      disabled={isReconcilingExistingAttempt || isLoadingTests || !selectedTestId}
                      title="Find this candidate in the selected test and sync the existing attempt. This does not send an invitation."
                      className="px-3 py-2 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      {isReconcilingExistingAttempt ? 'Syncing…' : 'Sync Existing Attempt'}
                    </button>

                    <button
                      type="button"
                      id="trigger-assessment-btn"
                      onClick={handleTriggerExam}
                      disabled={isTriggering || isLoadingTests || !selectedTestId}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      {isTriggering ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current" />
                      )}
                      {isTriggering ? 'Triggering...' : 'Trigger Exam'}
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                    ⚠️ Only Admins & Managers can trigger exams.
                  </span>
                )}
              </div>

              {testListError && <p className="text-xs text-amber-600 dark:text-amber-400">{testListError}</p>}
              {triggerError && <p className="text-xs text-red-500">{triggerError}</p>}
              {triggerSuccess && <p className="text-xs text-emerald-600 font-medium">{triggerSuccess}</p>}
            </div>

            {/* Exam History Log */}
            <div className="space-y-2 pt-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-extrabold text-zinc-400 uppercase tracking-wider block">Assessment History & Attempt Tracking</span>
                <span className="text-[10px] text-zinc-500">{(employee.hackerrankExams || []).length} assessment {(employee.hackerrankExams || []).length === 1 ? 'attempt' : 'attempts'} · newest first</span>
              </div>

              {employee.hackerrankExams && employee.hackerrankExams.length > 0 ? (
                <div className="overflow-x-auto border border-zinc-100 dark:border-zinc-800/60 rounded-xl">
                  <table className="min-w-[1080px] w-full divide-y divide-zinc-150 dark:divide-zinc-800/50">
                    <thead className="bg-zinc-50 dark:bg-zinc-900/50">
                      <tr>
                        <th className="px-4 py-2 text-left text-[10px] font-bold text-zinc-400 uppercase">Test / Attempt</th>
                        <th className="px-4 py-2 text-left text-[10px] font-bold text-zinc-400 uppercase">Invited</th>
                        <th className="px-4 py-2 text-left text-[10px] font-bold text-zinc-400 uppercase">Status</th>
                        <th className="px-4 py-2 text-left text-[10px] font-bold text-zinc-400 uppercase">Outcome</th>
                        <th className="px-4 py-2 text-left text-[10px] font-bold text-zinc-400 uppercase">Score</th>
                        <th className="px-4 py-2 text-left text-[10px] font-bold text-zinc-400 uppercase">Completed</th>
                        <th className="px-4 py-2 text-left text-[10px] font-bold text-zinc-400 uppercase">Result details</th>
                        <th className="px-4 py-2 text-right text-[10px] font-bold text-zinc-400 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800/40">
                      {[...(employee.hackerrankExams || [])]
                        .sort((a: any, b: any) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime())
                        .map((exam: any) => {
                          const examMeta = getExamWorkflowMetadata(exam, availableTests);
                          const sameTest = (employee.hackerrankExams || []).filter((item: any) =>
                            String(item.testId) === String(exam.testId) && !isSimulatedExam(item.rawResponse)
                          ).sort((a: any, b: any) => new Date(a.triggeredAt).getTime() - new Date(b.triggeredAt).getTime());
                          const attemptNumber = sameTest.findIndex((item: any) => item.id === exam.id) + 1;
                          const outcome = getAssessmentOutcome(exam.rawResponse);
                          const reportUrl = getAssessmentReportUrl(exam.rawResponse);
                          const simulated = isSimulatedExam(exam.rawResponse);
                          return (
                            <tr key={exam.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-850/20">
                              <td className="px-4 py-2.5">
                                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 block">{exam.testName}</span>
                                <span className="text-[9px] font-mono text-zinc-400 block mt-0.5">ID: {exam.testId}</span>
                                <span className="text-[10px] text-indigo-500 block mt-1">{examMeta.code || examMeta.difficulty || 'Assessment'} · Attempt {attemptNumber}</span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className="text-xs text-zinc-600 dark:text-zinc-300 block">{new Date(exam.triggeredAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                <span className="text-[9px] text-zinc-400 block mt-0.5">By: {exam.triggeredBy}</span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  exam.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30' :
                                  exam.status === 'In Progress' ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/30' :
                                  exam.status === 'Expired' || exam.status === 'Failed' ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30' :
                                  'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30'
                                }`}>{simulated ? 'Legacy test data' : exam.status}</span>
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex flex-col items-start gap-1.5">
                                  {simulated ? <span className="text-[10px] text-amber-600">Not a real result</span> : outcome ? (
                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold border ${outcome === 'Passed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30' : outcome === 'Failed' ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30' : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30'}`}>{outcome}</span>
                                  ) : <span className="text-xs text-zinc-400">{exam.status === 'Completed' ? 'Review required' : 'Pending'}</span>}
                                </div>
                              </td>
                              <td className="px-4 py-2.5"><span className="text-xs font-extrabold text-zinc-800 dark:text-zinc-100">{getAssessmentScoreDisplay(exam)}</span></td>
                              <td className="px-4 py-2.5"><span className="text-[10px] text-zinc-600 dark:text-zinc-300">{getAssessmentCompletionDate(exam)}</span></td>
                              <td className="px-4 py-2.5 min-w-[180px]">
                                <details className="text-[10px] text-zinc-600 dark:text-zinc-300">
                                  <summary className="cursor-pointer font-bold text-indigo-600 dark:text-indigo-400">View details</summary>
                                  <div className="mt-2 space-y-1 min-w-[170px]">
                                    {getAssessmentDetails(exam).length > 0 ? getAssessmentDetails(exam).map(([label, value]) => (
                                      <div key={label}><span className="font-semibold">{label}:</span> {value}</div>
                                    )) : <p>No detailed report fields have been returned yet. Sync again or open the official report when available.</p>}
                                    {reportUrl && <a href={reportUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mt-1 text-indigo-600 dark:text-indigo-400 font-bold"><ExternalLink className="w-3 h-3" /> Open report</a>}
                                  </div>
                                </details>
                              </td>
                              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                {!simulated && exam.status !== 'Expired' && (
                                  <button onClick={() => handleSyncExam(exam.id)} disabled={isSyncingExamId === exam.id} title="Fetch latest status and report details from HackerRank" className="p-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 disabled:opacity-50 transition-all inline-flex items-center gap-1 text-[10px] font-bold cursor-pointer mr-2">
                                    <RefreshCw className={`w-3 h-3 ${isSyncingExamId === exam.id ? 'animate-spin' : ''}`} /> Sync now
                                  </button>
                                )}
                                {reportUrl && <a href={reportUrl} target="_blank" rel="noreferrer" className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline">View report</a>}
                                {exam.status === 'Completed' && !reportUrl && !simulated && <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Synced</span>}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 border border-dashed border-zinc-200 dark:border-zinc-800 text-center rounded-xl">
                  <span className="text-xs text-zinc-400 block">No attempts yet.</span>
                </div>
              )}
            </div>
          </div>

          {/* Chakra AI Interviewer */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-300"><Bot className="w-5 h-5" /></div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Chakra AI Interviewer</h3>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">TalentLens fetches results through the server-side Chakra API, so recruiters do not need a Chakra login. CSV import is only a fallback after the interview is completed.</p>
            {chakraConfig && !chakraConfig.apiSyncConfigured && <p className="text-[11px] text-amber-700 dark:text-amber-300">API result sync is not configured on this server yet. Ask the workspace administrator to add the official Chakra API endpoint and credentials.</p>}
            <div className="bg-zinc-50 dark:bg-zinc-800/40 rounded-xl p-4 space-y-2">
                {canTrigger && <button type="button" onClick={handlePrepareChakra} disabled={isPreparingChakra || !chakraConfig?.inviteLinkConfigured}
                  title={!chakraConfig?.inviteLinkConfigured ? 'Chakra interview link is not configured' : 'Prepare a Chakra invitation'}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer">
                  <Bot className="w-3.5 h-3.5" />{isPreparingChakra ? 'Preparing invite…' : 'Prepare Chakra invitation'}
                </button>}
                {!chakraConfig?.inviteLinkConfigured && <p className="text-[11px] text-amber-700 dark:text-amber-300">Chakra link not configured.</p>}
                {preparedChakraDraft && <div className="pt-2 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={handleConfirmChakraSent} disabled={isConfirmingChakraSent} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold">{isConfirmingChakraSent ? 'Saving…' : 'Confirm invitation sent'}</button>
                  <button type="button" onClick={() => { setPreparedChakraDraft(null); setChakraMessage('Draft discarded. No history entry was created.'); setChakraError(''); }} disabled={isConfirmingChakraSent} className="px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-semibold">Discard draft</button>
                </div>}
            </div>
            {chakraError && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{chakraError}</p>}
            {chakraMessage && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">{chakraMessage}</p>}

            {(employee.chakraInterviews || []).length > 0 ? (
              <div className="overflow-x-auto border border-zinc-100 dark:border-zinc-800 rounded-xl">
                <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
                  <thead className="bg-zinc-50 dark:bg-zinc-900/50"><tr>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-zinc-400 uppercase">Interviewer</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-zinc-400 uppercase">Created</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-zinc-400 uppercase">Status</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-zinc-400 uppercase">Score / 5</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-zinc-400 uppercase">Result</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold text-zinc-400 uppercase">Actions</th>
                  </tr></thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                    {[...(employee.chakraInterviews || [])].sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime()).map((interview: ChakraInterview) => (
                      <tr key={interview.id}>
                        <td className="px-3 py-3 text-xs font-semibold text-zinc-800 dark:text-zinc-200">{interview.interviewerName}</td>
                        <td className="px-3 py-3 text-xs text-zinc-500">{interview.triggeredAt ? new Date(interview.triggeredAt).toLocaleDateString() : '—'}</td>
                        <td className="px-3 py-3"><span className="text-[10px] font-bold rounded-md px-2 py-1 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">{interview.status}</span></td>
                        <td className="px-3 py-3 text-xs font-bold text-zinc-800 dark:text-zinc-100">{interview.score !== null && interview.score !== undefined && Number.isFinite(Number(interview.score)) ? Number(interview.score).toFixed(2) : '—'}</td>
                        <td className="px-3 py-3 text-xs text-zinc-600 dark:text-zinc-300">{interview.recommendation || '—'}{interview.reportUrl && <a href={interview.reportUrl} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline"><ExternalLink className="w-3 h-3" />Report</a>}</td>
                        <td className="px-3 py-3 text-right"><div className="inline-flex flex-wrap gap-1 justify-end">
                          {interview.status === 'Invite Prepared' && canTrigger && <button type="button" onClick={() => handleMarkChakraInvited(interview.id)} className="px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 text-[10px] font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800">Mark Invited</button>}
                          {canTrigger && <button type="button" onClick={() => handleSyncChakra(interview.id)} disabled={isSyncingChakraId === interview.id || !chakraConfig?.apiSyncConfigured} title={chakraConfig?.apiSyncConfigured ? 'Fetch the latest result through TalentLens’ server-side Chakra API. Recruiters do not need a Chakra login.' : 'Ask the workspace administrator to configure the official Chakra API endpoint and credentials.'} className="px-2 py-1 rounded-md border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 text-[10px] font-bold inline-flex items-center gap-1 disabled:opacity-40"><RefreshCw className={`w-3 h-3 ${isSyncingChakraId === interview.id ? 'animate-spin' : ''}`} />{isSyncingChakraId === interview.id ? 'Fetching…' : 'Fetch result (API)'}</button>}
                          {canTrigger && <label aria-disabled={!isChakraInterviewCompleted(interview) || isImportingChakraId === interview.id} className={`px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 text-[10px] font-bold inline-flex items-center gap-1 ${isChakraInterviewCompleted(interview) && isImportingChakraId !== interview.id ? 'cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800' : 'opacity-40 cursor-not-allowed pointer-events-none'}`} title={isChakraInterviewCompleted(interview) ? 'Fallback only: upload the official CSV exported from Chakra after the interview. Fetch result (API) is preferred.' : 'Available after the interview is completed. Use Fetch result (API) to refresh the current interview status first.'} aria-label="Import Chakra result CSV"><Upload className="w-3 h-3" />{isImportingChakraId === interview.id ? 'Importing…' : 'Import result CSV'}<input type="file" accept=".csv,text/csv" className="hidden" disabled={!isChakraInterviewCompleted(interview) || isImportingChakraId === interview.id} onChange={(e) => { const file = e.currentTarget.files?.[0]; void handleImportChakraCsv(interview.id, file); e.currentTarget.value = ''; }} /></label>}
                        </div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="p-4 border border-dashed border-zinc-200 dark:border-zinc-800 text-center rounded-xl"><span className="text-xs text-zinc-400">No Chakra interview attempts recorded for this candidate.</span></div>}
          </div>




        </div>
      </div>
    </div>
  );
}
