import {Calendar, Check, Edit3, Plus, Trash2, X} from 'lucide-react';
import {useEffect, useState, type ChangeEvent, type FormEvent} from 'react';
import {callRpc} from '../../services/apiClient';
import type {
  AuthUser,
  EmployeeRecord,
  HolidayRecord,
  LeaveApplication,
  LeaveBalanceRecord,
  LeaveStatus,
  LeaveTypeConfig,
} from '../../types/hrms';

interface LeavesViewProps {
  user: AuthUser;
  onToast: (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;
  onOpenHolidayCalendar?: () => void;
}

export function LeavesView({user, onToast, onOpenHolidayCalendar}: LeavesViewProps) {
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeConfig[]>([]);
  const [applications, setApplications] = useState<LeaveApplication[]>([]);
  const [balances, setBalances] = useState<LeaveBalanceRecord[]>([]);
  const [holidays, setHolidays] = useState<HolidayRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [showApply, setShowApply] = useState(false);
  const [leaveTypeId, setLeaveTypeId] = useState('LT-CL');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [halfDaySession, setHalfDaySession] = useState<'FIRST_HALF' | 'SECOND_HALF'>('FIRST_HALF');
  const [reason, setReason] = useState('');
  const [docDataUrl, setDocDataUrl] = useState('');
  const [docName, setDocName] = useState('');

  const [rejectModal, setRejectModal] = useState<LeaveApplication | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Admin Edit Leave Application Modal
  const [editingLeave, setEditingLeave] = useState<LeaveApplication | null>(null);
  const [editLeaveForm, setEditLeaveForm] = useState({
    leaveTypeId: '',
    startDate: '',
    endDate: '',
    isHalfDay: false,
    halfDaySession: 'FIRST_HALF' as 'FIRST_HALF' | 'SECOND_HALF' | '',
    totalDays: 1,
    reason: '',
    status: 'PENDING' as LeaveStatus,
    rejectionReason: '',
  });

  // Holiday Create/Edit Modal
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [editingHolidayId, setEditingHolidayId] = useState('');
  const [holDate, setHolDate] = useState('');
  const [holName, setHolName] = useState('');
  const [holType, setHolType] = useState<HolidayRecord['type']>('COMPANY');
  const [holDesc, setHolDesc] = useState('');
  const [holOptional, setHolOptional] = useState(false);
  const [holYearFilter, setHolYearFilter] = useState('2027');

  // Admin Leave Balance Edit Modal
  const [editingBalance, setEditingBalance] = useState<LeaveBalanceRecord | null>(null);
  const [balForm, setBalForm] = useState({allocated: 0, used: 0});
  const [balanceFilterEmp, setBalanceFilterEmp] = useState('ALL');

  // Admin Leave Type Create/Edit Modal
  const [showLeaveTypeModal, setShowLeaveTypeModal] = useState(false);
  const [leaveTypeForm, setLeaveTypeForm] = useState({
    leaveTypeId: '',
    name: '',
    code: '',
    annualQuota: 12,
    isPaid: true,
    requiresDocument: false,
  });

  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'HR_ADMIN';

  const loadLeaveData = async () => {
    setLoading(true);
    try {
      const [res, empRes] = await Promise.all([
        callRpc<{
          ok: boolean;
          leaveTypes: LeaveTypeConfig[];
          applications: LeaveApplication[];
          balances: LeaveBalanceRecord[];
          holidays: HolidayRecord[];
        }>('getLeaveData', {}, {cacheKey: `leaves_${user.employeeId}`}),
        isAdmin
          ? callRpc<{ok: boolean; employees: EmployeeRecord[]}>('getEmployees', {}, {cacheKey: 'employees_list'})
          : Promise.resolve({ok: true, employees: [] as EmployeeRecord[]}),
      ]);
      setLeaveTypes(res.leaveTypes || []);
      setApplications(res.applications || []);
      setBalances(res.balances || []);
      setHolidays(res.holidays || []);
      if (isAdmin) setEmployees(empRes.employees || []);
    } catch (err: any) {
      onToast('error', 'Failed to load leave records', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeaveData();
  }, []);

  const handleDocUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocName(file.name);
    const reader = new FileReader();
    reader.onload = () => setDocDataUrl(String(reader.result));
    reader.readAsDataURL(file);
  };

  const handleApplyLeave = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await callRpc('applyLeave', {
        leaveTypeId,
        startDate,
        endDate: isHalfDay ? startDate : endDate,
        isHalfDay,
        halfDaySession: isHalfDay ? halfDaySession : '',
        reason,
        documentDataUrl: docDataUrl,
        documentName: docName,
      });
      setShowApply(false);
      setReason('');
      setDocDataUrl('');
      onToast('success', 'Leave application submitted');
      await loadLeaveData();
    } catch (err: any) {
      onToast('error', 'Leave submission failed', err.message);
    }
  };

  const handleReview = async (leaveId: string, decision: 'APPROVED' | 'REJECTED', rejReason = '') => {
    try {
      await callRpc('reviewLeave', {leaveId, decision, rejectionReason: rejReason});
      setRejectModal(null);
      setRejectionReason('');
      onToast('success', `Leave ${decision.toLowerCase()}`);
      await loadLeaveData();
    } catch (err: any) {
      onToast('error', 'Action failed', err.message);
    }
  };

  const handleCancel = async (leaveId: string) => {
    try {
      await callRpc('cancelLeave', {leaveId});
      onToast('info', 'Leave application cancelled');
      await loadLeaveData();
    } catch (err: any) {
      onToast('error', 'Cancel failed', err.message);
    }
  };

  const openLeaveEditor = (app: LeaveApplication) => {
    setEditingLeave(app);
    setEditLeaveForm({
      leaveTypeId: app.leaveTypeId,
      startDate: app.startDate,
      endDate: app.endDate,
      isHalfDay: Boolean(app.isHalfDay),
      halfDaySession: app.halfDaySession || 'FIRST_HALF',
      totalDays: Number(app.totalDays || 1),
      reason: app.reason || '',
      status: app.status,
      rejectionReason: app.rejectionReason || '',
    });
  };

  const handleSaveLeaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingLeave) return;
    try {
      await callRpc('updateLeaveApplication', {
        leaveId: editingLeave.leaveId,
        leaveTypeId: editLeaveForm.leaveTypeId,
        startDate: editLeaveForm.startDate,
        endDate: editLeaveForm.isHalfDay ? editLeaveForm.startDate : editLeaveForm.endDate,
        isHalfDay: editLeaveForm.isHalfDay,
        halfDaySession: editLeaveForm.isHalfDay ? editLeaveForm.halfDaySession : '',
        totalDays: Number(editLeaveForm.totalDays),
        reason: editLeaveForm.reason,
        status: editLeaveForm.status,
        rejectionReason: editLeaveForm.rejectionReason,
      });
      setEditingLeave(null);
      onToast('success', 'Leave application updated');
      await loadLeaveData();
    } catch (err: any) {
      onToast('error', 'Failed to update leave', err.message);
    }
  };

  const handleSaveHoliday = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await callRpc('saveHoliday', {
        holidayId: editingHolidayId || undefined,
        date: holDate,
        name: holName,
        type: holType,
        description: holDesc,
        isOptional: holOptional,
      });
      setEditingHolidayId('');
      setHolDate('');
      setHolName('');
      setHolType('COMPANY');
      setHolDesc('');
      setHolOptional(false);
      setShowHolidayModal(false);
      onToast('success', editingHolidayId ? 'Holiday updated' : 'Holiday added');
      await loadLeaveData();
    } catch (err: any) {
      onToast('error', 'Failed to save holiday', err.message);
    }
  };

  const handleDeleteHoliday = async (holidayId: string) => {
    try {
      await callRpc('deleteHoliday', {holidayId});
      onToast('info', 'Holiday deleted');
      await loadLeaveData();
    } catch (err: any) {
      onToast('error', 'Delete failed', err.message);
    }
  };

  const handleSaveBalance = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingBalance) return;
    try {
      await callRpc('updateLeaveBalance', {
        balanceId: editingBalance.balanceId,
        allocated: Number(balForm.allocated),
        used: Number(balForm.used),
      });
      setEditingBalance(null);
      onToast('success', 'Leave balance updated');
      await loadLeaveData();
    } catch (err: any) {
      onToast('error', 'Failed to update balance', err.message);
    }
  };

  const handleSaveLeaveType = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await callRpc('saveLeaveType', {
        leaveTypeId: leaveTypeForm.leaveTypeId || undefined,
        name: leaveTypeForm.name,
        code: leaveTypeForm.code,
        annualQuota: Number(leaveTypeForm.annualQuota),
        isPaid: leaveTypeForm.isPaid,
        requiresDocument: leaveTypeForm.requiresDocument,
      });
      setShowLeaveTypeModal(false);
      onToast('success', leaveTypeForm.leaveTypeId ? 'Leave category updated' : 'Leave category added');
      await loadLeaveData();
    } catch (err: any) {
      onToast('error', 'Failed to save leave category', err.message);
    }
  };

  const myBalances = balances.filter((b) => b.employeeId === user.employeeId);
  const filteredAdminBalances =
    balanceFilterEmp === 'ALL' ? balances : balances.filter((b) => b.employeeId === balanceFilterEmp);

  return (
    <div className="space-y-5">
      <div className="metallic-navy-panel overflow-hidden rounded-2xl text-white">
        <div className="h-1 w-full bg-gradient-to-r from-amber-400 via-emerald-400 to-sky-400" />
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-xl font-semibold text-white">Leave &amp; Holiday Management</h1>
            <p className="mt-0.5 text-xs text-sky-100/85">
              Dynamic leave balances · Manager &amp; HR approval workflow
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setEditingHolidayId('');
                  setHolDate('2027-01-26');
                  setHolName('');
                  setHolType('COMPANY');
                  setHolDesc('');
                  setHolOptional(false);
                  setShowHolidayModal(true);
                }}
                className="min-h-[40px] rounded-lg border border-white/25 bg-white/10 px-3.5 py-2 text-xs font-medium text-white hover:bg-white/20"
              >
                Add Company Holiday
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowApply(true)}
              className="metallic-btn-gold inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold"
            >
              <Plus className="h-4 w-4" />
              Apply for Leave
            </button>
          </div>
        </div>
      </div>

      {/* Personal Leave Balance Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {myBalances.map((b, idx) => {
          const accents = [
            'from-blue-600 to-cyan-400',
            'from-emerald-600 to-teal-400',
            'from-amber-500 to-yellow-400',
            'from-indigo-600 to-sky-400',
            'from-rose-600 to-amber-500',
            'from-teal-600 to-emerald-400',
          ];
          return (
            <div key={b.balanceId} className="metallic-surface overflow-hidden rounded-xl">
              <div className={`h-1 w-full bg-gradient-to-r ${accents[idx % accents.length]}`} />
              <div className="p-4">
                <p className="text-xs font-semibold text-slate-600">{b.leaveTypeName}</p>
                <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">{b.remaining}</p>
                <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                  Used {b.used} / {b.allocated}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Leave Applications Table */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-8">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              {isAdmin ? 'Organization Leave Requests' : 'My Leave History'}
            </h2>
          </div>
          {loading ? (
            <p className="p-6 text-center text-xs text-slate-500">Loading leave applications...</p>
          ) : applications.length === 0 ? (
            <p className="p-8 text-center text-xs text-slate-500">No leave applications found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-2.5">Employee</th>
                    <th className="px-4 py-2.5">Category &amp; Dates</th>
                    <th className="px-4 py-2.5">Days</th>
                    <th className="px-4 py-2.5">Reason</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {applications.map((app) => (
                    <tr key={app.leaveId} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{app.employeeName}</p>
                        <p className="font-mono text-slate-500">
                          {app.employeeId} · {app.department}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{app.leaveTypeName}</p>
                        <p className="font-mono text-slate-500">
                          {app.startDate} to {app.endDate} {app.isHalfDay ? '(Half Day)' : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold tabular-nums">{app.totalDays}</td>
                      <td className="max-w-[200px] px-4 py-3 text-slate-600">
                        <p className="truncate" title={app.reason}>
                          {app.reason}
                        </p>
                        {app.rejectionReason && (
                          <p className="text-[11px] text-red-600">Rejected: {app.rejectionReason}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`font-semibold ${
                            app.status === 'APPROVED'
                              ? 'text-emerald-700'
                              : app.status === 'REJECTED' || app.status === 'CANCELLED'
                                ? 'text-red-600'
                                : 'text-amber-700'
                          }`}
                        >
                          {app.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          {isAdmin && app.status === 'PENDING' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleReview(app.leaveId, 'APPROVED')}
                                className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white"
                              >
                                <Check className="h-3 w-3" /> Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => setRejectModal(app)}
                                className="inline-flex items-center gap-1 rounded bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white"
                              >
                                <X className="h-3 w-3" /> Reject
                              </button>
                            </>
                          )}
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => openLeaveEditor(app)}
                              className="inline-flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                            >
                              <Edit3 className="h-3 w-3" /> Edit
                            </button>
                          )}
                          {(app.status === 'PENDING' || app.status === 'APPROVED') &&
                            app.employeeId === user.employeeId && (
                              <button
                                type="button"
                                onClick={() => handleCancel(app.leaveId)}
                                className="rounded border border-slate-200 px-2.5 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
                              >
                                Cancel
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Holiday Calendar */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#0B1B36]" />
              <h2 className="font-display text-sm font-semibold text-slate-900">Holiday Calendar</h2>
            </div>
            <div className="flex items-center gap-1.5">
              <select
                value={holYearFilter}
                onChange={(e) => setHolYearFilter(e.target.value)}
                className="rounded border border-slate-200 px-2 py-1 font-mono text-[11px] text-slate-700"
              >
                <option value="2027">2027</option>
                <option value="2026">2026</option>
                <option value="ALL">All</option>
              </select>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingHolidayId('');
                    setHolDate('2027-01-26');
                    setHolName('');
                    setHolType('COMPANY');
                    setHolDesc('');
                    setHolOptional(false);
                    setShowHolidayModal(true);
                  }}
                  className="rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  + Add
                </button>
              )}
            </div>
          </div>
          {onOpenHolidayCalendar && (
            <button
              type="button"
              onClick={onOpenHolidayCalendar}
              className="mt-2.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-center text-[11px] font-semibold text-[#0B1B36] hover:bg-slate-100"
            >
              Open Full {holYearFilter === 'ALL' ? '2027' : holYearFilter} Interactive Calendar
            </button>
          )}
          <div className="mt-3 max-h-[420px] divide-y divide-slate-100 overflow-y-auto text-xs">
            {(() => {
              const filteredHolidays =
                holYearFilter === 'ALL'
                  ? holidays
                  : holidays.filter((h) => String(h.date || '').startsWith(`${holYearFilter}-`));
              if (filteredHolidays.length === 0) {
                return <p className="py-6 text-center text-slate-500">No holidays configured for {holYearFilter}.</p>;
              }
              return filteredHolidays.map((h) => (
                <div key={h.holidayId} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">{h.name}</p>
                    <p className="font-mono text-[11px] text-slate-500 tabular-nums">
                      {h.date} · {h.type}
                      {h.isOptional ? ' · Optional' : ''}
                    </p>
                  </div>
                  {isAdmin && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingHolidayId(h.holidayId);
                          setHolDate(h.date);
                          setHolName(h.name);
                          setHolType(h.type || 'COMPANY');
                          setHolDesc(h.description || '');
                          setHolOptional(Boolean(h.isOptional));
                          setShowHolidayModal(true);
                        }}
                        className="rounded border border-slate-200 p-1 text-slate-600 hover:bg-slate-50"
                        title="Edit holiday"
                      >
                        <Edit3 className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteHoliday(h.holidayId)}
                        className="rounded border border-red-200 p-1 text-red-600 hover:bg-red-50"
                        title="Delete holiday"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              ));
            })()}
          </div>
        </div>
      </div>

      {/* Admin Leave Balances & Leave Category Quotas */}
      {isAdmin && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="metallic-surface overflow-hidden rounded-xl lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
              <h2 className="font-display text-sm font-semibold text-slate-900">Employee Leave Balances</h2>
              <select
                value={balanceFilterEmp}
                onChange={(e) => setBalanceFilterEmp(e.target.value)}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
              >
                <option value="ALL">All Employees ({balances.length})</option>
                {employees.map((emp) => (
                  <option key={emp.employeeId} value={emp.employeeId}>
                    {emp.employeeId} — {emp.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div className="max-h-80 overflow-x-auto overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-2">Employee</th>
                    <th className="px-4 py-2">Leave Type</th>
                    <th className="px-4 py-2">Allocated</th>
                    <th className="px-4 py-2">Used</th>
                    <th className="px-4 py-2">Remaining</th>
                    <th className="px-4 py-2 text-right">Edit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAdminBalances.map((b) => {
                    const emp = employees.find((e) => e.employeeId === b.employeeId);
                    return (
                      <tr key={b.balanceId} className="hover:bg-slate-50/70">
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-slate-900">{emp?.fullName || b.employeeId}</p>
                          <p className="font-mono text-[11px] text-slate-500">{b.employeeId}</p>
                        </td>
                        <td className="px-4 py-2.5 text-slate-800">{b.leaveTypeName}</td>
                        <td className="px-4 py-2.5 font-mono tabular-nums">{b.allocated}</td>
                        <td className="px-4 py-2.5 font-mono tabular-nums">{b.used}</td>
                        <td className="px-4 py-2.5 font-mono font-semibold text-emerald-700 tabular-nums">{b.remaining}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingBalance(b);
                              setBalForm({allocated: b.allocated, used: b.used});
                            }}
                            className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                          >
                            <Edit3 className="h-3 w-3" /> Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="metallic-surface overflow-hidden rounded-xl lg:col-span-5">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 className="font-display text-sm font-semibold text-slate-900">Leave Categories &amp; Quotas</h2>
              <button
                type="button"
                onClick={() => {
                  setLeaveTypeForm({
                    leaveTypeId: '',
                    name: '',
                    code: '',
                    annualQuota: 12,
                    isPaid: true,
                    requiresDocument: false,
                  });
                  setShowLeaveTypeModal(true);
                }}
                className="rounded-lg bg-[#0B1B36] px-2.5 py-1 text-[11px] font-semibold text-white"
              >
                + Add Category
              </button>
            </div>
            <div className="divide-y divide-slate-100 p-4 text-xs">
              {leaveTypes.map((lt) => (
                <div key={lt.leaveTypeId} className="flex items-center justify-between gap-2 py-2.5">
                  <div>
                    <p className="font-medium text-slate-900">
                      {lt.name} <span className="font-mono text-slate-500">({lt.code})</span>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Quota: {lt.annualQuota}d · {lt.isPaid ? 'Paid' : 'Unpaid'}
                      {lt.requiresDocument ? ' · Doc Required' : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setLeaveTypeForm({
                        leaveTypeId: lt.leaveTypeId,
                        name: lt.name,
                        code: lt.code,
                        annualQuota: lt.annualQuota,
                        isPaid: lt.isPaid,
                        requiresDocument: lt.requiresDocument,
                      });
                      setShowLeaveTypeModal(true);
                    }}
                    className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Edit3 className="h-3 w-3" /> Edit
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Apply Leave Modal */}
      {showApply && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="font-display text-base font-semibold text-slate-900">Apply for Leave</h3>
            <form onSubmit={handleApplyLeave} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-slate-700">Leave Category</label>
                <select
                  value={leaveTypeId}
                  onChange={(e) => setLeaveTypeId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  {leaveTypes.map((lt) => (
                    <option key={lt.leaveTypeId} value={lt.leaveTypeId}>
                      {lt.name} ({lt.isPaid ? 'Paid' : 'Unpaid'})
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 font-medium text-slate-700">
                <input type="checkbox" checked={isHalfDay} onChange={(e) => setIsHalfDay(e.target.checked)} />
                Half-Day Leave
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700">Start Date</label>
                  <input
                    required
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
                {isHalfDay ? (
                  <div>
                    <label className="block font-medium text-slate-700">Session</label>
                    <select
                      value={halfDaySession}
                      onChange={(e) => setHalfDaySession(e.target.value as 'FIRST_HALF' | 'SECOND_HALF')}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                    >
                      <option value="FIRST_HALF">First Half</option>
                      <option value="SECOND_HALF">Second Half</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block font-medium text-slate-700">End Date</label>
                    <input
                      required
                      type="date"
                      value={endDate}
                      min={startDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block font-medium text-slate-700">Reason *</label>
                <textarea
                  required
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700">Supporting Document (Optional)</label>
                <input type="file" onChange={handleDocUpload} className="mt-1 w-full text-xs" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowApply(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 font-medium"
                >
                  Cancel
                </button>
                <button type="submit" className="rounded-lg bg-[#0B1B36] px-4 py-2 font-semibold text-white">
                  Submit Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Reject Leave ({rejectModal.employeeName})
            </h3>
            <textarea
              required
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Provide mandatory reason for rejection..."
              className="mt-3 w-full rounded-lg border border-slate-300 p-3 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setRejectModal(null)} className="rounded-lg border px-4 py-2 text-xs">
                Cancel
              </button>
              <button
                type="button"
                disabled={!rejectionReason.trim()}
                onClick={() => handleReview(rejectModal.leaveId, 'REJECTED', rejectionReason)}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Holiday Modal */}
      {showHolidayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="font-display text-base font-semibold text-slate-900">
              {editingHolidayId ? 'Edit Holiday' : 'Add Holiday'}
            </h3>
            <form onSubmit={handleSaveHoliday} className="mt-4 space-y-3 text-xs">
              <input
                required
                type="date"
                value={holDate}
                onChange={(e) => setHolDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
              <input
                required
                type="text"
                maxLength={120}
                value={holName}
                onChange={(e) => setHolName(e.target.value)}
                placeholder="Holiday Name"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
              <select
                value={holType}
                onChange={(e) => setHolType(e.target.value as HolidayRecord['type'])}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="COMPANY">Company Holiday</option>
                <option value="NATIONAL">National Holiday</option>
                <option value="REGIONAL">Regional Holiday</option>
              </select>
              <textarea
                rows={2}
                maxLength={240}
                value={holDesc}
                onChange={(e) => setHolDesc(e.target.value)}
                placeholder="Notes / Gazetted details (optional)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
              <label className="flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={holOptional}
                  onChange={(e) => setHolOptional(e.target.checked)}
                />
                Optional / Restricted Holiday (RH)
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowHolidayModal(false)} className="rounded-lg border px-3 py-2">
                  Cancel
                </button>
                <button type="submit" className="rounded-lg bg-[#0B1B36] px-4 py-2 font-semibold text-white">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Edit Leave Application Modal */}
      {editingLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Edit Leave Request ({editingLeave.employeeName})
              </h3>
              <button type="button" onClick={() => setEditingLeave(null)} className="text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveLeaveEdit} className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block font-medium text-slate-700">Leave Category</label>
                  <select
                    value={editLeaveForm.leaveTypeId}
                    onChange={(e) => setEditLeaveForm({...editLeaveForm, leaveTypeId: e.target.value})}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    {leaveTypes.map((lt) => (
                      <option key={lt.leaveTypeId} value={lt.leaveTypeId}>
                        {lt.name} ({lt.isPaid ? 'Paid' : 'Unpaid'})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700">Status</label>
                  <select
                    value={editLeaveForm.status}
                    onChange={(e) => setEditLeaveForm({...editLeaveForm, status: e.target.value as LeaveStatus})}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="PENDING">PENDING</option>
                    <option value="APPROVED">APPROVED</option>
                    <option value="REJECTED">REJECTED</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700">Start Date</label>
                  <input
                    required
                    type="date"
                    value={editLeaveForm.startDate}
                    onChange={(e) => setEditLeaveForm({...editLeaveForm, startDate: e.target.value})}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700">End Date</label>
                  <input
                    required
                    type="date"
                    disabled={editLeaveForm.isHalfDay}
                    value={editLeaveForm.isHalfDay ? editLeaveForm.startDate : editLeaveForm.endDate}
                    onChange={(e) => setEditLeaveForm({...editLeaveForm, endDate: e.target.value})}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700">Total Days</label>
                  <input
                    required
                    type="number"
                    step="0.5"
                    min={0.5}
                    value={editLeaveForm.totalDays}
                    onChange={(e) => setEditLeaveForm({...editLeaveForm, totalDays: Number(e.target.value)})}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={editLeaveForm.isHalfDay}
                      onChange={(e) =>
                        setEditLeaveForm({
                          ...editLeaveForm,
                          isHalfDay: e.target.checked,
                          totalDays: e.target.checked ? 0.5 : Math.max(1, editLeaveForm.totalDays),
                        })
                      }
                    />
                    Half-Day Leave
                  </label>
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700">Reason</label>
                <textarea
                  rows={2}
                  value={editLeaveForm.reason}
                  onChange={(e) => setEditLeaveForm({...editLeaveForm, reason: e.target.value})}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
                />
              </div>
              {editLeaveForm.status === 'REJECTED' && (
                <div>
                  <label className="block font-medium text-slate-700">Rejection Reason</label>
                  <input
                    type="text"
                    value={editLeaveForm.rejectionReason}
                    onChange={(e) => setEditLeaveForm({...editLeaveForm, rejectionReason: e.target.value})}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditingLeave(null)} className="rounded-lg border px-4 py-2">
                  Cancel
                </button>
                <button type="submit" className="rounded-lg bg-[#0B1B36] px-4 py-2 font-semibold text-white">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Edit Leave Balance Modal */}
      {editingBalance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Edit Balance · {editingBalance.leaveTypeName}
            </h3>
            <p className="text-xs text-slate-500">{editingBalance.employeeId}</p>
            <form onSubmit={handleSaveBalance} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700">Allocated Days</label>
                <input
                  required
                  type="number"
                  step="0.5"
                  min={0}
                  value={balForm.allocated}
                  onChange={(e) => setBalForm({...balForm, allocated: Number(e.target.value)})}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700">Used Days</label>
                <input
                  required
                  type="number"
                  step="0.5"
                  min={0}
                  value={balForm.used}
                  onChange={(e) => setBalForm({...balForm, used: Number(e.target.value)})}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                />
              </div>
              <p className="font-mono text-emerald-700">
                Remaining after save: {Math.max(0, balForm.allocated - balForm.used)} days
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditingBalance(null)} className="rounded-lg border px-3 py-2">
                  Cancel
                </button>
                <button type="submit" className="rounded-lg bg-[#0B1B36] px-4 py-2 font-semibold text-white">
                  Save Balance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Add / Edit Leave Category Modal */}
      {showLeaveTypeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="font-display text-base font-semibold text-slate-900">
              {leaveTypeForm.leaveTypeId ? 'Edit Leave Category' : 'Add Leave Category'}
            </h3>
            <form onSubmit={handleSaveLeaveType} className="mt-4 space-y-3 text-xs">
              <input
                required
                type="text"
                value={leaveTypeForm.name}
                onChange={(e) => setLeaveTypeForm({...leaveTypeForm, name: e.target.value})}
                placeholder="Category Name (e.g. Casual Leave)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  required
                  type="text"
                  value={leaveTypeForm.code}
                  onChange={(e) => setLeaveTypeForm({...leaveTypeForm, code: e.target.value.toUpperCase()})}
                  placeholder="Code (e.g. CL)"
                  className="rounded-lg border border-slate-300 px-3 py-2 font-mono uppercase"
                />
                <input
                  required
                  type="number"
                  min={0}
                  value={leaveTypeForm.annualQuota}
                  onChange={(e) => setLeaveTypeForm({...leaveTypeForm, annualQuota: Number(e.target.value)})}
                  placeholder="Annual Quota"
                  className="rounded-lg border border-slate-300 px-3 py-2 font-mono"
                />
              </div>
              <label className="flex items-center gap-2 font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={leaveTypeForm.isPaid}
                  onChange={(e) => setLeaveTypeForm({...leaveTypeForm, isPaid: e.target.checked})}
                />
                Paid Leave Category
              </label>
              <label className="flex items-center gap-2 font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={leaveTypeForm.requiresDocument}
                  onChange={(e) => setLeaveTypeForm({...leaveTypeForm, requiresDocument: e.target.checked})}
                />
                Requires Supporting Document
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowLeaveTypeModal(false)} className="rounded-lg border px-3 py-2">
                  Cancel
                </button>
                <button type="submit" className="rounded-lg bg-[#0B1B36] px-4 py-2 font-semibold text-white">
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
