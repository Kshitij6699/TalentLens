export interface User {
  id: number;
  uid: string;
  email: string;
  role: 'admin' | 'manager' | 'mentor';
  name: string;
  createdAt?: string;
  originalRole?: string;
  isTestingMode?: boolean;
}

export interface Mentor {
  id: number;
  employeeId: string;
  name: string;
  email: string;
  phone?: string | null;
  designation?: string | null;
  domainExpertise: string; // JSON string array or string of skills
  yearsOfExperience?: number | null;
  maxCapacity: number;
  status: string; // 'Active' | 'Inactive'
  profilePhoto?: string | null;
  createdAt?: string;
  
  // Enriched metrics computed by backend
  menteesCount?: number;
  avgTeamScore?: number;
}

export interface Employee {
  id: number;
  userId?: number | null;
  employeeId: string;
  name: string;
  email: string;
  joiningDate: string; // YYYY-MM-DD
  designation: string;
  employeeType: 'Bench' | 'New Joiner' | 'Lateral Entry';
  status: 'Enrolled' | 'Available' | 'In Training' | 'Allocated' | 'Interview Ready';
  skillGroup?: string | null;
  persona: string;
  skills: string[];
  benchAgingDays?: number | null;
  yearsOfExperience: number;
  previousProjectHistory?: string | null;
  assignedMentor?: string | null;
  currentProject: string; // 'Bench' or project name
  pythonLevel: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  sqlLevel: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  sparkLevel: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  pysparkLevel: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  programEnrollmentDate?: string | null; // YYYY-MM-DD
  createdAt?: string;
  
  // Enriched metrics computed by backend
  avgMockScore?: number | null;
  attendanceRate?: number;
  totalMocks?: number;
  scoreTrend?: 'Improving' | 'Declining' | 'Stable' | 'None';
  
  // Custom calculated domains for Sections 3 & 5
  pythonScore?: number | null;
  sqlScore?: number | null;
  sparkScore?: number | null;
  overallScore?: number | null;
  classificationTier?: 'Client Ready' | 'Interview Ready' | 'Allocated' | 'In Training' | 'Needs Support' | 'N/A';
  tierReasons?: string[];
  interviewReadiness?: InterviewReadiness;
  assessmentPath?: AssessmentPath;
  readinessReasons?: string[];
  canMarkReady?: boolean;
  skipAudit?: AssessmentSkipAudit | null;
  consecutiveResourcesOverdueCount?: number;
  managerAttentionRequired?: boolean;
  resourcesOverdue?: boolean;
  retentionIssue?: boolean;
  latestSessionDate?: string | null;
  nextSessionDate?: string | null;
  weeksEnrolled?: number;
  daysEnrolled?: number;
  sessions?: MentorSession[];
  mocks?: MockInterview[];
  hackerrankExams?: HackerRankExam[];
  chakraInterviews?: ChakraInterview[];
}

export type AssessmentPath = 'hackerrank' | 'chakra' | 'both' | 'skip';
export type InterviewReadiness =
  | 'Ready for Interview'
  | 'Assessment Pending'
  | 'Assessment In Progress'
  | 'Assessment Failed'
  | 'Chakra Pending';

export interface AssessmentSkipAudit {
  skippedBy: string;
  skippedAt: string;
  reason?: string;
}

export interface HackerRankExam {
  id: number;
  employeeId: number;
  testId: string;
  testName: string;
  triggeredAt: string;
  triggeredBy: string;
  status: 'Invited' | 'In Progress' | 'Submitted - Reports Pending' | 'Processing' | 'Completed' | 'Expired' | 'Failed' | string;
  completedAt?: string | null;
  score?: number | null;
  rawResponse?: string | null;
  createdAt?: string;
}

export interface ChakraInterview {
  id: number;
  employeeId: number;
  interviewerId: string;
  interviewerName: string;
  invitationUrl: string;
  triggeredAt: string;
  triggeredBy: string;
  invitedAt?: string | null;
  completedAt?: string | null;
  status: 'Invite Prepared' | 'Invited' | 'In Progress' | 'Completed' | 'Expired' | 'Failed' | string;
  score?: number | null;
  recommendation?: string | null;
  reportUrl?: string | null;
  rawResponse?: string | null;
  createdAt?: string;
}

export interface MentorSession {
  id: number;
  employeeId: number;
  sessionNumber: number;
  sessionDate: string; // YYYY-MM-DD
  duration: string; // "30 min" | "45 min" | "1 hour" | "1.5 hours" | "2 hours"
  mode: string; // "In-Person" | "Video Call" | "Hybrid"
  topics: string; // JSON string array
  subTopics: string; // JSON string array
  resources: string; // JSON string of resource list
  mentorNotes: string;
  
  prevSessionId?: number | null;
  q1Completed?: string | null; // 'Fully Completed' | 'Partially Completed' | 'Not Completed'
  q2Retained?: string | null; // 'Strong Retention' | 'Partial Retention' | 'Weak Retention'
  q3Readiness?: string | null; // 'Ready to progress' | 'Needs brief revision' | 'Requires full revision'
  followUpRemarks?: string | null;
  resourcesOverdue?: number; // 0 or 1
  retentionIssue?: number; // 0 or 1
  
  pythonTechAccuracy?: number | null;
  pythonProblemSolving?: number | null;
  pythonCodeQuality?: number | null;
  pythonConceptual?: number | null;
  pythonCommunication?: number | null;
  pythonAvgScore?: number | null;
  
  sqlTechAccuracy?: number | null;
  sqlProblemSolving?: number | null;
  sqlCodeQuality?: number | null;
  sqlConceptual?: number | null;
  sqlCommunication?: number | null;
  sqlAvgScore?: number | null;
  
  sparkTechAccuracy?: number | null;
  sparkProblemSolving?: number | null;
  sparkCodeQuality?: number | null;
  sparkConceptual?: number | null;
  sparkCommunication?: number | null;
  sparkAvgScore?: number | null;
  
  overallScore: number;
  createdAt?: string;
}

export interface MockInterview {
  id: number;
  employeeId: number;
  date: string; // YYYY-MM-DD
  mentorName: string;
  mockNumber: string; // 'Mock 1', 'Mock 2', etc.
  topic: string;
  techAccuracy: number; // 1-5
  problemSolvingSpeed: number; // 1-5
  codeQuality: number; // 1-5
  communication: number; // 1-5
  conceptualUnderstanding: number; // 1-5
  confidenceLevel: number; // 1-5
  overallScore: number;
  feedback: string;
  status: 'Pass' | 'Needs Improvement' | 'Fail';
  createdAt?: string;
}

export interface AttendanceLog {
  id: number;
  employeeId: number;
  sessionName: string;
  sessionDate: string; // YYYY-MM-DD
  topic: string;
  subtopic?: string | null;
  status: 'Present' | 'Absent' | 'Late';
  createdAt?: string;
}

export interface DashboardStats {
  overview: {
    totalEmployees: number;
    totalBench: number;
    totalNewJoiners: number;
    totalLaterals: number;
    interviewReady: number;
    needsSupport: number;
    benchAlerts: number;
    deployed?: number;
    enrolled?: number;
    idle?: number;
    clientReady?: number;
  };
  skillStrength: {
    Python: number;
    SQL: number;
    Spark: number;
    PySpark: number;
    General: number;
  };
  leaderboard: {
    id: number;
    name: string;
    skillGroup: string;
    avgScore: number;
    employeeType: string;
    attendanceRate: number;
  }[];
  flagged: {
    id: number;
    name: string;
    employeeType: string;
    attendanceRate: number;
    trend: string;
    avgScore: number;
    reason: string;
  }[];
  mentorPerformance?: {
    name: string;
    mentees: number;
    avgTeamScore: number;
    clientReadyCount: number;
  }[];
}

export const STATUS_LABELS: Record<string, string> = {
  'Enrolled': 'Enrolled',
  'Available': 'Idle',
  'In Training': 'Currently Enrolled',
  'Interview Ready': 'Ready for Interview',
  'Allocated': 'Deployed',
};
