import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp, real, boolean } from 'drizzle-orm/pg-core';

// Users table (for authentication & system authorization)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase UID
  email: text('email').notNull().unique(),
  role: text('role').notNull(), // 'admin' | 'manager' | 'mentor'
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Mentors table
export const mentors = pgTable('mentors', {
  id: serial('id').primaryKey(),
  employeeId: text('employee_id').notNull().unique(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone'),
  designation: text('designation'),
  domainExpertise: text('domain_expertise').default('[]').notNull(), // JSON string array of expertise e.g. ['Python', 'SQL']
  yearsOfExperience: real('years_of_experience'),
  maxCapacity: integer('max_capacity').default(4).notNull(),
  status: text('status').default('Active').notNull(), // 'Active' | 'Inactive'
  profilePhoto: text('profile_photo'),
  location: text('location'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Employees table (representing bench resources, new joiners, etc.)
export const employees = pgTable('employees', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id), // Nullable link to logged-in user
  employeeId: text('employee_id').notNull().unique(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  joiningDate: text('joining_date').notNull(), // YYYY-MM-DD
  designation: text('designation').default('Consultant').notNull(),
  employeeType: text('employee_type').notNull(), // 'Bench' | 'New Joiner' | 'Lateral Entry'
  status: text('status').notNull(), // 'Available' | 'In Training' | 'Allocated' | 'Interview Ready'
  skillGroup: text('skill_group'),
  persona: text('persona').default('Data Engineer').notNull(),
  skills: text('skills').default('[]').notNull(),
  benchAgingDays: integer('bench_aging_days').default(0),
  yearsOfExperience: real('years_of_experience').notNull(),
  previousProjectHistory: text('previous_project_history'),
  assignedMentor: text('assigned_mentor'),
  currentProject: text('current_project').notNull(), // 'Bench' or project name
  pythonLevel: text('python_level').notNull().default('Beginner'), // 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert'
  sqlLevel: text('sql_level').notNull().default('Beginner'),
  sparkLevel: text('spark_level').notNull().default('Beginner'),
  pysparkLevel: text('pyspark_level').notNull().default('Beginner'),
  programEnrollmentDate: text('program_enrollment_date'), // YYYY-MM-DD
  location: text('location'),
  module: text('module'),
  secondaryModule: text('secondary_module'),
  excelSourceActive: boolean('excel_source_active').default(true).notNull(),
  overallScore: real('overall_score'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Mock interviews table
export const mockInterviews = pgTable('mock_interviews', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').references(() => employees.id).notNull(),
  date: text('date').notNull(), // YYYY-MM-DD
  mentorName: text('mentor_name').notNull(),
  mockNumber: text('mock_number').notNull(), // 'Mock 1', 'Mock 2', etc.
  topic: text('topic').notNull(), // 'Python' | 'SQL' | 'Spark' | 'PySpark' | 'System Design' | etc.
  techAccuracy: integer('tech_accuracy').notNull(), // 1-5
  problemSolvingSpeed: integer('problem_solving_speed').notNull(), // 1-5
  codeQuality: integer('code_quality').notNull(), // 1-5
  communication: integer('communication').notNull(), // 1-5
  conceptualUnderstanding: integer('conceptual_understanding').notNull(), // 1-5
  confidenceLevel: integer('confidence_level').notNull(), // 1-5
  overallScore: real('overall_score').notNull(), // Average of above
  feedback: text('feedback').notNull(),
  status: text('status').notNull(), // 'Pass' | 'Needs Improvement' | 'Fail'
  createdAt: timestamp('created_at').defaultNow(),
});

// Attendance tracker table
export const attendance = pgTable('attendance', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').references(() => employees.id).notNull(),
  sessionName: text('session_name').notNull(),
  sessionDate: text('session_date').notNull(), // YYYY-MM-DD
  topic: text('topic').notNull(),
  subtopic: text('subtopic'),
  status: text('status').notNull(), // 'Present' | 'Absent' | 'Late'
  createdAt: timestamp('created_at').defaultNow(),
});

// Mentor Sessions table
export const mentorSessions = pgTable('mentor_sessions', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').references(() => employees.id).notNull(),
  sessionNumber: integer('session_number').notNull(),
  sessionDate: text('session_date').notNull(), // YYYY-MM-DD
  duration: text('duration').notNull(), // "30 min" | "45 min" | "1 hour" | "1.5 hours" | "2 hours"
  mode: text('mode').notNull(), // "In-Person" | "Video Call" | "Hybrid"
  topics: text('topics').notNull(), // JSON string list of topics
  subTopics: text('sub_topics').notNull(), // JSON string list of subtopics
  resources: text('resources').notNull(), // JSON string of resource list
  mentorNotes: text('mentor_notes').notNull(),
  
  // Mandatory Previous Session Review questions (Session 2 Onwards)
  prevSessionId: integer('prev_session_id'),
  q1Completed: text('q1_completed'), // 'Fully Completed' | 'Partially Completed' | 'Not Completed'
  q2Retained: text('q2_retained'), // 'Strong Retention' | 'Partial Retention' | 'Weak Retention'
  q3Readiness: text('q3_readiness'), // 'Ready to progress' | 'Needs brief revision' | 'Requires full revision'
  followUpRemarks: text('follow_up_remarks'),
  resourcesOverdue: integer('resources_overdue').default(0), // 0 or 1
  retentionIssue: integer('retention_issue').default(0), // 0 or 1
  
  // Python metrics
  pythonTechAccuracy: integer('python_tech_accuracy'),
  pythonProblemSolving: integer('python_problem_solving'),
  pythonCodeQuality: integer('python_code_quality'),
  pythonConceptual: integer('python_conceptual'),
  pythonCommunication: integer('python_communication'),
  pythonAvgScore: real('python_avg_score'),
  
  // SQL metrics
  sqlTechAccuracy: integer('sql_tech_accuracy'),
  sqlProblemSolving: integer('sql_problem_solving'),
  sqlCodeQuality: integer('sql_code_quality'),
  sqlConceptual: integer('sql_conceptual'),
  sqlCommunication: integer('sql_communication'),
  sqlAvgScore: real('sql_avg_score'),
  
  // Spark / PySpark metrics
  sparkTechAccuracy: integer('spark_tech_accuracy'),
  sparkProblemSolving: integer('spark_problem_solving'),
  sparkCodeQuality: integer('spark_code_quality'),
  sparkConceptual: integer('spark_conceptual'),
  sparkCommunication: integer('spark_communication'),
  sparkAvgScore: real('spark_avg_score'),
  
  // Aggregated Overall Score
  overallScore: real('overall_score').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// HackerRank Exams Table
export const hackerrankExams = pgTable('hackerrank_exams', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').references(() => employees.id).notNull(),
  testId: text('test_id').notNull(),
  testName: text('test_name').notNull(),
  triggeredAt: timestamp('triggered_at').defaultNow(),
  triggeredBy: text('triggered_by').notNull(),
  status: text('status').notNull(), // 'Invited' | 'In Progress' | 'Completed' | 'Expired' | 'Failed'
  completedAt: timestamp('completed_at'),
  score: real('score'),
  rawResponse: text('raw_response'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Chakra AI interviewer attempts. An attempt is only marked Invited after the recruiter
// confirms that the external invitation was actually sent. Scores are stored only when
// returned by Chakra's official API or present in its exported report CSV.
export const chakraInterviews = pgTable('chakra_interviews', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').references(() => employees.id).notNull(),
  interviewerId: text('interviewer_id').notNull(),
  interviewerName: text('interviewer_name').notNull(),
  invitationUrl: text('invitation_url').notNull(),
  status: text('status').notNull().default('Invite Prepared'),
  triggeredAt: timestamp('triggered_at').defaultNow(),
  triggeredBy: text('triggered_by').notNull(),
  invitedAt: timestamp('invited_at'),
  completedAt: timestamp('completed_at'),
  score: real('score'),
  recommendation: text('recommendation'),
  reportUrl: text('report_url'),
  rawResponse: text('raw_response'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Relations definitions
export const usersRelations = relations(users, ({ one }) => ({
  employeeProfile: one(employees, {
    fields: [users.id],
    references: [employees.userId],
  }),
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
  user: one(users, {
    fields: [employees.userId],
    references: [users.id],
  }),
  mockInterviews: many(mockInterviews),
  attendanceLogs: many(attendance),
  mentorSessions: many(mentorSessions),
  hackerrankExams: many(hackerrankExams),
  chakraInterviews: many(chakraInterviews),
}));

export const mockInterviewsRelations = relations(mockInterviews, ({ one }) => ({
  employee: one(employees, {
    fields: [mockInterviews.employeeId],
    references: [employees.id],
  }),
}));

export const attendanceRelations = relations(attendance, ({ one }) => ({
  employee: one(employees, {
    fields: [attendance.employeeId],
    references: [employees.id],
  }),
}));

export const mentorSessionsRelations = relations(mentorSessions, ({ one }) => ({
  employee: one(employees, {
    fields: [mentorSessions.employeeId],
    references: [employees.id],
  }),
}));

export const hackerrankExamsRelations = relations(hackerrankExams, ({ one }) => ({
  employee: one(employees, {
    fields: [hackerrankExams.employeeId],
    references: [employees.id],
  }),
}));

export const chakraInterviewsRelations = relations(chakraInterviews, ({ one }) => ({
  employee: one(employees, {
    fields: [chakraInterviews.employeeId],
    references: [employees.id],
  }),
}));
