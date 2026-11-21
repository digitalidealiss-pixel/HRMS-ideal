import {CheckCircle2, Edit3, FileUp, Plus, Search, Shield, Trash2, UserCheck, UserX, X} from 'lucide-react';
import {useEffect, useMemo, useState, type ChangeEvent, type FormEvent} from 'react';
import {callRpc} from '../../services/apiClient';
import type {
  AuthUser,
  DepartmentRecord,
  DesignationRecord,
  EmployeeDocument,
  EmployeeRecord,
  EmploymentStatus,
  UserRole,
} from '../../types/hrms';
import {ConfirmDialog} from '../common/ToastAndConfirm';

interface EmployeesViewProps {
  user: AuthUser;
  onToast: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

function compressImageFile(file: File, maxDim = 480): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = reject;
      img.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function maskSensitive(val?: string): string {
  if (!val) return '—';
  if (val.length <= 4) return 'XXXX';
  return `${'X'.repeat(Math.max(4, val.length - 4))}${val.slice(-4)}`;
}

const emptyEmployeeForm = () => ({
  fullName: '',
  profilePhotoUrl: '',
  fatherName: '',
  dob: '',
  gender: 'Male',
  mobile: '',
  personalEmail: '',
  officialEmail: '',
  emergencyContact: '',
  currentAddress: '',
  permanentAddress: '',
  dateOfJoining: new Date().toISOString().slice(0, 10),
  department: 'Operations & Field Services',
  designation: 'Site Engineer',
  reportingManagerId: '',
  reportingManagerName: '',
  employmentType: 'FULL_TIME' as EmployeeRecord['employmentType'],
  workLocation: 'Headquarters',
  isFieldEmployee: false,
  role: 'EMPLOYEE' as UserRole,
  status: 'ACTIVE' as EmploymentStatus,
  bankName: '',
  bankAccountNumber: '',
  ifscCode: '',
  panNumber: '',
  aadhaarNumber: '',
  initialPassword: '',
});

export function EmployeesView({user, onToast}: EmployeesViewProps) {
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [designations, setDesignations] = useState<DesignationRecord[]>([]);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyEmployeeForm());
  const [useCustomDesignation, setUseCustomDesignation] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [selectedEmp, setSelectedEmp] = useState<EmployeeRecord | null>(null);
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [orgTab, setOrgTab] = useState<'roles' | 'departments'>('roles');

  // Department CRUD state
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptCode, setNewDeptCode] = useState('');

  // Designation / Role CRUD state
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleTitle, setRoleTitle] = useState('');
  const [roleDept, setRoleDept] = useState('');
  const [roleLevel, setRoleLevel] = useState('L3');

  const [docType, setDocType] = useState('PAN Card');
  const [confirmToggle, setConfirmToggle] = useState<EmployeeRecord | null>(null);

  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'HR_ADMIN';

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const res = await callRpc<{
        ok: boolean;
        employees: EmployeeRecord[];
        departments: DepartmentRecord[];
        designations?: DesignationRecord[];
        documents: EmployeeDocument[];
      }>('getEmployees', {}, {cacheKey: `employees_${user.employeeId}`});
      setEmployees(res.employees || []);
      setDepartments(res.departments || []);
      setDesignations(res.designations || []);
      setDocuments(res.documents || []);
      if (selectedEmp) {
        const refreshed = (res.employees || []).find((e) => e.employeeId === selectedEmp.employeeId);
        if (refreshed) setSelectedEmp(refreshed);
      }
    } catch (err: any) {
      onToast('error', 'Failed to load employees', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  const filtered = useMemo(() => {
    return employees.filter((e) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        e.fullName.toLowerCase().includes(q) ||
        e.employeeId.toLowerCase().includes(q) ||
        e.officialEmail.toLowerCase().includes(q) ||
        e.designation.toLowerCase().includes(q);
      const matchDept = !deptFilter || e.department === deptFilter;
      const matchStatus = !statusFilter || e.status === statusFilter;
      return matchSearch && matchDept && matchStatus;
    });
  }, [employees, search, deptFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const handlePhotoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, 400);
      setForm((prev) => ({...prev, profilePhotoUrl: compressed}));
    } catch {
      onToast('error', 'Photo compression failed');
    }
  };

  const openCreateModal = () => {
    setEditingId(null);
    const defaultDept = departments[0]?.name || 'Operations & Field Services';
    const defaultRole = designations[0]?.title || 'Site Engineer';
    setUseCustomDesignation(designations.length === 0);
    setForm({
      ...emptyEmployeeForm(),
      department: defaultDept,
      designation: defaultRole,
    });
    setShowForm(true);
  };

  const openEditModal = (emp: EmployeeRecord) => {
    setEditingId(emp.employeeId);
    const matchesKnownDes = designations.some((d) => d.title.toLowerCase() === (emp.designation || '').toLowerCase());
    setUseCustomDesignation(Boolean(emp.designation) && !matchesKnownDes && designations.length > 0);
    setForm({
      fullName: emp.fullName,
      profilePhotoUrl: emp.profilePhotoUrl,
      fatherName: emp.fatherName,
      dob: emp.dob,
      gender: emp.gender || 'Male',
      mobile: emp.mobile,
      personalEmail: emp.personalEmail,
      officialEmail: emp.officialEmail,
      emergencyContact: emp.emergencyContact,
      currentAddress: emp.currentAddress,
      permanentAddress: emp.permanentAddress,
      dateOfJoining: emp.dateOfJoining,
      department: emp.department,
      designation: emp.designation,
      reportingManagerId: emp.reportingManagerId,
      reportingManagerName: emp.reportingManagerName,
      employmentType: emp.employmentType,
      workLocation: emp.workLocation,
      isFieldEmployee: emp.isFieldEmployee,
      role: emp.role,
      status: emp.status || 'ACTIVE',
      bankName: emp.bankName,
      bankAccountNumber: emp.bankAccountNumber,
      ifscCode: emp.ifscCode,
      panNumber: emp.panNumber,
      aadhaarNumber: emp.aadhaarNumber,
      initialPassword: '',
    });
    setShowForm(true);
  };

  const handleSaveEmployee = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingId) {
        await callRpc('updateEmployee', {employeeId: editingId, ...form});
        onToast('success', 'Employee profile updated', editingId);
      } else {
        const res = await callRpc<{ok: boolean; employeeId: string}>('createEmployee', form);
        onToast('success', 'Employee onboarded', `Assigned ID: ${res.employeeId}`);
      }
      setShowForm(false);
      await loadEmployees();
    } catch (err: any) {
      onToast('error', 'Save failed', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDocumentUpload = async (empId: string, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      onToast('error', 'File too large', 'Please upload documents under 4 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await callRpc('uploadDocument', {
          employeeId: empId,
          documentType: docType,
          fileName: file.name,
          mimeType: file.type,
          fileDataUrl: String(reader.result),
        });
        onToast('success', 'Document uploaded', `${docType} saved securely.`);
        await loadEmployees();
      } catch (err: any) {
        onToast('error', 'Document upload failed', err.message);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleVerifyDoc = async (docId: string, status: 'VERIFIED' | 'REJECTED') => {
    try {
      await callRpc('verifyDocument', {documentId: docId, verificationStatus: status});
      onToast('success', `Document marked ${status}`);
      await loadEmployees();
    } catch (err: any) {
      onToast('error', 'Verification failed', err.message);
    }
  };

  const handleToggleChecklist = async (emp: EmployeeRecord, key: keyof EmployeeRecord['onboardingChecklist']) => {
    const updated = {...emp.onboardingChecklist, [key]: !emp.onboardingChecklist[key]};
    try {
      await callRpc('updateEmployee', {employeeId: emp.employeeId, onboardingChecklist: updated});
      onToast('success', 'Checklist updated');
      await loadEmployees();
    } catch (err: any) {
      onToast('error', 'Checklist update failed', err.message);
    }
  };

  const handleSaveDepartment = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await callRpc('saveDepartment', {
        departmentId: editingDeptId || undefined,
        name: newDeptName.trim(),
        code: newDeptCode.trim().toUpperCase(),
      });
      setEditingDeptId(null);
      setNewDeptName('');
      setNewDeptCode('');
      onToast('success', editingDeptId ? 'Department updated' : 'Department created');
      await loadEmployees();
    } catch (err: any) {
      onToast('error', 'Failed to save department', err.message);
    }
  };

  const handleDeleteDepartment = async (departmentId: string) => {
    try {
      await callRpc('deleteDepartment', {departmentId});
      onToast('success', 'Department removed');
      await loadEmployees();
    } catch (err: any) {
      onToast('error', 'Failed to remove department', err.message);
    }
  };

  const handleSaveDesignation = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await callRpc('saveDesignation', {
        designationId: editingRoleId || undefined,
        title: roleTitle.trim(),
        department: roleDept || departments[0]?.name || 'Executive & Administration',
        level: roleLevel || 'L3',
      });
      setEditingRoleId(null);
      setRoleTitle('');
      setRoleLevel('L3');
      onToast('success', editingRoleId ? 'Role updated' : 'Role added');
      await loadEmployees();
    } catch (err: any) {
      onToast('error', 'Failed to save role', err.message);
    }
  };

  const handleDeleteDesignation = async (designationId: string) => {
    try {
      await callRpc('deleteDesignation', {designationId});
      onToast('success', 'Role removed');
      await loadEmployees();
    } catch (err: any) {
      onToast('error', 'Failed to remove role', err.message);
    }
  };

  const handleDeleteDoc = async (documentId: string) => {
    try {
      await callRpc('deleteDocument', {documentId});
      onToast('success', 'Document removed');
      await loadEmployees();
    } catch (err: any) {
      onToast('error', 'Delete failed', err.message);
    }
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="metallic-navy-panel overflow-hidden rounded-2xl text-white">
        <div className="h-1 w-full bg-gradient-to-r from-blue-400 via-amber-400 to-emerald-400" />
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-xl font-semibold text-white">
              {isAdmin ? 'Employee Directory & Onboarding' : 'My Employee Profile'}
            </h1>
            <p className="mt-0.5 text-xs text-sky-100/85">
              {employees.length} record(s) · {departments.length} department(s) · {designations.length} role(s)
            </p>
          </div>
          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setRoleDept(departments[0]?.name || 'Executive & Administration');
                  setOrgTab('roles');
                  setShowOrgModal(true);
                }}
                className="min-h-[40px] rounded-lg border border-white/25 bg-white/10 px-3.5 py-2 text-xs font-medium text-white hover:bg-white/20 whitespace-nowrap"
              >
                Manage Roles &amp; Departments
              </button>
              <button
                type="button"
                onClick={openCreateModal}
                className="metallic-btn-gold inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold whitespace-nowrap"
              >
                <Plus className="h-4 w-4" />
                Onboard Employee
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      {isAdmin && (
        <div className="metallic-surface flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-600" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by Employee ID, name, email, or designation..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>
          <select
            value={deptFilter}
            onChange={(e) => {
              setDeptFilter(e.target.value);
              setPage(1);
            }}
            className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.departmentId} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ON_NOTICE">On Notice</option>
            <option value="TERMINATED">Terminated</option>
          </select>
        </div>
      )}

      {/* Employee Directory Table */}
      <div className="metallic-surface overflow-hidden rounded-xl">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading employee records...</div>
        ) : paged.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-700">No employee records match your view.</p>
            {isAdmin && (
              <button
                type="button"
                onClick={openCreateModal}
                className="mt-3 rounded-lg bg-[#0B1B36] px-4 py-2 text-xs font-semibold text-white"
              >
                Onboard First Employee
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Department &amp; Role</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Joining &amp; Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map((emp) => (
                  <tr key={emp.employeeId} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {emp.profilePhotoUrl ? (
                          <img
                            src={emp.profilePhotoUrl}
                            alt={emp.fullName}
                            referrerPolicy="no-referrer"
                            className="h-9 w-9 rounded-full border border-slate-200 object-cover"
                          />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0B1B36] text-xs font-semibold text-white">
                            {emp.fullName.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-slate-900">{emp.fullName}</p>
                          <p className="font-mono text-xs text-slate-500">{emp.employeeId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-900">{emp.designation}</p>
                      <p className="text-xs text-slate-500">
                        {emp.department} · {emp.role}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-slate-800">{emp.officialEmail}</p>
                      <p className="font-mono text-xs text-slate-500 tabular-nums">{emp.mobile}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs text-slate-800 tabular-nums">{emp.dateOfJoining}</p>
                      <p className="text-xs text-slate-500">
                        {emp.employmentType.replace('_', ' ')} {emp.isFieldEmployee ? '· Field' : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-semibold ${
                          emp.status === 'ACTIVE' ? 'text-emerald-700' : 'text-red-600'
                        }`}
                      >
                        {emp.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedEmp(emp)}
                          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Profile &amp; Docs
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(emp)}
                          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Edit
                        </button>
                        {isAdmin && emp.employeeId !== user.employeeId && (
                          <button
                            type="button"
                            onClick={() => setConfirmToggle(emp)}
                            className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100"
                            title={emp.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                          >
                            {emp.status === 'ACTIVE' ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
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

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
            <span>
              Page {page} of {totalPages} ({filtered.length} employees)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded border border-slate-200 px-2.5 py-1 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-slate-200 px-2.5 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Employee Profile & Onboarding Checklist Drawer */}
      {selectedEmp && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40">
          <div className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                {selectedEmp.profilePhotoUrl ? (
                  <img
                    src={selectedEmp.profilePhotoUrl}
                    alt={selectedEmp.fullName}
                    referrerPolicy="no-referrer"
                    className="h-12 w-12 rounded-full border border-slate-200 object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0B1B36] text-sm font-semibold text-white">
                    {selectedEmp.fullName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <h2 className="font-display text-lg font-semibold text-slate-900">{selectedEmp.fullName}</h2>
                  <p className="text-xs text-slate-500">
                    {selectedEmp.employeeId} · {selectedEmp.designation} · {selectedEmp.department}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEmp(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
              <div className="space-y-1.5 border-b border-slate-100 pb-3">
                <p className="font-semibold text-slate-900">Personal &amp; Emergency</p>
                <p>Father&apos;s Name: {selectedEmp.fatherName || '—'}</p>
                <p>DOB / Gender: {selectedEmp.dob || '—'} · {selectedEmp.gender || '—'}</p>
                <p>Mobile: {selectedEmp.mobile || '—'}</p>
                <p>Personal Email: {selectedEmp.personalEmail || '—'}</p>
                <p>Emergency Contact: {selectedEmp.emergencyContact || '—'}</p>
                <p>Current Address: {selectedEmp.currentAddress || '—'}</p>
              </div>
              <div className="space-y-1.5 border-b border-slate-100 pb-3">
                <p className="font-semibold text-slate-900">Employment &amp; KYC</p>
                <p>Official Email: {selectedEmp.officialEmail}</p>
                <p>Reporting Manager: {selectedEmp.reportingManagerName || '—'}</p>
                <p>Work Location: {selectedEmp.workLocation}</p>
                <p>Bank: {selectedEmp.bankName || '—'} ({maskSensitive(selectedEmp.bankAccountNumber)})</p>
                <p>PAN: {isAdmin ? selectedEmp.panNumber || '—' : maskSensitive(selectedEmp.panNumber)}</p>
                <p>Aadhaar: {isAdmin ? maskSensitive(selectedEmp.aadhaarNumber) : maskSensitive(selectedEmp.aadhaarNumber)}</p>
              </div>
            </div>

            {/* Onboarding Checklist */}
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-slate-900">Onboarding Verification Checklist</h3>
              <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  ['profileCompleted', 'Profile Completed'],
                  ['photoUploaded', 'Photo Uploaded'],
                  ['kycVerified', 'KYC Verified'],
                  ['bankDetailsAdded', 'Bank Details Added'],
                  ['salaryConfigured', 'Salary Configured'],
                  ['credentialsIssued', 'Credentials Issued'],
                ].map(([key, label]) => {
                  const checked = Boolean(
                    selectedEmp.onboardingChecklist?.[key as keyof EmployeeRecord['onboardingChecklist']],
                  );
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={!isAdmin}
                      onClick={() =>
                        handleToggleChecklist(selectedEmp, key as keyof EmployeeRecord['onboardingChecklist'])
                      }
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs ${
                        checked
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      <CheckCircle2 className={`h-3.5 w-3.5 ${checked ? 'text-emerald-600' : 'text-slate-300'}`} />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Documents Section */}
            <div className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Employee Documents</h3>
                <div className="flex items-center gap-2">
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
                  >
                    <option>PAN Card</option>
                    <option>Aadhaar Card</option>
                    <option>Offer Letter</option>
                    <option>Education Certificate</option>
                    <option>Bank Passbook</option>
                    <option>Medical / Police Verification</option>
                  </select>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#0B1B36] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#13294B]">
                    <FileUp className="h-3.5 w-3.5" />
                    Upload
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => handleDocumentUpload(selectedEmp.employeeId, e)}
                    />
                  </label>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {documents.filter((d) => d.employeeId === selectedEmp.employeeId).length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
                    No documents uploaded yet.
                  </p>
                ) : (
                  documents
                    .filter((d) => d.employeeId === selectedEmp.employeeId)
                    .map((doc) => (
                      <div
                        key={doc.documentId}
                        className="flex items-center justify-between rounded-lg border border-slate-200 px-3.5 py-2.5 text-xs"
                      >
                        <div>
                          <p className="font-medium text-slate-900">
                            {doc.documentType} · {doc.fileName}
                          </p>
                          <p className="text-slate-500">
                            Status: {doc.verificationStatus}{' '}
                            {doc.verifiedBy ? `· Verified by ${doc.verifiedBy}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <a
                            href={doc.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-[#0B1B36] underline"
                          >
                            View
                          </a>
                          {isAdmin && doc.verificationStatus === 'PENDING' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleVerifyDoc(doc.documentId, 'VERIFIED')}
                                className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white"
                              >
                                Verify
                              </button>
                              <button
                                type="button"
                                onClick={() => handleVerifyDoc(doc.documentId, 'REJECTED')}
                                className="rounded bg-red-600 px-2 py-1 text-[11px] font-medium text-white"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => handleDeleteDoc(doc.documentId)}
                              className="rounded border border-red-200 p-1 text-red-600 hover:bg-red-50"
                              title="Remove Document"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding / Edit Employee Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="font-display text-lg font-semibold text-slate-900">
                {editingId ? `Edit Employee (${editingId})` : 'Onboard New Employee'}
              </h2>
              <button type="button" onClick={() => setShowForm(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEmployee} className="mt-4 space-y-5 text-xs">
              {/* Photo + Name */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3">
                  {form.profilePhotoUrl ? (
                    <img
                      src={form.profilePhotoUrl}
                      alt="Employee preview"
                      className="h-14 w-14 rounded-full border border-slate-200 object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-500">
                      Photo
                    </div>
                  )}
                  <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">
                    Upload Photo
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                  </label>
                </div>
                <div className="flex-1">
                  <label className="block font-medium text-slate-700">Full Name *</label>
                  <input
                    required
                    disabled={user.role === 'EMPLOYEE'}
                    type="text"
                    value={form.fullName}
                    onChange={(e) => setForm({...form, fullName: e.target.value})}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                  />
                </div>
              </div>

              {/* Personal Details */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block font-medium text-slate-700">Father&apos;s Name</label>
                  <input
                    disabled={user.role === 'EMPLOYEE'}
                    type="text"
                    value={form.fatherName}
                    onChange={(e) => setForm({...form, fatherName: e.target.value})}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700">Date of Birth</label>
                  <input
                    disabled={user.role === 'EMPLOYEE'}
                    type="date"
                    value={form.dob}
                    onChange={(e) => setForm({...form, dob: e.target.value})}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700">Gender</label>
                  <select
                    disabled={user.role === 'EMPLOYEE'}
                    value={form.gender}
                    onChange={(e) => setForm({...form, gender: e.target.value})}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                  >
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700">Mobile Number *</label>
                  <input
                    required
                    type="tel"
                    value={form.mobile}
                    onChange={(e) => setForm({...form, mobile: e.target.value})}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700">Official Email *</label>
                  <input
                    required
                    disabled={Boolean(editingId) && !isAdmin}
                    type="email"
                    value={form.officialEmail}
                    onChange={(e) => setForm({...form, officialEmail: e.target.value})}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700">Personal Email</label>
                  <input
                    type="email"
                    value={form.personalEmail}
                    onChange={(e) => setForm({...form, personalEmail: e.target.value})}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700">Emergency Contact</label>
                  <input
                    type="text"
                    value={form.emergencyContact}
                    onChange={(e) => setForm({...form, emergencyContact: e.target.value})}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700">Current Address</label>
                  <input
                    type="text"
                    value={form.currentAddress}
                    onChange={(e) => setForm({...form, currentAddress: e.target.value})}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
              </div>

              {isAdmin && (
                <>
                  <div className="border-t border-slate-200 pt-4">
                    <h3 className="mb-2.5 font-semibold text-slate-900">Role, Department &amp; Work Assignment</h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className="block font-medium text-slate-700">Date of Joining *</label>
                        <input
                          required
                          type="date"
                          value={form.dateOfJoining}
                          onChange={(e) => setForm({...form, dateOfJoining: e.target.value})}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-slate-700">Department *</label>
                        <select
                          value={form.department}
                          onChange={(e) => setForm({...form, department: e.target.value})}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                        >
                          {departments.map((d) => (
                            <option key={d.departmentId} value={d.name}>
                              {d.name}
                            </option>
                          ))}
                          {!departments.some((d) => d.name === form.department) && (
                            <option value={form.department}>{form.department}</option>
                          )}
                        </select>
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <label className="block font-medium text-slate-700">Role / Designation *</label>
                          <button
                            type="button"
                            onClick={() => {
                              setOrgTab('roles');
                              setRoleDept(form.department);
                              setShowOrgModal(true);
                            }}
                            className="text-[11px] font-semibold text-blue-700 hover:underline"
                          >
                            + Add / Edit Roles
                          </button>
                        </div>
                        {!useCustomDesignation && designations.length > 0 ? (
                          <select
                            required
                            value={
                              designations.some((d) => d.title === form.designation)
                                ? form.designation
                                : '__CUSTOM__'
                            }
                            onChange={(e) => {
                              if (e.target.value === '__CUSTOM__') {
                                setUseCustomDesignation(true);
                              } else {
                                setForm({...form, designation: e.target.value});
                              }
                            }}
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                          >
                            {designations.map((d) => (
                              <option key={d.designationId} value={d.title}>
                                {d.title} ({d.level})
                              </option>
                            ))}
                            <option value="__CUSTOM__">Other / Custom Role...</option>
                          </select>
                        ) : (
                          <div className="mt-1 flex gap-1.5">
                            <input
                              required
                              type="text"
                              value={form.designation}
                              onChange={(e) => setForm({...form, designation: e.target.value})}
                              placeholder="Enter role title"
                              className="w-full rounded-lg border border-slate-300 px-3 py-2"
                            />
                            {designations.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setUseCustomDesignation(false);
                                  setForm({...form, designation: designations[0].title});
                                }}
                                className="shrink-0 rounded-lg border border-slate-300 px-2.5 text-[11px] font-medium text-slate-700"
                              >
                                List
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="block font-medium text-slate-700">Reporting Manager</label>
                        <input
                          type="text"
                          value={form.reportingManagerName}
                          onChange={(e) => setForm({...form, reportingManagerName: e.target.value})}
                          placeholder="Manager Name"
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-slate-700">Employment Type</label>
                        <select
                          value={form.employmentType}
                          onChange={(e) =>
                            setForm({...form, employmentType: e.target.value as EmployeeRecord['employmentType']})
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                        >
                          <option value="FULL_TIME">Full Time</option>
                          <option value="FIELD_OPERATIONS">Field Operations</option>
                          <option value="CONTRACT">Contract</option>
                          <option value="INTERN">Intern</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-medium text-slate-700">Work Location</label>
                        <input
                          type="text"
                          value={form.workLocation}
                          onChange={(e) => setForm({...form, workLocation: e.target.value})}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-slate-700">Portal Access Role</label>
                        <select
                          disabled={user.role !== 'SUPER_ADMIN' && form.role === 'SUPER_ADMIN'}
                          value={form.role}
                          onChange={(e) => setForm({...form, role: e.target.value as UserRole})}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                        >
                          <option value="EMPLOYEE">Employee</option>
                          <option value="HR_ADMIN">HR Admin</option>
                          {(user.role === 'SUPER_ADMIN' || form.role === 'SUPER_ADMIN') && (
                            <option value="SUPER_ADMIN">Super Admin</option>
                          )}
                        </select>
                      </div>
                      {editingId && (
                        <div>
                          <label className="block font-medium text-slate-700">Employment Status</label>
                          <select
                            value={form.status}
                            onChange={(e) => setForm({...form, status: e.target.value as EmploymentStatus})}
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                          >
                            <option value="ACTIVE">Active</option>
                            <option value="ON_NOTICE">On Notice</option>
                            <option value="INACTIVE">Inactive</option>
                            <option value="TERMINATED">Terminated</option>
                          </select>
                        </div>
                      )}
                      {!editingId && (
                        <div>
                          <label className="block font-medium text-slate-700">Initial Password *</label>
                          <input
                            required
                            minLength={6}
                            type="text"
                            value={form.initialPassword}
                            onChange={(e) => setForm({...form, initialPassword: e.target.value})}
                            placeholder="Min 6 characters"
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                          />
                        </div>
                      )}
                      <div className="flex items-center gap-2 pt-5">
                        <input
                          id="fieldEmp"
                          type="checkbox"
                          checked={form.isFieldEmployee}
                          onChange={(e) => setForm({...form, isFieldEmployee: e.target.checked})}
                        />
                        <label htmlFor="fieldEmp" className="font-medium text-slate-700">
                          Field Employee (GPS Tracking Enabled)
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Statutory & Bank */}
                  <div className="border-t border-slate-200 pt-4">
                    <h3 className="mb-2.5 flex items-center gap-1.5 font-semibold text-slate-900">
                      <Shield className="h-3.5 w-3.5" />
                      Bank &amp; Statutory KYC Details
                    </h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className="block font-medium text-slate-700">Bank Name</label>
                        <input
                          type="text"
                          value={form.bankName}
                          onChange={(e) => setForm({...form, bankName: e.target.value})}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-slate-700">Account Number</label>
                        <input
                          type="text"
                          value={form.bankAccountNumber}
                          onChange={(e) => setForm({...form, bankAccountNumber: e.target.value})}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-slate-700">IFSC Code</label>
                        <input
                          type="text"
                          value={form.ifscCode}
                          onChange={(e) => setForm({...form, ifscCode: e.target.value.toUpperCase()})}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-slate-700">PAN Number</label>
                        <input
                          type="text"
                          value={form.panNumber}
                          onChange={(e) => setForm({...form, panNumber: e.target.value.toUpperCase()})}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-slate-700">Aadhaar Number</label>
                        <input
                          type="text"
                          value={form.aadhaarNumber}
                          onChange={(e) => setForm({...form, aadhaarNumber: e.target.value})}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-slate-700">Permanent Address</label>
                        <input
                          type="text"
                          value={form.permanentAddress}
                          onChange={(e) => setForm({...form, permanentAddress: e.target.value})}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-[#0B1B36] px-5 py-2 text-xs font-semibold text-white hover:bg-[#13294B] disabled:opacity-60"
                >
                  {submitting ? 'Saving...' : editingId ? 'Update Employee' : 'Complete Onboarding'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Roles / Designations & Departments Manager Modal */}
      {showOrgModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Manage Company Roles &amp; Departments
              </h3>
              <button type="button" onClick={() => setShowOrgModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 flex gap-2 border-b border-slate-200 pb-2 text-xs">
              <button
                type="button"
                onClick={() => setOrgTab('roles')}
                className={`rounded-lg px-3 py-1.5 font-semibold ${
                  orgTab === 'roles' ? 'bg-[#0B1B36] text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                Roles / Designations ({designations.length})
              </button>
              <button
                type="button"
                onClick={() => setOrgTab('departments')}
                className={`rounded-lg px-3 py-1.5 font-semibold ${
                  orgTab === 'departments' ? 'bg-[#0B1B36] text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                Departments ({departments.length})
              </button>
            </div>

            {orgTab === 'roles' ? (
              <div className="mt-4 space-y-4 text-xs">
                <div className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 px-3">
                  {designations.length === 0 ? (
                    <p className="py-4 text-center text-slate-500">No roles configured yet.</p>
                  ) : (
                    designations.map((des) => (
                      <div key={des.designationId} className="flex items-center justify-between gap-2 py-2.5">
                        <div>
                          <p className="font-semibold text-slate-900">{des.title}</p>
                          <p className="text-[11px] text-slate-500">
                            {des.department} · Level {des.level}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRoleId(des.designationId);
                              setRoleTitle(des.title);
                              setRoleDept(des.department);
                              setRoleLevel(des.level || 'L3');
                            }}
                            className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Edit3 className="h-3 w-3" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDesignation(des.designationId)}
                            className="rounded border border-red-200 p-1 text-red-600 hover:bg-red-50"
                            title="Delete role"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={handleSaveDesignation} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-900">
                      {editingRoleId ? 'Edit Role / Designation' : 'Add New Role / Designation'}
                    </p>
                    {editingRoleId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingRoleId(null);
                          setRoleTitle('');
                          setRoleLevel('L3');
                        }}
                        className="text-[11px] font-medium text-slate-500 underline"
                      >
                        Cancel Edit
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <input
                      required
                      type="text"
                      value={roleTitle}
                      onChange={(e) => setRoleTitle(e.target.value)}
                      placeholder="Role Title (e.g. Executive Director)"
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 sm:col-span-2"
                    />
                    <select
                      value={roleLevel}
                      onChange={(e) => setRoleLevel(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono"
                    >
                      <option value="L1">L1 (Director/CXO)</option>
                      <option value="L2">L2 (Manager)</option>
                      <option value="L3">L3 (Senior/Lead)</option>
                      <option value="L4">L4 (Executive/Staff)</option>
                      <option value="L5">L5 (Trainee/Intern)</option>
                    </select>
                  </div>
                  <select
                    value={roleDept}
                    onChange={(e) => setRoleDept(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                  >
                    {departments.map((d) => (
                      <option key={d.departmentId} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-[#0B1B36] py-2 font-semibold text-white hover:bg-[#13294B]"
                  >
                    {editingRoleId ? 'Update Role / Designation' : 'Add Role / Designation'}
                  </button>
                </form>
              </div>
            ) : (
              <div className="mt-4 space-y-4 text-xs">
                <div className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 px-3">
                  {departments.map((d) => (
                    <div key={d.departmentId} className="flex items-center justify-between gap-2 py-2.5">
                      <div>
                        <p className="font-semibold text-slate-900">{d.name}</p>
                        <p className="font-mono text-[11px] text-slate-500">{d.code}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingDeptId(d.departmentId);
                            setNewDeptName(d.name);
                            setNewDeptCode(d.code);
                          }}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Edit3 className="h-3 w-3" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDepartment(d.departmentId)}
                          className="rounded border border-red-200 p-1 text-red-600 hover:bg-red-50"
                          title="Delete department"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <form onSubmit={handleSaveDepartment} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-900">
                      {editingDeptId ? 'Edit Department' : 'Add New Department'}
                    </p>
                    {editingDeptId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDeptId(null);
                          setNewDeptName('');
                          setNewDeptCode('');
                        }}
                        className="text-[11px] font-medium text-slate-500 underline"
                      >
                        Cancel Edit
                      </button>
                    )}
                  </div>
                  <input
                    required
                    type="text"
                    value={newDeptName}
                    onChange={(e) => setNewDeptName(e.target.value)}
                    placeholder="Department Name (e.g. Plant Maintenance)"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                  />
                  <input
                    required
                    type="text"
                    value={newDeptCode}
                    onChange={(e) => setNewDeptCode(e.target.value)}
                    placeholder="Department Code (e.g. MAINT)"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono uppercase"
                  />
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-[#0B1B36] py-2 font-semibold text-white hover:bg-[#13294B]"
                  >
                    {editingDeptId ? 'Update Department' : 'Add Department'}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmToggle)}
        title={confirmToggle?.status === 'ACTIVE' ? 'Deactivate Employee?' : 'Activate Employee?'}
        description={`Change access status for ${confirmToggle?.fullName} (${confirmToggle?.employeeId})?`}
        confirmLabel={confirmToggle?.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
        destructive={confirmToggle?.status === 'ACTIVE'}
        onCancel={() => setConfirmToggle(null)}
        onConfirm={async () => {
          if (!confirmToggle) return;
          const next = confirmToggle.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
          await callRpc('toggleEmployeeStatus', {employeeId: confirmToggle.employeeId, status: next});
          onToast('success', `Employee marked ${next}`);
          setConfirmToggle(null);
          await loadEmployees();
        }}
      />
    </div>
  );
}
