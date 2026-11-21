import {
  CalendarCheck2,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  Filter,
  MapPin,
  RefreshCw,
  UserCheck,
  Users,
} from 'lucide-react';
import {useEffect, useMemo, useState} from 'react';
import {callRpc} from '../../services/apiClient';
import {exportReportToPdf, exportToCsv} from '../../services/pdfExports';
import type {AuthUser, DashboardAnalytics, DepartmentRecord, EmployeeRecord} from '../../types/hrms';
import {ChartCanvas} from '../common/ChartCanvas';

interface DashboardViewProps {
  user: AuthUser;
  onNavigate: (tab: string) => void;
}

export function DashboardView({user, onNavigate}: DashboardViewProps) {
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [filterDept, setFilterDept] = useState('');
  const [filterEmp, setFilterEmp] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'HR_ADMIN';

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [dashRes, empRes] = await Promise.all([
        callRpc<{ok: boolean; analytics: DashboardAnalytics}>(
          'getDashboardAnalytics',
          {date: filterDate, department: filterDept, employeeId: filterEmp},
          {cacheKey: `dashboard_${user.employeeId}_${filterDate}_${filterDept}`},
        ),
        callRpc<{ok: boolean; employees: EmployeeRecord[]; departments: DepartmentRecord[]}>(
          'getEmployees',
          {},
          {cacheKey: `employees_${user.employeeId}`},
        ),
      ]);
      setAnalytics(dashRes.analytics);
      setEmployees(empRes.employees || []);
      setDepartments(empRes.departments || []);
    } catch (err: any) {
      setError(err.message || 'Unable to load dashboard analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filterDate, filterDept, filterEmp]);

  const kpis = analytics?.kpis;

  const kpiCards = useMemo(() => {
    if (!kpis) return [];
    const cards = [
      {
        label: 'Total Employees',
        value: kpis.totalEmployees,
        sub: `${kpis.activeEmployees} Active`,
        nav: 'employees',
        icon: Users,
        topGradient: 'from-blue-600 to-cyan-500',
        iconBg: 'from-blue-600 to-indigo-700',
      },
      {
        label: 'Present Today',
        value: kpis.presentToday,
        sub: `${kpis.lateArrivalsToday} Late`,
        nav: 'attendance',
        icon: UserCheck,
        topGradient: 'from-emerald-600 to-teal-400',
        iconBg: 'from-emerald-600 to-teal-700',
      },
      {
        label: 'Absent & Leave',
        value: kpis.absentToday,
        sub: `${kpis.onLeaveToday} On Leave`,
        nav: 'leaves',
        icon: CalendarCheck2,
        topGradient: 'from-rose-600 to-amber-500',
        iconBg: 'from-rose-600 to-red-700',
      },
      ...(isAdmin
        ? [
            {
              label: 'Field Workforce',
              value: kpis.fieldEmployees,
              sub: `${kpis.sharingLocationLive} Live GPS`,
              nav: 'location',
              icon: MapPin,
              topGradient: 'from-cyan-600 to-blue-500',
              iconBg: 'from-cyan-600 to-sky-700',
            },
          ]
        : []),
      {
        label: 'Pending Approvals',
        value: kpis.pendingApprovals,
        sub: `${kpis.pendingLeaveRequests} Leaves`,
        nav: 'leaves',
        icon: ClipboardCheck,
        topGradient: 'from-amber-600 to-yellow-400',
        iconBg: 'from-amber-600 to-orange-700',
      },
    ];
    return cards;
  }, [kpis, isAdmin]);

  const handleExportCsv = () => {
    if (!analytics) return;
    exportToCsv(
      `IDEAL_HRMS_Dashboard_${filterDate}.csv`,
      ['Metric', 'Value'],
      [
        ['Date', filterDate],
        ['Department Filter', filterDept || 'All'],
        ['Total Employees', analytics.kpis.totalEmployees],
        ['Active Employees', analytics.kpis.activeEmployees],
        ['Present Today', analytics.kpis.presentToday],
        ['Absent Today', analytics.kpis.absentToday],
        ['On Leave Today', analytics.kpis.onLeaveToday],
        ['Late Arrivals Today', analytics.kpis.lateArrivalsToday],
        ['Field Employees', analytics.kpis.fieldEmployees],
        ['Sharing Location Live', analytics.kpis.sharingLocationLive],
        ['Pending Leave Requests', analytics.kpis.pendingLeaveRequests],
        ['Pending Approvals', analytics.kpis.pendingApprovals],
      ],
    );
  };

  const handleExportPdf = () => {
    if (!analytics) return;
    exportReportToPdf(
      'Organization Analytics Summary',
      `Date: ${filterDate} | Department: ${filterDept || 'All'}`,
      ['KPI Indicator', 'Live Count'],
      [
        ['Total Employees', analytics.kpis.totalEmployees],
        ['Active Employees', analytics.kpis.activeEmployees],
        ['Present Today', analytics.kpis.presentToday],
        ['Absent Today', analytics.kpis.absentToday],
        ['On Leave Today', analytics.kpis.onLeaveToday],
        ['Late Arrivals Today', analytics.kpis.lateArrivalsToday],
        ['Field Employees', analytics.kpis.fieldEmployees],
        ['Sharing Location Live', analytics.kpis.sharingLocationLive],
        ['Pending Leave Requests', analytics.kpis.pendingLeaveRequests],
        ['Total Pending Approvals', analytics.kpis.pendingApprovals],
      ],
      `IDEAL_HRMS_Dashboard_${filterDate}.pdf`,
    );
  };

  return (
    <div className="space-y-6">
      {/* Anodized Executive Banner & Filter Controls */}
      <div className="metallic-navy-panel overflow-hidden rounded-2xl text-white">
        <div className="h-1 w-full bg-gradient-to-r from-amber-400 via-sky-400 to-emerald-400" />
        <div className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold text-amber-300">
              IDEAL INDUSTRIAL SYNERGY SOLUTIONS PRIVATE LIMITED
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-white">
              {isAdmin ? 'Executive Operations Overview' : `Welcome, ${user.fullName}`}
            </h1>
            <p className="mt-1 text-xs text-sky-100/85">
              {user.employeeId} · {user.department || 'General'} · Live synchronized workforce metrics
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 backdrop-blur-xs">
              <Filter className="h-3.5 w-3.5 text-amber-300" />
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="bg-transparent font-mono text-xs text-white focus:outline-none [color-scheme:dark]"
              />
            </div>

            {isAdmin && (
              <>
                <select
                  value={filterDept}
                  onChange={(e) => setFilterDept(e.target.value)}
                  className="min-h-[36px] rounded-lg border border-white/20 bg-white/10 px-2.5 text-xs text-white focus:outline-none [&>option]:text-slate-900"
                >
                  <option value="">All Departments</option>
                  {departments.map((d) => (
                    <option key={d.departmentId} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>

                <select
                  value={filterEmp}
                  onChange={(e) => setFilterEmp(e.target.value)}
                  className="min-h-[36px] rounded-lg border border-white/20 bg-white/10 px-2.5 text-xs text-white focus:outline-none [&>option]:text-slate-900"
                >
                  <option value="">All Employees</option>
                  {employees.map((emp) => (
                    <option key={emp.employeeId} value={emp.employeeId}>
                      {emp.employeeId} — {emp.fullName}
                    </option>
                  ))}
                </select>
              </>
            )}

            <button
              type="button"
              onClick={loadData}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3 text-xs font-medium text-white hover:bg-white/20 whitespace-nowrap"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3 text-xs font-medium text-white hover:bg-white/20 whitespace-nowrap"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-300" />
              CSV
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              className="metallic-btn-gold inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              PDF
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
          {error}
        </div>
      )}

      {loading && !analytics ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="metallic-surface h-28 animate-pulse rounded-xl p-4" />
          ))}
        </div>
      ) : analytics ? (
        <>
          {/* Primary KPI Cards */}
          <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${isAdmin ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
            {kpiCards.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.label}
                  type="button"
                  onClick={() => onNavigate(card.nav)}
                  className="metallic-surface group overflow-hidden rounded-xl text-left transition-transform duration-150 hover:-translate-y-0.5"
                >
                  <div className={`h-1 w-full bg-gradient-to-r ${card.topGradient}`} />
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-600">{card.label}</span>
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${card.iconBg} text-white shadow-sm`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="mt-3 flex items-baseline justify-between gap-2">
                      <span className="font-mono text-2xl font-bold text-slate-900 tabular-nums">{card.value}</span>
                      <span className="text-xs font-medium text-slate-500 tabular-nums">{card.sub}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Brushed Platinum Metrics Strip */}
          <div
            className={`metallic-surface grid grid-cols-2 gap-3 rounded-xl p-4 sm:grid-cols-4 ${
              isAdmin ? 'lg:grid-cols-10' : 'lg:grid-cols-9'
            }`}
          >
            {[
              ['Total', analytics.kpis.totalEmployees, 'text-blue-700'],
              ['Active', analytics.kpis.activeEmployees, 'text-indigo-700'],
              ['Present', analytics.kpis.presentToday, 'text-emerald-700'],
              ['Absent', analytics.kpis.absentToday, 'text-rose-700'],
              ['On Leave', analytics.kpis.onLeaveToday, 'text-amber-700'],
              ['Late', analytics.kpis.lateArrivalsToday, 'text-orange-700'],
              ['Field Staff', analytics.kpis.fieldEmployees, 'text-cyan-700'],
              ...(isAdmin ? [['Live GPS', analytics.kpis.sharingLocationLive, 'text-teal-700']] : []),
              ['Leave Req.', analytics.kpis.pendingLeaveRequests, 'text-amber-700'],
              ['Approvals', analytics.kpis.pendingApprovals, 'text-slate-900'],
            ].map(([label, val, color]) => (
              <div key={String(label)} className="border-r border-slate-200/80 pr-2 last:border-r-0">
                <p className="text-[11px] font-medium text-slate-500">{label}</p>
                <p className={`mt-0.5 font-mono text-base font-bold tabular-nums ${color}`}>{val}</p>
              </div>
            ))}
          </div>

          {/* Vibrant Multi-Color Chart.js Analytics Grid */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="metallic-surface overflow-hidden rounded-xl">
              <div className="h-0.5 w-full bg-gradient-to-r from-blue-600 to-cyan-400" />
              <div className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-display text-sm font-semibold text-slate-900">Monthly Attendance Trends</h2>
                  <span className="text-xs text-slate-500">Present · Late · Leave</span>
                </div>
                <ChartCanvas
                  isEmpty={analytics.monthlyAttendanceTrends.length === 0}
                  emptyText="Attendance trends will populate automatically after employee check-ins."
                  config={{
                    type: 'line',
                    data: {
                      labels: analytics.monthlyAttendanceTrends.map((m) => m.label),
                      datasets: [
                        {
                          label: 'On-Time Present',
                          data: analytics.monthlyAttendanceTrends.map((m) => m.present),
                          borderColor: '#1D4ED8',
                          backgroundColor: 'rgba(29, 78, 216, 0.14)',
                          fill: true,
                          tension: 0.35,
                        },
                        {
                          label: 'Late Arrivals',
                          data: analytics.monthlyAttendanceTrends.map((m) => m.late),
                          borderColor: '#D97706',
                          backgroundColor: 'rgba(217, 119, 6, 0.10)',
                          fill: true,
                          tension: 0.35,
                        },
                        {
                          label: 'Approved Leave Days',
                          data: analytics.monthlyAttendanceTrends.map((m) => m.onLeave),
                          borderColor: '#0D9488',
                          tension: 0.35,
                        },
                      ],
                    },
                  }}
                />
              </div>
            </div>

            <div className="metallic-surface overflow-hidden rounded-xl">
              <div className="h-0.5 w-full bg-gradient-to-r from-indigo-600 to-amber-500" />
              <div className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-display text-sm font-semibold text-slate-900">Department Headcount Distribution</h2>
                  <span className="text-xs text-slate-500">Active Employees</span>
                </div>
                <ChartCanvas
                  isEmpty={analytics.departmentDistribution.length === 0}
                  emptyText="Department counts appear once employees are onboarded."
                  config={{
                    type: 'doughnut',
                    data: {
                      labels: analytics.departmentDistribution.map((d) => d.department),
                      datasets: [
                        {
                          data: analytics.departmentDistribution.map((d) => d.count),
                          backgroundColor: ['#1D4ED8', '#059669', '#D97706', '#4F46E5', '#0284C7', '#E11D48'],
                          borderColor: '#FFFFFF',
                          borderWidth: 2,
                        },
                      ],
                    },
                  }}
                />
              </div>
            </div>

            <div className="metallic-surface overflow-hidden rounded-xl">
              <div className="h-0.5 w-full bg-gradient-to-r from-emerald-600 to-teal-400" />
              <div className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-display text-sm font-semibold text-slate-900">
                    Daily Workforce Presence ({filterDate})
                  </h2>
                  <span className="text-xs text-slate-500">Present · Absent · Leave</span>
                </div>
                <ChartCanvas
                  isEmpty={analytics.kpis.activeEmployees === 0}
                  emptyText="Presence comparison appears once active employees exist."
                  config={{
                    type: 'bar',
                    data: {
                      labels: ['Present', 'Late', 'On Leave', 'Absent'],
                      datasets: [
                        {
                          label: 'Headcount',
                          data: [
                            Math.max(0, analytics.kpis.presentToday - analytics.kpis.lateArrivalsToday),
                            analytics.kpis.lateArrivalsToday,
                            analytics.kpis.onLeaveToday,
                            analytics.kpis.absentToday,
                          ],
                          backgroundColor: ['#059669', '#D97706', '#0284C7', '#E11D48'],
                          borderRadius: 6,
                        },
                      ],
                    },
                  }}
                />
              </div>
            </div>

            <div className="metallic-surface overflow-hidden rounded-xl">
              <div className="h-0.5 w-full bg-gradient-to-r from-cyan-600 to-indigo-500" />
              <div className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-display text-sm font-semibold text-slate-900">
                    Working Hours &amp; Overtime Analysis
                  </h2>
                  <span className="text-xs text-slate-500">Avg Hrs / Day</span>
                </div>
                <ChartCanvas
                  isEmpty={analytics.workingHoursTrend.length === 0}
                  emptyText="Working hours appear after check-out events are recorded."
                  config={{
                    type: 'bar',
                    data: {
                      labels: analytics.workingHoursTrend.map((w) => w.label),
                      datasets: [
                        {
                          label: 'Avg Working Hours',
                          data: analytics.workingHoursTrend.map((w) => w.avgHours),
                          backgroundColor: '#1D4ED8',
                          borderRadius: 5,
                        },
                        {
                          label: 'Total Overtime Hours',
                          data: analytics.workingHoursTrend.map((w) => w.overtimeHours),
                          backgroundColor: '#F59E0B',
                          borderRadius: 5,
                        },
                      ],
                    },
                  }}
                />
              </div>
            </div>

            <div className="metallic-surface overflow-hidden rounded-xl">
              <div className="h-0.5 w-full bg-gradient-to-r from-amber-500 to-rose-500" />
              <div className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-display text-sm font-semibold text-slate-900">Leave Statistics by Category</h2>
                  <span className="text-xs text-slate-500">Total Days Applied</span>
                </div>
                <ChartCanvas
                  isEmpty={analytics.leaveStatsByType.length === 0}
                  emptyText="No leave applications submitted yet."
                  config={{
                    type: 'bar',
                    data: {
                      labels: analytics.leaveStatsByType.map((l) => l.type),
                      datasets: [
                        {
                          label: 'Leave Days',
                          data: analytics.leaveStatsByType.map((l) => l.count),
                          backgroundColor: ['#4F46E5', '#0D9488', '#D97706', '#0284C7', '#E11D48', '#059669'],
                          borderRadius: 5,
                        },
                      ],
                    },
                  }}
                />
              </div>
            </div>

            <div className="metallic-surface overflow-hidden rounded-xl">
              <div className="h-0.5 w-full bg-gradient-to-r from-emerald-500 to-amber-500" />
              <div className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-display text-sm font-semibold text-slate-900">
                    Employee Punctuality Distribution
                  </h2>
                  <span className="text-xs text-slate-500">On-Time · Late · Half Day</span>
                </div>
                <ChartCanvas
                  isEmpty={
                    analytics.punctualityBreakdown.onTime +
                      analytics.punctualityBreakdown.late +
                      analytics.punctualityBreakdown.earlyDeparture ===
                    0
                  }
                  emptyText="Punctuality metrics populate from attendance logs."
                  config={{
                    type: 'doughnut',
                    data: {
                      labels: ['On-Time', 'Late Arrival', 'Half Day / Early Out'],
                      datasets: [
                        {
                          data: [
                            analytics.punctualityBreakdown.onTime,
                            analytics.punctualityBreakdown.late,
                            analytics.punctualityBreakdown.earlyDeparture,
                          ],
                          backgroundColor: ['#059669', '#F59E0B', '#E11D48'],
                          borderColor: '#FFFFFF',
                          borderWidth: 2,
                        },
                      ],
                    },
                  }}
                />
              </div>
            </div>

            <div className="metallic-surface overflow-hidden rounded-xl">
              <div className="h-0.5 w-full bg-gradient-to-r from-blue-700 to-emerald-500" />
              <div className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-display text-sm font-semibold text-slate-900">Payroll Expenditure (INR)</h2>
                  <span className="text-xs text-slate-500">Gross vs Net Payable</span>
                </div>
                <ChartCanvas
                  isEmpty={analytics.payrollExpenditure.length === 0}
                  emptyText="Payroll expenditure charts appear after monthly payroll generation."
                  config={{
                    type: 'bar',
                    data: {
                      labels: analytics.payrollExpenditure.map((p) => p.month),
                      datasets: [
                        {
                          label: 'Gross Earnings',
                          data: analytics.payrollExpenditure.map((p) => p.gross),
                          backgroundColor: '#1D4ED8',
                          borderRadius: 5,
                        },
                        {
                          label: 'Net Payable',
                          data: analytics.payrollExpenditure.map((p) => p.net),
                          backgroundColor: '#059669',
                          borderRadius: 5,
                        },
                      ],
                    },
                  }}
                />
              </div>
            </div>

            <div className="metallic-surface overflow-hidden rounded-xl">
              <div className="h-0.5 w-full bg-gradient-to-r from-indigo-600 to-sky-400" />
              <div className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-display text-sm font-semibold text-slate-900">
                    Department Productivity &amp; Task Progress
                  </h2>
                  <span className="text-xs text-slate-500">Avg Completion %</span>
                </div>
                <ChartCanvas
                  isEmpty={analytics.departmentProductivity.length === 0 && analytics.performanceRatings.length === 0}
                  emptyText="Assign tasks or complete performance reviews to view productivity metrics."
                  config={{
                    type: 'bar',
                    data: {
                      labels:
                        analytics.departmentProductivity.length > 0
                          ? analytics.departmentProductivity.map((d) => d.department)
                          : analytics.performanceRatings.map((r) => r.label),
                      datasets: [
                        {
                          label:
                            analytics.departmentProductivity.length > 0
                              ? 'Task Progress %'
                              : 'Performance Rating (out of 5)',
                          data:
                            analytics.departmentProductivity.length > 0
                              ? analytics.departmentProductivity.map((d) => d.completionRate)
                              : analytics.performanceRatings.map((r) => r.avgRating),
                          backgroundColor: '#4F46E5',
                          borderRadius: 5,
                        },
                      ],
                    },
                  }}
                />
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
