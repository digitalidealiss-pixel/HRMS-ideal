import {Download, FileSpreadsheet} from 'lucide-react';
import {useState} from 'react';
import {callRpc} from '../../services/apiClient';
import {exportReportToPdf, exportToCsv} from '../../services/pdfExports';
import type {AuthUser} from '../../types/hrms';

interface ReportsViewProps {
  user: AuthUser;
  onToast: (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;
}

const REPORT_CATALOG = [
  {id: 'directory', title: 'Employee Directory', desc: 'Complete active & inactive staff roster with IDs and departments.'},
  {id: 'daily_att', title: 'Daily Attendance Report', desc: 'Check-in, check-out, working hours, and punctuality for selected date.'},
  {id: 'monthly_att', title: 'Monthly Attendance Summary', desc: 'Aggregated monthly attendance logs and overtime hours.'},
  {id: 'gps_att', title: 'GPS Attendance Coordinates', desc: 'Latitude, longitude, accuracy, and verification status for check-ins.'},
  {id: 'field_loc', title: 'Field Location History', desc: 'Chronological movement trail recorded during field operations.'},
  {id: 'leaves', title: 'Leave Applications & Balances', desc: 'All leave requests, approval status, and remaining balances.'},
  {id: 'payroll', title: 'Monthly Payroll Register', desc: 'Gross earnings, PF, ESI, PT, TDS, LWP deductions, and net payable.'},
  {id: 'performance', title: 'Performance Reviews Report', desc: 'Appraisal scores, manager ratings, and self-assessments.'},
  {id: 'departments', title: 'Department Headcount Report', desc: 'Active workforce distribution across company departments.'},
  {id: 'tasks', title: 'Tasks & Targets Report', desc: 'Assigned deliverables, progress percentages, and deadlines.'},
];

export function ReportsView({user, onToast}: ReportsViewProps) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [runningId, setRunningId] = useState('');

  const runExport = async (reportId: string, format: 'CSV' | 'PDF') => {
    setRunningId(reportId);
    try {
      let title = '';
      let headers: string[] = [];
      let rows: (string | number)[][] = [];

      if (reportId === 'directory' || reportId === 'departments') {
        const res = await callRpc<any>('getEmployees');
        if (reportId === 'directory') {
          title = 'Employee Directory';
          headers = ['Employee ID', 'Name', 'Department', 'Designation', 'Official Email', 'Mobile', 'Status'];
          rows = (res.employees || []).map((e: any) => [
            e.employeeId,
            e.fullName,
            e.department,
            e.designation,
            e.officialEmail,
            e.mobile,
            e.status,
          ]);
        } else {
          title = 'Department Headcount Report';
          headers = ['Department', 'Code', 'Active Employees'];
          const emps = res.employees || [];
          rows = (res.departments || []).map((d: any) => [
            d.name,
            d.code,
            emps.filter((e: any) => e.department === d.name && e.status === 'ACTIVE').length,
          ]);
        }
      } else if (reportId === 'daily_att' || reportId === 'monthly_att' || reportId === 'gps_att') {
        const res = await callRpc<any>('getAttendance', {month});
        let recs = res.records || [];
        if (reportId === 'daily_att') {
          recs = recs.filter((r: any) => r.date === date);
          title = `Daily Attendance (${date})`;
          headers = ['Employee ID', 'Name', 'Date', 'Check In', 'Check Out', 'Hours', 'Overtime (h)', 'Status'];
          rows = recs.map((r: any) => [
            r.employeeId,
            r.employeeName,
            r.date,
            r.checkInTime.slice(11, 19),
            r.checkOutTime ? r.checkOutTime.slice(11, 19) : 'Missing',
            r.workingHours,
            r.overtimeHours ?? 0,
            r.status,
          ]);
        } else if (reportId === 'monthly_att') {
          title = `Monthly Attendance (${month})`;
          headers = ['Employee ID', 'Name', 'Department', 'Date', 'Hours', 'Overtime', 'Status'];
          rows = recs.map((r: any) => [
            r.employeeId,
            r.employeeName,
            r.department,
            r.date,
            r.workingHours,
            r.overtimeHours,
            r.status,
          ]);
        } else {
          title = `GPS Attendance Coordinates (${month})`;
          headers = ['Employee ID', 'Name', 'Date', 'In Lat/Lng', 'Accuracy (m)', 'Out Lat/Lng', 'Verification'];
          rows = recs.map((r: any) => [
            r.employeeId,
            r.employeeName,
            r.date,
            r.checkInLat ? `${r.checkInLat}, ${r.checkInLng}` : 'N/A',
            r.checkInAccuracy ?? '—',
            r.checkOutLat ? `${r.checkOutLat}, ${r.checkOutLng}` : 'N/A',
            r.verificationStatus,
          ]);
        }
      } else if (reportId === 'field_loc') {
        const res = await callRpc<any>('getLocationHistory', {date});
        title = `Field Location History (${date})`;
        headers = ['Timestamp', 'Employee ID', 'Name', 'Mode', 'Latitude', 'Longitude', 'Accuracy', 'Step (m)', 'Address', 'Maps URL', 'Source'];
        rows = (res.history || []).map((h: any) => [
          h.timestamp,
          h.employeeId,
          h.employeeName,
          h.attendanceType || 'FIELD',
          h.latitude,
          h.longitude,
          h.accuracy,
          h.distanceFromPrevMeters ?? 0,
          h.address || '',
          h.mapsUrl || '',
          h.source,
        ]);
      } else if (reportId === 'leaves') {
        const res = await callRpc<any>('getLeaveData');
        title = 'Leave Applications Report';
        headers = ['Leave ID', 'Employee', 'Type', 'From', 'To', 'Days', 'Status'];
        rows = (res.applications || []).map((l: any) => [
          l.leaveId,
          `${l.employeeName} (${l.employeeId})`,
          l.leaveTypeName,
          l.startDate,
          l.endDate,
          l.totalDays,
          l.status,
        ]);
      } else if (reportId === 'payroll') {
        const res = await callRpc<any>('getPayrollData', {month});
        title = `Payroll Register (${month})`;
        headers = ['Employee', 'Present', 'LWP', 'Gross (INR)', 'Deductions', 'Net Payable', 'Status'];
        rows = (res.payrolls || []).map((p: any) => [
          `${p.employeeName} (${p.employeeId})`,
          p.presentDays,
          p.unpaidLeaveDays,
          p.grossEarnings,
          p.totalDeductions,
          p.netPayable,
          p.status,
        ]);
      } else if (reportId === 'performance') {
        const res = await callRpc<any>('getPerformanceData');
        title = 'Performance Reviews Report';
        headers = ['Employee', 'Cycle', 'Period', 'Self Score', 'Manager Rating', 'Status'];
        rows = (res.reviews || []).map((r: any) => [
          `${r.employeeName} (${r.employeeId})`,
          r.cycleType,
          r.periodLabel,
          r.selfAssessmentScore,
          r.managerRating,
          r.status,
        ]);
      } else if (reportId === 'tasks') {
        const res = await callRpc<any>('getTasks');
        title = 'Tasks & Targets Report';
        headers = ['Task ID', 'Title', 'Assigned To', 'Priority', 'Deadline', 'Progress %', 'Status'];
        rows = (res.tasks || []).map((t: any) => [
          t.taskId,
          t.title,
          `${t.assignedToName} (${t.assignedToId})`,
          t.priority,
          t.deadline,
          t.progressPercent,
          t.status,
        ]);
      }

      if (format === 'CSV') {
        exportToCsv(`IDEAL_HRMS_${reportId}_${month}.csv`, headers, rows);
      } else {
        exportReportToPdf(title, `Generated by ${user.fullName}`, headers, rows, `IDEAL_HRMS_${reportId}_${month}.pdf`);
      }
      onToast('success', `${title} exported (${format})`);
    } catch (err: any) {
      onToast('error', 'Report generation failed', err.message);
    } finally {
      setRunningId('');
    }
  };

  return (
    <div className="space-y-5">
      <div className="metallic-navy-panel overflow-hidden rounded-2xl text-white">
        <div className="h-1 w-full bg-gradient-to-r from-emerald-400 via-sky-400 to-amber-400" />
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-xl font-semibold text-white">Reports &amp; Exports Center</h1>
            <p className="mt-0.5 text-xs text-sky-100/85">
              Excel-compatible CSV (UTF-8 BOM) &amp; formatted PDF reports pulled live from the database
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 font-mono text-xs text-white [color-scheme:dark]"
            />
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 font-mono text-xs text-white [color-scheme:dark]"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {REPORT_CATALOG.map((rep, idx) => {
          const accents = [
            'from-blue-600 to-cyan-400',
            'from-emerald-600 to-teal-400',
            'from-indigo-600 to-blue-400',
            'from-amber-500 to-yellow-400',
            'from-rose-600 to-amber-500',
          ];
          return (
            <div key={rep.id} className="metallic-surface overflow-hidden rounded-xl">
              <div className={`h-1 w-full bg-gradient-to-r ${accents[idx % accents.length]}`} />
              <div className="flex items-center justify-between gap-4 p-5">
                <div>
                  <h3 className="font-display text-sm font-semibold text-slate-900">{rep.title}</h3>
                  <p className="mt-1 text-xs text-slate-500">{rep.desc}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={runningId === rep.id}
                    onClick={() => runExport(rep.id, 'CSV')}
                    className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
                    CSV
                  </button>
                  <button
                    type="button"
                    disabled={runningId === rep.id}
                    onClick={() => runExport(rep.id, 'PDF')}
                    className="metallic-btn-primary inline-flex min-h-[38px] items-center gap-1 rounded-lg px-3 text-xs font-semibold"
                  >
                    <Download className="h-3.5 w-3.5" />
                    PDF
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
