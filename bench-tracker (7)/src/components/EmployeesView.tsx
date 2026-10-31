import React, { useState } from 'react';
import { 
  UserPlus, 
  Search, 
  Trash2, 
  Edit3, 
  ExternalLink,
  BookOpen,
  Mail,
  User,
  Calendar,
  Layers,
  GraduationCap,
  Play
} from 'lucide-react';
import { Employee, Mentor, STATUS_LABELS } from '../types.ts';
import EmployeeDetailModal from './EmployeeDetailModal.tsx';

const formatExperience = (value: number | string | null | undefined) => {
  const years = Number(value);
  if (!Number.isFinite(years)) return '—';
  return `${Number(years.toFixed(1))} years`;
};


const getLatestHackerRankSummary = (employee: Employee) => {
  const exams = [...(employee.hackerrankExams || [])].sort(
    (a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime()
  );
  const exam: any = exams[0];
  if (!exam) return { status: 'Not invited', score: '—', outcome: null as string | null, simulated: false };

  let data: any = {};
  try { data = exam.rawResponse ? JSON.parse(exam.rawResponse) : {}; } catch { data = {}; }
  if (data?.simulated === true) return { status: 'Legacy test data', score: 'Not real', outcome: null as string | null, simulated: true };
  const candidate = data?.candidate ?? data?.invitationResponse?.candidate ?? data?.invitationResponse ?? data;

  let score = '—';
  const percentage = candidate?.percentage_score;
  if (percentage !== undefined && percentage !== null && Number.isFinite(Number(percentage))) {
    score = `${Number(percentage).toFixed(1)}%`;
  } else {
    const rawScore = candidate?.score ?? candidate?.total_score ?? candidate?.test_score ?? exam.score;
    const maxScore = candidate?.max_score ?? candidate?.maxScore ?? candidate?.total_max_score;
    if (rawScore !== undefined && rawScore !== null && Number.isFinite(Number(rawScore))) {
      score = maxScore !== undefined && maxScore !== null && Number.isFinite(Number(maxScore))
        ? `${Number(rawScore).toFixed(1)} / ${Number(maxScore).toFixed(1)}`
        : `${Number(rawScore).toFixed(1)} points`;
    }
  }

  let outcome: string | null = null;
  const storedOutcome = data?.assessmentOutcome ?? data?.outcome;
  if (typeof storedOutcome === 'string') {
    if (/^(passed?|qualified)$/i.test(storedOutcome.trim())) outcome = 'Passed';
    else if (/^(failed?|not qualified)$/i.test(storedOutcome.trim())) outcome = 'Failed';
    else if (/^review required$/i.test(storedOutcome.trim())) outcome = 'Review required';
  }
  const atsState = Number(candidate?.ats_state);
  if (!outcome && atsState === 2) outcome = 'Passed';
  else if (!outcome && atsState === 3) outcome = 'Failed';
  else if (!outcome) {
    const explicit = candidate?.assessmentOutcome ?? candidate?.outcome ?? candidate?.verdict ?? candidate?.result;
    if (typeof explicit === 'string' && /^(passed?|qualified|failed?|not qualified)$/i.test(explicit.trim())) {
      outcome = /^(pass|qualified)/i.test(explicit.trim()) ? 'Passed' : 'Failed';
    } else if (typeof (candidate?.is_qualified ?? candidate?.qualified ?? candidate?.passed) === 'boolean') {
      outcome = (candidate.is_qualified ?? candidate.qualified ?? candidate.passed) ? 'Passed' : 'Failed';
    } else if (data?.testCutoffScore !== null && data?.testCutoffScore !== undefined &&
      Number.isFinite(Number(data.testCutoffScore)) && percentage !== null && percentage !== undefined &&
      Number.isFinite(Number(percentage))) {
      outcome = Number(percentage) >= Number(data.testCutoffScore) ? 'Passed' : 'Failed';
    } else if (atsState === 1) outcome = 'Review required';
  }

  return { status: exam.status || 'Unknown', score, outcome, simulated: false };
};

const getLatestAssessmentSummary = (employee: Employee) => ({
  ...getLatestHackerRankSummary(employee),
  provider: 'HackerRank',
});

interface EmployeesViewProps {
  employees: Employee[];
  mentors?: Mentor[];
  userRole: 'admin' | 'manager' | 'mentor';
  onAddEmployee: (employeeData: Partial<Employee>) => Promise<any>;
  onUpdateEmployee: (empId: number, employeeData: Partial<Employee>) => Promise<any>;
  onDeleteEmployee: (empId: number) => Promise<any>;
  token: string | null;
  simulatedRole: string;
  onRefresh: () => void;
}

export default function EmployeesView({
  employees,
  mentors = [],
  userRole,
  onAddEmployee,
  onUpdateEmployee,
  onDeleteEmployee,
  token,
  simulatedRole,
  onRefresh
}: EmployeesViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSkill, setFilterSkill] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterType, setFilterType] = useState('All');
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);

  // Form states for Add/Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [formData, setFormData] = useState<Partial<Employee>>({
    employeeId: '',
    name: '',
    email: '',
    joiningDate: new Date().toISOString().split('T')[0],
    programEnrollmentDate: new Date().toISOString().split('T')[0],
    employeeType: 'Bench',
    status: 'Enrolled',
    skillGroup: 'Python',
    yearsOfExperience: 1,
    previousProjectHistory: '',
    assignedMentor: '',
    currentProject: 'Bench',
    pythonLevel: 'Beginner',
    sqlLevel: 'Beginner',
    sparkLevel: 'Beginner',
    pysparkLevel: 'Beginner'
  });

  const [formError, setFormError] = useState('');
  const [eligibleMentors, setEligibleMentors] = useState<any[]>([]);
  const [loadingEligibleMentors, setLoadingEligibleMentors] = useState(false);

  // Keep the detail modal in sync with fresh results returned by the backend.
  React.useEffect(() => {
    if (!selectedEmp) return;
    const freshEmployee = employees.find((emp) => emp.id === selectedEmp.id);
    if (freshEmployee && freshEmployee !== selectedEmp) setSelectedEmp(freshEmployee);
  }, [employees, selectedEmp]);

  // Dynamic eligible mentors query
  React.useEffect(() => {
    if (isModalOpen && modalMode === 'edit' && formData.id) {
      const fetchEligible = async () => {
        setLoadingEligibleMentors(true);
        try {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'x-simulated-role': simulatedRole
          };
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
          const res = await fetch(`/api/employees/${formData.id}/eligible-mentors`, { headers });
          if (res.ok) {
            const data = await res.json();
            let eligible = data.mentors || [];
            
            // Client-side validation fallback in case designation is changed on-the-fly inside modal
            const getDesignationRank = (des: string) => {
              const d = des ? des.toLowerCase() : '';
              if (d.includes('manager') && d.includes('senior')) return 6;
              if (d.includes('manager')) return 5;
              if (d.includes('assistant manager') || d.includes('am')) return 4;
              if (d.includes('senior') || d.includes('consultant') || d.includes('con')) return 3;
              if (d.includes('executive') || d.includes('associate consultant') || d.includes('acon')) return 2;
              if (d.includes('analyst')) return 1;
              return 1;
            };
            const empRank = getDesignationRank(formData.designation || 'Consultant');
            eligible = eligible.filter((m: any) => {
              const mRank = getDesignationRank(m.designation || '');
              return mRank >= empRank;
            });

            // Keep the current mentor in the list so we don't clear it
            if (formData.assignedMentor) {
              const hasCurrent = eligible.some((m: any) => m.name === formData.assignedMentor);
              if (!hasCurrent) {
                const currentM = mentors.find(m => m.name === formData.assignedMentor);
                if (currentM) {
                  eligible = [currentM, ...eligible];
                }
              }
            }
            setEligibleMentors(eligible);
          } else {
            setEligibleMentors(mentors);
          }
        } catch (e) {
          console.error('Failed to load eligible mentors', e);
          setEligibleMentors(mentors);
        } finally {
          setLoadingEligibleMentors(false);
        }
      };
      fetchEligible();
    } else {
      setEligibleMentors([]);
    }
  }, [formData.id, formData.designation, isModalOpen, modalMode]);

  // Handle open modal
  const handleOpenAdd = () => {
    setModalMode('add');
    setFormData({
      employeeId: `EMP${Math.floor(100 + Math.random() * 900)}`,
      name: '',
      email: '',
      joiningDate: new Date().toISOString().split('T')[0],
      programEnrollmentDate: new Date().toISOString().split('T')[0],
      employeeType: 'Bench',
      status: 'Enrolled',
      skillGroup: 'Python',
      yearsOfExperience: 1,
      previousProjectHistory: '',
      assignedMentor: '',
      currentProject: 'Bench',
      pythonLevel: 'Beginner',
      sqlLevel: 'Beginner',
      sparkLevel: 'Beginner',
      pysparkLevel: 'Beginner',
      designation: 'Consultant'
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (emp: Employee) => {
    setModalMode('edit');
    setFormData({
      ...emp,
      yearsOfExperience: Number.isFinite(Number(emp.yearsOfExperience))
        ? Number(Number(emp.yearsOfExperience).toFixed(1))
        : 0,
    });
    setFormError('');
    setIsModalOpen(true);
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formData.employeeId || !formData.name || !formData.email || !formData.joiningDate) {
      setFormError('Please fill out all mandatory fields.');
      return;
    }

    try {
      // Normalize experience to one decimal before persisting it.
      const payload = {
        ...formData,
        yearsOfExperience: Number.isFinite(Number(formData.yearsOfExperience))
          ? Number(Number(formData.yearsOfExperience).toFixed(1))
          : 0,
      };
      if (modalMode === 'add') {
        await onAddEmployee(payload);
      } else {
        await onUpdateEmployee(formData.id!, payload);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'An error occurred while saving the employee record.');
    }
  };

  // Filter list
  const filteredList = employees.filter(emp => {
    const matchesSearch = 
      emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.employeeId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesSkill = filterSkill === 'All' || emp.skillGroup === filterSkill;
    const matchesStatus = filterStatus === 'All' || emp.status === filterStatus;
    const matchesType = filterType === 'All' || emp.employeeType === filterType;

    return matchesSearch && matchesSkill && matchesStatus && matchesType;
  });

  // Get status color (mandated: green = available, red = needs support, blue = interview ready, orange = in training)
  const getStatusStyle = (emp: Employee) => {
    if (emp.status === 'Interview Ready') return 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40';
    if (emp.status === 'Enrolled') return 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/40';
    switch (emp.classificationTier) {
      case 'Needs Support':
        return 'bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/40';
      case 'Client Ready':
      case 'Interview Ready':
        return 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40';
      case 'In Training':
        return 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/40';
      case 'Allocated':
        return 'bg-purple-50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-900/40';
      default:
        switch (emp.status) {
          case 'Available':
            return 'bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700';
          case 'In Training':
            return 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/40';
          case 'Allocated':
            return 'bg-purple-50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-900/40';
          default:
            return 'bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700';
        }
    }
  };

  const getProficiencyStyle = (level: string) => {
    switch (level) {
      case 'Expert':
        return 'bg-indigo-600 text-white';
      case 'Advanced':
        return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400';
      case 'Intermediate':
        return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
      default:
        return 'bg-zinc-50 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500 border border-zinc-100 dark:border-zinc-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Employee Directory</h1>
          
        </div>

        {/* Restricting to Excel synchronization only, manual addition removed */}
      </div>

      {/* Directory Filters */}
      <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
          <input
            id="employee-search-input"
            type="text"
            placeholder="Search by ID, name, or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl pl-9 pr-4 py-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex flex-wrap md:flex-nowrap items-center gap-3 w-full md:w-auto">
          <select
            id="filter-skill-select"
            value={filterSkill}
            onChange={(e) => setFilterSkill(e.target.value)}
            className="text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="All">All Skill Groups</option>
            <option value="Python">Python</option>
            <option value="SQL">SQL</option>
            <option value="Spark">Spark</option>
            <option value="PySpark">PySpark</option>
            <option value="Data Engineering General">DE General</option>
          </select>

          <select
            id="filter-status-select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="All">All Statuses</option>
            <option value="Enrolled">{STATUS_LABELS['Enrolled']}</option>
            <option value="Available">{STATUS_LABELS['Available']}</option>
            <option value="In Training">{STATUS_LABELS['In Training']}</option>
            <option value="Allocated">{STATUS_LABELS['Allocated']}</option>
            <option value="Interview Ready">{STATUS_LABELS['Interview Ready']}</option>
          </select>

          <select
            id="filter-type-select"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="All">All Types</option>
            <option value="Bench">Bench</option>
            <option value="New Joiner">New Joiner</option>
            <option value="Lateral Entry">Lateral Entry</option>
          </select>
        </div>
      </div>

      {/* Employee List */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Candidates</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Showing {filteredList.length} of {employees.length} employees</p>
          </div>
        </div>
        {filteredList.length === 0 ? (
          <div className="p-10 text-center text-sm text-zinc-400 dark:text-zinc-500">
            No employee profiles match the chosen search criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-bold">Candidate</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold">Experience</th>
                  <th className="px-4 py-3 font-bold">Role Focus</th>
                  <th className="px-4 py-3 font-bold">Mentor</th>
                  <th className="px-4 py-3 font-bold">Allocation</th>
                  <th className="px-4 py-3 font-bold">Skill Matrix</th>
                  <th className="px-4 py-3 font-bold">Latest HackerRank</th>
                  <th className="px-4 py-3 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {filteredList.map(emp => {
                  const statusLabel = ['Enrolled', 'Interview Ready', 'Allocated'].includes(emp.status)
                    ? (STATUS_LABELS[emp.status] || emp.status)
                    : emp.classificationTier === 'Needs Support' ? 'Needs Support' :
                      (emp.classificationTier === 'Client Ready' || emp.classificationTier === 'Interview Ready') ? 'Ready for Interview' :
                      emp.classificationTier === 'Allocated' ? 'Deployed' :
                      emp.classificationTier === 'In Training' ? 'In Training' :
                      emp.classificationTier === 'N/A' ? 'Idle / Bench' : (STATUS_LABELS[emp.status] || emp.status);
                  return (
                    <tr key={emp.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <button onClick={() => setSelectedEmp(emp)} className="text-left group">
                          <span className="block font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">{emp.name}</span>
                          <span className="block mt-0.5 text-[10px] font-mono text-zinc-400">{emp.employeeId}</span>
                          <span className="block mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">{emp.email}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${getStatusStyle(emp)}`}>{statusLabel}</span>
                        <span className="block mt-1 text-[10px] text-zinc-400">{emp.employeeType}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-zinc-700 dark:text-zinc-300">{formatExperience(emp.yearsOfExperience)}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-semibold text-indigo-600 dark:text-indigo-400">{emp.skillGroup || '—'}</td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{emp.assignedMentor || 'Unassigned'}</td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{emp.currentProject === 'Bench' ? 'Bench' : (emp.currentProject || '—')}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5 max-w-[230px]">
                          {([['PY', emp.pythonLevel], ['SQL', emp.sqlLevel], ['SP', emp.sparkLevel], ['PS', emp.pysparkLevel]] as const).map(([label, level]) => (
                            <span key={label} title={`${label}: ${level}`} className={`rounded-md px-1.5 py-1 text-[9px] font-bold ${getProficiencyStyle(level || '')}`}>{label}: {level || 'N/A'}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 min-w-[165px]">
                        {(() => {
                          const assessment = getLatestAssessmentSummary(emp);
                          const primaryLabel = assessment.outcome || assessment.status;
                          const statusStyle = assessment.simulated
                            ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30'
                            : primaryLabel === 'Passed'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30'
                              : primaryLabel === 'Failed' || primaryLabel === 'Expired'
                                ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30'
                                : primaryLabel === 'Review required'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30'
                                  : 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/30';
                          return (
                            <>
                              <span className="block mb-1 text-[9px] font-bold uppercase tracking-wide text-zinc-400">{assessment.provider}</span>
                              <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${statusStyle}`}>{primaryLabel}</span>
                              <span className="block mt-1 text-[11px] font-bold text-zinc-700 dark:text-zinc-200">{assessment.score}</span>
                              <button onClick={() => setSelectedEmp(emp)} className="block mt-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline">{assessment.status === 'Not invited' ? 'Choose assessment' : 'View attempts'}</button>
                            </>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end items-center gap-1.5">
                          {(userRole === 'admin' || userRole === 'manager' || userRole === 'mentor') && (
                            <button id={`edit-emp-btn-${emp.id}`} onClick={() => handleOpenEdit(emp)} className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-300" title="Edit Profile" aria-label={`Edit ${emp.name}`}>
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {userRole === 'admin' && (
                            <button id={`delete-emp-btn-${emp.id}`} onClick={() => { if (confirm(`Are you sure you want to delete ${emp.name}? This will purge all associated interview and attendance data.`)) onDeleteEmployee(emp.id); }} className="p-2 rounded-lg border border-red-100 dark:border-red-950/40 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-600 dark:text-red-400" title="Delete Record" aria-label={`Delete ${emp.name}`}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal popup */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
              <h2 className="text-md font-bold text-zinc-900 dark:text-zinc-100">
                {modalMode === 'add' ? 'Register New DE Resource' : `Modify Profile: ${formData.name}`}
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/40 rounded-xl text-xs font-semibold">
                  {formError}
                </div>
              )}

              {/* Section 1: Demographics */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Employee ID *</label>
                  <input
                    type="text"
                    required
                    disabled={modalMode === 'edit'}
                    value={formData.employeeId}
                    onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                    className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    disabled={userRole === 'mentor'}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Official Email *</label>
                  <input
                    type="email"
                    required
                    disabled={userRole === 'mentor'}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Joining Date *</label>
                  <input
                    type="date"
                    required
                    disabled={userRole === 'mentor'}
                    value={formData.joiningDate}
                    onChange={(e) => setFormData({ ...formData, joiningDate: e.target.value })}
                    className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Section 2: Roles and Assignments */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-zinc-50 dark:border-zinc-800 pt-4">
                <div>
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Resource Type</label>
                  <select
                    disabled={userRole === 'mentor'}
                    value={formData.employeeType}
                    onChange={(e) => setFormData({ ...formData, employeeType: e.target.value as any })}
                    className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="Bench">Bench</option>
                    <option value="New Joiner">New Joiner</option>
                    <option value="Lateral Entry">Lateral Entry</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Availability Status</label>
                  {modalMode === 'add' ? (
                    <div className="space-y-1">
                      <div className="w-full text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-2.5 text-zinc-700 dark:text-zinc-300">Enrolled</div>
                    </div>
                  ) : (
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                      className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="Enrolled">{STATUS_LABELS['Enrolled']}</option>
                      <option value="Available">{STATUS_LABELS['Available']}</option>
                      <option value="In Training">{STATUS_LABELS['In Training']}</option>
                      <option value="Allocated">{STATUS_LABELS['Allocated']}</option>
                      <option value="Interview Ready">{STATUS_LABELS['Interview Ready']}</option>
                    </select>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Primary Skill Group</label>
                  <select
                    disabled={userRole === 'mentor'}
                    value={formData.skillGroup}
                    onChange={(e) => setFormData({ ...formData, skillGroup: e.target.value as any })}
                    className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="Python">Python</option>
                    <option value="SQL">SQL</option>
                    <option value="Spark">Spark</option>
                    <option value="PySpark">PySpark</option>
                    <option value="Data Engineering General">Data Engineering General</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Designation</label>
                  <select
                    disabled={userRole === 'mentor'}
                    value={formData.designation || 'Consultant'}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="Associate Consultant">Associate Consultant</option>
                    <option value="Consultant">Consultant</option>
                    <option value="Assistant Manager">Assistant Manager</option>
                    <option value="Manager">Manager</option>
                    <option value="Senior Manager">Senior Manager</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Years of Experience</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    disabled={userRole === 'mentor'}
                    value={formData.yearsOfExperience}
                    onChange={(e) => setFormData({ ...formData, yearsOfExperience: Number(e.target.value) })}
                    className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>



                <div>
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Current Allocation Project</label>
                  <input
                    type="text"
                    disabled={userRole === 'mentor'}
                    value={formData.currentProject}
                    onChange={(e) => setFormData({ ...formData, currentProject: e.target.value })}
                    placeholder="or 'Bench'"
                    className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Section 3: Skill Levels */}
              <div className="space-y-2 border-t border-zinc-50 dark:border-zinc-800 pt-4">
                <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block">Assessment Matrix Levels</span>
                {modalMode === 'add' ? (
                  <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-150 dark:border-zinc-850 rounded-2xl space-y-1">
                    <span className="text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400 block uppercase tracking-wider">💡 Automatic Skill Level Initialization</span>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                      As a new resource, all proficiency levels (Python, SQL, Spark, PySpark) default to <strong>Beginner</strong>. Competency assessment grades are managed dynamically by mentors after evaluatory mock interviews or training sessions are executed.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 block mb-1">Python Level</label>
                      <select
                        value={formData.pythonLevel}
                        onChange={(e) => setFormData({ ...formData, pythonLevel: e.target.value as any })}
                        className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="Beginner">Beginner</option>
                        <option value="Intermediate">Intermediate</option>
                        <option value="Advanced">Advanced</option>
                        <option value="Expert">Expert</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 block mb-1">SQL Level</label>
                      <select
                        value={formData.sqlLevel}
                        onChange={(e) => setFormData({ ...formData, sqlLevel: e.target.value as any })}
                        className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="Beginner">Beginner</option>
                        <option value="Intermediate">Intermediate</option>
                        <option value="Advanced">Advanced</option>
                        <option value="Expert">Expert</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 block mb-1">Spark Level</label>
                      <select
                        value={formData.sparkLevel}
                        onChange={(e) => setFormData({ ...formData, sparkLevel: e.target.value as any })}
                        className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="Beginner">Beginner</option>
                        <option value="Intermediate">Intermediate</option>
                        <option value="Advanced">Advanced</option>
                        <option value="Expert">Expert</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 block mb-1">PySpark Level</label>
                      <select
                        value={formData.pysparkLevel}
                        onChange={(e) => setFormData({ ...formData, pysparkLevel: e.target.value as any })}
                        className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="Beginner">Beginner</option>
                        <option value="Intermediate">Intermediate</option>
                        <option value="Advanced">Advanced</option>
                        <option value="Expert">Expert</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Section 5: HackerRank Assessment */}
              <div className="border-t border-zinc-50 dark:border-zinc-800 pt-4 space-y-3">
                <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block">HackerRank Assessment</span>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-50 dark:bg-zinc-800/40 p-4 rounded-xl border border-zinc-200 dark:border-zinc-750">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-zinc-850 dark:text-zinc-200 block">Assessment Automation</span>
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500 block">HackerRank integration is active! Trigger exams and view logs on the career dashboard.</span>
                  </div>
                  {modalMode === 'edit' && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsModalOpen(false);
                        setSelectedEmp(formData as Employee);
                      }}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm self-start sm:self-center cursor-pointer transition-all flex items-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Open Career Dashboard
                    </button>
                  )}
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Overall Score (0.00 - 5.00)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="5"
                    value={formData.overallScore ?? ''}
                    onChange={(e) => setFormData({ ...formData, overallScore: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="e.g. 4.25"
                    className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Section 4: Project history */}
              <div className="border-t border-zinc-50 dark:border-zinc-800 pt-4">
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Previous Project History / Remarks</label>
                <textarea
                  disabled={userRole === 'mentor'}
                  value={formData.previousProjectHistory || ''}
                  onChange={(e) => setFormData({ ...formData, previousProjectHistory: e.target.value })}
                  placeholder="For lateral entries, highlight client pipelines, streaming clusters, or data warehouses they constructed..."
                  rows={3}
                  className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-50 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm"
                >
                  {modalMode === 'add' ? 'Register Employee' : 'Save Modifications'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Career Dashboard Detail Modal */}
      {selectedEmp && (
        <EmployeeDetailModal
          employee={employees.find(e => e.id === selectedEmp.id) || selectedEmp}
          userRole={userRole}
          onClose={() => setSelectedEmp(null)}
          onRefresh={onRefresh}
          token={token}
          simulatedRole={simulatedRole}
        />
      )}
    </div>
  );
}
