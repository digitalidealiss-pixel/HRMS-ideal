import {Award, Edit3, Plus, Trash2, X} from 'lucide-react';
import {useEffect, useState, type FormEvent} from 'react';
import {callRpc} from '../../services/apiClient';
import type {AuthUser, EmployeeRecord, PerformanceKPI, PerformanceReview} from '../../types/hrms';
import {ChartCanvas} from '../common/ChartCanvas';

interface PerformanceViewProps {
  user: AuthUser;
  onToast: (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;
}

const CRITERIA_LABELS: [keyof PerformanceReview['criteria'], string][] = [
  ['attendancePunctuality', 'Attendance & Punctuality'],
  ['workQuality', 'Work Quality'],
  ['productivity', 'Productivity'],
  ['communication', 'Communication'],
  ['teamwork', 'Teamwork'],
  ['discipline', 'Discipline'],
  ['targetAchievement', 'Target Achievement'],
  ['initiative', 'Initiative'],
];

export function PerformanceView({user, onToast}: PerformanceViewProps) {
  const [reviews, setReviews] = useState<PerformanceReview[]>([]);
  const [kpis, setKpis] = useState<PerformanceKPI[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showKpiModal, setShowKpiModal] = useState(false);

  const [reviewForm, setReviewForm] = useState({
    reviewId: '',
    employeeId: user.employeeId,
    cycleType: 'MONTHLY' as PerformanceReview['cycleType'],
    periodLabel: new Date().toISOString().slice(0, 7),
    criteria: {
      attendancePunctuality: 4,
      workQuality: 4,
      productivity: 4,
      communication: 4,
      teamwork: 4,
      discipline: 4,
      targetAchievement: 4,
      initiative: 4,
    },
    selfAssessmentScore: 4,
    selfAssessmentNotes: '',
    managerRating: 4,
    managerFeedback: '',
    hrComments: '',
    strengths: '',
    improvementAreas: '',
    status: 'MANAGER_REVIEW' as PerformanceReview['status'],
  });

  const [kpiForm, setKpiForm] = useState({
    kpiId: '',
    employeeId: user.employeeId,
    title: '',
    targetValue: '',
    achievedValue: '',
    weightPercent: 25,
    period: new Date().toISOString().slice(0, 7),
  });

  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'HR_ADMIN';

  const loadData = async () => {
    try {
      const [perfRes, empRes] = await Promise.all([
        callRpc<{ok: boolean; reviews: PerformanceReview[]; kpis: PerformanceKPI[]}>('getPerformanceData'),
        callRpc<{ok: boolean; employees: EmployeeRecord[]}>('getEmployees'),
      ]);
      setReviews(perfRes.reviews || []);
      setKpis(perfRes.kpis || []);
      setEmployees(empRes.employees || []);
    } catch (err: any) {
      onToast('error', 'Performance load failed', err.message);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveReview = async (e: FormEvent) => {
    e.preventDefault();
    const emp = employees.find((x) => x.employeeId === reviewForm.employeeId);
    try {
      await callRpc('savePerformanceReview', {
        ...reviewForm,
        employeeName: emp?.fullName || user.fullName,
        department: emp?.department || user.department,
        managerRating: Number(reviewForm.managerRating),
      });
      setShowReviewModal(false);
      onToast('success', 'Performance review saved');
      await loadData();
    } catch (err: any) {
      onToast('error', 'Save failed', err.message);
    }
  };

  const handleSaveKpi = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await callRpc('saveKPI', {
        ...kpiForm,
        kpiId: kpiForm.kpiId || undefined,
      });
      setShowKpiModal(false);
      onToast('success', kpiForm.kpiId ? 'KPI target updated' : 'KPI target added');
      await loadData();
    } catch (err: any) {
      onToast('error', 'KPI save failed', err.message);
    }
  };

  const handleDeleteKpi = async (kpiId: string) => {
    try {
      await callRpc('deleteKPI', {kpiId});
      onToast('info', 'KPI target deleted');
      await loadData();
    } catch (err: any) {
      onToast('error', 'Delete failed', err.message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="metallic-navy-panel overflow-hidden rounded-2xl text-white">
        <div className="h-1 w-full bg-gradient-to-r from-amber-400 via-blue-400 to-emerald-400" />
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-xl font-semibold text-white">Performance Reviews &amp; KPIs</h1>
            <p className="mt-0.5 text-xs text-sky-100/85">
              Monthly, Quarterly &amp; Annual appraisals · Self-assessment &amp; manager evaluation
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setKpiForm({
                    kpiId: '',
                    employeeId: employees[0]?.employeeId || user.employeeId,
                    title: '',
                    targetValue: '',
                    achievedValue: '',
                    weightPercent: 25,
                    period: new Date().toISOString().slice(0, 7),
                  });
                  setShowKpiModal(true);
                }}
                className="min-h-[40px] rounded-lg border border-white/25 bg-white/10 px-3.5 py-2 text-xs font-medium text-white hover:bg-white/20"
              >
                Add KPI Target
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setReviewForm((f) => ({...f, reviewId: ''}));
                setShowReviewModal(true);
              }}
              className="metallic-btn-gold inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold"
            >
              <Plus className="h-4 w-4" />
              {isAdmin ? 'New Appraisal' : 'Submit Self-Assessment'}
            </button>
          </div>
        </div>
      </div>

      {/* Graphical Performance Report + KPI List */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="metallic-surface rounded-xl p-5 lg:col-span-6">
          <h2 className="mb-3 font-display text-sm font-semibold text-slate-900">Rating Overview (out of 5)</h2>
          <ChartCanvas
            isEmpty={reviews.length === 0}
            emptyText="Complete performance reviews to view rating trends."
            config={{
              type: 'bar',
              data: {
                labels: reviews.slice(0, 10).map((r) => `${r.employeeName} (${r.periodLabel})`),
                datasets: [
                  {
                    label: 'Manager Rating',
                    data: reviews.slice(0, 10).map((r) => r.managerRating),
                    backgroundColor: '#1D4ED8',
                    borderRadius: 4,
                  },
                  {
                    label: 'Self Score',
                    data: reviews.slice(0, 10).map((r) => r.selfAssessmentScore),
                    backgroundColor: '#F59E0B',
                    borderRadius: 4,
                  },
                ],
              },
            }}
          />
        </div>

        <div className="metallic-surface rounded-xl p-5 lg:col-span-6">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-[#0B1B36]" />
            <h2 className="font-display text-sm font-semibold text-slate-900">KPI Targets</h2>
          </div>
          <div className="mt-3 divide-y divide-slate-100 text-xs">
            {kpis.length === 0 ? (
              <p className="py-8 text-center text-slate-500">No KPI targets defined yet.</p>
            ) : (
              kpis.map((k) => (
                <div key={k.kpiId} className="flex items-center justify-between gap-2 py-2.5">
                  <div>
                    <p className="font-medium text-slate-900">{k.title}</p>
                    <p className="text-slate-500">
                      {k.employeeId} · Period {k.period} · Weight {k.weightPercent}%
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-slate-900">
                      {k.achievedValue || '0'} / {k.targetValue}
                    </span>
                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setKpiForm({
                              kpiId: k.kpiId,
                              employeeId: k.employeeId,
                              title: k.title,
                              targetValue: k.targetValue,
                              achievedValue: k.achievedValue,
                              weightPercent: k.weightPercent,
                              period: k.period,
                            });
                            setShowKpiModal(true);
                          }}
                          className="rounded border border-slate-200 p-1 text-slate-600 hover:bg-slate-50"
                          title="Edit KPI"
                        >
                          <Edit3 className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteKpi(k.kpiId)}
                          className="rounded border border-red-200 p-1 text-red-600 hover:bg-red-50"
                          title="Delete KPI"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Reviews Table */}
      <div className="metallic-surface overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Cycle &amp; Period</th>
                <th className="px-4 py-3">Self Score</th>
                <th className="px-4 py-3">Manager Rating</th>
                <th className="px-4 py-3">Strengths &amp; Feedback</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reviews.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    No performance reviews recorded yet.
                  </td>
                </tr>
              ) : (
                reviews.map((r) => (
                  <tr key={r.reviewId}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{r.employeeName}</p>
                      <p className="font-mono text-slate-500">
                        {r.employeeId} · {r.department}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {r.cycleType} · {r.periodLabel}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums">{r.selfAssessmentScore} / 5</td>
                    <td className="px-4 py-3 font-mono font-semibold text-slate-900 tabular-nums">
                      {r.managerRating} / 5
                    </td>
                    <td className="max-w-xs px-4 py-3 text-slate-600">
                      <p className="truncate">{r.managerFeedback || r.selfAssessmentNotes || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setReviewForm({
                            reviewId: r.reviewId,
                            employeeId: r.employeeId,
                            cycleType: r.cycleType,
                            periodLabel: r.periodLabel,
                            criteria: r.criteria,
                            selfAssessmentScore: r.selfAssessmentScore,
                            selfAssessmentNotes: r.selfAssessmentNotes,
                            managerRating: r.managerRating,
                            managerFeedback: r.managerFeedback,
                            hrComments: r.hrComments,
                            strengths: r.strengths,
                            improvementAreas: r.improvementAreas,
                            status: r.status,
                          });
                          setShowReviewModal(true);
                        }}
                        className="inline-flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
                      >
                        {isAdmin && <Edit3 className="h-3 w-3" />}
                        {isAdmin ? 'Edit Review' : 'Open'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-display text-base font-semibold text-slate-900">Performance Review</h3>
              <button type="button" onClick={() => setShowReviewModal(false)} className="text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveReview} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block font-medium text-slate-700">Employee</label>
                  <select
                    disabled={!isAdmin}
                    value={reviewForm.employeeId}
                    onChange={(e) => setReviewForm({...reviewForm, employeeId: e.target.value})}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                  >
                    {employees.map((emp) => (
                      <option key={emp.employeeId} value={emp.employeeId}>
                        {emp.employeeId} — {emp.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700">Cycle</label>
                  <select
                    value={reviewForm.cycleType}
                    onChange={(e) =>
                      setReviewForm({...reviewForm, cycleType: e.target.value as PerformanceReview['cycleType']})
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="QUARTERLY">Quarterly</option>
                    <option value="ANNUAL">Annual</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700">Period Label</label>
                  <input
                    required
                    type="text"
                    value={reviewForm.periodLabel}
                    onChange={(e) => setReviewForm({...reviewForm, periodLabel: e.target.value})}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-4">
                {CRITERIA_LABELS.map(([key, label]) => (
                  <div key={key}>
                    <label className="block font-medium text-slate-700">{label} (1-5)</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      step={0.5}
                      value={reviewForm.criteria[key]}
                      onChange={(e) => {
                        const nextCriteria = {...reviewForm.criteria, [key]: Number(e.target.value)};
                        const avg =
                          Object.values(nextCriteria).reduce((acc, v) => acc + Number(v), 0) / CRITERIA_LABELS.length;
                        setReviewForm({
                          ...reviewForm,
                          criteria: nextCriteria,
                          managerRating: isAdmin ? Math.round(avg * 10) / 10 : reviewForm.managerRating,
                        });
                      }}
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 font-mono"
                    />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block font-medium text-slate-700">Self-Assessment Score (1-5)</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    step={0.5}
                    value={reviewForm.selfAssessmentScore}
                    onChange={(e) => setReviewForm({...reviewForm, selfAssessmentScore: Number(e.target.value)})}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
                {isAdmin && (
                  <div>
                    <label className="block font-medium text-slate-700">Manager Rating (1-5)</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      step={0.1}
                      value={reviewForm.managerRating}
                      onChange={(e) => setReviewForm({...reviewForm, managerRating: Number(e.target.value)})}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                    />
                  </div>
                )}
                <div>
                  <label className="block font-medium text-slate-700">Status</label>
                  <select
                    disabled={!isAdmin}
                    value={reviewForm.status}
                    onChange={(e) =>
                      setReviewForm({...reviewForm, status: e.target.value as PerformanceReview['status']})
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                  >
                    <option value="SELF_PENDING">Self Pending</option>
                    <option value="MANAGER_REVIEW">Manager Review</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                </div>
              </div>

              <textarea
                rows={2}
                value={reviewForm.selfAssessmentNotes}
                onChange={(e) => setReviewForm({...reviewForm, selfAssessmentNotes: e.target.value})}
                placeholder="Employee self-assessment summary..."
                className="w-full rounded-lg border border-slate-300 p-2.5"
              />
              {isAdmin && (
                <>
                  <textarea
                    rows={2}
                    value={reviewForm.managerFeedback}
                    onChange={(e) => setReviewForm({...reviewForm, managerFeedback: e.target.value})}
                    placeholder="Manager feedback..."
                    className="w-full rounded-lg border border-slate-300 p-2.5"
                  />
                  <textarea
                    rows={2}
                    value={reviewForm.hrComments}
                    onChange={(e) => setReviewForm({...reviewForm, hrComments: e.target.value})}
                    placeholder="HR / Admin comments & appraisal remarks..."
                    className="w-full rounded-lg border border-slate-300 p-2.5"
                  />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input
                      type="text"
                      value={reviewForm.strengths}
                      onChange={(e) => setReviewForm({...reviewForm, strengths: e.target.value})}
                      placeholder="Key strengths"
                      className="rounded-lg border border-slate-300 px-3 py-2"
                    />
                    <input
                      type="text"
                      value={reviewForm.improvementAreas}
                      onChange={(e) => setReviewForm({...reviewForm, improvementAreas: e.target.value})}
                      placeholder="Improvement areas"
                      className="rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowReviewModal(false)} className="rounded-lg border px-4 py-2">
                  Cancel
                </button>
                <button type="submit" className="rounded-lg bg-[#0B1B36] px-5 py-2 font-semibold text-white">
                  Save Review
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* KPI Modal */}
      {showKpiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="font-display text-base font-semibold text-slate-900">
              {kpiForm.kpiId ? 'Edit KPI Target' : 'Assign KPI Target'}
            </h3>
            <form onSubmit={handleSaveKpi} className="mt-4 space-y-3 text-xs">
              <select
                value={kpiForm.employeeId}
                onChange={(e) => setKpiForm({...kpiForm, employeeId: e.target.value})}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                {employees.map((emp) => (
                  <option key={emp.employeeId} value={emp.employeeId}>
                    {emp.employeeId} — {emp.fullName}
                  </option>
                ))}
              </select>
              <input
                required
                type="text"
                value={kpiForm.title}
                onChange={(e) => setKpiForm({...kpiForm, title: e.target.value})}
                placeholder="KPI Title (e.g. Monthly Site Inspections)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  required
                  type="text"
                  value={kpiForm.targetValue}
                  onChange={(e) => setKpiForm({...kpiForm, targetValue: e.target.value})}
                  placeholder="Target (e.g. 20)"
                  className="rounded-lg border border-slate-300 px-3 py-2"
                />
                <input
                  type="text"
                  value={kpiForm.achievedValue}
                  onChange={(e) => setKpiForm({...kpiForm, achievedValue: e.target.value})}
                  placeholder="Achieved (e.g. 14)"
                  className="rounded-lg border border-slate-300 px-3 py-2"
                />
                <input
                  required
                  type="number"
                  min={1}
                  max={100}
                  value={kpiForm.weightPercent}
                  onChange={(e) => setKpiForm({...kpiForm, weightPercent: Number(e.target.value)})}
                  placeholder="Weight %"
                  className="rounded-lg border border-slate-300 px-3 py-2 font-mono"
                />
                <input
                  required
                  type="text"
                  value={kpiForm.period}
                  onChange={(e) => setKpiForm({...kpiForm, period: e.target.value})}
                  placeholder="Period (e.g. 2026-04)"
                  className="rounded-lg border border-slate-300 px-3 py-2 font-mono"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowKpiModal(false)} className="rounded-lg border px-4 py-2">
                  Cancel
                </button>
                <button type="submit" className="rounded-lg bg-[#0B1B36] px-4 py-2 font-semibold text-white">
                  Save KPI
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
