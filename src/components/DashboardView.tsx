import React, { useState } from 'react';
import { 
  Users, 
  GraduationCap, 
  UserCheck, 
  AlertTriangle, 
  TrendingUp, 
  Award,
  Search,
  CheckCircle2,
  Calendar,
  FileSpreadsheet,
  AlertCircle,
  Filter
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  Legend,
  PieChart,
  Pie
} from 'recharts';
import { Employee, DashboardStats, STATUS_LABELS } from '../types.ts';

const designationFullNameMap: Record<string, string> = {
  'Manager': 'Manager',
  'AM': 'Assistant Manager (AM)',
  'CON': 'Consultant (CON)',
  'ACON': 'Associate Consultant (ACON)',
  'Analyst': 'Analyst'
};

const DesignationTick = (props: any) => {
  const { x, y, payload } = props;
  const label = payload.value;
  const fullName = designationFullNameMap[label] || label;
  
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={14} textAnchor="middle" fill="#a1a1aa" fontSize={10} className="select-none font-medium">
        <title>{fullName}</title>
        {label}
      </text>
    </g>
  );
};

interface DashboardViewProps {
  employees: Employee[];
  stats: DashboardStats | null;
  onUpdateStatus: (empId: number, status: 'Available' | 'In Training' | 'Allocated' | 'Interview Ready') => void;
  userRole: string;
  setCurrentView?: (view: string) => void;
}

interface FilterDropdownProps {
  column: string;
  values: string[];
  selected: string[];
  onChange: (vals: string[]) => void;
  openSearch: string;
  setOpenSearch: (val: string) => void;
  onClose: () => void;
  align?: 'left' | 'right';
}

function FilterDropdown({ 
  column, 
  values, 
  selected, 
  onChange,
  openSearch,
  setOpenSearch,
  onClose,
  align = 'left'
}: FilterDropdownProps) {
  const filteredValues = values.filter(v => v.toLowerCase().includes(openSearch.toLowerCase()));
  const alignmentClass = align === 'right' ? 'right-0' : 'left-0';

  return (
    <div 
      className={`absolute top-full ${alignmentClass} mt-2 w-60 bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-2xl shadow-xl z-50 p-3.5 text-left normal-case font-normal text-zinc-700 dark:text-zinc-300`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2">
        <input 
          type="text" 
          placeholder={`Search ${column}...`} 
          value={openSearch}
          onChange={(e) => setOpenSearch(e.target.value)}
          className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-zinc-800 dark:text-zinc-200"
        />
      </div>
      <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
        {filteredValues.map(val => (
          <label key={val} className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg cursor-pointer text-xs">
            <input 
              type="checkbox" 
              checked={selected.includes(val)}
              onChange={(e) => {
                if (e.target.checked) {
                  onChange([...selected, val]);
                } else {
                  onChange(selected.filter(s => s !== val));
                }
              }}
              className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
            />
            <span className="truncate">{column === 'Status' ? (STATUS_LABELS[val] || val) : val}</span>
          </label>
        ))}
        {filteredValues.length === 0 && (
          <span className="text-[10px] text-zinc-400 block text-center py-2">No matches found</span>
        )}
      </div>
      <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-zinc-100 dark:border-zinc-800 text-[10px] font-bold">
        <button 
          onClick={() => onChange([])}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
        >
          Clear All
        </button>
        <button 
          onClick={onClose}
          className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default function DashboardView({
  employees,
  stats,
  onUpdateStatus,
  userRole,
  setCurrentView
}: DashboardViewProps) {
  // KPI Clickable Tab selection
  const [activeTab, setActiveTab] = useState<string>('bench_total');

  // Table pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Selector state for less-common personas and skills
  const [selectedOtherPersona, setSelectedOtherPersona] = useState<string>('');
  const [selectedOtherSkill, setSelectedOtherSkill] = useState<string>('');

  // Chart drilldown state
  const [chartDrilldown, setChartDrilldown] = useState<{ field: 'persona' | 'designation' | 'skill' | 'benchAging'; value: string } | null>(null);

  const handleChartFilter = (field: 'persona' | 'designation' | 'skill' | 'benchAging', value: string) => {
    if (chartDrilldown && chartDrilldown.field === field && chartDrilldown.value === value) {
      setChartDrilldown(null);
    } else {
      setChartDrilldown({ field, value });
    }
    setCurrentPage(1);
  };

  // Excel columns filters state (including skills)
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({
    name: [],
    persona: [],
    skills: [],
    classificationTier: [],
    status: []
  });

  const [openFilterDropdown, setOpenFilterDropdown] = useState<string | null>(null);
  const [dropdownSearch, setDropdownSearch] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const handleClearAllFilters = () => {
    setSearchQuery('');
    setColumnFilters({
      name: [],
      persona: [],
      skills: [],
      classificationTier: [],
      status: []
    });
    setCurrentPage(1);
    setSelectedOtherPersona('');
    setSelectedOtherSkill('');
    setChartDrilldown(null);
  };

  // Reset secondary selectors and column filters on tab change
  React.useEffect(() => {
    setSelectedOtherPersona('');
    setSelectedOtherSkill('');
    setChartDrilldown(null);
    setColumnFilters({
      name: [],
      persona: [],
      skills: [],
      classificationTier: [],
      status: []
    });
  }, [activeTab]);

  // Toggle state to show overdue bench details list
  const [showOverdueDetails, setShowOverdueDetails] = useState<boolean>(false);

  // Reset page to 1 on search, tab, or filter change
  const serializedFilters = JSON.stringify(columnFilters);
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeTab, serializedFilters]);

  // ----------------------------------------------------
  // SEGMENTED COUNTS & SELECTION FOR TABS
  // ----------------------------------------------------
  const benchEmployees = employees.filter(e => e.employeeType === 'Bench' && e.status !== 'Allocated');
  const enrolledEmployees = benchEmployees.filter(e => e.status === 'In Training' || !!e.programEnrollmentDate);
  const idleEmployees = benchEmployees.filter(e => !(e.status === 'In Training' || !!e.programEnrollmentDate));
  
  // Enforcing Client Ready to be a subset of enrolled employees
  const clientReadyBench = enrolledEmployees.filter(e => e.classificationTier === 'Client Ready' || e.status === 'Interview Ready');
  // Deployed counts all employees with status === 'Allocated' (tracked independently)
  const deployedBench = employees.filter(e => e.status === 'Allocated');

  const tabCounts = {
    bench_total: stats?.overview?.totalBench ?? benchEmployees.length,
    enrolled: stats?.overview?.enrolled ?? enrolledEmployees.length,
    idle: stats?.overview?.idle ?? idleEmployees.length,
    client_ready: stats?.overview?.clientReady ?? (stats?.overview?.interviewReady ?? clientReadyBench.length),
    deployed: stats?.overview?.deployed ?? deployedBench.length
  };

  // Base list of employees for the active tab (before Excel column filters and search queries)
  const tabBaseEmployees = React.useMemo(() => {
    return employees.filter(emp => {
      if (activeTab === 'bench_total') {
        return emp.employeeType === 'Bench' && emp.status !== 'Allocated';
      } else if (activeTab === 'enrolled') {
        return emp.employeeType === 'Bench' && emp.status !== 'Allocated' && (emp.status === 'In Training' || !!emp.programEnrollmentDate);
      } else if (activeTab === 'idle') {
        return emp.employeeType === 'Bench' && emp.status !== 'Allocated' && !(emp.status === 'In Training' || !!emp.programEnrollmentDate);
      } else if (activeTab === 'client_ready') {
        return emp.employeeType === 'Bench' && emp.status !== 'Allocated' && (emp.status === 'In Training' || !!emp.programEnrollmentDate) && (emp.classificationTier === 'Client Ready' || emp.status === 'Interview Ready');
      } else if (activeTab === 'deployed') {
        return emp.status === 'Allocated';
      }
      return true;
    });
  }, [employees, activeTab]);

  // ----------------------------------------------------
  // UNIQUE OPTIONS FOR EXCEL COLUMN FILTERS (Scoped dynamically to current tab base scope for accuracy)
  // ----------------------------------------------------
  const uniqueNames = React.useMemo(() => Array.from(new Set(tabBaseEmployees.map(e => e.name))).sort(), [tabBaseEmployees]);
  const uniquePersonas = React.useMemo(() => Array.from(new Set(tabBaseEmployees.map(e => e.persona).filter(Boolean))).sort(), [tabBaseEmployees]);
  const uniqueSkillsList = React.useMemo(() => Array.from(new Set(tabBaseEmployees.flatMap(e => e.skills || []))).sort(), [tabBaseEmployees]);
  const uniqueTiers = React.useMemo(() => Array.from(new Set(tabBaseEmployees.map(e => e.classificationTier || 'Needs Support'))).sort(), [tabBaseEmployees]);
  const uniqueStatuses = React.useMemo(() => Array.from(new Set(tabBaseEmployees.map(e => e.status))).sort(), [tabBaseEmployees]);

  // For charts, we use stable personas across all employees
  const allUniquePersonas = Array.from(new Set(employees.map(e => e.persona).filter(Boolean))).sort();

  // ----------------------------------------------------
  // REAL-TIME ESCALATIONS & GENERAL AUDITS
  // ----------------------------------------------------
  const totalEmployeesCount = employees.length;
  const overdueBenchCount = employees.filter(e => e.weeksEnrolled && e.weeksEnrolled > 12 && e.classificationTier !== 'Client Ready').length;
  const escalationList = employees.filter(e => e.managerAttentionRequired);

  // ----------------------------------------------------
  // TAB FILTERED EMPLOYEES (FOR CHARTS & BASE DIRECTORY TABLE - Follows KPI Tabs)
  // ----------------------------------------------------
  const tabFilteredEmps = React.useMemo(() => {
    return tabBaseEmployees.filter(emp => {
      // Filter by Excel Column Filters
      for (const col of Object.keys(columnFilters)) {
        const selectedVals = columnFilters[col];
        if (selectedVals.length > 0) {
          if (col === 'skills') {
            const matchesSkillFilter = emp.skills?.some(s => selectedVals.includes(s));
            if (!matchesSkillFilter) return false;
          } else {
            let valToCompare = '';
            if (col === 'name') valToCompare = emp.name;
            else if (col === 'persona') valToCompare = emp.persona || '';
            else if (col === 'classificationTier') valToCompare = emp.classificationTier || 'Needs Support';
            else if (col === 'status') valToCompare = emp.status;

            if (!selectedVals.includes(valToCompare)) {
              return false;
            }
          }
        }
      }

      // Filter by Global Search Query
      if (searchQuery) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = emp.name?.toLowerCase().includes(query);
        const matchesId = emp.employeeId?.toLowerCase().includes(query);
        const matchesEmail = emp.email?.toLowerCase().includes(query);
        const matchesPersona = emp.persona?.toLowerCase().includes(query);
        const matchesSkills = emp.skills?.some(s => s.toLowerCase().includes(query));
        
        if (!matchesName && !matchesId && !matchesEmail && !matchesPersona && !matchesSkills) {
          return false;
        }
      }

      return true;
    });
  }, [tabBaseEmployees, columnFilters, searchQuery]);

  const getShortDesignation = (des: string): string => {
    if (des === 'Manager') return 'Manager';
    if (des === 'AM' || des === 'Assistant Manager') return 'AM';
    if (des === 'Consultant (CON)' || des === 'Consultant') return 'CON';
    if (des === 'Associate Consultant (ACON)' || des === 'Associate Consultant') return 'ACON';
    if (des === 'Analyst') return 'Analyst';
    return des;
  };

  const filteredEmps = tabFilteredEmps.filter(emp => {
    if (!chartDrilldown) return true;
    
    if (chartDrilldown.field === 'persona') {
      return emp.persona === chartDrilldown.value;
    }
    
    if (chartDrilldown.field === 'designation') {
      const isAM = chartDrilldown.value === 'AM';
      const isCON = chartDrilldown.value === 'Consultant (CON)' || chartDrilldown.value === 'CON';
      const isACON = chartDrilldown.value === 'Associate Consultant (ACON)' || chartDrilldown.value === 'ACON';
      
      if (isAM) {
        return emp.designation === 'AM' || emp.designation === 'Assistant Manager';
      }
      if (isCON) {
        return emp.designation === 'Consultant (CON)' || emp.designation === 'Consultant';
      }
      if (isACON) {
        return emp.designation === 'Associate Consultant (ACON)' || emp.designation === 'Associate Consultant';
      }
      return emp.designation === chartDrilldown.value;
    }
    
    if (chartDrilldown.field === 'skill') {
      return emp.skills?.includes(chartDrilldown.value);
    }
    
    if (chartDrilldown.field === 'benchAging') {
      const days = emp.benchAgingDays ?? 0;
      if (chartDrilldown.value === '0-15 days') return days <= 15;
      if (chartDrilldown.value === '16-30 days') return days > 15 && days <= 30;
      if (chartDrilldown.value === '31-60 days') return days > 30 && days <= 60;
      if (chartDrilldown.value === '61-90 days') return days > 60 && days <= 90;
      if (chartDrilldown.value === '90+ days') return days > 90;
    }
    
    return true;
  });

  // ----------------------------------------------------
  // CHART DATA PREPARATION Handlers (Reading from tabFilteredEmps)
  // ----------------------------------------------------
  const COLORS = [
    '#A5B4FC', '#99E6D9', '#FFD8A8', '#F9A8C9', '#C4B5FD', 
    '#FDE047', '#93C5FD', '#A7F3D0', '#FBCFE8', '#FED7AA', '#C7D2FE'
  ];

  // Chart 1: Persona-wise Training count (Top 10 + Selector for the rest)
  const rawPersonaData = allUniquePersonas.map(p => ({
    name: p,
    count: tabFilteredEmps.filter(e => e.persona === p).length
  })).sort((a, b) => b.count - a.count);

  const topPersonas = rawPersonaData.slice(0, 10);
  const otherPersonas = rawPersonaData.slice(10);
  
  const displayedPersonaData = [...topPersonas];
  if (selectedOtherPersona) {
    const found = rawPersonaData.find(p => p.name === selectedOtherPersona);
    if (found && !displayedPersonaData.some(p => p.name === selectedOtherPersona)) {
      displayedPersonaData.push(found);
    }
  }

  // Chart 2: Designation Chart (Plain employee count per designation, simplified)
  const prepareDesignationData = (emps: Employee[]) => {
    const designations = ['Manager', 'AM', 'Consultant (CON)', 'Associate Consultant (ACON)', 'Analyst'];
    emps.forEach(e => {
      if (e.designation && !designations.includes(e.designation)) {
        designations.push(e.designation);
      }
    });

    return designations.map(des => ({
      designation: des,
      shortLabel: getShortDesignation(des),
      count: emps.filter(e => {
        if (des === 'AM' && (e.designation === 'Assistant Manager' || e.designation === 'AM')) return true;
        if (des === 'Consultant (CON)' && (e.designation === 'Consultant' || e.designation === 'Consultant (CON)')) return true;
        if (des === 'Associate Consultant (ACON)' && (e.designation === 'Associate Consultant' || e.designation === 'Associate Consultant (ACON)')) return true;
        return e.designation === des;
      }).length
    }));
  };
  const designationData = prepareDesignationData(tabFilteredEmps);

  // Chart 3: Tech Proficiency Chart / Top Skills Chart (Top 6 + Selector for the rest)
  const skillCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    tabFilteredEmps.forEach(e => {
      if (e.skills) {
        e.skills.forEach(skill => {
          counts[skill] = (counts[skill] || 0) + 1;
        });
      }
    });
    return Object.entries(counts).map(([name, count]) => ({
      name,
      count
    })).sort((a, b) => b.count - a.count);
  }, [tabFilteredEmps]);

  const topSkills = skillCounts.slice(0, 6);
  const otherSkills = skillCounts.slice(6);

  const displayedSkillData = [...topSkills];
  if (selectedOtherSkill) {
    const found = skillCounts.find(s => s.name === selectedOtherSkill);
    if (found && !displayedSkillData.some(s => s.name === selectedOtherSkill)) {
      displayedSkillData.push(found);
    }
  }

  // Chart 4: Bench Aging (Days on Bench) (Pastel scheme, coral flag)
  const prepareBenchAgingData = (emps: Employee[]) => {
    let b0_15 = 0;
    let b16_30 = 0;
    let b31_60 = 0;
    let b61_90 = 0;
    let b90_plus = 0;

    emps.forEach(e => {
      const days = e.benchAgingDays ?? 0;
      if (days <= 15) b0_15++;
      else if (days <= 30) b16_30++;
      else if (days <= 60) b31_60++;
      else if (days <= 90) b61_90++;
      else b90_plus++;
    });

    return [
      { name: '0-15 days', value: b0_15, color: '#A5B4FC' },
      { name: '16-30 days', value: b16_30, color: '#99E6D9' },
      { name: '31-60 days', value: b31_60, color: '#FFD8A8' },
      { name: '61-90 days', value: b61_90, color: '#F9A8C9' },
      { name: '90+ days', value: b90_plus, color: '#FFB3A7' }, // Soft coral highlight for 90+ days "at risk"
    ];
  };
  const benchAgingData = prepareBenchAgingData(tabFilteredEmps);

  // ----------------------------------------------------
  // PAGINATION CALCULATIONS
  // ----------------------------------------------------
  const itemsPerPage = 10;
  const totalPages = Math.ceil(filteredEmps.length / itemsPerPage) || 1;
  const paginatedEmps = filteredEmps.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  
  const startIdx = filteredEmps.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endIdx = Math.min(currentPage * itemsPerPage, filteredEmps.length);
  const badgeText = `Showing ${startIdx}–${endIdx} of ${filteredEmps.length} matching resources`;

  const isPersonaDrilldownActive = chartDrilldown?.field === 'persona';
  const isSelectedPersona = (name: string) => chartDrilldown?.field === 'persona' && chartDrilldown?.value === name;

  const isDesignationDrilldownActive = chartDrilldown?.field === 'designation';
  const isSelectedDesignation = (des: string) => chartDrilldown?.field === 'designation' && chartDrilldown?.value === des;

  const isSkillDrilldownActive = chartDrilldown?.field === 'skill';
  const isSelectedSkill = (name: string) => chartDrilldown?.field === 'skill' && chartDrilldown?.value === name;

  const isBenchAgingDrilldownActive = chartDrilldown?.field === 'benchAging';
  const isSelectedBenchAging = (name: string) => chartDrilldown?.field === 'benchAging' && chartDrilldown?.value === name;

  return (
    <div className="space-y-6 relative">
      
      {/* Click outside overlay for filters */}
      {openFilterDropdown && (
        <div 
          className="fixed inset-0 z-40 bg-transparent" 
          onClick={() => setOpenFilterDropdown(null)} 
        />
      )}

      {/* 1. Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Talent Readiness Dashboard</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">Real-time skills logging, client-ready pipelines, and three-tier classifications.</p>
        </div>
      </div>

      {/* 3. Clickable Segment Tabs with formulas (Round 3 Fix) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { key: 'bench_total', label: 'Bench (Total)', count: tabCounts.bench_total, icon: Users, color: 'indigo' },
          { key: 'enrolled', label: 'Currently Enrolled', count: tabCounts.enrolled, icon: GraduationCap, color: 'teal' },
          { key: 'idle', label: 'Idle', count: tabCounts.idle, icon: AlertCircle, color: 'amber' },
          { key: 'client_ready', label: 'Client Ready', count: tabCounts.client_ready, icon: UserCheck, color: 'emerald' },
          { key: 'deployed', label: 'Deployed', count: tabCounts.deployed, icon: CheckCircle2, color: 'purple' },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          
          let activeStyles = '';
          if (isActive) {
            if (tab.color === 'indigo') activeStyles = 'ring-2 ring-indigo-500/80 border-indigo-500 bg-indigo-50/10 dark:bg-indigo-950/10 shadow-md';
            else if (tab.color === 'teal') activeStyles = 'ring-2 ring-teal-500/80 border-teal-500 bg-teal-50/10 dark:bg-teal-950/10 shadow-md';
            else if (tab.color === 'amber') activeStyles = 'ring-2 ring-amber-500/80 border-amber-500 bg-amber-50/10 dark:bg-amber-950/10 shadow-md';
            else if (tab.color === 'emerald') activeStyles = 'ring-2 ring-emerald-500/80 border-emerald-500 bg-emerald-50/10 dark:bg-emerald-950/10 shadow-md';
            else if (tab.color === 'purple') activeStyles = 'ring-2 ring-purple-500/80 border-purple-500 bg-purple-50/10 dark:bg-purple-950/10 shadow-md';
          } else {
            activeStyles = 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-850';
          }
          
          let iconStyles = '';
          if (tab.color === 'indigo') iconStyles = 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400';
          else if (tab.color === 'teal') iconStyles = 'bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400';
          else if (tab.color === 'amber') iconStyles = 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400';
          else if (tab.color === 'emerald') iconStyles = 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400';
          else if (tab.color === 'purple') iconStyles = 'bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400';

          return (
            <div 
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`bg-white dark:bg-zinc-900 p-5 rounded-2xl border transition-all cursor-pointer flex items-center gap-4 ${activeStyles}`}
            >
              <div className={`p-3 rounded-xl ${iconStyles}`}>
                <Icon className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block whitespace-normal break-words leading-tight">{tab.label}</span>
                <span className="text-2xl font-black block leading-none mt-1.5 text-zinc-900 dark:text-zinc-50">{tab.count}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dynamic Segment Charts */}
      <div className="space-y-6">
        {/* Row 1: Persona-wise Training (Full width) */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 w-full animate-fade-in">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm leading-tight">Persona-wise Training (Top 10 + Custom)</h3>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Resource allocation distribution by primary persona track. (Selected KPI Tab: {activeTab === 'bench_total' ? 'Bench Total' : activeTab === 'enrolled' ? 'Enrolled' : activeTab === 'idle' ? 'Idle' : activeTab === 'client_ready' ? 'Client Ready' : 'Deployed'})</p>
            </div>
            {otherPersonas.length > 0 && (
              <div className="flex items-center gap-2">
                <label htmlFor="other-personas-select" className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 text-nowrap">View other persona:</label>
                <select
                  id="other-personas-select"
                  value={selectedOtherPersona}
                  onChange={(e) => setSelectedOtherPersona(e.target.value)}
                  className="text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 px-2.5 py-1.5 font-medium shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">-- Choose Persona --</option>
                  {otherPersonas.map(p => (
                    <option key={p.name} value={p.name}>{p.name} ({p.count})</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          
          <div className="h-64 mt-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={displayedPersonaData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" className="dark:stroke-zinc-800" />
                <XAxis dataKey="name" stroke="#a1a1aa" fontSize={10} tickLine={false} />
                <YAxis stroke="#a1a1aa" fontSize={11} tickLine={false} allowDecimals={false} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#18181b', 
                    border: 'none', 
                    borderRadius: '12px', 
                    color: '#f4f4f5',
                    fontSize: '11px' 
                  }} 
                />
                <Bar 
                  dataKey="count" 
                  fill="#A5B4FC" 
                  radius={[6, 6, 0, 0]}
                  onClick={(data) => {
                    const val = data?.name || (data?.payload && data?.payload?.name);
                    if (val) handleChartFilter('persona', val);
                  }}
                  className="cursor-pointer"
                >
                  {displayedPersonaData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={COLORS[index % COLORS.length]} 
                      opacity={isPersonaDrilldownActive ? (isSelectedPersona(entry.name) ? 1 : 0.35) : 1}
                      stroke={isSelectedPersona(entry.name) ? '#4f46e5' : 'none'}
                      strokeWidth={isSelectedPersona(entry.name) ? 2 : 0}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Row 2: Designation + Tech Proficiency (Side-by-side) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 2: Employees by Designation */}
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 animate-fade-in">
            <div>
              <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm leading-tight">Employees by Designation</h3>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Resource seniority mapping across primary engineering levels.</p>
            </div>
            
            <div className="h-64 mt-6">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#18181b', 
                      border: 'none', 
                      borderRadius: '12px', 
                      color: '#f4f4f5',
                      fontSize: '11px' 
                    }} 
                    formatter={(value: any, name: any) => [`${value} Employees`, designationFullNameMap[name] || name]}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={36} 
                    iconType="circle" 
                    iconSize={8}
                    wrapperStyle={{ fontSize: '10px' }}
                    formatter={(value: any) => designationFullNameMap[value] || value}
                  />
                  <Pie
                    data={designationData}
                    cx="50%"
                    cy="45%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="count"
                    nameKey="designation"
                    label={({ name, value }) => {
                      if (!value) return '';
                      return `${getShortDesignation(name)}: ${value}`;
                    }}
                    labelLine={true}
                    onClick={(data: any) => {
                      const val = data?.designation || (data?.payload && data?.payload?.designation);
                      if (val) handleChartFilter('designation', val);
                    }}
                    className="cursor-pointer outline-none"
                  >
                    {designationData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={COLORS[index % COLORS.length]} 
                        opacity={isDesignationDrilldownActive ? (isSelectedDesignation(entry.designation) ? 1 : 0.35) : 1}
                        stroke={isSelectedDesignation(entry.designation) ? '#4f46e5' : '#fff'}
                        strokeWidth={isSelectedDesignation(entry.designation) ? 2 : 1}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 3: Tech Proficiency / Top Skills */}
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm leading-tight">Tech Proficiency / Top Skills</h3>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Frequency distribution of individual technologies across candidates.</p>
              </div>
              {otherSkills.length > 0 && (
                <div className="flex items-center gap-2">
                  <label htmlFor="other-skills-select" className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 text-nowrap">View other skill:</label>
                  <select
                    id="other-skills-select"
                    value={selectedOtherSkill}
                    onChange={(e) => setSelectedOtherSkill(e.target.value)}
                    className="text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 px-2.5 py-1.5 font-medium shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">-- Choose Skill --</option>
                    {otherSkills.map(s => (
                      <option key={s.name} value={s.name}>{s.name} ({s.count})</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            
            <div className="h-64 mt-6">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={displayedSkillData} 
                  layout="vertical"
                  margin={{ top: 10, right: 15, left: 15, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e4e4e7" className="dark:stroke-zinc-800" />
                  <XAxis type="number" stroke="#a1a1aa" fontSize={11} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" stroke="#a1a1aa" fontSize={10} tickLine={false} width={85} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#18181b', 
                      border: 'none', 
                      borderRadius: '12px', 
                      color: '#f4f4f5',
                      fontSize: '11px' 
                    }} 
                  />
                  <Bar 
                    dataKey="count" 
                    fill="#FFD8A8" 
                    radius={[0, 6, 6, 0]}
                    onClick={(data) => {
                      const val = data?.name || (data?.payload && data?.payload?.name);
                      if (val) handleChartFilter('skill', val);
                    }}
                    className="cursor-pointer"
                  >
                    {displayedSkillData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={COLORS[index % COLORS.length]} 
                        opacity={isSkillDrilldownActive ? (isSelectedSkill(entry.name) ? 1 : 0.35) : 1}
                        stroke={isSelectedSkill(entry.name) ? '#4f46e5' : 'none'}
                        strokeWidth={isSelectedSkill(entry.name) ? 2 : 0}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Row 3: Bench Aging (Idle Tab Only, Full width) */}
        {activeTab === 'idle' && (
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 animate-fade-in w-full">
            <div>
              <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm leading-tight">Bench Aging (Days on Bench)</h3>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Days since entering the bench. At-risk resources exceeding 90 days are highlighted in soft coral highlight.</p>
            </div>
            <div className="h-64 mt-6">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={benchAgingData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" className="dark:stroke-zinc-800" />
                  <XAxis dataKey="name" stroke="#a1a1aa" fontSize={11} tickLine={false} />
                  <YAxis stroke="#a1a1aa" fontSize={11} tickLine={false} allowDecimals={false} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#18181b', 
                      border: 'none', 
                      borderRadius: '12px', 
                      color: '#f4f4f5',
                      fontSize: '11px' 
                    }} 
                  />
                  <Bar 
                    dataKey="value" 
                    fill="#6366f1" 
                    radius={[8, 8, 0, 0]}
                    onClick={(data) => {
                      const val = data?.name || (data?.payload && data?.payload?.name);
                      if (val) handleChartFilter('benchAging', val);
                    }}
                    className="cursor-pointer"
                  >
                    {benchAgingData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.color} 
                        opacity={isBenchAgingDrilldownActive ? (isSelectedBenchAging(entry.name) ? 1 : 0.35) : 1}
                        stroke={isSelectedBenchAging(entry.name) ? '#4f46e5' : 'none'}
                        strokeWidth={isSelectedBenchAging(entry.name) ? 2 : 0}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* 4. Global Search and Reset Banner (Moved to just above directory table - Round 3 Fix) */}
      <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input
              type="text"
              id="global-search-bar"
              placeholder="Search resources by Name, Employee ID, Email, or Skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-zinc-50 dark:bg-zinc-800/45 border border-zinc-200 dark:border-zinc-700/60 rounded-2xl text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all shadow-inner"
            />
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-850 px-3.5 py-2.5 rounded-xl border border-zinc-150 dark:border-zinc-800">
              {badgeText}
            </span>
            <button
              id="clear-all-filters-btn"
              onClick={handleClearAllFilters}
              className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-bold transition-all border border-zinc-200 dark:border-zinc-700/50 flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              Clear All Filters
            </button>
          </div>
        </div>
      </div>

      {/* 5. Interactive Candidate Directory Table (Dynamic base tab scope) */}
      <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm leading-none">Interactive Candidate Directory</h3>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
              Currently enrolled program candidates list with interactive Excel filters.
            </p>
          </div>
          <span className="text-[10px] font-bold text-zinc-450 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-1 rounded-lg border dark:border-zinc-800">
            {filteredEmps.length} matching resources found
          </span>
        </div>

        {chartDrilldown && (
          <div className="flex flex-wrap items-center gap-2 py-1.5 border-b border-zinc-100 dark:border-zinc-850">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Active Drilldown:</span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 dark:bg-indigo-950/45 text-indigo-700 dark:text-indigo-350 text-xs font-semibold rounded-full border border-indigo-100 dark:border-indigo-900/30 shadow-xs">
              Filtered by {chartDrilldown.field === 'benchAging' ? 'bench aging' : chartDrilldown.field}: <strong className="font-bold">{chartDrilldown.value}</strong>
              <button 
                id="clear-chart-drilldown-badge"
                onClick={() => setChartDrilldown(null)}
                className="hover:bg-indigo-100 dark:hover:bg-indigo-900/60 p-0.5 rounded-full transition-colors cursor-pointer text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-200"
              >
                ✕
              </button>
            </span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-[1450px]">
            <thead>
              <tr className="border-b border-zinc-150 dark:border-zinc-850 text-zinc-400 dark:text-zinc-500 font-bold uppercase text-[10px] tracking-wider">
                <th className="pb-3 px-4 min-w-[80px] text-left">ID</th>
                
                {/* Name Excel Column Filter */}
                <th className="relative pb-3 px-4 select-none min-w-[170px] text-left">
                  <div 
                    className="flex items-center gap-1.5 cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDropdownSearch('');
                      setOpenFilterDropdown(openFilterDropdown === 'name' ? null : 'name');
                    }}
                  >
                    <span>Name</span>
                    <Filter className={`w-3.5 h-3.5 transition-all ${columnFilters.name.length > 0 ? 'text-indigo-600 dark:text-indigo-400 fill-indigo-100 dark:fill-indigo-950/40' : 'text-zinc-400 hover:text-zinc-600'}`} />
                  </div>
                  {openFilterDropdown === 'name' && (
                    <FilterDropdown 
                      column="Name" 
                      values={uniqueNames} 
                      selected={columnFilters.name} 
                      onChange={(vals) => setColumnFilters({ ...columnFilters, name: vals })}
                      openSearch={dropdownSearch}
                      setOpenSearch={setDropdownSearch}
                      onClose={() => setOpenFilterDropdown(null)}
                    />
                  )}
                </th>

                <th className="pb-3 px-4 min-w-[190px] text-left">Email</th>

                {/* Persona Excel Column Filter */}
                <th className="relative pb-3 px-4 select-none min-w-[160px] text-left">
                  <div 
                    className="flex items-center gap-1.5 cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDropdownSearch('');
                      setOpenFilterDropdown(openFilterDropdown === 'persona' ? null : 'persona');
                    }}
                  >
                    <span>Persona</span>
                    <Filter className={`w-3.5 h-3.5 transition-all ${columnFilters.persona.length > 0 ? 'text-indigo-600 dark:text-indigo-400 fill-indigo-100 dark:fill-indigo-950/40' : 'text-zinc-400 hover:text-zinc-600'}`} />
                  </div>
                  {openFilterDropdown === 'persona' && (
                    <FilterDropdown 
                      column="Persona" 
                      values={uniquePersonas} 
                      selected={columnFilters.persona} 
                      onChange={(vals) => setColumnFilters({ ...columnFilters, persona: vals })} 
                      openSearch={dropdownSearch}
                      setOpenSearch={setDropdownSearch}
                      onClose={() => setOpenFilterDropdown(null)}
                    />
                  )}
                </th>

                {/* Skills Excel Column Filter (New - Round 3 Fix) */}
                <th className="relative pb-3 px-4 select-none min-w-[180px] text-left">
                  <div 
                    className="flex items-center gap-1.5 cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDropdownSearch('');
                      setOpenFilterDropdown(openFilterDropdown === 'skills' ? null : 'skills');
                    }}
                  >
                    <span>Skills</span>
                    <Filter className={`w-3.5 h-3.5 transition-all ${columnFilters.skills.length > 0 ? 'text-indigo-600 dark:text-indigo-400 fill-indigo-100 dark:fill-indigo-950/40' : 'text-zinc-400 hover:text-zinc-600'}`} />
                  </div>
                  {openFilterDropdown === 'skills' && (
                    <FilterDropdown 
                      column="Skills" 
                      values={uniqueSkillsList} 
                      selected={columnFilters.skills} 
                      onChange={(vals) => setColumnFilters({ ...columnFilters, skills: vals })} 
                      openSearch={dropdownSearch}
                      setOpenSearch={setDropdownSearch}
                      onClose={() => setOpenFilterDropdown(null)}
                    />
                  )}
                </th>

                <th className="pb-3 px-4 min-w-[100px] text-center">Overall</th>

                {/* Classification Tier Excel Column Filter */}
                <th className="relative pb-3 px-4 select-none min-w-[170px] text-center">
                  <div 
                    className="flex items-center justify-center gap-1.5 cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDropdownSearch('');
                      setOpenFilterDropdown(openFilterDropdown === 'classificationTier' ? null : 'classificationTier');
                    }}
                  >
                    <span>Classification Tier</span>
                    <Filter className={`w-3.5 h-3.5 transition-all ${columnFilters.classificationTier.length > 0 ? 'text-indigo-600 dark:text-indigo-400 fill-indigo-100 dark:fill-indigo-950/40' : 'text-zinc-400 hover:text-zinc-600'}`} />
                  </div>
                  {openFilterDropdown === 'classificationTier' && (
                    <FilterDropdown 
                      column="Classification" 
                      values={uniqueTiers} 
                      selected={columnFilters.classificationTier} 
                      onChange={(vals) => setColumnFilters({ ...columnFilters, classificationTier: vals })} 
                      openSearch={dropdownSearch}
                      setOpenSearch={setDropdownSearch}
                      onClose={() => setOpenFilterDropdown(null)}
                      align="right"
                    />
                  )}
                </th>

                {/* Status Excel Column Filter */}
                <th className="relative pb-3 px-4 select-none text-right min-w-[130px]">
                  <div 
                    className="flex items-center justify-end gap-1.5 cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDropdownSearch('');
                      setOpenFilterDropdown(openFilterDropdown === 'status' ? null : 'status');
                    }}
                  >
                    <span>Status</span>
                    <Filter className={`w-3.5 h-3.5 transition-all ${columnFilters.status.length > 0 ? 'text-indigo-600 dark:text-indigo-400 fill-indigo-100 dark:fill-indigo-950/40' : 'text-zinc-400 hover:text-zinc-600'}`} />
                  </div>
                  {openFilterDropdown === 'status' && (
                    <FilterDropdown 
                      column="Status" 
                      values={uniqueStatuses} 
                      selected={columnFilters.status} 
                      onChange={(vals) => setColumnFilters({ ...columnFilters, status: vals })} 
                      openSearch={dropdownSearch}
                      setOpenSearch={setDropdownSearch}
                      onClose={() => setOpenFilterDropdown(null)}
                      align="right"
                    />
                  )}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/50 text-zinc-700 dark:text-zinc-300">
              {paginatedEmps.map(emp => {
                const isEnrolled = emp.status === 'In Training' || !!emp.programEnrollmentDate || emp.status === 'Allocated' || emp.status === 'Interview Ready';
                return (
                  <tr key={emp.id} className="hover:bg-zinc-50/55 dark:hover:bg-zinc-800/35 transition-colors">
                    <td className="py-3 px-4 text-left font-mono font-bold text-zinc-400 text-[10px] whitespace-nowrap">{emp.employeeId}</td>
                    <td className="py-3 px-4 text-left font-extrabold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                      <div>
                        <span>{emp.name}</span>
                        {emp.designation && (
                          <span className="text-[9px] text-indigo-500 font-semibold block">{emp.designation}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-left text-zinc-500 whitespace-nowrap">{emp.email}</td>
                    <td className="py-3 px-4 text-left font-semibold text-zinc-800 dark:text-zinc-200 whitespace-nowrap">{emp.persona}</td>
                    {/* Skills badges in separate column - Round 3 Fix */}
                    <td className="py-3 px-4 text-left">
                      <div className="flex flex-wrap gap-1 max-w-[180px]">
                        {emp.skills && emp.skills.length > 0 ? (
                          emp.skills.map(s => (
                            <span key={s} className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-850 text-zinc-600 dark:text-zinc-400 rounded text-[9px] font-medium font-mono border border-zinc-200 dark:border-zinc-750 whitespace-nowrap">
                              {s}
                            </span>
                          ))
                        ) : (
                          <span className="text-zinc-400 text-[10px]">None</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                      {isEnrolled && emp.overallScore ? `${Number(emp.overallScore).toFixed(2)}` : 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                        emp.classificationTier === 'Client Ready' 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/40' 
                        : emp.classificationTier === 'Interview Ready'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/40'
                        : emp.classificationTier === 'Allocated'
                          ? 'bg-zinc-100 text-zinc-750 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700'
                        : emp.classificationTier === 'In Training'
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/40'
                        : emp.classificationTier === 'N/A'
                          ? 'bg-zinc-50 text-zinc-400 border-zinc-200 dark:bg-zinc-900/40 dark:text-zinc-500 dark:border-zinc-800'
                        : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/40'
                      }`}>
                        {emp.classificationTier}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
                        emp.status === 'Available' ? 'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400' :
                        emp.status === 'Interview Ready' ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400' :
                        emp.status === 'Allocated' ? 'bg-zinc-150 dark:bg-zinc-850 text-zinc-700 dark:text-zinc-300' :
                        'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400'
                      }`}>
                        {STATUS_LABELS[emp.status] || emp.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filteredEmps.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-zinc-400 font-semibold">
                    No active directory list matching your selected search query and filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Previous / Next Pagination Controls (Round 3 Fix) */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
          <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 disabled:opacity-50 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-700 dark:text-zinc-300 rounded-lg text-xs font-bold border border-zinc-250 dark:border-zinc-750 transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              Previous
            </button>
            
            {/* Page Numbers */}
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(page => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
              .map((page, index, array) => {
                const isSelected = page === currentPage;
                const showEllipsisBefore = index > 0 && page - array[index - 1] > 1;
                return (
                  <React.Fragment key={page}>
                    {showEllipsisBefore && <span className="text-zinc-400 dark:text-zinc-600 text-xs">...</span>}
                    <button
                      onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-700 dark:text-zinc-300 border border-zinc-250 dark:border-zinc-750'
                      }`}
                    >
                      {page}
                    </button>
                  </React.Fragment>
                );
              })}

            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 disabled:opacity-50 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-700 dark:text-zinc-300 rounded-lg text-xs font-bold border border-zinc-250 dark:border-zinc-750 transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
