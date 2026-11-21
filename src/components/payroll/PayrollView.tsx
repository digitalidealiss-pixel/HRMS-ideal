import {Calculator, CheckCircle2, Download, Edit3, IndianRupee, Settings2, X} from 'lucide-react';
import {useEffect, useState, type FormEvent} from 'react';
import {callRpc} from '../../services/apiClient';
import {generatePayslipPdf} from '../../services/pdfExports';
import type {AppSettings, AuthUser, EmployeeRecord, PayrollRecord, SalaryStructure} from '../../types/hrms';

interface PayrollViewProps {
  user: AuthUser;
  onToast: (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;
}

export function PayrollView({user, onToast}: PayrollViewProps) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [payrolls, setPayrolls] = useState<PayrollRecord[]>([]);
  const [structures, setStructures] = useState<SalaryStructure[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [showStructModal, setShowStructModal] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [structForm, setStructForm] = useState({
    basicSalary: 25000,
    hra: 10000,
    conveyanceAllowance: 2000,
    specialAllowance: 5000,
    overtimeHourlyRate: 250,
    pfApplicable: true,
    pfEmployeePercent: 12,
    pfEmployerPercent: 12,
    pfWageCap: 15000,
    esiApplicable: false,
    esiEmployeePercent: 0.75,
    esiEmployerPercent: 3.25,
    ptApplicable: true,
    ptMonthlyAmount: 200,
    tdsMonthlyAmount: 0,
    otherFixedDeduction: 0,
  });

  const [editingPayroll, setEditingPayroll] = useState<PayrollRecord | null>(null);
  const [payEditForm, setPayEditForm] = useState({
    workingDaysInMonth: 26,
    presentDays: 26,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    overtimeHours: 0,
    basicEarned: 0,
    hraEarned: 0,
    allowancesEarned: 0,
    overtimePay: 0,
    incentives: 0,
    unpaidDeduction: 0,
    pfDeduction: 0,
    esiDeduction: 0,
    professionalTax: 0,
    tdsDeduction: 0,
    otherDeductions: 0,
    status: 'DRAFT' as PayrollRecord['status'],
  });

  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'HR_ADMIN';

  const loadPayroll = async () => {
    setLoading(true);
    try {
      const [payRes, empRes, setRes] = await Promise.all([
        callRpc<{ok: boolean; structures: SalaryStructure[]; payrolls: PayrollRecord[]}>(
          'getPayrollData',
          {month},
          {cacheKey: `payroll_${user.employeeId}_${month}`},
        ),
        callRpc<{ok: boolean; employees: EmployeeRecord[]}>('getEmployees'),
        callRpc<{ok: boolean; settings: AppSettings}>('getSettings'),
      ]);
      setPayrolls(payRes.payrolls || []);
      setStructures(payRes.structures || []);
      setEmployees(empRes.employees || []);
      setSettings(setRes.settings || null);
    } catch (err: any) {
      onToast('error', 'Failed to load payroll', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayroll();
  }, [month]);

  const openStructureEditor = (empId: string) => {
    setSelectedEmpId(empId);
    const existing = structures.find((s) => s.employeeId === empId);
    if (existing) {
      setStructForm({
        basicSalary: existing.basicSalary,
        hra: existing.hra,
        conveyanceAllowance: existing.conveyanceAllowance,
        specialAllowance: existing.specialAllowance,
        overtimeHourlyRate: existing.overtimeHourlyRate,
        pfApplicable: Boolean(existing.pfApplicable),
        pfEmployeePercent: existing.pfEmployeePercent,
        pfEmployerPercent: existing.pfEmployerPercent,
        pfWageCap: existing.pfWageCap,
        esiApplicable: Boolean(existing.esiApplicable),
        esiEmployeePercent: existing.esiEmployeePercent,
        esiEmployerPercent: existing.esiEmployerPercent,
        ptApplicable: Boolean(existing.ptApplicable),
        ptMonthlyAmount: existing.ptMonthlyAmount,
        tdsMonthlyAmount: existing.tdsMonthlyAmount,
        otherFixedDeduction: existing.otherFixedDeduction,
      });
    }
    setShowStructModal(true);
  };

  const handleSaveStructure = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await callRpc('saveSalaryStructure', {employeeId: selectedEmpId, ...structForm});
      setShowStructModal(false);
      onToast('success', 'Salary structure saved', selectedEmpId);
      await loadPayroll();
    } catch (err: any) {
      onToast('error', 'Save failed', err.message);
    }
  };

  const handleGeneratePayroll = async () => {
    setGenerating(true);
    try {
      const res = await callRpc<{ok: boolean; count: number}>('generatePayroll', {month});
      onToast('success', 'Monthly payroll generated', `${res.count} employee statement(s) computed for ${month}.`);
      await loadPayroll();
    } catch (err: any) {
      onToast('error', 'Payroll generation failed', err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleStatusChange = async (payrollId: string, status: 'APPROVED' | 'PAID') => {
    try {
      await callRpc('updatePayrollStatus', {payrollId, status});
      onToast('success', `Payroll marked ${status}`);
      await loadPayroll();
    } catch (err: any) {
      onToast('error', 'Update failed', err.message);
    }
  };

  const openPayrollEditor = (p: PayrollRecord) => {
    setEditingPayroll(p);
    setPayEditForm({
      workingDaysInMonth: p.workingDaysInMonth,
      presentDays: p.presentDays,
      paidLeaveDays: p.paidLeaveDays,
      unpaidLeaveDays: p.unpaidLeaveDays,
      overtimeHours: p.overtimeHours,
      basicEarned: p.basicEarned,
      hraEarned: p.hraEarned,
      allowancesEarned: p.allowancesEarned,
      overtimePay: p.overtimePay,
      incentives: p.incentives,
      unpaidDeduction: p.unpaidDeduction,
      pfDeduction: p.pfDeduction,
      esiDeduction: p.esiDeduction,
      professionalTax: p.professionalTax,
      tdsDeduction: p.tdsDeduction,
      otherDeductions: p.otherDeductions,
      status: p.status,
    });
  };

  const handleSavePayrollEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingPayroll) return;
    try {
      await callRpc('updatePayrollRecord', {
        payrollId: editingPayroll.payrollId,
        ...payEditForm,
      });
      setEditingPayroll(null);
      onToast('success', 'Payroll statement updated');
      await loadPayroll();
    } catch (err: any) {
      onToast('error', 'Failed to update payroll', err.message);
    }
  };

  const liveGross =
    Number(payEditForm.basicEarned || 0) +
    Number(payEditForm.hraEarned || 0) +
    Number(payEditForm.allowancesEarned || 0) +
    Number(payEditForm.overtimePay || 0) +
    Number(payEditForm.incentives || 0);
  const liveDeductions =
    Number(payEditForm.unpaidDeduction || 0) +
    Number(payEditForm.pfDeduction || 0) +
    Number(payEditForm.esiDeduction || 0) +
    Number(payEditForm.professionalTax || 0) +
    Number(payEditForm.tdsDeduction || 0) +
    Number(payEditForm.otherDeductions || 0);
  const liveNet = Math.max(0, liveGross - liveDeductions);

  return (
    <div className="space-y-5">
      <div className="metallic-navy-panel overflow-hidden rounded-2xl text-white">
        <div className="h-1 w-full bg-gradient-to-r from-emerald-400 via-amber-400 to-blue-400" />
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-xl font-semibold text-white">
              {isAdmin ? 'Indian Statutory Payroll & Payslips' : 'My Salary Slips'}
            </h1>
            <p className="mt-0.5 text-xs text-sky-100/85">
              Attendance &amp; LWP linked · Configurable per-employee PF, ESI, Professional Tax &amp; TDS
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="min-h-[40px] rounded-lg border border-white/25 bg-white/10 px-3 font-mono text-xs text-white [color-scheme:dark]"
            />
            {isAdmin && (
              <button
                type="button"
                disabled={generating}
                onClick={handleGeneratePayroll}
                className="metallic-btn-gold inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-60"
              >
                <Calculator className="h-4 w-4" />
                {generating ? 'Computing...' : `Run Payroll (${month})`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Salary Structures Table (Admin Only) */}
      {isAdmin && (
        <div className="metallic-surface rounded-xl p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-slate-900">Employee Salary Structures &amp; Statutory Rules</h2>
            <span className="text-xs text-slate-500">{structures.length} configured</span>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2.5">Employee</th>
                  <th className="px-3 py-2.5">Gross Monthly</th>
                  <th className="px-3 py-2.5">Statutory Applicability</th>
                  <th className="px-3 py-2.5 text-right">Configure</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((emp) => {
                  const st = structures.find((s) => s.employeeId === emp.employeeId);
                  const gross = st
                    ? st.basicSalary + st.hra + st.conveyanceAllowance + st.specialAllowance
                    : 0;
                  return (
                    <tr key={emp.employeeId}>
                      <td className="px-3 py-2.5">
                        <span className="font-medium text-slate-900">{emp.fullName}</span>{' '}
                        <span className="font-mono text-slate-500">({emp.employeeId})</span>
                      </td>
                      <td className="px-3 py-2.5 font-mono tabular-nums">
                        {st ? `INR ${gross.toLocaleString('en-IN')}` : 'Not configured'}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">
                        {st
                          ? [
                              st.pfApplicable ? 'PF' : null,
                              st.esiApplicable ? 'ESI' : null,
                              st.ptApplicable ? 'PT' : null,
                              st.tdsMonthlyAmount > 0 ? 'TDS' : null,
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'No statutory deductions'
                          : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => openStructureEditor(emp.employeeId)}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                          {st ? 'Edit Structure' : 'Configure'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Generated Payroll Register */}
      <div className="metallic-surface overflow-hidden rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
          <h2 className="font-display text-sm font-semibold text-slate-900">Payroll Statements ({month})</h2>
          <span className="text-[11px] font-medium text-emerald-800">
            {settings?.overtimeEnabled === false
              ? 'Overtime Auto-Pay: Disabled in Settings'
              : settings?.overtimeRateMode === 'FIXED_HOURLY_RATE'
                ? `Overtime Auto-Pay: Fixed Hourly Rate after ${settings?.overtimeAfterHours ?? 9}h duty`
                : `Overtime Auto-Pay: ${settings?.overtimeBasicPercentPerHour ?? 1.5}% of Basic Salary/hr after ${settings?.overtimeAfterHours ?? 9}h duty`}
          </span>
        </div>
        {loading ? (
          <p className="p-6 text-center text-xs text-slate-500">Loading payroll data...</p>
        ) : payrolls.length === 0 ? (
          <p className="p-8 text-center text-xs text-slate-500">
            No payroll generated for {month} yet. Configure salary structures and click Run Payroll.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2.5">Employee</th>
                  <th className="px-3 py-2.5">Attendance / LWP / OT</th>
                  <th className="px-3 py-2.5 text-right">Gross (INR)</th>
                  <th className="px-3 py-2.5 text-right">Deductions</th>
                  <th className="px-3 py-2.5 text-right">Net Payable</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payrolls.map((p) => {
                  const emp = employees.find((e) => e.employeeId === p.employeeId);
                  return (
                    <tr key={p.payrollId} className="hover:bg-slate-50/70">
                      <td className="px-3 py-3">
                        <p className="font-medium text-slate-900">{p.employeeName}</p>
                        <p className="font-mono text-slate-500">
                          {p.employeeId} · {p.department}
                        </p>
                      </td>
                      <td className="px-3 py-3 font-mono tabular-nums text-slate-700">
                        <div>
                          {p.presentDays}d Present · {p.unpaidLeaveDays}d LWP · {p.overtimeHours}h OT
                        </div>
                        {p.overtimePay > 0 && (
                          <div className="text-[11px] font-semibold text-emerald-700">
                            OT Pay: +₹{p.overtimePay.toLocaleString('en-IN', {maximumFractionDigits: 2})}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">
                        {p.grossEarnings.toLocaleString('en-IN', {maximumFractionDigits: 2})}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-red-600 tabular-nums">
                        -{p.totalDeductions.toLocaleString('en-IN', {maximumFractionDigits: 2})}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                        {p.netPayable.toLocaleString('en-IN', {maximumFractionDigits: 2})}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`font-semibold ${
                            p.status === 'PAID'
                              ? 'text-emerald-700'
                              : p.status === 'APPROVED'
                                ? 'text-[#0B1B36]'
                                : 'text-amber-700'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => openPayrollEditor(p)}
                              className="inline-flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                            >
                              <Edit3 className="h-3 w-3" /> Edit
                            </button>
                          )}
                          {isAdmin && p.status === 'DRAFT' && (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(p.payrollId, 'APPROVED')}
                              className="inline-flex items-center gap-1 rounded bg-[#0B1B36] px-2.5 py-1 text-[11px] font-medium text-white"
                            >
                              <CheckCircle2 className="h-3 w-3" /> Approve
                            </button>
                          )}
                          {isAdmin && p.status === 'APPROVED' && (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(p.payrollId, 'PAID')}
                              className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white"
                            >
                              <IndianRupee className="h-3 w-3" /> Mark Paid
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => generatePayslipPdf(p, emp)}
                            className="inline-flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                          >
                            <Download className="h-3 w-3" /> Payslip PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Salary Structure Modal */}
      {showStructModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Salary &amp; Statutory Rules ({selectedEmpId})
              </h3>
              <button type="button" onClick={() => setShowStructModal(false)} className="text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveStructure} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block font-medium text-slate-700">Basic Salary (INR)</label>
                  <input
                    type="number"
                    min={0}
                    value={structForm.basicSalary}
                    onChange={(e) => setStructForm({...structForm, basicSalary: Number(e.target.value)})}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700">HRA (INR)</label>
                  <input
                    type="number"
                    min={0}
                    value={structForm.hra}
                    onChange={(e) => setStructForm({...structForm, hra: Number(e.target.value)})}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700">Conveyance Allowance</label>
                  <input
                    type="number"
                    min={0}
                    value={structForm.conveyanceAllowance}
                    onChange={(e) => setStructForm({...structForm, conveyanceAllowance: Number(e.target.value)})}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700">Special Allowance</label>
                  <input
                    type="number"
                    min={0}
                    value={structForm.specialAllowance}
                    onChange={(e) => setStructForm({...structForm, specialAllowance: Number(e.target.value)})}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700">
                    Fixed OT Hourly Rate (Fallback)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={structForm.overtimeHourlyRate}
                    onChange={(e) => setStructForm({...structForm, overtimeHourlyRate: Number(e.target.value)})}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                  <p className="mt-1 text-[10px] text-emerald-700">
                    Active Auto-OT ({settings?.overtimeBasicPercentPerHour ?? 1.5}% Basic/hr): ₹
                    {((structForm.basicSalary * Number(settings?.overtimeBasicPercentPerHour ?? 1.5)) / 100).toFixed(2)}/hr
                  </p>
                </div>
                <div>
                  <label className="block font-medium text-slate-700">TDS Monthly (INR)</label>
                  <input
                    type="number"
                    min={0}
                    value={structForm.tdsMonthlyAmount}
                    onChange={(e) => setStructForm({...structForm, tdsMonthlyAmount: Number(e.target.value)})}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700">PF Wage Cap (INR)</label>
                  <input
                    type="number"
                    min={0}
                    value={structForm.pfWageCap}
                    onChange={(e) => setStructForm({...structForm, pfWageCap: Number(e.target.value)})}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700">Other Fixed Deduction (INR)</label>
                  <input
                    type="number"
                    min={0}
                    value={structForm.otherFixedDeduction}
                    onChange={(e) => setStructForm({...structForm, otherFixedDeduction: Number(e.target.value)})}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 border-t border-slate-200 pt-3 sm:grid-cols-3">
                <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                  <label className="flex items-center gap-2 font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={structForm.pfApplicable}
                      onChange={(e) => setStructForm({...structForm, pfApplicable: e.target.checked})}
                    />
                    PF Applicable
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={structForm.pfEmployeePercent}
                    onChange={(e) => setStructForm({...structForm, pfEmployeePercent: Number(e.target.value)})}
                    placeholder="Employee %"
                    className="w-full rounded border border-slate-300 px-2 py-1 font-mono"
                  />
                </div>
                <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                  <label className="flex items-center gap-2 font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={structForm.esiApplicable}
                      onChange={(e) => setStructForm({...structForm, esiApplicable: e.target.checked})}
                    />
                    ESI Applicable (&le; 21k)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    value={structForm.esiEmployeePercent}
                    onChange={(e) => setStructForm({...structForm, esiEmployeePercent: Number(e.target.value)})}
                    placeholder="Employee %"
                    className="w-full rounded border border-slate-300 px-2 py-1 font-mono"
                  />
                </div>
                <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                  <label className="flex items-center gap-2 font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={structForm.ptApplicable}
                      onChange={(e) => setStructForm({...structForm, ptApplicable: e.target.checked})}
                    />
                    Professional Tax
                  </label>
                  <input
                    type="number"
                    value={structForm.ptMonthlyAmount}
                    onChange={(e) => setStructForm({...structForm, ptMonthlyAmount: Number(e.target.value)})}
                    placeholder="PT Amount"
                    className="w-full rounded border border-slate-300 px-2 py-1 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setShowStructModal(false)} className="rounded-lg border px-4 py-2">
                  Cancel
                </button>
                <button type="submit" className="rounded-lg bg-[#0B1B36] px-5 py-2 font-semibold text-white">
                  Save Salary Structure
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Edit Payroll Statement Modal */}
      {editingPayroll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Edit Payroll Statement · {editingPayroll.employeeName} ({editingPayroll.month})
                </h3>
                <p className="font-mono text-[11px] text-slate-500">{editingPayroll.payrollId}</p>
              </div>
              <button type="button" onClick={() => setEditingPayroll(null)} className="text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSavePayrollEdit} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  ['workingDaysInMonth', 'Working Days'],
                  ['presentDays', 'Present Days'],
                  ['paidLeaveDays', 'Paid Leaves'],
                  ['unpaidLeaveDays', 'LWP Days'],
                  ['overtimeHours', 'OT Hours'],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label className="block font-medium text-slate-700">{label}</label>
                    <input
                      type="number"
                      step="0.5"
                      min={0}
                      value={(payEditForm as any)[key]}
                      onChange={(e) => setPayEditForm({...payEditForm, [key]: Number(e.target.value)})}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 font-mono"
                    />
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-200 pt-3">
                <p className="mb-2 font-semibold text-slate-800">Earnings (INR)</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {[
                    ['basicEarned', 'Basic'],
                    ['hraEarned', 'HRA'],
                    ['allowancesEarned', 'Allowances'],
                    ['overtimePay', 'Overtime Pay'],
                    ['incentives', 'Incentives / Bonus'],
                  ].map(([key, label]) => (
                    <div key={key}>
                      <label className="block font-medium text-slate-700">{label}</label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={(payEditForm as any)[key]}
                        onChange={(e) => setPayEditForm({...payEditForm, [key]: Number(e.target.value)})}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 font-mono"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3">
                <p className="mb-2 font-semibold text-slate-800">Deductions (INR)</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                  {[
                    ['unpaidDeduction', 'LWP Deduction'],
                    ['pfDeduction', 'PF'],
                    ['esiDeduction', 'ESI'],
                    ['professionalTax', 'Prof. Tax'],
                    ['tdsDeduction', 'TDS'],
                    ['otherDeductions', 'Other Ded.'],
                  ].map(([key, label]) => (
                    <div key={key}>
                      <label className="block font-medium text-slate-700">{label}</label>
                      <input
                        type="number"
                        min={0}
                        value={(payEditForm as any)[key]}
                        onChange={(e) => setPayEditForm({...payEditForm, [key]: Number(e.target.value)})}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 font-mono"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap gap-4 font-mono">
                  <span>
                    Gross: <strong className="text-slate-900">INR {liveGross.toLocaleString('en-IN')}</strong>
                  </span>
                  <span>
                    Deductions: <strong className="text-red-600">-{liveDeductions.toLocaleString('en-IN')}</strong>
                  </span>
                  <span>
                    Net Payable: <strong className="text-emerald-700">INR {liveNet.toLocaleString('en-IN')}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="font-medium text-slate-700">Status:</label>
                  <select
                    value={payEditForm.status}
                    onChange={(e) => setPayEditForm({...payEditForm, status: e.target.value as PayrollRecord['status']})}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-semibold"
                  >
                    <option value="DRAFT">DRAFT</option>
                    <option value="APPROVED">APPROVED</option>
                    <option value="PAID">PAID</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditingPayroll(null)} className="rounded-lg border px-4 py-2">
                  Cancel
                </button>
                <button type="submit" className="rounded-lg bg-[#0B1B36] px-5 py-2 font-semibold text-white">
                  Save Payroll Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
