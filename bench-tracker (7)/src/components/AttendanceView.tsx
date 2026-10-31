import React, { useState } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Plus, 
  Calendar, 
  Search, 
  Users,
  Award,
  AlertCircle
} from 'lucide-react';
import { AttendanceLog, Employee } from '../types.ts';

interface AttendanceViewProps {
  attendanceLogs: AttendanceLog[];
  employees: Employee[];
  userRole: string;
  onAddSession: (sessionData: { sessionName: string, sessionDate: string, topic: string, logs: { employeeId: number, status: 'Present' | 'Absent' | 'Late' }[] }) => Promise<any>;
  onUpdateLog: (logId: number, status: 'Present' | 'Absent' | 'Late') => Promise<any>;
}

export default function AttendanceView({
  attendanceLogs,
  employees,
  userRole,
  onAddSession,
  onUpdateLog
}: AttendanceViewProps) {
  // Get unique sessions
  const sessionsMap: Record<string, { name: string, date: string, topic: string, subtopic?: string | null }> = {};
  attendanceLogs.forEach(log => {
    const key = `${log.sessionName}_${log.sessionDate}`;
    if (!sessionsMap[key]) {
      sessionsMap[key] = {
        name: log.sessionName,
        date: log.sessionDate,
        topic: log.topic,
        subtopic: log.subtopic
      };
    }
  });

  const sessionList = Object.keys(sessionsMap).map(key => sessionsMap[key]);
  const [selectedSession, setSelectedSession] = useState<string>(sessionList[0]?.name || '');

  // Form State for creating session
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newSession, setNewSession] = useState({
    name: '',
    date: new Date().toISOString().split('T')[0],
    topic: 'Python',
    subtopic: '',
    defaultStatus: 'Present' as 'Present' | 'Absent' | 'Late'
  });
  const [formError, setFormError] = useState('');

  // Handle create session
  const handleCreateSessionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!newSession.name) {
      setFormError('Please input a valid session name.');
      return;
    }

    try {
      const logsPayload = employees.map(emp => ({
        employeeId: emp.id,
        status: newSession.defaultStatus
      }));

      await onAddSession({
        sessionName: newSession.name,
        sessionDate: newSession.date,
        topic: newSession.topic,
        subtopic: newSession.subtopic || undefined,
        logs: logsPayload
      } as any);

      setSelectedSession(newSession.name);
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Error occurred creating training session.');
    }
  };

  const activeLogs = attendanceLogs.filter(log => log.sessionName === selectedSession);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Attendance Logging</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">Register training cohorts, log technical session presence, and audit compliance metrics.</p>
        </div>

        {(userRole === 'admin' || userRole === 'mentor') && (
          <button
            id="create-session-button"
            onClick={() => {
              setNewSession({
                name: '',
                date: new Date().toISOString().split('T')[0],
                topic: 'Python',
                subtopic: '',
                defaultStatus: 'Present'
              });
              setFormError('');
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Create Session Roll</span>
          </button>
        )}
      </div>

      {/* Grid: Left selector, Right attendance grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Side: Sessions Directory list */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 lg:col-span-1 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-100 dark:border-zinc-800/80">
            <Users className="w-4 h-4 text-indigo-500" />
            <h3 className="font-bold text-zinc-950 dark:text-zinc-100 text-sm">Training Sessions</h3>
          </div>

          <div className="space-y-1.5 max-h-[350px] overflow-y-auto">
            {sessionList.map(session => {
              const isActive = session.name === selectedSession;
              return (
                <button
                  key={session.name}
                  onClick={() => setSelectedSession(session.name)}
                  className={`w-full text-left p-3 rounded-xl transition-all border ${
                    isActive 
                      ? 'bg-indigo-50 dark:bg-indigo-950/35 border-indigo-200 dark:border-indigo-900 text-indigo-900 dark:text-indigo-400' 
                      : 'border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/40 text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  <h4 className="font-bold text-xs truncate">{session.name}</h4>
                  <div className="flex justify-between items-center mt-1.5 text-[9px] font-semibold text-zinc-400">
                    <span>{session.date}</span>
                    <div className="flex gap-1 max-w-[120px] truncate">
                      {session.subtopic && <span className="bg-purple-50 dark:bg-purple-950/25 text-purple-600 dark:text-purple-400 px-1 py-0.5 rounded text-[8px] truncate" title={session.subtopic}>{session.subtopic}</span>}
                      <span className="bg-zinc-100 dark:bg-zinc-850 px-1.5 py-0.5 rounded-md text-zinc-500">{session.topic}</span>
                    </div>
                  </div>
                </button>
              );
            })}

            {sessionList.length === 0 && (
              <div className="text-center py-10 text-zinc-400 text-xs">
                No active session rosters created yet.
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Active attendance rolls logger */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 lg:col-span-3 space-y-4">
          {selectedSession ? (
            <>
              {/* Active Session Info */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4 gap-3">
                <div>
                  <h3 className="font-extrabold text-zinc-900 dark:text-zinc-50 text-md">{selectedSession}</h3>
                  <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500 mt-1 flex-wrap">
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">Topic: {activeLogs[0]?.topic}</span>
                    {activeLogs[0]?.subtopic && (
                      <>
                        <span>•</span>
                        <span className="font-bold text-purple-600 dark:text-purple-400">Sub-topic: {activeLogs[0]?.subtopic}</span>
                      </>
                    )}
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                      {activeLogs[0]?.sessionDate}
                    </span>
                  </div>
                </div>

                {/* Presence summary */}
                <div className="flex gap-4 text-xs font-semibold">
                  <div className="text-center bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
                    <span className="block text-[9px] text-zinc-400 uppercase tracking-wider">Present</span>
                    <span className="font-bold text-sm leading-none block mt-0.5">{activeLogs.filter(l => l.status === 'Present').length}</span>
                  </div>
                  <div className="text-center bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 px-3 py-1.5 rounded-xl border border-amber-100 dark:border-amber-900/40">
                    <span className="block text-[9px] text-zinc-400 uppercase tracking-wider">Late</span>
                    <span className="font-bold text-sm leading-none block mt-0.5">{activeLogs.filter(l => l.status === 'Late').length}</span>
                  </div>
                  <div className="text-center bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 px-3 py-1.5 rounded-xl border border-red-100 dark:border-red-900/40">
                    <span className="block text-[9px] text-zinc-400 uppercase tracking-wider">Absent</span>
                    <span className="font-bold text-sm leading-none block mt-0.5">{activeLogs.filter(l => l.status === 'Absent').length}</span>
                  </div>
                </div>
              </div>

              {/* Attendance Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-100 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500 font-bold uppercase text-[10px] tracking-wider">
                      <th className="pb-3">Roster Name</th>
                      <th className="pb-3">Primary Skill</th>
                      <th className="pb-3 text-center">Status</th>
                      <th className="pb-3 text-right">Quick Marking Roll</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/40 text-zinc-700 dark:text-zinc-300">
                    {activeLogs.map(log => {
                      const empProfile = employees.find(e => e.id === log.employeeId);
                      return (
                        <tr key={log.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                          <td className="py-3.5">
                            <span className="font-bold text-zinc-900 dark:text-zinc-100 text-xs block">{empProfile?.name || 'Unknown'}</span>
                            <span className="text-[10px] text-zinc-400 block mt-0.5">{empProfile?.employeeId} ({empProfile?.employeeType})</span>
                          </td>
                          <td className="py-3.5 font-semibold text-zinc-500">{empProfile?.skillGroup}</td>
                          <td className="py-3.5 text-center">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                              log.status === 'Present' ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40' :
                              log.status === 'Late' ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/40' :
                              'bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/40'
                            }`}>
                              {log.status === 'Present' ? <CheckCircle2 className="w-3 h-3" /> : log.status === 'Late' ? <Clock className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                              {log.status}
                            </span>
                          </td>
                          <td className="py-3.5 text-right">
                            {(userRole === 'admin' || userRole === 'mentor') ? (
                              <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5 bg-zinc-100 dark:bg-zinc-900">
                                <button
                                  id={`attend-p-${log.id}`}
                                  onClick={() => onUpdateLog(log.id, 'Present')}
                                  className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${
                                    log.status === 'Present' 
                                      ? 'bg-emerald-600 text-white' 
                                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                                  }`}
                                >
                                  Present
                                </button>
                                <button
                                  id={`attend-l-${log.id}`}
                                  onClick={() => onUpdateLog(log.id, 'Late')}
                                  className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${
                                    log.status === 'Late' 
                                      ? 'bg-amber-500 text-white' 
                                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                                  }`}
                                >
                                  Late
                                </button>
                                <button
                                  id={`attend-a-${log.id}`}
                                  onClick={() => onUpdateLog(log.id, 'Absent')}
                                  className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${
                                    log.status === 'Absent' 
                                      ? 'bg-red-500 text-white' 
                                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                                  }`}
                                >
                                  Absent
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-zinc-400">View Only</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="text-center py-24 text-zinc-400 space-y-3">
              <AlertCircle className="w-12 h-12 text-zinc-300 mx-auto" />
              <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">No active roster loaded</h3>
              <p className="text-xs">Create a new session roll or select an existing cohort on the sidebar to log roster statuses.</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Session Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-md max-h-[90vh] overflow-y-auto flex flex-col">
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
              <h2 className="text-md font-bold text-zinc-900 dark:text-zinc-100">Create New Session Roll</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-400 hover:text-zinc-600">✕</button>
            </div>

            <form onSubmit={handleCreateSessionSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-semibold">
                  {formError}
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Session Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. PySpark Optimization Strategies"
                  value={newSession.name}
                  onChange={(e) => setNewSession({ ...newSession, name: e.target.value })}
                  className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Session Date *</label>
                  <input
                    type="date"
                    required
                    value={newSession.date}
                    onChange={(e) => setNewSession({ ...newSession, date: e.target.value })}
                    className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Topic *</label>
                  <select
                    value={newSession.topic}
                    onChange={(e) => setNewSession({ ...newSession, topic: e.target.value })}
                    className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none"
                  >
                    <option value="Python">Python</option>
                    <option value="SQL">SQL</option>
                    <option value="Spark">Spark</option>
                    <option value="PySpark">PySpark</option>
                    <option value="General DE">General DE</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Sub-topic (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Window Functions, DAG Optimizations, OOP"
                  value={newSession.subtopic}
                  onChange={(e) => setNewSession({ ...newSession, subtopic: e.target.value })}
                  className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Default Initial Status</label>
                <select
                  value={newSession.defaultStatus}
                  onChange={(e) => setNewSession({ ...newSession, defaultStatus: e.target.value as any })}
                  className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none"
                >
                  <option value="Present">Present (All Present initially)</option>
                  <option value="Absent">Absent (All Absent initially)</option>
                  <option value="Late">Late (All Late initially)</option>
                </select>
                <span className="text-[10px] text-zinc-400 mt-1 block">Creates initial attendance rows for all {employees.length} current employees on roster.</span>
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
                  Create Session Roll
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
