import {
  Briefcase,
  Building2,
  Calculator,
  Clock,
  Download,
  Edit3,
  Globe,
  Mail,
  Plus,
  RefreshCw,
  Route,
  Save,
  ShieldCheck,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react';
import {useEffect, useState, type FormEvent} from 'react';
import {callRpc, getGasWebAppUrl, setGasWebAppUrl} from '../../services/apiClient';
import {exportToCsv} from '../../services/pdfExports';
import type {
  AppSettings,
  AuditLogRecord,
  AuthUser,
  DepartmentRecord,
  DesignationRecord,
} from '../../types/hrms';
import {AdminOtpInbox} from '../common/AdminOtpInbox';

interface OvertimeAuditRow {
  attendanceId: string;
  employeeId: string;
  employeeName: string;
  department: string;
  date: string;
  checkInTime: string;
  checkOutTime: string;
  workingHours: number;
  overtimeHours: number;
  basicSalary: number;
  hourlyOtRate: number;
  estimatedOtPay: number;
  rateMode: 'BASIC_PERCENT_PER_HOUR' | 'FIXED_HOURLY_RATE';
  basicPercentApplied: number;
  status: string;
  verificationStatus: string;
  correctionStatus: string;
  regularizedBy?: string;
}

interface OvertimeAuditResponse {
  ok: boolean;
  month: string;
  policy: {
    enabled: boolean;
    afterHours: number;
    rateMode: 'BASIC_PERCENT_PER_HOUR' | 'FIXED_HOURLY_RATE';
    basicPercentPerHour: number;
  };
  records: OvertimeAuditRow[];
  auditEvents: AuditLogRecord[];
}

interface SettingsViewProps {
  user: AuthUser;
  onToast: (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;
}

const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function SettingsView({user, onToast}: SettingsViewProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [designations, setDesignations] = useState<DesignationRecord[]>([]);
  const [gasUrl, setGasUrl] = useState(getGasWebAppUrl());
  const [saving, setSaving] = useState(false);
  const [sampleBasic, setSampleBasic] = useState(100);
  const [sampleOtHours, setSampleOtHours] = useState(1);
  const [otAuditMonth, setOtAuditMonth] = useState(new Date().toISOString().slice(0, 7));
  const [otAudit, setOtAudit] = useState<OvertimeAuditResponse | null>(null);
  const [loadingOtAudit, setLoadingOtAudit] = useState(false);
  const [auditModuleFilter, setAuditModuleFilter] = useState('ALL');

  const [roleForm, setRoleForm] = useState({
    designationId: '',
    title: '',
    department: '',
    level: 'L3',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  });
  const [deptForm, setDeptForm] = useState({
    departmentId: '',
    name: '',
    code: '',
  });

  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'HR_ADMIN';

  const loadOvertimeAudit = async (monthStr = otAuditMonth) => {
    if (!isAdmin) return;
    setLoadingOtAudit(true);
    try {
      const otRes = await callRpc<OvertimeAuditResponse>('getOvertimeAudit', {month: monthStr});
      setOtAudit(otRes);
    } catch {
      // ignore if backend does not yet return audit
    } finally {
      setLoadingOtAudit(false);
    }
  };

  const loadAll = async () => {
    try {
      const [setRes, empRes] = await Promise.all([
        callRpc<{ok: boolean; settings: AppSettings}>('getSettings'),
        isAdmin
          ? callRpc<{ok: boolean; departments: DepartmentRecord[]; designations: DesignationRecord[]}>('getEmployees')
          : Promise.resolve({ok: true, departments: [] as DepartmentRecord[], designations: [] as DesignationRecord[]}),
      ]);
      const loaded = setRes.settings;
      setSettings({
        ...loaded,
        overtimeEnabled: loaded.overtimeEnabled !== false,
        overtimeAfterHours: loaded.overtimeAfterHours ?? 9,
        overtimeRateMode: loaded.overtimeRateMode || 'BASIC_PERCENT_PER_HOUR',
        overtimeBasicPercentPerHour: loaded.overtimeBasicPercentPerHour ?? 1.5,
        conveyanceBikeRatePerKm: loaded.conveyanceBikeRatePerKm ?? 4.5,
        conveyanceCarRatePerKm: loaded.conveyanceCarRatePerKm ?? 14,
        foodAllowanceEnabled: loaded.foodAllowanceEnabled !== false,
        foodBreakfastAmount: loaded.foodBreakfastAmount ?? 70,
        foodLunchAmount: loaded.foodLunchAmount ?? 90,
        foodDinnerAmount: loaded.foodDinnerAmount ?? 90,
      });
      if (isAdmin) {
        const depts = empRes.departments || [];
        setDepartments(depts);
        setDesignations(empRes.designations || []);
        setRoleForm((prev) => ({
          ...prev,
          department: prev.department || depts[0]?.name || 'Executive & Administration',
        }));
        await loadOvertimeAudit(otAuditMonth);
      }
      if (user.role === 'SUPER_ADMIN') {
        const logRes = await callRpc<{ok: boolean; logs: AuditLogRecord[]}>('getAuditLogs');
        setAuditLogs(logRes.logs || []);
      }
    } catch (err: any) {
      onToast('error', 'Settings load failed', err.message);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadOvertimeAudit(otAuditMonth);
    }
  }, [otAuditMonth]);

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      await callRpc('saveSettings', settings);
      setGasWebAppUrl(gasUrl);
      onToast('success', 'HRMS settings, overtime rules & connector saved');
      await loadAll();
    } catch (err: any) {
      onToast('error', 'Save failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRole = async (e: FormEvent) => {
    e.preventDefault();
    if (!roleForm.title.trim()) return;
    try {
      await callRpc('saveDesignation', {
        designationId: roleForm.designationId || undefined,
        title: roleForm.title.trim(),
        department: roleForm.department || departments[0]?.name || 'Executive & Administration',
        level: roleForm.level,
        status: roleForm.status,
      });
      setRoleForm({
        designationId: '',
        title: '',
        department: departments[0]?.name || 'Executive & Administration',
        level: 'L3',
        status: 'ACTIVE',
      });
      onToast('success', roleForm.designationId ? 'Role updated' : 'Role added');
      await loadAll();
    } catch (err: any) {
      onToast('error', 'Failed to save role', err.message);
    }
  };

  const handleDeleteRole = async (designationId: string) => {
    try {
      await callRpc('deleteDesignation', {designationId});
      onToast('info', 'Role deleted');
      await loadAll();
    } catch (err: any) {
      onToast('error', 'Delete failed', err.message);
    }
  };

  const handleSaveDepartment = async (e: FormEvent) => {
    e.preventDefault();
    if (!deptForm.name.trim() || !deptForm.code.trim()) return;
    try {
      await callRpc('saveDepartment', {
        departmentId: deptForm.departmentId || undefined,
        name: deptForm.name.trim(),
        code: deptForm.code.trim().toUpperCase(),
      });
      setDeptForm({departmentId: '', name: '', code: ''});
      onToast('success', deptForm.departmentId ? 'Department updated' : 'Department added');
      await loadAll();
    } catch (err: any) {
      onToast('error', 'Failed to save department', err.message);
    }
  };

  const handleDeleteDepartment = async (departmentId: string) => {
    try {
      await callRpc('deleteDepartment', {departmentId});
      onToast('info', 'Department deleted');
      await loadAll();
    } catch (err: any) {
      onToast('error', 'Delete failed', err.message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="metallic-navy-panel overflow-hidden rounded-2xl text-white">
        <div className="h-1 w-full bg-gradient-to-r from-blue-400 via-indigo-400 to-amber-400" />
        <div className="p-5">
          <h1 className="font-display text-xl font-semibold text-white">HRMS Settings, Policies &amp; Audit Logs</h1>
          <p className="mt-0.5 text-xs text-sky-100/85">
            Shift attendance thresholds, Google Apps Script Web App connector, and security audit trail
          </p>
        </div>
      </div>

      {settings && (
        <form onSubmit={handleSaveSettings} className="metallic-surface rounded-xl p-5 space-y-5 text-xs">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="block font-medium text-slate-700">Company Legal Name</label>
              <input
                type="text"
                value={settings.companyName}
                onChange={(e) => setSettings({...settings, companyName: e.target.value})}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700">Company Code</label>
              <input
                type="text"
                value={settings.companyCode}
                onChange={(e) => setSettings({...settings, companyCode: e.target.value.toUpperCase()})}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono uppercase"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700">Weekly Off Day</label>
              <select
                value={settings.weeklyOffDay || 'Sunday'}
                onChange={(e) => setSettings({...settings, weeklyOffDay: e.target.value})}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                {WEEK_DAYS.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700">Shift Start Time</label>
              <input
                type="time"
                value={settings.shiftStartTime}
                onChange={(e) => setSettings({...settings, shiftStartTime: e.target.value})}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700">Shift End Time</label>
              <input
                type="time"
                value={settings.shiftEndTime}
                onChange={(e) => setSettings({...settings, shiftEndTime: e.target.value})}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700">Late Grace Minutes</label>
              <input
                type="number"
                value={settings.lateGraceMinutes}
                onChange={(e) => setSettings({...settings, lateGraceMinutes: Number(e.target.value)})}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700">Half-Day Threshold (Hours)</label>
              <input
                type="number"
                step="0.5"
                value={settings.halfDayThresholdHours}
                onChange={(e) => setSettings({...settings, halfDayThresholdHours: Number(e.target.value)})}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700">Location Stale Threshold (Min)</label>
              <input
                type="number"
                value={settings.locationStaleMinutes}
                onChange={(e) => setSettings({...settings, locationStaleMinutes: Number(e.target.value)})}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 font-medium text-slate-700">
            <input
              type="checkbox"
              checked={settings.requireCheckoutSelfie}
              onChange={(e) => setSettings({...settings, requireCheckoutSelfie: e.target.checked})}
            />
            Require mandatory selfie photograph on Check-Out
          </label>

          {/* Dedicated Overtime Policy & Auto-Pay Calculation Section */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/80 pb-2.5">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-emerald-700" />
                <div>
                  <h2 className="font-display text-sm font-semibold text-slate-900">
                    Overtime Rules &amp; Automatic Basic-Pay Calculation
                  </h2>
                  <p className="text-[11px] text-slate-600">
                    Additional duty hours worked beyond the shift duty threshold are automatically converted to Overtime Pay in Payroll.
                  </p>
                </div>
              </div>
              <label className="inline-flex items-center gap-2 font-semibold text-emerald-900">
                <input
                  type="checkbox"
                  checked={settings.overtimeEnabled !== false}
                  onChange={(e) => setSettings({...settings, overtimeEnabled: e.target.checked})}
                />
                Enable Auto Overtime Pay
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block font-medium text-slate-700">Duty Hours Before Overtime (Default 9h)</label>
                <input
                  type="number"
                  step="0.5"
                  min={1}
                  max={24}
                  value={settings.overtimeAfterHours ?? 9}
                  onChange={(e) => setSettings({...settings, overtimeAfterHours: Number(e.target.value)})}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700">Overtime Pay Calculation Method</label>
                <select
                  value={settings.overtimeRateMode || 'BASIC_PERCENT_PER_HOUR'}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      overtimeRateMode: e.target.value as 'BASIC_PERCENT_PER_HOUR' | 'FIXED_HOURLY_RATE',
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                >
                  <option value="BASIC_PERCENT_PER_HOUR">% of Basic Salary per OT Hour (Default 1.5%)</option>
                  <option value="FIXED_HOURLY_RATE">Fixed Hourly Rate (from Salary Structure)</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700">
                  Overtime % of Basic Salary / Hour
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  disabled={settings.overtimeRateMode === 'FIXED_HOURLY_RATE'}
                  value={settings.overtimeBasicPercentPerHour ?? 1.5}
                  onChange={(e) =>
                    setSettings({...settings, overtimeBasicPercentPerHour: Number(e.target.value)})
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono disabled:bg-slate-100"
                />
              </div>
            </div>

            {/* Live Overtime Formula Preview */}
            {(() => {
              const pct = Number(settings.overtimeBasicPercentPerHour ?? 1.5);
              const afterHrs = Number(settings.overtimeAfterHours ?? 9);
              const perHrOt = Math.round(sampleBasic * (pct / 100) * 100) / 100;
              const otTotal = Math.round(perHrOt * sampleOtHours * 100) / 100;
              const combined = Math.round((sampleBasic + otTotal) * 100) / 100;
              return (
                <div className="rounded-lg border border-emerald-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-slate-800">
                      <Calculator className="h-4 w-4 text-emerald-700" />
                      <span className="font-semibold">Live Overtime Formula Preview</span>
                      <span className="font-mono text-[11px] text-slate-600">
                        (Duty &gt; {afterHrs}h → {pct}% of Basic Salary / OT hour)
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <label className="text-slate-600">Sample Basic (₹):</label>
                      <input
                        type="number"
                        min={0}
                        step="1"
                        value={sampleBasic}
                        onChange={(e) => setSampleBasic(Number(e.target.value))}
                        className="w-24 rounded border border-slate-300 px-2 py-1 font-mono"
                      />
                      <label className="text-slate-600">OT Hrs:</label>
                      <input
                        type="number"
                        min={0}
                        step="0.5"
                        value={sampleOtHours}
                        onChange={(e) => setSampleOtHours(Number(e.target.value))}
                        className="w-20 rounded border border-slate-300 px-2 py-1 font-mono"
                      />
                    </div>
                  </div>
                  <p className="mt-2 font-mono text-xs text-emerald-900">
                    Basic ₹{sampleBasic.toLocaleString('en-IN')} + {sampleOtHours}h OT (₹{perHrOt}/hr = {pct}% × ₹
                    {sampleBasic}) = <strong>₹{combined.toLocaleString('en-IN', {maximumFractionDigits: 2})}</strong>{' '}
                    <span className="text-slate-500">
                      (worked {(afterHrs + sampleOtHours).toFixed(1)}h total duty)
                    </span>
                  </p>
                </div>
              );
            })()}
          </div>

          {/* Local Conveyance & Travel Claim Rates Section */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-200/80 pb-2.5">
              <div className="flex items-center gap-2">
                <Route className="h-4 w-4 text-blue-700" />
                <div>
                  <h2 className="font-display text-sm font-semibold text-slate-900">
                    Local Conveyance &amp; Travel Claim Rates
                  </h2>
                  <p className="text-[11px] text-slate-600">
                    Automatic per-km reimbursement rates applied server-side when employees log live Location A → Location B trips.
                  </p>
                </div>
              </div>
              <span className="font-mono text-[11px] font-semibold text-blue-900 tabular-nums">
                10 km Bike = ₹{(10 * Number(settings.conveyanceBikeRatePerKm ?? 4.5)).toFixed(2)} · 10 km Car = ₹
                {(10 * Number(settings.conveyanceCarRatePerKm ?? 14)).toFixed(2)}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block font-medium text-slate-700">Two-Wheeler / Bike Rate (₹ per km)</label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  value={settings.conveyanceBikeRatePerKm ?? 4.5}
                  onChange={(e) => setSettings({...settings, conveyanceBikeRatePerKm: Number(e.target.value)})}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700">Four-Wheeler / Car Rate (₹ per km)</label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  value={settings.conveyanceCarRatePerKm ?? 14}
                  onChange={(e) => setSettings({...settings, conveyanceCarRatePerKm: Number(e.target.value)})}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Food Allowance Rules (Working Hours Only) */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/80 pb-2.5">
              <div className="flex items-center gap-2">
                <UtensilsCrossed className="h-4 w-4 text-amber-700" />
                <div>
                  <h2 className="font-display text-sm font-semibold text-slate-900">
                    Food Allowance Policy (Working Hours Only)
                  </h2>
                  <p className="text-[11px] text-slate-600">
                    Applicable to every employee strictly between Attendance Check-In and Check-Out. Daily cap: Breakfast + Lunch + Dinner.
                  </p>
                </div>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={settings.foodAllowanceEnabled !== false}
                  onChange={(e) => setSettings({...settings, foodAllowanceEnabled: e.target.checked})}
                  className="h-4 w-4 rounded border-slate-300 text-amber-600"
                />
                <span>Enable Food Allowance</span>
              </label>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block font-medium text-slate-700">Breakfast Allowance (₹)</label>
                <input
                  type="number"
                  step="1"
                  min={0}
                  value={settings.foodBreakfastAmount ?? 70}
                  onChange={(e) => setSettings({...settings, foodBreakfastAmount: Number(e.target.value)})}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700">Lunch Allowance (₹)</label>
                <input
                  type="number"
                  step="1"
                  min={0}
                  value={settings.foodLunchAmount ?? 90}
                  onChange={(e) => setSettings({...settings, foodLunchAmount: Number(e.target.value)})}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700">Dinner Allowance (₹)</label>
                <input
                  type="number"
                  step="1"
                  min={0}
                  value={settings.foodDinnerAmount ?? 90}
                  onChange={(e) => setSettings({...settings, foodDinnerAmount: Number(e.target.value)})}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono"
                />
              </div>
            </div>
            <p className="font-mono text-[11px] text-amber-950 tabular-nums">
              Configured Meal Caps: Breakfast ₹{Number(settings.foodBreakfastAmount ?? 70)} · Lunch ₹
              {Number(settings.foodLunchAmount ?? 90)} · Dinner ₹{Number(settings.foodDinnerAmount ?? 90)} · Max ₹
              {(
                Number(settings.foodBreakfastAmount ?? 70) +
                Number(settings.foodLunchAmount ?? 90) +
                Number(settings.foodDinnerAmount ?? 90)
              ).toFixed(0)}
              /working day (Checked-In Duty Only)
            </p>
          </div>

          <div className="border-t border-slate-200 pt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="flex items-center gap-1.5 font-semibold text-slate-900">
                  <Mail className="h-4 w-4 text-amber-600" />
                  Admin Recovery Email (Receives Password Reset OTPs)
                </label>
                <input
                  type="email"
                  value={settings.adminRecoveryEmail || ''}
                  onChange={(e) => setSettings({...settings, adminRecoveryEmail: e.target.value})}
                  placeholder="digitalidealiss@gmail.com"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 font-semibold text-slate-900">
                  <Globe className="h-4 w-4 text-blue-700" />
                  Optional OTP Email/Webhook Relay URL
                </label>
                <input
                  type="url"
                  value={settings.otpWebhookUrl || ''}
                  onChange={(e) => setSettings({...settings, otpWebhookUrl: e.target.value})}
                  placeholder="https://... (optional webhook for external email/SMS relay)"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
                />
              </div>
            </div>

            <div>
              <label className="flex items-center gap-1.5 font-semibold text-slate-900">
                <Globe className="h-4 w-4 text-[#0B1B36]" />
                Google Apps Script Web App URL (Optional Live Google Sheets Connector)
              </label>
              <input
                type="url"
                value={gasUrl}
                onChange={(e) => setGasUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec (leave blank for Workspace Server)"
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="metallic-btn-primary inline-flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-xs font-semibold"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </form>
      )}

      {isAdmin && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Roles / Designations Management */}
          <div className="metallic-surface rounded-xl p-5 lg:col-span-7">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
              <Briefcase className="h-4 w-4 text-[#0B1B36]" />
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Roles &amp; Designations ({designations.length})
              </h2>
            </div>
            <form onSubmit={handleSaveRole} className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-12">
              <input
                required
                type="text"
                value={roleForm.title}
                onChange={(e) => setRoleForm({...roleForm, title: e.target.value})}
                placeholder="Role / Designation Title"
                className="rounded-lg border border-slate-300 px-3 py-2 sm:col-span-4"
              />
              <select
                value={roleForm.department}
                onChange={(e) => setRoleForm({...roleForm, department: e.target.value})}
                className="rounded-lg border border-slate-300 px-2.5 py-2 sm:col-span-4"
              >
                {departments.map((d) => (
                  <option key={d.departmentId} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
              <select
                value={roleForm.level}
                onChange={(e) => setRoleForm({...roleForm, level: e.target.value})}
                className="rounded-lg border border-slate-300 px-2 py-2 font-mono sm:col-span-2"
              >
                {['L1', 'L2', 'L3', 'L4', 'L5', 'L6'].map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1 rounded-lg bg-[#0B1B36] px-3 py-2 font-semibold text-white sm:col-span-2"
              >
                <Plus className="h-3.5 w-3.5" />
                {roleForm.designationId ? 'Update' : 'Add'}
              </button>
              {roleForm.designationId && (
                <button
                  type="button"
                  onClick={() =>
                    setRoleForm({
                      designationId: '',
                      title: '',
                      department: departments[0]?.name || 'Executive & Administration',
                      level: 'L3',
                      status: 'ACTIVE',
                    })
                  }
                  className="text-left text-[11px] text-slate-500 underline sm:col-span-12"
                >
                  Cancel editing role
                </button>
              )}
            </form>
            <div className="mt-3 max-h-64 divide-y divide-slate-100 overflow-y-auto text-xs">
              {designations.map((des) => (
                <div key={des.designationId} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <p className="font-medium text-slate-900">
                      {des.title}{' '}
                      <span className="font-mono text-[11px] text-slate-500">({des.level})</span>
                    </p>
                    <p className="text-[11px] text-slate-500">{des.department}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setRoleForm({
                          designationId: des.designationId,
                          title: des.title,
                          department: des.department,
                          level: des.level,
                          status: des.status || 'ACTIVE',
                        })
                      }
                      className="rounded border border-slate-200 p-1 text-slate-600 hover:bg-slate-50"
                      title="Edit role"
                    >
                      <Edit3 className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRole(des.designationId)}
                      className="rounded border border-red-200 p-1 text-red-600 hover:bg-red-50"
                      title="Delete role"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Departments Management */}
          <div className="metallic-surface rounded-xl p-5 lg:col-span-5">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
              <Building2 className="h-4 w-4 text-[#0B1B36]" />
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Departments ({departments.length})
              </h2>
            </div>
            <form onSubmit={handleSaveDepartment} className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-12">
              <input
                required
                type="text"
                value={deptForm.name}
                onChange={(e) => setDeptForm({...deptForm, name: e.target.value})}
                placeholder="Department Name"
                className="rounded-lg border border-slate-300 px-3 py-2 sm:col-span-6"
              />
              <input
                required
                type="text"
                value={deptForm.code}
                onChange={(e) => setDeptForm({...deptForm, code: e.target.value.toUpperCase()})}
                placeholder="Code"
                className="rounded-lg border border-slate-300 px-3 py-2 font-mono uppercase sm:col-span-3"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1 rounded-lg bg-[#0B1B36] px-3 py-2 font-semibold text-white sm:col-span-3"
              >
                <Plus className="h-3.5 w-3.5" />
                {deptForm.departmentId ? 'Update' : 'Add'}
              </button>
              {deptForm.departmentId && (
                <button
                  type="button"
                  onClick={() => setDeptForm({departmentId: '', name: '', code: ''})}
                  className="text-left text-[11px] text-slate-500 underline sm:col-span-12"
                >
                  Cancel editing department
                </button>
              )}
            </form>
            <div className="mt-3 max-h-64 divide-y divide-slate-100 overflow-y-auto text-xs">
              {departments.map((d) => (
                <div key={d.departmentId} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <p className="font-medium text-slate-900">{d.name}</p>
                    <p className="font-mono text-[11px] text-slate-500">{d.code}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setDeptForm({departmentId: d.departmentId, name: d.name, code: d.code})
                      }
                      className="rounded border border-slate-200 p-1 text-slate-600 hover:bg-slate-50"
                      title="Edit department"
                    >
                      <Edit3 className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDepartment(d.departmentId)}
                      className="rounded border border-red-200 p-1 text-red-600 hover:bg-red-50"
                      title="Delete department"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="metallic-surface overflow-hidden rounded-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-emerald-700" />
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900">
                  Overtime Audit &amp; Auto-Calculated Pay Ledger
                </h2>
                <p className="text-[11px] text-slate-500">
                  Tracks all duty &gt; {otAudit?.policy.afterHours ?? settings?.overtimeAfterHours ?? 9}h and auto-calculated OT pay (
                  {otAudit?.policy.rateMode === 'FIXED_HOURLY_RATE'
                    ? 'Fixed Hourly Rate'
                    : `${otAudit?.policy.basicPercentPerHour ?? settings?.overtimeBasicPercentPerHour ?? 1.5}% of Basic Salary/hr`}
                  )
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <input
                type="month"
                value={otAuditMonth}
                onChange={(e) => setOtAuditMonth(e.target.value)}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => loadOvertimeAudit(otAuditMonth)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingOtAudit ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={() =>
                  exportToCsv(
                    `Overtime_Audit_${otAuditMonth}.csv`,
                    [
                      'Employee ID',
                      'Employee Name',
                      'Department',
                      'Date',
                      'In Time',
                      'Out Time',
                      'Working Hours',
                      'Overtime Hours',
                      'Basic Salary (INR)',
                      'OT Rate / Hr (INR)',
                      'Calculated OT Pay (INR)',
                      'Status',
                      'Regularized By',
                    ],
                    (otAudit?.records || []).map((r) => [
                      r.employeeId,
                      r.employeeName,
                      r.department,
                      r.date,
                      r.checkInTime ? r.checkInTime.slice(11, 16) : '',
                      r.checkOutTime ? r.checkOutTime.slice(11, 16) : '',
                      r.workingHours,
                      r.overtimeHours,
                      r.basicSalary,
                      r.hourlyOtRate,
                      r.estimatedOtPay,
                      r.correctionStatus && r.correctionStatus !== 'NONE' ? `${r.status} (Reg: ${r.correctionStatus})` : r.status,
                      r.regularizedBy || '',
                    ]),
                  )
                }
                className="inline-flex items-center gap-1 rounded-lg bg-[#0B1B36] px-3 py-1.5 font-semibold text-white"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 border-b border-slate-200 bg-slate-50/70 p-4 text-xs sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-[11px] text-slate-500">Overtime Entries ({otAuditMonth})</p>
              <p className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
                {otAudit?.records.length || 0}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-[11px] text-slate-500">Total Overtime Hours</p>
              <p className="mt-1 font-mono text-lg font-semibold text-emerald-700 tabular-nums">
                {(otAudit?.records.reduce((s, r) => s + Number(r.overtimeHours || 0), 0) || 0).toFixed(2)} hrs
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-[11px] text-slate-500">Auto-Calculated OT Pay</p>
              <p className="mt-1 font-mono text-lg font-semibold text-[#0B1B36] tabular-nums">
                INR{' '}
                {(
                  otAudit?.records.reduce((s, r) => s + Number(r.estimatedOtPay || 0), 0) || 0
                ).toLocaleString('en-IN', {maximumFractionDigits: 2})}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-[11px] text-slate-500">Active Rate Rule</p>
              <p className="mt-1 font-mono text-sm font-semibold text-slate-900">
                {otAudit?.policy.enabled === false
                  ? 'Disabled'
                  : otAudit?.policy.rateMode === 'FIXED_HOURLY_RATE'
                    ? `Fixed / hr (>${otAudit?.policy.afterHours ?? 9}h)`
                    : `${otAudit?.policy.basicPercentPerHour ?? 1.5}% Basic/hr (>${otAudit?.policy.afterHours ?? 9}h)`}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-2.5">Employee / Date</th>
                  <th className="px-4 py-2.5">Shift In–Out</th>
                  <th className="px-4 py-2.5 text-right">Duty (h)</th>
                  <th className="px-4 py-2.5 text-right">Overtime (h)</th>
                  <th className="px-4 py-2.5 text-right">Basic Salary</th>
                  <th className="px-4 py-2.5 text-right">OT Rate / Hr</th>
                  <th className="px-4 py-2.5 text-right">Auto OT Pay</th>
                  <th className="px-4 py-2.5">Audit Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(otAudit?.records || []).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                      No overtime hours (&gt; {otAudit?.policy.afterHours ?? 9}h duty) logged for {otAuditMonth}.
                    </td>
                  </tr>
                ) : (
                  (otAudit?.records || []).map((r) => (
                    <tr key={r.attendanceId} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-900">{r.employeeName}</p>
                        <p className="font-mono text-[11px] text-slate-500">
                          {r.employeeId} · {r.date}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-600 tabular-nums">
                        {r.checkInTime ? r.checkInTime.slice(11, 16) : '—'} – {r.checkOutTime ? r.checkOutTime.slice(11, 16) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{r.workingHours}h</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                        +{r.overtimeHours}h
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {r.basicSalary > 0 ? `₹${r.basicSalary.toLocaleString('en-IN')}` : 'No structure'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700">
                        ₹{r.hourlyOtRate.toLocaleString('en-IN', {maximumFractionDigits: 2})}/hr
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-[#0B1B36] tabular-nums">
                        ₹{r.estimatedOtPay.toLocaleString('en-IN', {maximumFractionDigits: 2})}
                      </td>
                      <td className="px-4 py-2.5 text-[11px] text-slate-600">
                        {r.status}
                        {r.regularizedBy ? ` · Reg by ${r.regularizedBy}` : ''}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {user.role === 'SUPER_ADMIN' && <AdminOtpInbox user={user} onToast={onToast} />}

      {user.role === 'SUPER_ADMIN' && (
        <div className="metallic-surface overflow-hidden rounded-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#0B1B36]" />
              <h2 className="font-display text-sm font-semibold text-slate-900">Security &amp; Overtime Audit Trail</h2>
            </div>
            <select
              value={auditModuleFilter}
              onChange={(e) => setAuditModuleFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700"
            >
              <option value="ALL">All Modules</option>
              <option value="PAYROLL">Payroll &amp; Overtime</option>
              <option value="ATTENDANCE">Attendance</option>
              <option value="SETTINGS">Settings &amp; Rules</option>
              <option value="AUTH">Auth &amp; OTP</option>
              <option value="EMPLOYEES">Employees</option>
              <option value="LEAVES">Leaves</option>
            </select>
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-2.5">Timestamp</th>
                  <th className="px-4 py-2.5">Actor</th>
                  <th className="px-4 py-2.5">Module &amp; Action</th>
                  <th className="px-4 py-2.5">Target</th>
                  <th className="px-4 py-2.5">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs
                  .filter((log) => auditModuleFilter === 'ALL' || log.module === auditModuleFilter)
                  .map((log) => (
                    <tr key={log.logId}>
                      <td className="px-4 py-2.5 font-mono text-slate-600">{new Date(log.timestamp).toLocaleString()}</td>
                      <td className="px-4 py-2.5">
                        {log.actorName} <span className="font-mono text-slate-500">({log.actorRole})</span>
                      </td>
                      <td className="px-4 py-2.5 font-mono font-semibold text-slate-800">
                        {log.module} · {log.action}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-600">{log.targetId}</td>
                      <td className="px-4 py-2.5 text-slate-600">{log.details}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
