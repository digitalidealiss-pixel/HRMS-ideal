import {AlertTriangle, Edit3, Plus, Trash2, X} from 'lucide-react';
import {useEffect, useState, type FormEvent} from 'react';
import {callRpc} from '../../services/apiClient';
import type {AuthUser, EmployeeRecord, TaskPriority, TaskRecord, TaskStatus} from '../../types/hrms';

interface TasksViewProps {
  user: AuthUser;
  onToast: (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;
}

export function TasksView({user, onToast}: TasksViewProps) {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  const [form, setForm] = useState({
    taskId: '',
    title: '',
    description: '',
    assignedToId: user.employeeId,
    priority: 'MEDIUM' as TaskPriority,
    deadline: new Date().toISOString().slice(0, 10),
    targetMetric: '',
    progressPercent: 0,
    status: 'TODO' as TaskStatus,
    completionEvidence: '',
    managerComments: '',
  });

  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'HR_ADMIN';

  const loadTasks = async () => {
    try {
      const [taskRes, empRes] = await Promise.all([
        callRpc<{ok: boolean; tasks: TaskRecord[]}>('getTasks', {}, {cacheKey: `tasks_${user.employeeId}`}),
        callRpc<{ok: boolean; employees: EmployeeRecord[]}>('getEmployees'),
      ]);
      setTasks(taskRes.tasks || []);
      setEmployees(empRes.employees || []);
      if (empRes.employees?.length && !form.assignedToId) {
        setForm((f) => ({...f, assignedToId: empRes.employees[0].employeeId}));
      }
    } catch (err: any) {
      onToast('error', 'Failed to load tasks', err.message);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const openCreateModal = () => {
    setForm({
      taskId: '',
      title: '',
      description: '',
      assignedToId: employees[0]?.employeeId || user.employeeId,
      priority: 'MEDIUM',
      deadline: new Date().toISOString().slice(0, 10),
      targetMetric: '',
      progressPercent: 0,
      status: 'TODO',
      completionEvidence: '',
      managerComments: '',
    });
    setShowCreate(true);
  };

  const openEditModal = (t: TaskRecord) => {
    setForm({
      taskId: t.taskId,
      title: t.title,
      description: t.description,
      assignedToId: t.assignedToId,
      priority: t.priority,
      deadline: t.deadline,
      targetMetric: t.targetMetric,
      progressPercent: t.progressPercent,
      status: t.status,
      completionEvidence: t.completionEvidence,
      managerComments: t.managerComments,
    });
    setShowCreate(true);
  };

  const handleSaveTask = async (e: FormEvent) => {
    e.preventDefault();
    const emp = employees.find((x) => x.employeeId === form.assignedToId);
    try {
      await callRpc('saveTask', {
        ...form,
        taskId: form.taskId || undefined,
        assignedToName: emp?.fullName || user.fullName,
        department: emp?.department || user.department,
      });
      setShowCreate(false);
      onToast('success', form.taskId ? 'Task updated' : 'Task assigned');
      await loadTasks();
    } catch (err: any) {
      onToast('error', 'Task save failed', err.message);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await callRpc('deleteTask', {taskId});
      onToast('info', 'Task deleted');
      await loadTasks();
    } catch (err: any) {
      onToast('error', 'Delete failed', err.message);
    }
  };

  const handleUpdateProgress = async (task: TaskRecord, progressPercent: number, status?: TaskStatus, evidence?: string) => {
    try {
      await callRpc('saveTask', {
        taskId: task.taskId,
        progressPercent,
        status: status || (progressPercent >= 100 ? 'COMPLETED' : progressPercent > 0 ? 'IN_PROGRESS' : 'TODO'),
        completionEvidence: evidence ?? task.completionEvidence,
      });
      onToast('success', 'Task updated');
      await loadTasks();
    } catch (err: any) {
      onToast('error', 'Update failed', err.message);
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      <div className="metallic-navy-panel overflow-hidden rounded-2xl text-white">
        <div className="h-1 w-full bg-gradient-to-r from-indigo-400 via-sky-400 to-emerald-400" />
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-xl font-semibold text-white">Tasks &amp; Operational Targets</h1>
            <p className="mt-0.5 text-xs text-sky-100/85">
              Deadlines, progress tracking, completion evidence, and overdue alerts
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={openCreateModal}
              className="metallic-btn-gold inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold"
            >
              <Plus className="h-4 w-4" />
              Assign Task
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tasks.length === 0 ? (
          <div className="metallic-surface col-span-full rounded-xl p-10 text-center text-xs text-slate-500">
            No tasks assigned yet.
          </div>
        ) : (
          tasks.map((t) => {
            const isOverdue = t.status !== 'COMPLETED' && t.deadline < today;
            return (
              <div key={t.taskId} className="metallic-surface flex flex-col justify-between overflow-hidden rounded-xl">
                <div
                  className={`h-1 w-full bg-gradient-to-r ${
                    isOverdue
                      ? 'from-rose-600 to-amber-500'
                      : t.status === 'COMPLETED'
                        ? 'from-emerald-600 to-teal-400'
                        : 'from-blue-600 to-indigo-500'
                  }`}
                />
                <div className="flex flex-1 flex-col justify-between p-5">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display text-sm font-semibold text-slate-900">{t.title}</h3>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={`text-[11px] font-semibold ${
                          isOverdue ? 'text-red-600' : t.status === 'COMPLETED' ? 'text-emerald-700' : 'text-slate-600'
                        }`}
                      >
                        {isOverdue ? 'OVERDUE' : t.status}
                      </span>
                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditModal(t)}
                            className="rounded border border-slate-200 p-1 text-slate-600 hover:bg-slate-50"
                            title="Edit task"
                          >
                            <Edit3 className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTask(t.taskId)}
                            className="rounded border border-red-200 p-1 text-red-600 hover:bg-red-50"
                            title="Delete task"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {t.assignedToName} ({t.assignedToId}) · {t.priority} Priority · Due {t.deadline}
                  </p>
                  {t.description && <p className="mt-2 text-xs text-slate-700">{t.description}</p>}
                  {t.targetMetric && (
                    <p className="mt-1.5 font-mono text-[11px] text-slate-600">Target: {t.targetMetric}</p>
                  )}
                  {t.managerComments && (
                    <p className="mt-1 text-[11px] text-blue-700">Admin Note: {t.managerComments}</p>
                  )}
                  {isOverdue && (
                    <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-red-600">
                      <AlertTriangle className="h-3.5 w-3.5" /> Deadline passed
                    </p>
                  )}
                </div>

                <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">Progress</span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">{t.progressPercent}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={10}
                    value={t.progressPercent}
                    onChange={(e) => handleUpdateProgress(t, Number(e.target.value))}
                    className="w-full accent-[#0B1B36]"
                  />
                  <input
                    type="text"
                    defaultValue={t.completionEvidence}
                    onBlur={(e) => {
                      if (e.target.value !== t.completionEvidence) {
                        handleUpdateProgress(t, t.progressPercent, t.status, e.target.value);
                      }
                    }}
                    placeholder="Completion evidence / notes (saves on blur)"
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">
                {form.taskId ? 'Edit Task' : 'Assign Task'}
              </h3>
              <button type="button" onClick={() => setShowCreate(false)} className="text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSaveTask} className="mt-4 space-y-3 text-xs">
              <input
                required
                type="text"
                value={form.title}
                onChange={(e) => setForm({...form, title: e.target.value})}
                placeholder="Task Title"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({...form, description: e.target.value})}
                placeholder="Task description & deliverables..."
                className="w-full rounded-lg border border-slate-300 p-2.5"
              />
              <select
                value={form.assignedToId}
                onChange={(e) => setForm({...form, assignedToId: e.target.value})}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                {employees.map((emp) => (
                  <option key={emp.employeeId} value={emp.employeeId}>
                    {emp.employeeId} — {emp.fullName}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={form.priority}
                  onChange={(e) => setForm({...form, priority: e.target.value as TaskPriority})}
                  className="rounded-lg border border-slate-300 px-3 py-2"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
                <input
                  required
                  type="date"
                  value={form.deadline}
                  onChange={(e) => setForm({...form, deadline: e.target.value})}
                  className="rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              {form.taskId && (
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={form.status}
                    onChange={(e) => setForm({...form, status: e.target.value as TaskStatus})}
                    className="rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="TODO">TODO</option>
                    <option value="IN_PROGRESS">IN_PROGRESS</option>
                    <option value="COMPLETED">COMPLETED</option>
                    <option value="OVERDUE">OVERDUE</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.progressPercent}
                    onChange={(e) => setForm({...form, progressPercent: Number(e.target.value)})}
                    placeholder="Progress %"
                    className="rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
              )}
              <input
                type="text"
                value={form.targetMetric}
                onChange={(e) => setForm({...form, targetMetric: e.target.value})}
                placeholder="Target Metric (e.g. Complete 100% audit)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
              {form.taskId && (
                <>
                  <input
                    type="text"
                    value={form.completionEvidence}
                    onChange={(e) => setForm({...form, completionEvidence: e.target.value})}
                    placeholder="Completion evidence"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                  <input
                    type="text"
                    value={form.managerComments}
                    onChange={(e) => setForm({...form, managerComments: e.target.value})}
                    placeholder="Manager comments"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border px-4 py-2">
                  Cancel
                </button>
                <button type="submit" className="rounded-lg bg-[#0B1B36] px-4 py-2 font-semibold text-white">
                  {form.taskId ? 'Save Changes' : 'Assign Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
