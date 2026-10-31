import React, { useState } from 'react';
import { 
  GraduationCap, 
  Plus, 
  Calendar, 
  User, 
  Award, 
  TrendingUp,
  MessageSquare,
  Search,
  Sliders,
  ChevronRight,
  ClipboardList
} from 'lucide-react';
import { MockInterview, Employee } from '../types.ts';

interface MockInterviewsViewProps {
  mocks: MockInterview[];
  employees: Employee[];
  userRole: string;
  onAddMock: (mockData: Partial<MockInterview>) => Promise<any>;
}

export default function MockInterviewsView({
  mocks,
  employees,
  userRole,
  onAddMock
}: MockInterviewsViewProps) {
  const [filterTopic, setFilterTopic] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('All');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    employeeId: '',
    date: new Date().toISOString().split('T')[0],
    mentorName: '',
    mockNumber: 'Mock 1',
    topic: 'Python',
    techAccuracy: 3,
    problemSolvingSpeed: 3,
    codeQuality: 3,
    communication: 3,
    conceptualUnderstanding: 3,
    confidenceLevel: 3,
    feedback: '',
    status: 'Pass' as 'Pass' | 'Needs Improvement' | 'Fail'
  });

  const [formError, setFormError] = useState('');

  const getNextMockDetails = (empIdStr: string) => {
    const empId = Number(empIdStr);
    const empMocks = mocks.filter(m => m.employeeId === empId).sort((a, b) => a.date.localeCompare(b.date));
    const count = empMocks.length;
    const nextNum = count + 1;
    const lastMockDate = count > 0 ? empMocks[count - 1].date : null;
    return {
      nextNum,
      mockNumber: `Mock #${nextNum}`,
      lastMockDate
    };
  };

  React.useEffect(() => {
    if (formData.employeeId) {
      const { mockNumber } = getNextMockDetails(formData.employeeId);
      setFormData(prev => {
        if (prev.mockNumber !== mockNumber) {
          return { ...prev, mockNumber };
        }
        return prev;
      });
    }
  }, [formData.employeeId, mocks]);

  const handleOpenAdd = () => {
    const defaultEmpId = employees[0]?.id.toString() || '';
    const { mockNumber } = getNextMockDetails(defaultEmpId);
    setFormData({
      employeeId: defaultEmpId,
      date: new Date().toISOString().split('T')[0],
      mentorName: '',
      mockNumber: mockNumber,
      topic: 'Python',
      techAccuracy: 3,
      problemSolvingSpeed: 3,
      codeQuality: 3,
      communication: 3,
      conceptualUnderstanding: 3,
      confidenceLevel: 3,
      feedback: '',
      status: 'Pass'
    });
    setFormError('');
    setIsModalOpen(true);
  };

  // Live score calculation
  const calculateLiveAverage = () => {
    const scores = [
      formData.techAccuracy,
      formData.problemSolvingSpeed,
      formData.codeQuality,
      formData.communication,
      formData.conceptualUnderstanding,
      formData.confidenceLevel
    ];
    return Number((scores.reduce((sum, s) => sum + s, 0) / scores.length).toFixed(2));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formData.employeeId || !formData.mentorName || !formData.feedback) {
      setFormError('Please fill out all mandatory fields (Mentor, feedback, and Employee selection).');
      return;
    }

    try {
      await onAddMock({
        ...formData,
        employeeId: Number(formData.employeeId)
      });
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Failed to submit mock assessment.');
    }
  };

  // Filter lists
  const filteredMocks = mocks.filter(mock => {
    const matchesTopic = filterTopic === 'All' || mock.topic === filterTopic;
    const matchesStatus = filterStatus === 'All' || mock.status === filterStatus;
    const matchesEmployee = selectedEmployeeId === 'All' || mock.employeeId.toString() === selectedEmployeeId;
    return matchesTopic && matchesStatus && matchesEmployee;
  });

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Pass':
        return 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/40';
      case 'Needs Improvement':
        return 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/40';
      case 'Fail':
        return 'bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/40';
      default:
        return 'bg-zinc-50 dark:bg-zinc-800 text-zinc-500';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Mock Interview Assessments</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">Review detailed scorecards, technical metrics, and structured feedback from mentors.</p>
        </div>

        {(userRole === 'admin' || userRole === 'mentor') && (
          <button
            id="log-mock-button"
            onClick={handleOpenAdd}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Log Mock Session</span>
          </button>
        )}
      </div>

      {/* Aggregate metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
          <div>
            <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">Total Mocks Conducted</span>
            <span className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-50 block leading-tight mt-1">{mocks.length} sessions</span>
          </div>
          <ClipboardList className="w-8 h-8 text-indigo-500/40" />
        </div>

        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
          <div>
            <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">Pass Rate</span>
            <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 block leading-tight mt-1">
              {mocks.length > 0 ? `${Math.round((mocks.filter(m => m.status === 'Pass').length / mocks.length) * 100)}%` : '0%'}
            </span>
          </div>
          <Award className="w-8 h-8 text-emerald-500/40" />
        </div>

        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
          <div>
            <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">Needs Support Rate</span>
            <span className="text-2xl font-extrabold text-red-600 dark:text-red-400 block leading-tight mt-1">
              {mocks.length > 0 ? `${Math.round((mocks.filter(m => m.status === 'Fail' || m.status === 'Needs Improvement').length / mocks.length) * 100)}%` : '0%'}
            </span>
          </div>
          <Sliders className="w-8 h-8 text-red-500/40" />
        </div>
      </div>

      {/* Advanced Filters */}
      <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <label className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block mb-1">Filter by Resource Name</label>
          <select
            id="mock-filter-employee"
            value={selectedEmployeeId}
            onChange={(e) => setSelectedEmployeeId(e.target.value)}
            className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="All">All Evaluated Resources</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>{e.name} ({e.employeeId})</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3 w-full md:w-auto shrink-0 pt-5 md:pt-0">
          <div>
            <label className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block mb-1">Mock Topic</label>
            <select
              id="mock-filter-topic"
              value={filterTopic}
              onChange={(e) => setFilterTopic(e.target.value)}
              className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="All">All Topics</option>
              <option value="Python">Python</option>
              <option value="SQL">SQL</option>
              <option value="Spark">Spark</option>
              <option value="PySpark">PySpark</option>
              <option value="System Design">System Design</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block mb-1">Evaluation Outcome</label>
            <select
              id="mock-filter-status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="All">All Statuses</option>
              <option value="Pass">Pass</option>
              <option value="Needs Improvement">Needs Improvement</option>
              <option value="Fail">Fail</option>
            </select>
          </div>
        </div>
      </div>

      {/* Scorecards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredMocks.map(mock => {
          const matchedEmployee = employees.find(e => e.id === mock.employeeId);
          return (
            <div 
              key={mock.id} 
              className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden hover:border-zinc-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between"
            >
              <div className="p-5 space-y-4">
                {/* Header Profile info */}
                <div className="flex justify-between items-start">
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                      <GraduationCap className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">{matchedEmployee?.name || 'Unknown Employee'}</h3>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
                        <span className="font-semibold">{mock.mockNumber}</span>
                        <span>•</span>
                        <span className="font-medium">{mock.topic}</span>
                      </div>
                    </div>
                  </div>

                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadgeClass(mock.status)}`}>
                    {mock.status}
                  </span>
                </div>

                {/* Score breakdown bar chart view */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-b border-zinc-50 dark:border-zinc-800/50 py-4 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>Technical Accuracy</span>
                      <span className="text-zinc-800 dark:text-zinc-200">{mock.techAccuracy}/5</span>
                    </div>
                    <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${(mock.techAccuracy/5)*100}%` }} />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>Problem-Solving Speed</span>
                      <span className="text-zinc-800 dark:text-zinc-200">{mock.problemSolvingSpeed}/5</span>
                    </div>
                    <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${(mock.problemSolvingSpeed/5)*100}%` }} />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>Code Quality &amp; Optimization</span>
                      <span className="text-zinc-800 dark:text-zinc-200">{mock.codeQuality}/5</span>
                    </div>
                    <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${(mock.codeQuality/5)*100}%` }} />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>Communication &amp; Explain</span>
                      <span className="text-zinc-800 dark:text-zinc-200">{mock.communication}/5</span>
                    </div>
                    <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${(mock.communication/5)*100}%` }} />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>Conceptual Understanding</span>
                      <span className="text-zinc-800 dark:text-zinc-200">{mock.conceptualUnderstanding}/5</span>
                    </div>
                    <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${(mock.conceptualUnderstanding/5)*100}%` }} />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>Confidence Level</span>
                      <span className="text-zinc-800 dark:text-zinc-200">{mock.confidenceLevel}/5</span>
                    </div>
                    <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${(mock.confidenceLevel/5)*100}%` }} />
                    </div>
                  </div>
                </div>

                {/* Feedback comment block */}
                <div className="text-xs space-y-1.5">
                  <span className="font-bold text-zinc-400 dark:text-zinc-500 flex items-center gap-1">
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Mentor Feedback</span>
                  </span>
                  <p className="text-zinc-600 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800/45 p-3 rounded-xl italic leading-relaxed">
                    "{mock.feedback}"
                  </p>
                </div>
              </div>

              {/* Card Footer Info */}
              <div className="bg-zinc-50 dark:bg-zinc-900/40 px-5 py-3 border-t border-zinc-100 dark:border-zinc-800 flex justify-between items-center text-[10px] font-semibold text-zinc-500">
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Assessed by: <span className="text-zinc-700 dark:text-zinc-300">{mock.mentorName}</span></span>
                </span>
                <span className="flex items-center gap-1 text-right">
                  <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                  <span>On: <span className="text-zinc-700 dark:text-zinc-300">{mock.date}</span></span>
                </span>
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 border-l border-zinc-200 dark:border-zinc-800 pl-3">
                  Score: {Number(mock.overallScore).toFixed(2)}/5.0
                </span>
              </div>
            </div>
          );
        })}

        {filteredMocks.length === 0 && (
          <div className="col-span-full bg-zinc-50 dark:bg-zinc-800/10 p-12 text-center rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500 text-sm">
            No historical mock interviews fit these filters.
          </div>
        )}
      </div>

      {/* Log Mock Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-xl max-h-[90vh] overflow-y-auto flex flex-col">
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
              <h2 className="text-md font-bold text-zinc-900 dark:text-zinc-100">Submit Mock Assessment Feedback</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-400 hover:text-zinc-600">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-semibold">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Select Employee *</label>
                  <select
                    value={formData.employeeId}
                    onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                    className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.name} ({e.employeeId})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Assigned Mentor Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sneha Rao"
                    value={formData.mentorName}
                    onChange={(e) => setFormData({ ...formData, mentorName: e.target.value })}
                    className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Mock Round *</label>
                  <input
                    type="text"
                    required
                    readOnly
                    value={formData.mockNumber}
                    className="w-full text-xs bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-400 dark:text-zinc-500 focus:outline-none cursor-not-allowed"
                  />
                  {formData.employeeId && (() => {
                    const selectedEmp = employees.find(e => e.id.toString() === formData.employeeId);
                    const { nextNum, lastMockDate } = getNextMockDetails(formData.employeeId);
                    return (
                      <p className="text-[10px] text-zinc-500 mt-1">
                        This will be {selectedEmp?.name}'s Mock #{nextNum}.{' '}
                        {lastMockDate ? `Previous mock on ${lastMockDate}.` : 'No previous mocks found.'}
                      </p>
                    );
                  })()}
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Topic Evaluated *</label>
                  <select
                    value={formData.topic}
                    onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                    className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="Python">Python</option>
                    <option value="SQL">SQL</option>
                    <option value="Spark">Spark</option>
                    <option value="PySpark">PySpark</option>
                    <option value="System Design">System Design</option>
                    <option value="General DE">General DE</option>
                  </select>
                </div>
              </div>

              {/* Slider ratings */}
              <div className="bg-zinc-50 dark:bg-zinc-800/40 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800 space-y-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Metrics Assessment Scale (1-5)</span>
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">Live Average: {calculateLiveAverage()}/5</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-semibold text-zinc-500">
                  <div className="space-y-1 bg-white dark:bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-100 dark:border-zinc-800/60">
                    <div className="flex justify-between">
                      <span>Technical Accuracy</span>
                      <span className="text-zinc-800 dark:text-zinc-200 font-bold">{formData.techAccuracy}/5</span>
                    </div>
                    <input
                      type="range" min="1" max="5" value={formData.techAccuracy}
                      onChange={(e) => setFormData({ ...formData, techAccuracy: Number(e.target.value) })}
                      className="w-full accent-indigo-600"
                    />
                  </div>

                  <div className="space-y-1 bg-white dark:bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-100 dark:border-zinc-800/60">
                    <div className="flex justify-between">
                      <span>Problem-Solving Speed</span>
                      <span className="text-zinc-800 dark:text-zinc-200 font-bold">{formData.problemSolvingSpeed}/5</span>
                    </div>
                    <input
                      type="range" min="1" max="5" value={formData.problemSolvingSpeed}
                      onChange={(e) => setFormData({ ...formData, problemSolvingSpeed: Number(e.target.value) })}
                      className="w-full accent-indigo-600"
                    />
                  </div>

                  <div className="space-y-1 bg-white dark:bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-100 dark:border-zinc-800/60">
                    <div className="flex justify-between">
                      <span>Code Quality &amp; Opt</span>
                      <span className="text-zinc-800 dark:text-zinc-200 font-bold">{formData.codeQuality}/5</span>
                    </div>
                    <input
                      type="range" min="1" max="5" value={formData.codeQuality}
                      onChange={(e) => setFormData({ ...formData, codeQuality: Number(e.target.value) })}
                      className="w-full accent-indigo-600"
                    />
                  </div>

                  <div className="space-y-1 bg-white dark:bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-100 dark:border-zinc-800/60">
                    <div className="flex justify-between">
                      <span>Communication / Expl</span>
                      <span className="text-zinc-800 dark:text-zinc-200 font-bold">{formData.communication}/5</span>
                    </div>
                    <input
                      type="range" min="1" max="5" value={formData.communication}
                      onChange={(e) => setFormData({ ...formData, communication: Number(e.target.value) })}
                      className="w-full accent-indigo-600"
                    />
                  </div>

                  <div className="space-y-1 bg-white dark:bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-100 dark:border-zinc-800/60">
                    <div className="flex justify-between">
                      <span>Conceptual Understand</span>
                      <span className="text-zinc-800 dark:text-zinc-200 font-bold">{formData.conceptualUnderstanding}/5</span>
                    </div>
                    <input
                      type="range" min="1" max="5" value={formData.conceptualUnderstanding}
                      onChange={(e) => setFormData({ ...formData, conceptualUnderstanding: Number(e.target.value) })}
                      className="w-full accent-indigo-600"
                    />
                  </div>

                  <div className="space-y-1 bg-white dark:bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-100 dark:border-zinc-800/60">
                    <div className="flex justify-between">
                      <span>Confidence Level</span>
                      <span className="text-zinc-800 dark:text-zinc-200 font-bold">{formData.confidenceLevel}/5</span>
                    </div>
                    <input
                      type="range" min="1" max="5" value={formData.confidenceLevel}
                      onChange={(e) => setFormData({ ...formData, confidenceLevel: Number(e.target.value) })}
                      className="w-full accent-indigo-600"
                    />
                  </div>
                </div>
              </div>

              {/* Status outcome */}
              <div>
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Assessment Outcome Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="Pass">Pass (Ready / Satisfactory)</option>
                  <option value="Needs Improvement">Needs Improvement (Support required)</option>
                  <option value="Fail">Fail (Unsatisfactory / Review)</option>
                </select>
              </div>

              {/* Feedback text */}
              <div>
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Written Feedback &amp; Suggestions *</label>
                <textarea
                  required
                  rows={3}
                  value={formData.feedback}
                  onChange={(e) => setFormData({ ...formData, feedback: e.target.value })}
                  placeholder="Review specific areas (e.g. struggles with Window functions in SQL, excellent explanation of decorators)..."
                  className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-50 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold"
                >
                  Submit Assessment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
