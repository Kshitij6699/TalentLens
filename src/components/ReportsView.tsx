import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  Download, 
  Printer, 
  Award, 
  AlertTriangle, 
  TrendingUp,
  Sliders,
  BarChart2,
  Calendar
} from 'lucide-react';
import { Employee, MockInterview, AttendanceLog } from '../types.ts';

interface ReportsViewProps {
  employees: Employee[];
  mocks: MockInterview[];
  attendanceLogs: AttendanceLog[];
}

export default function ReportsView({
  employees,
  mocks,
  attendanceLogs
}: ReportsViewProps) {
  const [activeReportType, setActiveReportType] = useState<'readiness' | 'gaps' | 'support'>('readiness');

  // Helpers to calculate data
  const readyList = employees.filter(e => e.status === 'Interview Ready');
  const supportList = employees.filter(e => (e.avgMockScore && e.avgMockScore < 2.5) || (e.attendanceRate !== undefined && e.attendanceRate < 75));

  // Calculate Average Scores per Topic for Skill Deficit Gap analysis
  const topicsList = ['Python', 'SQL', 'Spark', 'PySpark', 'System Design'];
  const competencyGaps = topicsList.map(topic => {
    const topicMocks = mocks.filter(m => m.topic === topic);
    const avgScore = topicMocks.length > 0 
      ? Number((topicMocks.reduce((sum, m) => sum + m.overallScore, 0) / topicMocks.length).toFixed(2))
      : 0;
    
    return {
      topic,
      avgScore,
      totalAssessments: topicMocks.length,
      deficit: avgScore > 0 ? Number((5.0 - avgScore).toFixed(2)) : 0
    };
  });

  // Export to CSV helper
  const triggerCsvDownload = (filename: string, headers: string[], rows: any[][]) => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadReadinessCsv = () => {
    const headers = ['Employee ID', 'Name', 'Email', 'Skill Group', 'Years Experience', 'Mock Average Score', 'Attendance Rate'];
    const rows = readyList.map(emp => [
      emp.employeeId,
      emp.name,
      emp.email,
      emp.skillGroup,
      emp.yearsOfExperience,
      emp.avgMockScore || 'No Mocks',
      emp.attendanceRate || 0
    ]);
    triggerCsvDownload('interview_ready_resources.csv', headers, rows);
  };

  const handleDownloadSupportCsv = () => {
    const headers = ['Employee ID', 'Name', 'Email', 'Skill Group', 'Mock Average Score', 'Attendance Rate', 'Deficit Flag'];
    const rows = supportList.map(emp => {
      const mockDeficit = emp.avgMockScore && emp.avgMockScore < 2.5;
      const attDeficit = emp.attendanceRate && emp.attendanceRate < 75;
      const flag = mockDeficit && attDeficit ? 'Critical (Mock & Attendance)' : mockDeficit ? 'Low Mock Score' : 'Low Attendance';
      return [
        emp.employeeId,
        emp.name,
        emp.email,
        emp.skillGroup,
        emp.avgMockScore || 'No Mocks',
        emp.attendanceRate || 0,
        flag
      ];
    });
    triggerCsvDownload('support_required_resources.csv', headers, rows);
  };

  const handleDownloadCompetencyCsv = () => {
    const headers = ['Topic / Competency Area', 'Average Assessed Score', 'Deficit Relative to Max (5.0)', 'Total Evaluated Sessions'];
    const rows = competencyGaps.map(gap => [
      gap.topic,
      gap.avgScore,
      gap.deficit,
      gap.totalAssessments
    ]);
    triggerCsvDownload('competency_gaps_report.csv', headers, rows);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Reports &amp; Exports</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">Download spreadsheets, print program review slides, and monitor competency skill gaps.</p>
        </div>

        <button
          id="print-report-button"
          onClick={handlePrint}
          className="flex items-center gap-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold px-4 py-2.5 rounded-xl transition-all border border-zinc-200 dark:border-zinc-700"
        >
          <Printer className="w-4 h-4" />
          <span>Print Document (PDF)</span>
        </button>
      </div>

      {/* Select Report view switcher tabs */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800 gap-1">
        <button
          onClick={() => setActiveReportType('readiness')}
          className={`px-4 py-2.5 font-bold text-xs border-b-2 transition-all ${
            activeReportType === 'readiness'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-600'
          }`}
        >
          Placement Readiness Report
        </button>
        <button
          onClick={() => setActiveReportType('gaps')}
          className={`px-4 py-2.5 font-bold text-xs border-b-2 transition-all ${
            activeReportType === 'gaps'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-600'
          }`}
        >
          Competency Gaps Report
        </button>
        <button
          onClick={() => setActiveReportType('support')}
          className={`px-4 py-2.5 font-bold text-xs border-b-2 transition-all ${
            activeReportType === 'support'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-600'
          }`}
        >
          Support Cohort Audit
        </button>
      </div>

      {/* Report detail display container */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
        
        {/* Report subheader actions */}
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-900/60">
          <div>
            <h2 className="font-extrabold text-zinc-900 dark:text-zinc-100 text-sm">
              {activeReportType === 'readiness' && 'Client-Placement Interview Readiness Report'}
              {activeReportType === 'gaps' && 'Competency Skill Deficit Gap Analysis'}
              {activeReportType === 'support' && 'Support & Intervention Cohort Audit'}
            </h2>
            <p className="text-[10px] text-zinc-400 mt-1 uppercase font-bold tracking-wider">
              {activeReportType === 'readiness' && `Audit of ${readyList.length} Interview Ready resources.`}
              {activeReportType === 'gaps' && 'Summary of average scorecards across 5 technical categories.'}
              {activeReportType === 'support' && `Warning log capturing ${supportList.length} high-priority records.`}
            </p>
          </div>

          <button
            id="download-csv-button"
            onClick={
              activeReportType === 'readiness' ? handleDownloadReadinessCsv :
              activeReportType === 'gaps' ? handleDownloadCompetencyCsv :
              handleDownloadSupportCsv
            }
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold px-3.5 py-2 rounded-lg transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download CSV</span>
          </button>
        </div>

        {/* Dynamic preview lists */}
        <div className="p-6">
          
          {/* READINESS TAB */}
          {activeReportType === 'readiness' && (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-100 dark:border-zinc-800 text-zinc-400 font-bold uppercase text-[10px] tracking-wider">
                      <th className="pb-2">Resource</th>
                      <th className="pb-2">Email</th>
                      <th className="pb-2">Primary Competency</th>
                      <th className="pb-2 text-center">Avg Mock Score</th>
                      <th className="pb-2 text-center">Attendance Rate</th>
                      <th className="pb-2 text-right">Placement Stage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/40 text-zinc-700 dark:text-zinc-300">
                    {readyList.map(emp => (
                      <tr key={emp.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                        <td className="py-3 font-semibold text-zinc-900 dark:text-zinc-100">{emp.name}</td>
                        <td className="py-3 text-zinc-400">{emp.email}</td>
                        <td className="py-3 font-medium">{emp.skillGroup}</td>
                        <td className="py-3 text-center font-bold text-emerald-600">{emp.avgMockScore ? `${emp.avgMockScore} / 5` : 'No Mocks'}</td>
                        <td className="py-3 text-center font-medium">{emp.attendanceRate}%</td>
                        <td className="py-3 text-right">
                          <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[10px] rounded-full font-bold">READY FOR CLIENT</span>
                        </td>
                      </tr>
                    ))}
                    {readyList.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-zinc-400">No resources have been marked as Interview Ready. Navigate to the Dashboard or Directory to promote them.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* GAPS TAB */}
          {activeReportType === 'gaps' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {competencyGaps.map(gap => (
                  <div key={gap.topic} className="p-4 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 rounded-xl space-y-1">
                    <span className="text-[10px] text-zinc-400 block font-bold uppercase tracking-wider">{gap.topic}</span>
                    <span className="text-xl font-black text-indigo-600 block leading-tight">{gap.avgScore > 0 ? `${gap.avgScore}/5.0` : 'N/A'}</span>
                    <span className="text-[9px] text-zinc-500 block">Assessments: {gap.totalAssessments} sessions</span>
                    {gap.deficit > 0 && (
                      <span className="text-[9px] font-bold text-red-500 bg-red-50 dark:bg-red-950/20 px-1 py-0.5 rounded block mt-2 text-center">
                        Gap: -{gap.deficit} deficit
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-t border-zinc-100 dark:border-zinc-800/60 pt-4">
                  <thead>
                    <tr className="border-b border-zinc-100 dark:border-zinc-800 text-zinc-400 font-bold uppercase text-[10px] tracking-wider">
                      <th className="pb-2">Competency Topic</th>
                      <th className="pb-2">Program Average Score</th>
                      <th className="pb-2">Total Evaluations Completed</th>
                      <th className="pb-2 text-right">Deficit Priority</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/40 text-zinc-700 dark:text-zinc-300">
                    {competencyGaps.map(gap => (
                      <tr key={gap.topic} className="hover:bg-zinc-50/50">
                        <td className="py-3 font-semibold text-zinc-900 dark:text-zinc-100">{gap.topic}</td>
                        <td className="py-3 font-bold text-indigo-600">{gap.avgScore > 0 ? `${gap.avgScore} / 5` : 'No reviews completed'}</td>
                        <td className="py-3">{gap.totalAssessments} iterations</td>
                        <td className="py-3 text-right">
                          <span className={`px-2 py-0.5 text-[9px] font-extrabold rounded-full ${
                            gap.deficit > 2.0 ? 'bg-red-100 text-red-700' :
                            gap.deficit > 1.0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {gap.deficit > 2.0 ? 'CRITICAL DEFICIT' : gap.deficit > 1.0 ? 'MEDIUM SUPPORT' : 'SATISFACTORY'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SUPPORT TAB */}
          {activeReportType === 'support' && (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-100 dark:border-zinc-800 text-zinc-400 font-bold uppercase text-[10px] tracking-wider">
                      <th className="pb-2">Flagged Resource</th>
                      <th className="pb-2">Cohort Type</th>
                      <th className="pb-2 text-center">Avg Mock Score</th>
                      <th className="pb-2 text-center">Attendance Rate</th>
                      <th className="pb-2 text-right">Intervention Cause</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/40 text-zinc-700 dark:text-zinc-300">
                    {supportList.map(emp => {
                      const mockDeficit = emp.avgMockScore && emp.avgMockScore < 2.5;
                      const attDeficit = emp.attendanceRate && emp.attendanceRate < 75;
                      const flag = mockDeficit && attDeficit ? 'Critical (Both)' : mockDeficit ? 'Low Score (Average < 2.5)' : 'Low Attendance (< 75%)';

                      return (
                        <tr key={emp.id} className="hover:bg-red-50/10">
                          <td className="py-3 font-semibold text-zinc-950 dark:text-zinc-100">{emp.name}</td>
                          <td className="py-3">{emp.employeeType}</td>
                          <td className="py-3 text-center font-bold text-red-500">{emp.avgMockScore || 'N/A'}</td>
                          <td className="py-3 text-center font-bold text-amber-500">{emp.attendanceRate}%</td>
                          <td className="py-3 text-right">
                            <span className="bg-red-50 text-red-700 px-2 py-0.5 text-[9px] rounded font-bold border border-red-200 uppercase">{flag}</span>
                          </td>
                        </tr>
                      );
                    })}
                    {supportList.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-zinc-400">🎉 Congratulations! No resources are currently below performance thresholds.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
