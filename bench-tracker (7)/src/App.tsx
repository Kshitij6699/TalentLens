import React, { useState, useEffect } from 'react';
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { auth, googleAuthProvider } from './lib/firebase.ts';
import { 
  User, 
  Employee, 
  MockInterview, 
  AttendanceLog, 
  DashboardStats 
} from './types.ts';

// View Components
import Sidebar from './components/Sidebar.tsx';
import DashboardView from './components/DashboardView.tsx';
import EmployeesView from './components/EmployeesView.tsx';
import ReportsView from './components/ReportsView.tsx';
import SettingsView from './components/SettingsView.tsx';

// Icons
import { 
  GraduationCap, 
  ShieldAlert, 
  Check, 
  AlertCircle,
  ShieldCheck,
  UserCheck,
  Menu
} from 'lucide-react';

const API_BASE = ''; // Relative paths to bind to Express dev server / proxy

export default function App() {
  const [currentView, setCurrentView] = useState<string>('dashboard');
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('talentlens-theme');
      return saved ? saved === 'dark' : true;
    } catch {
      return true;
    }
  });
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [simulatedRole, setSimulatedRole] = useState<'admin' | 'manager' | 'mentor'>('admin');
  const [token, setToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  // Core Data State
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [mentors, setMentors] = useState<any[]>([]);
  const [mocks, setMocks] = useState<MockInterview[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [dataLoading, setDataLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Apply class-based theme and persist the user's selection across refreshes.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', darkMode);
    root.style.colorScheme = darkMode ? 'dark' : 'light';
    try {
      localStorage.setItem('talentlens-theme', darkMode ? 'dark' : 'light');
    } catch {
      // The theme still works if storage is disabled by the browser.
    }
  }, [darkMode]);

  // Monitor Firebase Auth changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fUser) => {
      setAuthLoading(true);
      if (fUser) {
        setFirebaseUser(fUser);
        const idToken = await fUser.getIdToken();
        setToken(idToken);
        
        // Sync user to db or fetch role
        try {
          const res = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ email: fUser.email, name: fUser.displayName })
          });
          if (res.ok) {
            const data = await res.json();
            setUser({ ...data.user, role: 'admin' });
            setSimulatedRole('admin');
          } else {
            let errorText = 'Auth Sync Error';
            try {
              const errData = await res.json();
              errorText = errData.message || errData.error || errorText;
            } catch (e) {
              errorText = `Auth Sync Error: Status ${res.status}`;
            }
            setErrorMsg(errorText);
          }
        } catch (err: any) {
          setErrorMsg('Auth connection failed: ' + err.message);
        }
      } else {
        // Fallback to local sandbox user if no Firebase user is active
        setFirebaseUser(null);
        setToken(null);
        // Default to a sandbox admin user so the app is instantly usable for review
        setUser({
          id: 0,
          uid: 'sandbox-admin',
          email: 'sandbox@talentlens.com',
          role: 'admin',
          name: 'Sandbox Admin'
        });
        setSimulatedRole('admin');
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Refresh all dashboard metrics & database lists
  const refreshAllData = async () => {
    if (authLoading) return;
    setDataLoading(true);
    setErrorMsg('');
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    // Pass the active simulated role header to support server-side middleware simulation
    headers['x-simulated-role'] = simulatedRole;

    try {
      // Parallel data fetching for performance
      const [empRes, mentorRes, mockRes, attRes, statRes] = await Promise.all([
        fetch(`${API_BASE}/api/employees`, { headers }),
        fetch(`${API_BASE}/api/mentors`, { headers }),
        fetch(`${API_BASE}/api/mocks`, { headers }),
        fetch(`${API_BASE}/api/attendance`, { headers }),
        fetch(`${API_BASE}/api/dashboard/stats`, { headers })
      ]);

      if (empRes.ok) {
        const empData = await empRes.json();
        setEmployees(empData.employees);
      }
      if (mentorRes.ok) {
        const mentorData = await mentorRes.json();
        setMentors(mentorData.mentors);
      }
      if (mockRes.ok) {
        const mockData = await mockRes.json();
        setMocks(mockData.mocks);
      }
      if (attRes.ok) {
        const attData = await attRes.json();
        setAttendanceLogs(attData.attendance);
      }
      if (statRes.ok) {
        const statData = await statRes.json();
        setStats(statData.stats);
      }
    } catch (err: any) {
      setErrorMsg('Data fetching failed: ' + err.message);
    } finally {
      setDataLoading(false);
    }
  };

  // Trigger loading on Auth or Role selection changes
  useEffect(() => {
    refreshAllData();
  }, [token, simulatedRole, authLoading]);

  // Toast auto-clear
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  useEffect(() => {
    if (errorMsg) {
      const timer = setTimeout(() => setErrorMsg(''), 6000);
      return () => clearTimeout(timer);
    }
  }, [errorMsg]);

  // Actions: Authentication
  const handleGoogleSignIn = async () => {
    try {
      setErrorMsg('');
      await signInWithPopup(auth, googleAuthProvider);
      setSuccessMsg('Successfully signed in with Google Auth!');
    } catch (err: any) {
      setErrorMsg('Sign-in failed: ' + err.message);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setFirebaseUser(null);
      setToken(null);
      setSuccessMsg('Signed out successfully.');
    } catch (err: any) {
      setErrorMsg('Sign-out error: ' + err.message);
    }
  };

  const handleSimulatedRoleChange = (newRole: 'admin' | 'manager' | 'mentor') => {
    const forcedRole = 'admin';
    setSimulatedRole(forcedRole);
    if (user) {
      setUser({
        ...user,
        role: forcedRole,
        name: user.uid === 'sandbox-admin' ? 'Sandbox Admin' : user.name
      });
    } else {
      setUser({
        id: 0,
        uid: 'sandbox-admin',
        email: 'sandbox@talentlens.com',
        role: forcedRole,
        name: 'Sandbox Admin'
      });
    }
    setSuccessMsg('Simulated privileges switched to: ADMIN');
  };

  // Actions: Employee CRUD
  const handleAddEmployee = async (employeeData: Partial<Employee>) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-simulated-role': simulatedRole
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch(`${API_BASE}/api/employees`, {
        method: 'POST',
        headers,
        body: JSON.stringify(employeeData)
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`Successfully registered profile: ${employeeData.name}`);
        refreshAllData();
        return data;
      } else {
        throw new Error(data.error || data.message || 'Error occurred while saving employee record.');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
      throw err;
    }
  };

  const handleAddMentor = async (mentorData: any) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-simulated-role': simulatedRole
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch(`${API_BASE}/api/mentors`, {
        method: 'POST',
        headers,
        body: JSON.stringify(mentorData)
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`Successfully registered mentor: ${mentorData.name}`);
        refreshAllData();
        return data;
      } else {
        throw new Error(data.error || data.message || 'Error saving mentor record.');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
      throw err;
    }
  };

  const handleUpdateEmployee = async (empId: number, employeeData: Partial<Employee>) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-simulated-role': simulatedRole
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch(`${API_BASE}/api/employees/${empId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(employeeData)
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`Profile updated successfully: ${employeeData.name}`);
        refreshAllData();
        return data;
      } else {
        throw new Error(data.error || data.message || 'Error updating employee record.');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
      throw err;
    }
  };

  const handleDeleteEmployee = async (empId: number) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-simulated-role': simulatedRole
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch(`${API_BASE}/api/employees/${empId}`, {
        method: 'DELETE',
        headers
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg('Employee profile purged from records.');
        refreshAllData();
        return data;
      } else {
        throw new Error(data.message || 'Error purging employee record.');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
      throw err;
    }
  };

  const handleQuickUpdateStatus = async (empId: number, status: 'Enrolled' | 'Available' | 'In Training' | 'Allocated' | 'Interview Ready') => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-simulated-role': simulatedRole
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch(`${API_BASE}/api/employees/${empId}/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`Status updated successfully to ${status}!`);
        refreshAllData();
      } else {
        setErrorMsg('Status update failed: ' + data.message);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Actions: Mock Interviews
  const handleAddMock = async (mockData: Partial<MockInterview>) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-simulated-role': simulatedRole
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch(`${API_BASE}/api/mocks`, {
        method: 'POST',
        headers,
        body: JSON.stringify(mockData)
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg('Mock interview assessment scorecard saved successfully.');
        refreshAllData();
        return data;
      } else {
        throw new Error(data.message || 'Error occurred saving mock session.');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
      throw err;
    }
  };

  // Actions: Attendance
  const handleAddSession = async (sessionPayload: { sessionName: string, sessionDate: string, topic: string, logs: { employeeId: number, status: 'Present' | 'Absent' | 'Late' }[] }) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-simulated-role': simulatedRole
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch(`${API_BASE}/api/attendance`, {
        method: 'POST',
        headers,
        body: JSON.stringify(sessionPayload)
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(` Roster created for session: ${sessionPayload.sessionName}`);
        refreshAllData();
        return data;
      } else {
        throw new Error(data.message || 'Error creating training session roll.');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
      throw err;
    }
  };

  const handleUpdateLog = async (logId: number, status: 'Present' | 'Absent' | 'Late') => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-simulated-role': simulatedRole
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch(`${API_BASE}/api/attendance/${logId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (res.ok) {
        refreshAllData();
        return data;
      } else {
        throw new Error(data.message || 'Error logging attendance roll.');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
      throw err;
    }
  };

  // Render Loader if initial authentication check is running
  if (authLoading && !user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-zinc-100">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <h1 className="text-sm font-bold tracking-wider uppercase text-zinc-400">Loading TalentHouse Security...</h1>
      </div>
    );
  }

  // LOGIN PAGE (Only shows if no simulated sandbox role OR Firebase Auth is unset)
  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col justify-center items-center p-6 text-zinc-100 relative overflow-hidden">
        
        {/* Decorative Grid Mesh */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(99,102,241,0.18),rgba(255,255,255,0))]" />
        
        <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl p-8 space-y-6 shadow-2xl relative z-10">
          {/* Logo Brand */}
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
              <GraduationCap className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight">Data Engineering TalentHouse</h1>
              <p className="text-zinc-500 text-xs mt-1">Resource planning, mock assessments, and readiness auditing.</p>
            </div>
          </div>

          {/* Real Auth Access */}
          <div className="space-y-3 border-t border-b border-zinc-800/80 py-6">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block text-center">Standard Corporate Authentication</span>
            <button
              id="google-sign-in-btn"
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-zinc-100 text-zinc-900 font-bold py-3 px-4 rounded-xl transition-all shadow-md text-sm"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.48 15.02 1 12 1 7.21 1 3.16 3.73 1.15 7.74l3.85 2.99C5.9 7.42 8.7 5.04 12 5.04z" />
                <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.47h6.44c-.28 1.47-1.11 2.72-2.36 3.56l3.66 2.84c2.14-1.98 3.39-4.89 3.39-8.51z" />
                <path fill="#FBBC05" d="M5 14.73c-.24-.73-.38-1.5-.38-2.3s.14-1.57.38-2.3L1.15 7.74C.41 9.21 0 10.86 0 12.6s.41 3.39 1.15 4.86l3.85-2.99z" />
                <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.66-2.84c-1.01.68-2.31 1.09-3.9 1.09-3.3 0-6.1-2.38-7.1-5.69L1.45 15.6C3.46 19.61 7.51 23 12 23z" />
              </svg>
              <span>Sign In with Google Workspace</span>
            </button>
          </div>

          {/* Sandbox Access (Immediate review) */}
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              <ShieldCheck className="w-4 h-4 text-indigo-500" />
              <span>Review Sandbox Access</span>
            </div>
            
            <button
              id="sandbox-login-admin"
              onClick={() => handleSimulatedRoleChange('admin')}
              className="w-full p-4 bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-250 rounded-xl transition-all text-left flex flex-col justify-between h-20 font-bold"
            >
              <span className="text-red-400">Sandbox Admin Access</span>
              <span className="text-[10px] text-zinc-500 font-semibold">Pre-loaded assessments, system logs &amp; controls</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-100 dark:bg-zinc-950 font-sans text-zinc-800 dark:text-zinc-200 overflow-hidden transition-colors duration-200">
      
      {/* Sidebar Navigation */}
      <Sidebar 
        currentView={currentView} 
        setCurrentView={setCurrentView} 
        user={user}
        onLogout={firebaseUser ? handleSignOut : () => setUser(null)}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        onSimulatedRoleChange={handleSimulatedRoleChange}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Backdrop for mobile */}
      {sidebarOpen && (
        <div 
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/55 backdrop-blur-xs z-30 md:hidden"
        />
      )}

      {/* Main Panel Content Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 relative">
        
        {/* Mobile Header bar */}
        <div className="flex items-center justify-between md:hidden mb-4 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 -ml-2 rounded-xl text-zinc-600 dark:text-zinc-350 hover:bg-zinc-100 dark:hover:bg-zinc-850"
              aria-label="Open sidebar menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
                <GraduationCap className="w-4 h-4" />
              </div>
              <span className="font-extrabold text-xs uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                {currentView}
              </span>
            </div>
          </div>
          <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 font-mono">
            {user?.role?.toUpperCase()}
          </span>
        </div>
        
        {/* Ambient Loading overlay */}
        {dataLoading && (
          <div className="absolute top-4 right-4 bg-white/85 dark:bg-zinc-900/85 backdrop-blur-xs px-3.5 py-1.5 rounded-full shadow-sm text-xs border border-zinc-200 dark:border-zinc-800 flex items-center gap-2 font-semibold">
            <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span>Synchronizing Database...</span>
          </div>
        )}

        {/* Global Floating Toast Notifications */}
        {successMsg && (
          <div className="fixed bottom-4 right-4 bg-emerald-600 text-white font-semibold text-xs px-4 py-3 rounded-xl shadow-lg flex items-center gap-2.5 z-50 animate-bounce">
            <Check className="w-4 h-4 bg-emerald-700/80 rounded-full p-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="fixed bottom-4 right-4 bg-red-600 text-white font-semibold text-xs px-4 py-3 rounded-xl shadow-lg flex items-center gap-2.5 z-50 animate-bounce">
            <AlertCircle className="w-4 h-4 bg-red-700/80 rounded-full p-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Dynamic Inner Views */}
        {currentView === 'dashboard' && (
          <DashboardView 
            employees={employees} 
            stats={stats} 
            onUpdateStatus={handleQuickUpdateStatus}
            userRole={user.role}
            setCurrentView={setCurrentView}
          />
        )}

        {currentView === 'employees' && (
          <EmployeesView 
            employees={employees} 
            mentors={mentors}
            userRole={user.role}
            onAddEmployee={handleAddEmployee}
            onUpdateEmployee={handleUpdateEmployee}
            onDeleteEmployee={handleDeleteEmployee}
            token={token}
            simulatedRole={simulatedRole}
            onRefresh={refreshAllData}
          />
        )}



        {currentView === 'reports' && (
          <ReportsView 
            employees={employees} 
            mocks={mocks} 
            attendanceLogs={attendanceLogs}
          />
        )}

        {currentView === 'settings' && (
          <SettingsView 
            user={user}
            onSimulatedRoleChange={handleSimulatedRoleChange}
            token={token}
            simulatedRole={simulatedRole}
            onRefresh={refreshAllData}
            setSuccessMsg={setSuccessMsg}
            setErrorMsg={setErrorMsg}
          />
        )}
      </main>
    </div>
  );
}
