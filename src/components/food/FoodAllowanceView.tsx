import {
  CheckCircle2,
  Clock,
  Coffee,
  Download,
  FileSpreadsheet,
  IndianRupee,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
  UtensilsCrossed,
  XCircle,
} from 'lucide-react';
import {useEffect, useMemo, useState} from 'react';
import {callRpc} from '../../services/apiClient';
import {exportReportToPdf, exportToCsv} from '../../services/pdfExports';
import type {
  AuthUser,
  EmployeeRecord,
  FoodAllowancePolicy,
  FoodAllowanceRecord,
  FoodAllowanceStatus,
  FoodDutyEligibility,
  FoodMealType,
} from '../../types/hrms';

interface FoodAllowanceViewProps {
  user: AuthUser;
  onToast: (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;
}

function getStatusTextClass(status: FoodAllowanceStatus): string {
  switch (status) {
    case 'PAID':
      return 'text-emerald-700';
    case 'APPROVED':
      return 'text-blue-700';
    case 'SUBMITTED':
      return 'text-amber-700';
    case 'REJECTED':
      return 'text-rose-700';
    default:
      return 'text-slate-700';
  }
}

function formatTimeShort(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(11, 19) || iso;
  return d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
}

export function FoodAllowanceView({user, onToast}: FoodAllowanceViewProps) {
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'HR_ADMIN';

  const [claims, setClaims] = useState<FoodAllowanceRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [policy, setPolicy] = useState<FoodAllowancePolicy>({
    enabled: true,
    breakfast: 70,
    lunch: 90,
    dinner: 90,
  });
  const [todayShift, setTodayShift] = useState<FoodDutyEligibility>({
    eligible: false,
    reason: 'Checking active Attendance working hours...',
    date: new Date().toISOString().slice(0, 10),
    attendanceId: '',
    checkInTime: '',
    checkOutTime: '',
    attendanceStatus: 'NOT_CHECKED_IN',
  });
  const [loading, setLoading] = useState(true);
  const [busyMeal, setBusyMeal] = useState<FoodMealType | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string>('');
  const [notes, setNotes] = useState('');

  // Filters & modals
  const [monthFilter, setMonthFilter] = useState<string>(new Date().toISOString().slice(0, 7));
  const [mealFilter, setMealFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [employeeFilter, setEmployeeFilter] = useState<string>('');
  const [rejectModalClaim, setRejectModalClaim] = useState<FoodAllowanceRecord | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [foodRes, empRes] = await Promise.all([
        callRpc<{
          ok: boolean;
          claims: FoodAllowanceRecord[];
          policy: FoodAllowancePolicy;
          todayShift: FoodDutyEligibility;
        }>('getFoodAllowances', {
          month: monthFilter || undefined,
          mealType: mealFilter,
          status: statusFilter,
          employeeId: isAdmin && employeeFilter ? employeeFilter : undefined,
        }),
        isAdmin
          ? callRpc<{ok: boolean; employees: EmployeeRecord[]}>('getEmployees')
          : Promise.resolve({ok: true, employees: [] as EmployeeRecord[]}),
      ]);
      setClaims(foodRes.claims || []);
      if (foodRes.policy) setPolicy(foodRes.policy);
      if (foodRes.todayShift) setTodayShift(foodRes.todayShift);
      if (isAdmin) setEmployees(empRes.employees || []);
    } catch (err: any) {
      onToast('error', 'Failed to load food allowances', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [monthFilter, mealFilter, statusFilter, employeeFilter]);

  useEffect(() => {
    const onAttUpdated = () => loadData();
    window.addEventListener('ideal-attendance-updated', onAttUpdated);
    return () => window.removeEventListener('ideal-attendance-updated', onAttUpdated);
  }, []);

  const myTodayClaims = useMemo(() => {
    const activeDate = todayShift.date || new Date().toISOString().slice(0, 10);
    return claims.filter((c) => c.employeeId === user.employeeId && c.date === activeDate);
  }, [claims, user.employeeId, todayShift.date]);

  const myTodayTotalClaimed = useMemo(
    () =>
      myTodayClaims
        .filter((c) => c.status !== 'REJECTED')
        .reduce((sum, c) => sum + Number(c.amount || 0), 0),
    [myTodayClaims],
  );

  const metrics = useMemo(() => {
    let submitted = 0;
    let approved = 0;
    let paid = 0;
    for (const c of claims) {
      const amt = Number(c.amount || 0);
      if (c.status === 'SUBMITTED') submitted += amt;
      else if (c.status === 'APPROVED') approved += amt;
      else if (c.status === 'PAID') paid += amt;
    }
    return {
      totalCount: claims.length,
      submitted: Math.round(submitted * 100) / 100,
      approved: Math.round(approved * 100) / 100,
      paid: Math.round(paid * 100) / 100,
    };
  }, [claims]);

  const handleClaimMeal = async (mealType: FoodMealType) => {
    if (!policy.enabled) {
      onToast('warning', 'Food Allowance Disabled', 'Super Admin has disabled food allowance claims in Settings.');
      return;
    }
    if (!todayShift.eligible) {
      onToast('warning', 'Working Hours Required', todayShift.reason);
      return;
    }
    setBusyMeal(mealType);
    try {
      const res = await callRpc<{
        ok: boolean;
        claim: FoodAllowanceRecord;
        policy: FoodAllowancePolicy;
        todayShift: FoodDutyEligibility;
      }>('claimFoodAllowance', {
        mealType,
        notes: notes.trim(),
      });
      setNotes('');
      if (res.todayShift) setTodayShift(res.todayShift);
      onToast(
        'success',
        `${mealType.charAt(0) + mealType.slice(1).toLowerCase()} Claim Submitted`,
        `₹${res.claim.amount} recorded for active duty on ${res.claim.date} (${res.claim.claimId}).`,
      );
      await loadData();
    } catch (err: any) {
      onToast('error', 'Food Claim Blocked', err.message);
    } finally {
      setBusyMeal(null);
    }
  };

  const handleAdminDecision = async (
    claim: FoodAllowanceRecord,
    decision: 'APPROVED' | 'REJECTED' | 'PAID',
    rejectionReason?: string,
  ) => {
    setActionBusyId(claim.claimId);
    try {
      await callRpc('reviewFoodAllowance', {
        claimId: claim.claimId,
        decision,
        rejectionReason,
      });
      onToast(
        'success',
        `Food Claim ${decision}`,
        `${claim.employeeName} · ${claim.mealType} ₹${claim.amount} (${claim.claimId})`,
      );
      setRejectModalClaim(null);
      setRejectReason('');
      await loadData();
    } catch (err: any) {
      onToast('error', 'Review Action Failed', err.message);
    } finally {
      setActionBusyId('');
    }
  };

  const handleExportCsv = () => {
    exportToCsv(
      `IDEAL_Food_Allowances_${monthFilter || 'ALL'}.csv`,
      [
        'Claim_ID',
        'Date',
        'Employee_ID',
        'Employee_Name',
        'Department',
        'Meal_Type',
        'Amount_INR',
        'Duty_CheckIn',
        'Duty_CheckOut',
        'Claimed_At',
        'Notes',
        'Status',
        'Reviewed_By',
      ],
      claims.map((c) => [
        c.claimId,
        c.date,
        c.employeeId,
        c.employeeName,
        c.department,
        c.mealType,
        c.amount,
        c.checkInTime,
        c.checkOutTime || 'ACTIVE_DUTY',
        c.claimedAt,
        c.notes || '',
        c.status,
        c.reviewedBy || '',
      ]),
    );
  };

  const handleExportPdf = () => {
    exportReportToPdf(
      `Food Allowance Register (${monthFilter || 'All Months'})`,
      `Daily Caps: Breakfast INR ${policy.breakfast} · Lunch INR ${policy.lunch} · Dinner INR ${policy.dinner} (Working Hours Only)`,
      ['Claim ID', 'Date', 'Employee', 'Meal', 'Amount', 'Duty Window', 'Status'],
      claims.map((c) => [
        c.claimId,
        c.date,
        `${c.employeeName} (${c.employeeId})`,
        c.mealType,
        `INR ${Number(c.amount || 0).toFixed(2)}`,
        `${formatTimeShort(c.checkInTime)} – ${c.checkOutTime ? formatTimeShort(c.checkOutTime) : 'Active'}`,
        c.status,
      ]),
      `IDEAL_Food_Allowances_${monthFilter || 'ALL'}.pdf`,
    );
  };

  const mealOptions: Array<{
    type: FoodMealType;
    label: string;
    amount: number;
    icon: typeof Coffee;
    windowHint: string;
  }> = [
    {
      type: 'BREAKFAST',
      label: 'Breakfast Allowance',
      amount: policy.breakfast,
      icon: Coffee,
      windowHint: 'Morning duty meal · Fixed cap per working day',
    },
    {
      type: 'LUNCH',
      label: 'Lunch Allowance',
      amount: policy.lunch,
      icon: Sun,
      windowHint: 'Mid-day duty meal · Fixed cap per working day',
    },
    {
      type: 'DINNER',
      label: 'Dinner Allowance',
      amount: policy.dinner,
      icon: Moon,
      windowHint: 'Evening / late duty meal · Fixed cap per working day',
    },
  ];

  const maxDailyCap = policy.breakfast + policy.lunch + policy.dinner;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="metallic-surface rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0B1B36] text-amber-300 shadow-xs">
              <UtensilsCrossed className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold text-slate-900">
                Employee Food Allowance (Working Hours Only)
              </h1>
              <p className="mt-0.5 text-xs text-slate-600">
                Fixed meal reimbursement for every employee during verified Attendance working hours · Breakfast ₹
                <span className="font-mono tabular-nums">{policy.breakfast}</span> · Lunch ₹
                <span className="font-mono tabular-nums">{policy.lunch}</span> · Dinner ₹
                <span className="font-mono tabular-nums">{policy.dinner}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={loadData}
              className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
              CSV
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              className="metallic-btn-primary inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg px-3.5 py-2 text-xs font-semibold"
            >
              <Download className="h-3.5 w-3.5" />
              PDF Report
            </button>
          </div>
        </div>
      </div>

      {/* Live Working-Hours Guard Banner + Meal Claim Console */}
      <div className="metallic-surface rounded-2xl p-5 space-y-4">
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs ${
            !policy.enabled
              ? 'border-slate-300 bg-slate-100 text-slate-700'
              : todayShift.eligible
                ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                : 'border-amber-200 bg-amber-50 text-amber-950'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {todayShift.eligible && policy.enabled ? (
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            ) : (
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            )}
            <div>
              <div className="font-semibold">
                {!policy.enabled
                  ? 'Food Allowance Policy Disabled'
                  : todayShift.eligible
                    ? 'Active Working Hours Verified — Eligible to Claim Meals'
                    : 'Outside Active Working Hours — Meal Claims Locked'}
              </div>
              <div className="mt-0.5 text-[11px] opacity-90">
                {policy.enabled ? todayShift.reason : 'Super Admin has paused food allowance submissions in Settings.'}
              </div>
            </div>
          </div>
          <div className="font-mono text-[11px] tabular-nums text-right">
            <div>
              Duty Date: <strong>{todayShift.date}</strong> · Status: <strong>{todayShift.attendanceStatus}</strong>
            </div>
            <div>
              In: <strong>{formatTimeShort(todayShift.checkInTime)}</strong> · Out:{' '}
              <strong>{todayShift.checkOutTime ? formatTimeShort(todayShift.checkOutTime) : 'On Duty'}</strong>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-[240px] flex-1">
            <label className="block text-xs font-semibold text-slate-700">
              Optional Meal / Duty Remark (e.g. Site duty, client visit, canteen receipt ref)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={140}
              disabled={!todayShift.eligible || !policy.enabled}
              placeholder="Optional remark recorded with your meal claim..."
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 disabled:bg-slate-100"
            />
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-right text-xs">
            <div className="text-[11px] text-slate-500">Today Claimed / Daily Cap</div>
            <div className="font-mono text-sm font-bold text-slate-900 tabular-nums">
              ₹{myTodayTotalClaimed.toFixed(0)} / ₹{maxDailyCap.toFixed(0)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {mealOptions.map((meal) => {
            const Icon = meal.icon;
            const todayClaim = myTodayClaims.find(
              (c) => c.mealType === meal.type && c.status !== 'REJECTED',
            );
            const rejectedToday = !todayClaim
              ? myTodayClaims.find((c) => c.mealType === meal.type && c.status === 'REJECTED')
              : undefined;
            const canClaim = policy.enabled && todayShift.eligible && !todayClaim && busyMeal === null;

            return (
              <div
                key={meal.type}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-2xs"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[#0B1B36]">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="font-display text-sm font-bold text-slate-900">{meal.label}</h3>
                        <p className="text-[11px] text-slate-500">{meal.windowHint}</p>
                      </div>
                    </div>
                    <div className="font-mono text-lg font-bold text-[#0B1B36] tabular-nums">
                      ₹{meal.amount}
                    </div>
                  </div>

                  <div className="mt-3 text-xs">
                    {todayClaim ? (
                      <div className="text-emerald-800">
                        <span className="font-semibold">Claimed Today</span> ·{' '}
                        <span className={`font-semibold ${getStatusTextClass(todayClaim.status)}`}>
                          {todayClaim.status}
                        </span>{' '}
                        · <span className="font-mono tabular-nums">{todayClaim.claimId}</span>
                        <div className="mt-0.5 text-[11px] text-slate-500 font-mono tabular-nums">
                          Submitted at {formatTimeShort(todayClaim.claimedAt)}
                        </div>
                      </div>
                    ) : rejectedToday ? (
                      <div className="text-rose-700 text-[11px]">
                        Previous claim ({rejectedToday.claimId}) was rejected
                        {rejectedToday.rejectionReason ? `: ${rejectedToday.rejectionReason}` : ''}. You may submit a valid duty claim.
                      </div>
                    ) : (
                      <div className="text-slate-600 text-[11px]">
                        {todayShift.eligible
                          ? 'Available once per working day while checked in.'
                          : 'Locked until Attendance Check-In is active.'}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!canClaim}
                  onClick={() => handleClaimMeal(meal.type)}
                  className={`mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                    canClaim
                      ? 'metallic-btn-emerald'
                      : 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-500'
                  }`}
                >
                  <IndianRupee className="h-3.5 w-3.5" />
                  {todayClaim
                    ? `Claimed (₹${todayClaim.amount})`
                    : busyMeal === meal.type
                      ? 'Submitting Claim...'
                      : `Claim ${meal.label.split(' ')[0]} · ₹${meal.amount}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary KPI Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="metallic-surface rounded-xl p-4">
          <div className="text-[11px] font-medium text-slate-500">Claims Listed</div>
          <div className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">{metrics.totalCount}</div>
        </div>
        <div className="metallic-surface rounded-xl p-4">
          <div className="text-[11px] font-medium text-slate-500">Pending Review</div>
          <div className="mt-1 font-mono text-xl font-bold text-amber-700 tabular-nums">
            ₹{metrics.submitted.toLocaleString('en-IN', {maximumFractionDigits: 2})}
          </div>
        </div>
        <div className="metallic-surface rounded-xl p-4">
          <div className="text-[11px] font-medium text-slate-500">Approved (Payable)</div>
          <div className="mt-1 font-mono text-xl font-bold text-blue-700 tabular-nums">
            ₹{metrics.approved.toLocaleString('en-IN', {maximumFractionDigits: 2})}
          </div>
        </div>
        <div className="metallic-surface rounded-xl p-4">
          <div className="text-[11px] font-medium text-slate-500">Paid Reimbursements</div>
          <div className="mt-1 font-mono text-xl font-bold text-emerald-700 tabular-nums">
            ₹{metrics.paid.toLocaleString('en-IN', {maximumFractionDigits: 2})}
          </div>
        </div>
      </div>

      {/* Food Allowance Register Table */}
      <div className="metallic-surface rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900">
              {isAdmin ? 'Organization Food Allowance Register' : 'My Food Allowance Claims'}
            </h2>
            <p className="text-[11px] text-slate-500">
              Every record is tied to a verified employee Attendance working-hours window (Check-In to Check-Out).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono"
            />
            <select
              value={mealFilter}
              onChange={(e) => setMealFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
            >
              <option value="ALL">All Meals</option>
              <option value="BREAKFAST">Breakfast (₹{policy.breakfast})</option>
              <option value="LUNCH">Lunch (₹{policy.lunch})</option>
              <option value="DINNER">Dinner (₹{policy.dinner})</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
            >
              <option value="ALL">All Statuses</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="PAID">Paid</option>
            </select>
            {isAdmin && (
              <select
                value={employeeFilter}
                onChange={(e) => setEmployeeFilter(e.target.value)}
                className="max-w-[200px] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
              >
                <option value="">All Employees</option>
                {employees.map((emp) => (
                  <option key={emp.employeeId} value={emp.employeeId}>
                    {emp.employeeId} — {emp.fullName}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="py-2.5 pr-3">Claim / Date</th>
                <th className="py-2.5 pr-3">Employee</th>
                <th className="py-2.5 pr-3">Meal</th>
                <th className="py-2.5 pr-3">Working Hours Window</th>
                <th className="py-2.5 pr-3 text-right">Amount</th>
                <th className="py-2.5 pr-3">Status</th>
                {isAdmin && <th className="py-2.5 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {claims.map((c) => {
                const isRowBusy = actionBusyId === c.claimId;
                return (
                  <tr key={c.claimId} className="hover:bg-slate-50/70">
                    <td className="py-3 pr-3 align-top">
                      <div className="font-mono font-semibold text-slate-900">{c.claimId}</div>
                      <div className="font-mono text-[11px] text-slate-500 tabular-nums">{c.date}</div>
                    </td>
                    <td className="py-3 pr-3 align-top">
                      <div className="font-semibold text-slate-900">{c.employeeName}</div>
                      <div className="text-[11px] text-slate-500">
                        <span className="font-mono">{c.employeeId}</span> · {c.department}
                      </div>
                    </td>
                    <td className="py-3 pr-3 align-top">
                      <div className="font-semibold text-slate-900">{c.mealType}</div>
                      <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                        Claimed {formatTimeShort(c.claimedAt)}
                      </div>
                      {c.notes && <div className="mt-0.5 text-[11px] text-slate-600">{c.notes}</div>}
                    </td>
                    <td className="py-3 pr-3 align-top font-mono text-[11px] text-slate-700 tabular-nums">
                      <div>In: {formatTimeShort(c.checkInTime)}</div>
                      <div>Out: {c.checkOutTime ? formatTimeShort(c.checkOutTime) : 'Active Shift'}</div>
                    </td>
                    <td className="py-3 pr-3 align-top text-right font-mono text-sm font-bold text-[#0B1B36] tabular-nums">
                      ₹{Number(c.amount || 0).toFixed(2)}
                    </td>
                    <td className="py-3 pr-3 align-top">
                      <div className={`font-semibold ${getStatusTextClass(c.status)}`}>{c.status}</div>
                      {c.reviewedBy && (
                        <div className="text-[11px] text-slate-500">by {c.reviewedBy}</div>
                      )}
                      {c.rejectionReason && (
                        <div className="mt-0.5 text-[11px] text-rose-700">{c.rejectionReason}</div>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="py-3 align-top text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {c.status === 'SUBMITTED' && (
                            <>
                              <button
                                type="button"
                                disabled={isRowBusy}
                                onClick={() => handleAdminDecision(c, 'APPROVED')}
                                className="inline-flex min-h-[32px] items-center gap-1 whitespace-nowrap shrink-0 rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={isRowBusy}
                                onClick={() => {
                                  setRejectModalClaim(c);
                                  setRejectReason('');
                                }}
                                className="inline-flex min-h-[32px] items-center gap-1 whitespace-nowrap shrink-0 rounded-md border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Reject
                              </button>
                            </>
                          )}
                          {c.status === 'APPROVED' && (
                            <button
                              type="button"
                              disabled={isRowBusy}
                              onClick={() => handleAdminDecision(c, 'PAID')}
                              className="inline-flex min-h-[32px] items-center gap-1 whitespace-nowrap shrink-0 rounded-md bg-[#0B1B36] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                            >
                              <IndianRupee className="h-3.5 w-3.5" />
                              Mark Paid
                            </button>
                          )}
                          {(c.status === 'PAID' || c.status === 'REJECTED') && (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {!claims.length && (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="py-8 text-center text-xs text-slate-500">
                    {loading ? 'Loading food allowance claims...' : 'No food allowance claims found for selected filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reject Reason Modal */}
      {rejectModalClaim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl space-y-4">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">
                Reject Food Allowance ({rejectModalClaim.claimId})
              </h3>
              <p className="mt-1 text-xs text-slate-600">
                {rejectModalClaim.employeeName} · {rejectModalClaim.mealType} ₹{rejectModalClaim.amount} on{' '}
                {rejectModalClaim.date}
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Rejection Reason *</label>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="State reason for declining this meal claim..."
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectModalClaim(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionBusyId === rejectModalClaim.claimId}
                onClick={() =>
                  handleAdminDecision(
                    rejectModalClaim,
                    'REJECTED',
                    rejectReason.trim() || 'Declined after working-hours audit',
                  )
                }
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
