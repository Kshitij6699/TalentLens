import React from 'react';
import { 
  Settings, 
  BookOpen, 
  ShieldCheck, 
  Database,
  HelpCircle,
  Code,
  Upload,
  RefreshCw,
  FileSpreadsheet
} from 'lucide-react';

interface SettingsViewProps {
  user: any;
  onSimulatedRoleChange: (role: 'admin' | 'manager' | 'mentor') => void;
  token?: string | null;
  simulatedRole?: string;
  onRefresh?: () => void;
  setSuccessMsg?: (msg: string) => void;
  setErrorMsg?: (msg: string) => void;
}

export default function SettingsView({
  user,
  onSimulatedRoleChange,
  token = null,
  simulatedRole = 'admin',
  onRefresh = () => {},
  setSuccessMsg = () => {},
  setErrorMsg = () => {}
}: SettingsViewProps) {
  const [uploadingType, setUploadingType] = React.useState<'employees' | 'mentors' | null>(null);
  const [seedStatus, setSeedStatus] = React.useState<any>(null);
  const [loadingSeedStatus, setLoadingSeedStatus] = React.useState(false);
  const [reseeding, setReseeding] = React.useState(false);

  const fetchSeedStatus = async () => {
    setLoadingSeedStatus(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-simulated-role': simulatedRole
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch('/api/seed-status', { headers });
      if (response.ok) {
        const data = await response.json();
        setSeedStatus(data);
      }
    } catch (e) {
      console.error('Failed to fetch seed status', e);
    } finally {
      setLoadingSeedStatus(false);
    }
  };

  React.useEffect(() => {
    fetchSeedStatus();
  }, [token, simulatedRole]);

  const handleManualReseed = async () => {
    setReseeding(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-simulated-role': simulatedRole
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch('/api/reseed-from-excel', {
        method: 'POST',
        headers
      });
      const data = await response.json();
      if (response.ok) {
        setSuccessMsg(data.message || 'Excel database re-sync completed successfully!');
        onRefresh();
        fetchSeedStatus();
      } else {
        setErrorMsg(data.message || 'Failed to re-sync database from Excel files.');
        fetchSeedStatus();
      }
    } catch (e: any) {
      setErrorMsg('Error triggering manual sync: ' + e.message);
    } finally {
      setReseeding(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'employees' | 'mentors') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const result = evt.target?.result as string;
        const base64 = result.split(',')[1] || result;

        setUploadingType(type);
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        headers['x-simulated-role'] = simulatedRole;

        const response = await fetch('/api/import-excel', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            fileType: type,
            base64
          })
        });

        if (response.ok) {
          const resData = await response.json();
          setSuccessMsg(resData.message || 'Successfully synchronized data!');
          onRefresh();
        } else {
          const errData = await response.json();
          setErrorMsg(errData.error || 'Failed to import data.');
        }
      } catch (err: any) {
        setErrorMsg('Error processing file: ' + err.message);
      } finally {
        setUploadingType(null);
      }
    };
    reader.readAsDataURL(file);
  };
  
  const skillMatrixSpecs = [
    {
      skill: 'Python',
      beginner: 'Basic loops, variables, conditional statements, list comprehensions, built-in functions.',
      intermediate: 'File handling, writing custom packages/modules, standard OOP structures, decorators, list/dict manipulations.',
      advanced: 'Asynchronous event loops, multithreading/multiprocessing, decorators, generator pipelines, typing patterns.',
      expert: 'C-extension wrapping, customized memory management, deep framework contribution, metaclass programming.'
    },
    {
      skill: 'SQL',
      beginner: 'Simple joins (INNER/LEFT), basic aggregating (GROUP BY, SUM, COUNT), filtering (WHERE, HAVING).',
      intermediate: 'Complex aggregation, subqueries, CTEs, basic window functions (ROW_NUMBER, RANK), index constraints.',
      advanced: 'Partitioning strategies, analytical functions, query tuning via execution plans, transactional locking, custom stored procedures.',
      expert: 'High-volume clustered index designing, distributed database query rewriting, query optimizer overriding, high-availability replication configuration.'
    },
    {
      skill: 'Spark & PySpark',
      beginner: 'Understanding RDDs vs DataFrames, loading standard CSV/JSON sources, simple select and filter operations.',
      intermediate: 'Writing modular PySpark transforms, joins, broad range aggregation, basic cache/persist usage, partition understanding.',
      advanced: 'Catalyst optimizer tuning, partition rebalancing strategies, broadcast joins, window functions, custom UDF optimization.',
      expert: 'Custom Spark serialization hooks, physical executor cluster provisioning, streaming backpressure configuration, custom datasource connector authorship.'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">System Settings</h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm">Configure environment variables, simulate roles, and check competency guidelines.</p>
      </div>

      {/* Excel Data Import / Sync Pipeline */}
      {(user?.role === 'admin' || user?.role === 'manager') ? (
        <div id="excel-sync-pipeline-card" className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <h2 className="font-bold text-zinc-900 dark:text-zinc-50 text-md">Excel Import / Data Sync Pipeline</h2>
            </div>
            <span className="text-xs bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-mono px-2 py-1 rounded-md font-semibold">
              Authorized Sync Mode
            </span>
          </div>

          <p className="text-zinc-500 dark:text-zinc-400 text-xs leading-relaxed max-w-3xl">
            Synchronize the central talent repository by dragging or selecting source Excel sheets. 
            All imported employee profiles (<strong>Dashboard_source_bench_updated.xlsx</strong>) and mentor listings (<strong>Mentors_list.xlsx</strong>) will merge seamlessly based on Employee ID. Portal-managed metrics like status, assigned mentors, evaluations, and mock-interview records are fully preserved.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {/* Employee Source Upload */}
            <div className="border border-dashed border-zinc-200 dark:border-zinc-800 hover:border-indigo-500 dark:hover:border-indigo-400 bg-zinc-50/50 dark:bg-zinc-900/55 p-5 rounded-xl transition duration-200 flex flex-col items-center justify-center text-center space-y-3 relative group">
              <Upload className="w-8 h-8 text-zinc-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition" />
              <div className="space-y-1">
                <span className="font-bold text-xs text-zinc-800 dark:text-zinc-200 block">Synchronize Employee Bench List</span>
                <span className="text-[10px] text-zinc-500 block">Accepts .xlsx, .xls source files</span>
              </div>
              <label className="cursor-pointer bg-white dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-[11px] font-bold text-zinc-700 dark:text-zinc-300 px-3 py-1.5 rounded-lg shadow-xs transition inline-block">
                {uploadingType === 'employees' ? (
                  <span className="flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Synchronizing...
                  </span>
                ) : 'Select Source File'}
                <input 
                  type="file" 
                  accept=".xlsx,.xls" 
                  className="hidden" 
                  disabled={uploadingType !== null}
                  onChange={(e) => handleFileChange(e, 'employees')} 
                />
              </label>
            </div>

            {/* Mentor Source Upload */}
            <div className="border border-dashed border-zinc-200 dark:border-zinc-800 hover:border-indigo-500 dark:hover:border-indigo-400 bg-zinc-50/50 dark:bg-zinc-900/55 p-5 rounded-xl transition duration-200 flex flex-col items-center justify-center text-center space-y-3 relative group">
              <Upload className="w-8 h-8 text-zinc-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition" />
              <div className="space-y-1">
                <span className="font-bold text-xs text-zinc-800 dark:text-zinc-200 block">Synchronize Mentors List</span>
                <span className="text-[10px] text-zinc-500 block">Accepts .xlsx, .xls listings</span>
              </div>
              <label className="cursor-pointer bg-white dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-[11px] font-bold text-zinc-700 dark:text-zinc-300 px-3 py-1.5 rounded-lg shadow-xs transition inline-block">
                {uploadingType === 'mentors' ? (
                  <span className="flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Synchronizing...
                  </span>
                ) : 'Select Source File'}
                <input 
                  type="file" 
                  accept=".xlsx,.xls" 
                  className="hidden" 
                  disabled={uploadingType !== null}
                  onChange={(e) => handleFileChange(e, 'mentors')} 
                />
              </label>
            </div>
          </div>

          {/* Real-time sync status display */}
          <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200/60 dark:border-zinc-800 space-y-3 mt-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Central Database Seeding Status</span>
              <button 
                onClick={fetchSeedStatus}
                disabled={loadingSeedStatus}
                className="text-[10px] text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-2.5 h-2.5 ${loadingSeedStatus ? 'animate-spin' : ''}`} />
                Reload status
              </button>
            </div>

            {seedStatus ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {seedStatus.status === 'success' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                        ● Success
                      </span>
                    )}
                    {seedStatus.status === 'failed' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400">
                        ● Failed
                      </span>
                    )}
                    {seedStatus.status === 'files-not-found' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                        ● Files Not Found
                      </span>
                    )}
                    {seedStatus.status === 'idle' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                        ● Idle / Unknown
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-400">
                      Last Checked: {seedStatus.timestamp ? new Date(seedStatus.timestamp).toLocaleString() : 'Never'}
                    </span>
                  </div>

                  {seedStatus.errorMessage ? (
                    <div className="text-[11px] text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/10 p-2.5 rounded-lg border border-red-100 dark:border-red-950/30 font-mono leading-relaxed max-h-24 overflow-y-auto">
                      {seedStatus.errorMessage}
                    </div>
                  ) : (
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      The core database tables match the target Excel schemas exactly. 100 benchmark resources mapped with custom mentors, evaluations, and simulated interview metrics.
                    </p>
                  )}
                </div>

                <div className="text-[11px] space-y-1 text-zinc-500 dark:text-zinc-400 border-l border-zinc-200 dark:border-zinc-800 pl-4 font-mono">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5 font-sans">Resolved System Paths:</div>
                  <div className="truncate" title={seedStatus.resolvedEmployeePath || ''}>
                    <strong className="font-sans">Bench Sheet:</strong> {seedStatus.resolvedEmployeePath ? seedStatus.resolvedEmployeePath.split('/').pop()?.split('\\').pop() : 'Unresolved'}
                  </div>
                  <div className="truncate" title={seedStatus.resolvedMentorPath || ''}>
                    <strong className="font-sans">Mentor Sheet:</strong> {seedStatus.resolvedMentorPath ? seedStatus.resolvedMentorPath.split('/').pop()?.split('\\').pop() : 'Unresolved'}
                  </div>
                  {seedStatus.status === 'files-not-found' && seedStatus.triedPaths && seedStatus.triedPaths.length > 0 && (
                    <div className="mt-1.5 pt-1 border-t border-zinc-100 dark:border-zinc-800 font-sans text-[10px]">
                      <span className="font-bold text-zinc-400 block mb-0.5">Attempted candidate paths:</span>
                      <ul className="list-disc list-inside space-y-0.5 max-h-16 overflow-y-auto text-[9px] font-mono">
                        {seedStatus.triedPaths.map((p: string, idx: number) => (
                          <li key={idx} className="truncate" title={p}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <span className="text-xs text-zinc-400">Loading synchronization pipeline status...</span>
            )}

            {/* Manual Sync Trigger Button */}
            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
              <button
                id="manual-reseed-button"
                onClick={handleManualReseed}
                disabled={reseeding}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${reseeding ? 'animate-spin' : ''}`} />
                <span>{reseeding ? 'Re-synchronizing Database...' : 'Run Manual Excel Sync Pipeline'}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Role Privileges Map */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-4 lg:col-span-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-md">Simulation Privilege Matrices</h3>
          </div>
          
          <div className="space-y-3.5 text-xs">
            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl space-y-1">
              <span className="font-bold text-zinc-800 dark:text-zinc-200 block">System Administrator</span>
              <p className="text-zinc-500">Unrestricted system access. Register or purge employee profiles, log mocks, mark sessions, download stats.</p>
            </div>

            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl space-y-1">
              <span className="font-bold text-zinc-800 dark:text-zinc-200 block">Manager</span>
              <p className="text-zinc-500">Read and edit all employee records, promote to "Interview Ready", generate PDF reports, download CSVs.</p>
            </div>

            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl space-y-1">
              <span className="font-bold text-zinc-800 dark:text-zinc-200 block">Mentor</span>
              <p className="text-zinc-500">Read employee matrices, create and submit Mock sessions, evaluate metrics scale, mark training session attendances.</p>
            </div>
          </div>
        </div>

        {/* Competency Rubric Cheatsheet */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-4 lg:col-span-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-md">Competency Matrix Rubrics</h3>
          </div>

          <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1">
            {skillMatrixSpecs.map(spec => (
              <div key={spec.skill} className="space-y-2 border-b border-zinc-100 dark:border-zinc-800/60 pb-4 last:border-0 last:pb-0">
                <span className="font-extrabold text-indigo-600 dark:text-indigo-400 text-xs block">{spec.skill} Competency Rubric</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] leading-relaxed">
                  <div className="bg-zinc-50 dark:bg-zinc-800/30 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800/40">
                    <span className="font-bold text-zinc-800 dark:text-zinc-200 block mb-0.5">Beginner Level</span>
                    <p className="text-zinc-500">{spec.beginner}</p>
                  </div>
                  <div className="bg-zinc-50 dark:bg-zinc-800/30 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800/40">
                    <span className="font-bold text-zinc-800 dark:text-zinc-200 block mb-0.5">Intermediate Level</span>
                    <p className="text-zinc-500">{spec.intermediate}</p>
                  </div>
                  <div className="bg-zinc-50 dark:bg-zinc-800/30 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800/40">
                    <span className="font-bold text-zinc-800 dark:text-zinc-200 block mb-0.5">Advanced Level</span>
                    <p className="text-zinc-500">{spec.advanced}</p>
                  </div>
                  <div className="bg-zinc-50 dark:bg-zinc-800/30 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800/40">
                    <span className="font-bold text-zinc-800 dark:text-zinc-200 block mb-0.5">Expert Level</span>
                    <p className="text-zinc-500">{spec.expert}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Database Schema Reference */}
      <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-4">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-md">Cloud SQL PostgreSQL Schema Reference</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-semibold text-zinc-500">
          <div className="bg-zinc-50 dark:bg-zinc-850 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800">
            <span className="font-bold text-zinc-800 dark:text-zinc-200 block mb-1">users Table</span>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-zinc-500 font-mono">
              <li>id: serial (PK)</li>
              <li>uid: varchar(255)</li>
              <li>email: varchar(255)</li>
              <li>role: varchar(50)</li>
              <li>name: varchar(255)</li>
            </ul>
          </div>

          <div className="bg-zinc-50 dark:bg-zinc-850 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800">
            <span className="font-bold text-zinc-800 dark:text-zinc-200 block mb-1">employees Table</span>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-zinc-500 font-mono">
              <li>id: serial (PK)</li>
              <li>employeeId: varchar(50)</li>
              <li>name: varchar(255)</li>
              <li>email: varchar(255)</li>
              <li>joiningDate: varchar(50)</li>
              <li>employeeType: varchar(50)</li>
              <li>status: varchar(50)</li>
              <li>pythonLevel: varchar(50)</li>
              <li>sqlLevel: varchar(50)</li>
              <li>sparkLevel: varchar(50)</li>
              <li>pysparkLevel: varchar(50)</li>
            </ul>
          </div>

          <div className="bg-zinc-50 dark:bg-zinc-850 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800">
            <span className="font-bold text-zinc-800 dark:text-zinc-200 block mb-1">mock_interviews Table</span>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-zinc-500 font-mono">
              <li>id: serial (PK)</li>
              <li>employeeId: integer (FK)</li>
              <li>topic: varchar(100)</li>
              <li>techAccuracy: integer</li>
              <li>problemSolvingSpeed: integer</li>
              <li>overallScore: numeric</li>
              <li>feedback: text</li>
              <li>status: varchar(50)</li>
            </ul>
          </div>

          <div className="bg-zinc-50 dark:bg-zinc-850 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800">
            <span className="font-bold text-zinc-800 dark:text-zinc-200 block mb-1">attendance Table</span>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-zinc-500 font-mono">
              <li>id: serial (PK)</li>
              <li>employeeId: integer (FK)</li>
              <li>sessionName: varchar(255)</li>
              <li>sessionDate: varchar(50)</li>
              <li>topic: varchar(100)</li>
              <li>status: varchar(50)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
