import {
  CalendarClock,
  Camera,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  ExternalLink,
  MapPin,
  RefreshCw,
  ShieldAlert,
  X,
} from 'lucide-react';
import {useEffect, useRef, useState, type ChangeEvent, type FormEvent} from 'react';
import {callRpc, submitAttendanceWithOfflineFallback, syncPendingOfflineEvents} from '../../services/apiClient';
import {buildGoogleMapsUrl, reverseGeocodeLocation} from '../../services/mapsService';
import {getOfflineQueue} from '../../services/offlineDb';
import {exportReportToPdf, exportToCsv} from '../../services/pdfExports';
import type {
  AppSettings,
  AttendanceRecord,
  AttendanceStatus,
  AuthUser,
  EmployeeRecord,
  OfflineSyncItem,
  RegularizationType,
} from '../../types/hrms';
import {AttendanceLocationModal, CheckInOutPreviewMap} from '../maps/GoogleMapsWidgets';

interface AttendanceViewProps {
  user: AuthUser;
  onToast: (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;
}

interface CapturedGps {
  lat: number;
  lng: number;
  accuracy: number;
  address?: string;
  placeId?: string;
}

const toTimeInput = (iso?: string) => {
  if (!iso) return '';
  if (iso.includes('T') && iso.length >= 16) return iso.slice(11, 16);
  if (/^\d{2}:\d{2}/.test(iso)) return iso.slice(0, 5);
  return '';
};

const computeTimesSummary = (inHHMM: string, outHHMM: string, thresholdHours: number) => {
  const inMatch = /^(\d{2}):(\d{2})/.exec(inHHMM || '');
  const outMatch = /^(\d{2}):(\d{2})/.exec(outHHMM || '');
  if (!inMatch || !outMatch) return {workingHours: '', overtimeHours: ''};
  const inMin = Number(inMatch[1]) * 60 + Number(inMatch[2]);
  let outMin = Number(outMatch[1]) * 60 + Number(outMatch[2]);
  if (outMin < inMin) {
    outMin += 1440; // overnight production shift
  }
  const workingHours = Math.round(((outMin - inMin) / 60) * 100) / 100;
  const overtimeHours =
    workingHours > thresholdHours ? Math.round((workingHours - thresholdHours) * 100) / 100 : 0;
  return {
    workingHours: String(workingHours),
    overtimeHours: String(overtimeHours),
  };
};

const REGULARIZATION_LABELS: Record<RegularizationType, string> = {
  MISSED_PUNCH_IN: 'Missed Check-In',
  MISSED_PUNCH_OUT: 'Missed Check-Out',
  FULL_DAY_REGULARIZATION: 'Full Day / Missed Date',
  TIMING_CORRECTION: 'Shift Timing Correction',
  ON_DUTY_FIELD: 'On-Duty / Client Site Visit',
  ADMIN_ADJUSTMENT: 'Admin Direct Adjustment',
};

export function AttendanceView({user, onToast}: AttendanceViewProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [offlineQueue, setOfflineQueue] = useState<OfflineSyncItem[]>([]);
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);

  // Camera & GPS capture state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [selfieDataUrl, setSelfieDataUrl] = useState('');
  const [gpsCoords, setGpsCoords] = useState<CapturedGps | null>(null);
  const [gpsStatus, setGpsStatus] = useState('');
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [attendanceType, setAttendanceType] = useState<'OFFICE' | 'FIELD' | 'REMOTE'>(
    user.isFieldEmployee ? 'FIELD' : 'OFFICE',
  );
  const [submitting, setSubmitting] = useState(false);

  // Regularization & Admin Edit modal
  const [showRegModal, setShowRegModal] = useState(false);
  const [regMode, setRegMode] = useState<'EMPLOYEE_REQUEST' | 'ADMIN_EDIT' | 'ADMIN_REVIEW'>('EMPLOYEE_REQUEST');
  const [regForm, setRegForm] = useState({
    attendanceId: '',
    employeeId: user.employeeId,
    date: new Date().toISOString().slice(0, 10),
    regularizationType: 'MISSED_PUNCH_OUT' as RegularizationType,
    checkInTime: '09:30',
    checkOutTime: '18:30',
    attendanceType: (user.isFieldEmployee ? 'FIELD' : 'OFFICE') as 'OFFICE' | 'FIELD' | 'REMOTE',
    status: 'PRESENT' as AttendanceStatus,
    workingHours: '',
    overtimeHours: '',
    checkInAddress: '',
    checkOutAddress: '',
    correctionStatus: 'APPROVED' as 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED',
    reason: '',
    notes: '',
    applyImmediately: true,
  });
  const [savingReg, setSavingReg] = useState(false);
  const [otManualOverride, setOtManualOverride] = useState(false);
  const [mapModalRecord, setMapModalRecord] = useState<AttendanceRecord | null>(null);

  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'HR_ADMIN';
  const todayStr = new Date().toISOString().slice(0, 10);
  const openOvernightRecord = records.find(
    (r) =>
      r.employeeId === user.employeeId &&
      Boolean(r.checkInTime) &&
      !r.checkOutTime &&
      Date.now() - new Date(r.checkInTime).getTime() <= 24 * 3600000,
  );
  const todayRecord =
    records.find((r) => r.employeeId === user.employeeId && r.date === todayStr) || openOvernightRecord;
  const pendingRegularizations = records.filter((r) => r.correctionStatus === 'PENDING');
  const overtimeThreshold = Number(settings?.overtimeAfterHours || 9);
  const totalOvertimeHours =
    Math.round(records.reduce((s, r) => s + Number(r.overtimeHours || 0), 0) * 100) / 100;

  const loadAttendance = async () => {
    setLoading(true);
    try {
      const [attRes, setRes, queue, empRes] = await Promise.all([
        callRpc<{ok: boolean; records: AttendanceRecord[]}>(
          'getAttendance',
          {month: monthFilter},
          {cacheKey: `attendance_${user.employeeId}_${monthFilter}`},
        ),
        callRpc<{ok: boolean; settings: AppSettings}>('getSettings', {}, {cacheKey: 'app_settings'}),
        getOfflineQueue(),
        isAdmin
          ? callRpc<{ok: boolean; employees: EmployeeRecord[]}>('getEmployees', {}, {cacheKey: 'employees_list'})
          : Promise.resolve({ok: true, employees: [] as EmployeeRecord[]}),
      ]);
      setRecords(attRes.records || []);
      setSettings(setRes.settings);
      setOfflineQueue(queue);
      if (isAdmin) setEmployees(empRes.employees || []);
    } catch (err: any) {
      onToast('error', 'Failed to load attendance', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttendance();
    if (user.isFieldEmployee || attendanceType === 'FIELD') {
      captureGps().catch(() => {});
    }
    return () => {
      stopCamera();
    };
  }, [monthFilter]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    setSelfieDataUrl('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {facingMode: 'user', width: {ideal: 640}, height: {ideal: 480}},
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      });
    } catch {
      onToast('warning', 'Camera access unavailable', 'You can upload or capture a selfie photo via the file button.');
    }
  };

  const captureSelfieFrame = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const maxW = 480;
    const ratio = video.videoHeight ? video.videoHeight / video.videoWidth : 0.75;
    canvas.width = maxW;
    canvas.height = Math.round(maxW * ratio);
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const compressed = canvas.toDataURL('image/jpeg', 0.78);
    setSelfieDataUrl(compressed);
    stopCamera();
  };

  const handleFallbackPhoto = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 480 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
        setSelfieDataUrl(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const captureGps = (): Promise<CapturedGps> => {
    setGpsStatus('Acquiring GPS fix...');
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        setGpsStatus('Geolocation unavailable on this browser.');
        reject(new Error('Geolocation not supported.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const fix: CapturedGps = {
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
            accuracy: Math.round(pos.coords.accuracy),
          };
          setGpsCoords(fix);
          setGpsStatus(`GPS Locked (±${fix.accuracy}m)`);

          if (navigator.onLine) {
            setResolvingAddress(true);
            const geo = await reverseGeocodeLocation(fix.lat, fix.lng);
            setResolvingAddress(false);
            if (geo.address) {
              fix.address = geo.address;
              fix.placeId = geo.placeId;
              setGpsCoords({...fix});
            }
          }
          resolve(fix);
        },
        (err) => {
          setGpsStatus(`Location error: ${err.message}`);
          reject(err);
        },
        {enableHighAccuracy: true, timeout: 15000, maximumAge: 0},
      );
    });
  };

  const handleAttendanceAction = async (type: 'CHECK_IN' | 'CHECK_OUT') => {
    if (type === 'CHECK_IN' && !selfieDataUrl) {
      onToast('warning', 'Selfie required', 'Please capture a check-in selfie before submitting.');
      return;
    }
    if (type === 'CHECK_OUT' && settings?.requireCheckoutSelfie && !selfieDataUrl) {
      onToast('warning', 'Check-out selfie required', 'Company policy requires a check-out selfie.');
      return;
    }

    const effectiveType = type === 'CHECK_OUT' && todayRecord?.attendanceType ? todayRecord.attendanceType : attendanceType;
    const isFieldMandatory = effectiveType === 'FIELD' || user.isFieldEmployee;

    setSubmitting(true);
    try {
      let coords = gpsCoords;
      if (!coords || isFieldMandatory) {
        try {
          coords = await captureGps();
        } catch (gpsErr: any) {
          if (isFieldMandatory) {
            onToast(
              'error',
              'Location Mandatory for Field Duty',
              gpsErr?.message || 'Enable device Location / GPS permission to Check In or Check Out on field duty.',
            );
            setSubmitting(false);
            return;
          }
          if (!coords) {
            onToast('warning', 'Proceeding without GPS fix', 'Location permission denied or timed out.');
          }
        }
      }
      if (isFieldMandatory && (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng) || (coords.lat === 0 && coords.lng === 0))) {
        onToast('error', 'Location Mandatory for Field Duty', 'A valid live GPS fix is required.');
        setSubmitting(false);
        return;
      }

      const res = await submitAttendanceWithOfflineFallback(type, user.employeeId, {
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        accuracy: coords?.accuracy ?? null,
        address: coords?.address || '',
        placeId: coords?.placeId || '',
        selfieDataUrl,
        attendanceType: effectiveType,
      });

      setSelfieDataUrl('');
      if (res.offlineQueued) {
        onToast(
          'warning',
          `${type === 'CHECK_IN' ? 'Check-In' : 'Check-Out'} Saved Offline`,
          'Marked PENDING SYNC (Device-Captured / Unverified until server sync).',
        );
      } else {
        onToast(
          'success',
          `${type === 'CHECK_IN' ? 'Check-In' : 'Check-Out'} Verified`,
          coords?.address ? `Location: ${coords.address}` : 'Attendance & location saved.',
        );
      }
      await loadAttendance();
      window.dispatchEvent(new CustomEvent('ideal-attendance-updated'));
    } catch (err: any) {
      onToast('error', 'Attendance failed', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSyncNow = async () => {
    const res = await syncPendingOfflineEvents();
    onToast('info', 'Offline Sync Complete', `Synced: ${res.synced} · Failed: ${res.failed}`);
    await loadAttendance();
    window.dispatchEvent(new CustomEvent('ideal-attendance-updated'));
  };

  const openRegularizeModal = (record?: AttendanceRecord, mode?: 'EMPLOYEE_REQUEST' | 'ADMIN_EDIT' | 'ADMIN_REVIEW') => {
    const resolvedMode =
      mode ||
      (isAdmin
        ? record?.correctionStatus === 'PENDING'
          ? 'ADMIN_REVIEW'
          : 'ADMIN_EDIT'
        : 'EMPLOYEE_REQUEST');

    setRegMode(resolvedMode);
    setOtManualOverride(false);
    if (record) {
      const inTime =
        resolvedMode === 'ADMIN_REVIEW' && record.requestedCheckInTime
          ? toTimeInput(record.requestedCheckInTime)
          : toTimeInput(record.checkInTime) || toTimeInput(record.requestedCheckInTime) || settings?.shiftStartTime || '09:30';
      const outTime =
        resolvedMode === 'ADMIN_REVIEW' && record.requestedCheckOutTime
          ? toTimeInput(record.requestedCheckOutTime)
          : toTimeInput(record.checkOutTime) || toTimeInput(record.requestedCheckOutTime) || settings?.shiftEndTime || '18:30';
      const computed = computeTimesSummary(inTime, outTime, overtimeThreshold);
      const existingW = Number(record.workingHours || 0);
      const useComputed = resolvedMode === 'ADMIN_REVIEW' || existingW === 0;
      const initWorking = useComputed ? computed.workingHours : String(existingW);
      const initOt = useComputed
        ? computed.overtimeHours
        : String(
            Number(record.overtimeHours || 0) > 0
              ? Number(record.overtimeHours)
              : existingW > overtimeThreshold
                ? Math.round((existingW - overtimeThreshold) * 100) / 100
                : 0,
          );

      setRegForm({
        attendanceId: record.attendanceId,
        employeeId: record.employeeId,
        date: record.date,
        regularizationType:
          record.regularizationType ||
          (resolvedMode === 'ADMIN_EDIT'
            ? 'ADMIN_ADJUSTMENT'
            : !record.checkInTime
              ? 'MISSED_PUNCH_IN'
              : !record.checkOutTime
                ? 'MISSED_PUNCH_OUT'
                : 'TIMING_CORRECTION'),
        checkInTime: inTime,
        checkOutTime: outTime,
        attendanceType: record.requestedAttendanceType || record.attendanceType || 'OFFICE',
        status: record.requestedStatus || record.status || 'PRESENT',
        workingHours: initWorking,
        overtimeHours: initOt,
        checkInAddress: record.checkInAddress || '',
        checkOutAddress: record.checkOutAddress || '',
        correctionStatus: record.correctionStatus === 'PENDING' ? 'APPROVED' : record.correctionStatus || 'APPROVED',
        reason: record.correctionReason || '',
        notes: record.notes || '',
        applyImmediately: true,
      });
    } else {
      const defIn = settings?.shiftStartTime || '09:30';
      const defOut = settings?.shiftEndTime || '18:30';
      const defComputed = computeTimesSummary(defIn, defOut, overtimeThreshold);
      setRegForm({
        attendanceId: '',
        employeeId: user.employeeId,
        date: todayStr,
        regularizationType: isAdmin ? 'ADMIN_ADJUSTMENT' : 'FULL_DAY_REGULARIZATION',
        checkInTime: defIn,
        checkOutTime: defOut,
        attendanceType: user.isFieldEmployee ? 'FIELD' : 'OFFICE',
        status: 'PRESENT',
        workingHours: defComputed.workingHours,
        overtimeHours: defComputed.overtimeHours,
        checkInAddress: '',
        checkOutAddress: '',
        correctionStatus: 'APPROVED',
        reason: '',
        notes: '',
        applyImmediately: true,
      });
    }
    setShowRegModal(true);
  };

  const handleSubmitRegularization = async (e: FormEvent) => {
    e.preventDefault();
    if (!regForm.date) {
      onToast('warning', 'Date required', 'Select the attendance date to regularize.');
      return;
    }
    if (regMode === 'EMPLOYEE_REQUEST' && !regForm.reason.trim()) {
      onToast('warning', 'Reason required', 'Please explain why attendance regularization is needed.');
      return;
    }
    setSavingReg(true);
    try {
      if (regMode === 'ADMIN_REVIEW' && regForm.attendanceId) {
        await callRpc('approveAttendanceCorrection', {
          attendanceId: regForm.attendanceId,
          decision: 'APPROVED',
          checkInTime: regForm.checkInTime,
          checkOutTime: regForm.checkOutTime,
          attendanceType: regForm.attendanceType,
          status: regForm.status,
          workingHours: regForm.workingHours !== '' ? Number(regForm.workingHours) : undefined,
          overtimeHours: otManualOverride && regForm.overtimeHours !== '' ? Number(regForm.overtimeHours) : undefined,
          notes: regForm.notes,
        });
        onToast('success', 'Regularization approved & applied');
      } else if (isAdmin && regMode === 'ADMIN_EDIT' && regForm.applyImmediately) {
        await callRpc('adminSaveAttendance', {
          attendanceId: regForm.attendanceId || undefined,
          employeeId: regForm.employeeId,
          date: regForm.date,
          checkInTime: regForm.checkInTime,
          checkOutTime: regForm.checkOutTime,
          attendanceType: regForm.attendanceType,
          status: regForm.status,
          workingHours: regForm.workingHours !== '' ? Number(regForm.workingHours) : undefined,
          overtimeHours: otManualOverride && regForm.overtimeHours !== '' ? Number(regForm.overtimeHours) : undefined,
          checkInAddress: regForm.checkInAddress,
          checkOutAddress: regForm.checkOutAddress,
          correctionStatus: regForm.correctionStatus,
          regularizationType: regForm.regularizationType,
          correctionReason: regForm.reason || 'Admin attendance regularization',
          notes: regForm.notes,
          recalculateHours: regForm.workingHours === '',
        });
        onToast('success', 'Attendance record saved', `${regForm.employeeId} · ${regForm.date}`);
      } else {
        await callRpc('regularizeAttendance', {
          attendanceId: regForm.attendanceId || undefined,
          employeeId: isAdmin ? regForm.employeeId : user.employeeId,
          date: regForm.date,
          regularizationType: regForm.regularizationType,
          requestedCheckInTime: regForm.checkInTime,
          requestedCheckOutTime: regForm.checkOutTime,
          requestedAttendanceType: regForm.attendanceType,
          requestedStatus: regForm.status,
          reason: regForm.reason || 'Attendance regularization request',
          notes: regForm.notes,
          applyImmediately: isAdmin ? regForm.applyImmediately : false,
        });
        onToast(
          'success',
          isAdmin && regForm.applyImmediately ? 'Attendance regularized' : 'Regularization request submitted',
          isAdmin && regForm.applyImmediately ? 'Attendance updated immediately.' : 'Sent to HR Admin for review.',
        );
      }
      setShowRegModal(false);
      await loadAttendance();
    } catch (err: any) {
      onToast('error', 'Regularization failed', err.message);
    } finally {
      setSavingReg(false);
    }
  };

  const handleReviewCorrection = async (attendanceId: string, decision: 'APPROVED' | 'REJECTED') => {
    try {
      await callRpc('approveAttendanceCorrection', {
        attendanceId,
        decision,
      });
      onToast('success', `Regularization ${decision.toLowerCase()}`);
      await loadAttendance();
    } catch (err: any) {
      onToast('error', 'Approval failed', err.message);
    }
  };

  return (
    <div className="space-y-5">
      {/* Mobile-First Check-In / Check-Out Console */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="metallic-surface overflow-hidden rounded-2xl lg:col-span-5">
          <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-blue-600 to-amber-500" />
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-display text-lg font-semibold text-slate-900">Mobile Attendance Capture</h1>
                <p className="text-xs text-slate-500">
                  {todayStr} · Shift {settings?.shiftStartTime || '09:30'}–{settings?.shiftEndTime || '18:30'}
                </p>
              </div>
              <select
                value={attendanceType}
                onChange={(e) => {
                  const val = e.target.value as 'OFFICE' | 'FIELD' | 'REMOTE';
                  setAttendanceType(val);
                  if (val === 'FIELD') captureGps().catch(() => {});
                }}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-800"
              >
                <option value="OFFICE">Office</option>
                <option value="FIELD">Field Site</option>
                <option value="REMOTE">Remote</option>
              </select>
            </div>

            {(attendanceType === 'FIELD' || user.isFieldEmployee || todayRecord?.attendanceType === 'FIELD') && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
                <span>
                  <strong>Field Duty Policy:</strong> Device Location / GPS is mandatory from Check-In until Check-Out.
                  Travel route points are logged continuously to Google Sheets and visible only to Admin.
                </span>
              </div>
            )}

            {/* Camera Preview / Selfie Box */}
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
              {cameraActive ? (
                <div className="relative">
                  <video ref={videoRef} autoPlay playsInline muted className="h-52 w-full object-cover" />
                  <div className="flex justify-center gap-2 bg-slate-900 p-2.5">
                    <button
                      type="button"
                      onClick={captureSelfieFrame}
                      className="min-h-[40px] rounded-lg bg-white px-4 text-xs font-semibold text-slate-900"
                    >
                      Capture Selfie
                    </button>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="min-h-[40px] rounded-lg border border-slate-600 px-3 text-xs text-slate-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : selfieDataUrl ? (
                <div className="relative bg-slate-900">
                  <img src={selfieDataUrl} alt="Captured selfie" className="h-52 w-full object-cover" />
                  <button
                    type="button"
                    onClick={startCamera}
                    className="absolute bottom-2 right-2 rounded-lg bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-white"
                  >
                    Retake
                  </button>
                </div>
              ) : (
                <div className="flex h-40 flex-col items-center justify-center gap-3 p-4 text-center text-slate-300">
                  <Camera className="h-8 w-8 text-slate-400" />
                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={startCamera}
                      className="min-h-[40px] rounded-lg bg-white px-4 text-xs font-semibold text-slate-900"
                    >
                      Open Front Camera
                    </button>
                    <label className="inline-flex min-h-[40px] cursor-pointer items-center rounded-lg border border-slate-600 px-3 text-xs font-medium text-slate-200">
                      Camera / Photo File
                      <input
                        type="file"
                        accept="image/*"
                        capture="user"
                        className="hidden"
                        onChange={handleFallbackPhoto}
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Google Maps Live GPS & Address Strip */}
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2 text-slate-700">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                  <div className="min-w-0 space-y-0.5">
                    {gpsCoords ? (
                      <>
                        <p className="font-semibold text-slate-900">
                          {resolvingAddress
                            ? 'Resolving Google Maps address...'
                            : gpsCoords.address || 'Coordinates locked (Google Maps preview below)'}
                        </p>
                        <p className="font-mono text-[11px] text-slate-600 tabular-nums">
                          {gpsCoords.lat}, {gpsCoords.lng} (±{gpsCoords.accuracy}m)
                        </p>
                        <a
                          href={buildGoogleMapsUrl(gpsCoords.lat, gpsCoords.lng, gpsCoords.placeId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:underline"
                        >
                          Open in Google Maps <ExternalLink className="h-3 w-3" />
                        </a>
                      </>
                    ) : (
                      <span className="font-mono text-slate-600">
                        {gpsStatus || 'Click Get Live GPS to lock Google Maps address'}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => captureGps().catch(() => {})}
                  className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-semibold text-[#0B1B36] hover:bg-slate-100"
                >
                  {gpsCoords ? 'Refresh GPS' : 'Get Live GPS'}
                </button>
              </div>
            </div>

            {/* Embedded Live Google Map Preview for Current / Today Check-In & Check-Out */}
            <CheckInOutPreviewMap liveCapture={gpsCoords} todayRecord={todayRecord} />

            {/* Primary Action Buttons */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={submitting || Boolean(todayRecord?.checkInTime)}
                onClick={() => handleAttendanceAction('CHECK_IN')}
                className="metallic-btn-emerald min-h-[48px] rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-45"
              >
                {todayRecord?.checkInTime ? 'Checked In' : submitting ? 'Saving...' : 'CHECK IN'}
              </button>
              <button
                type="button"
                disabled={submitting || !todayRecord?.checkInTime || Boolean(todayRecord?.checkOutTime)}
                onClick={() => handleAttendanceAction('CHECK_OUT')}
                className="metallic-btn-primary min-h-[48px] rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-45"
              >
                {todayRecord?.checkOutTime ? 'Checked Out' : 'CHECK OUT'}
              </button>
            </div>

            {todayRecord && (
              <div className="mt-3 space-y-2 border-t border-slate-200/80 pt-3 text-xs text-slate-700">
                <div className="flex items-center justify-between">
                  <span>
                    In: <strong className="font-mono text-emerald-700 tabular-nums">{todayRecord.checkInTime.slice(11, 19)}</strong>
                  </span>
                  <span>
                    Out:{' '}
                    <strong className="font-mono text-blue-700 tabular-nums">
                      {todayRecord.checkOutTime ? todayRecord.checkOutTime.slice(11, 19) : 'Active'}
                    </strong>
                  </span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {todayRecord.workingHours} hrs
                    {Number(todayRecord.overtimeHours || 0) > 0 && (
                      <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                        +{todayRecord.overtimeHours}h OT
                      </span>
                    )}
                  </span>
                </div>
                {todayRecord.checkInAddress && (
                  <p className="text-[11px] text-slate-600">
                    <strong className="text-emerald-800">In Location:</strong> {todayRecord.checkInAddress}
                  </p>
                )}
                {todayRecord.checkOutAddress && (
                  <p className="text-[11px] text-slate-600">
                    <strong className="text-blue-800">Out Location:</strong> {todayRecord.checkOutAddress}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Pending Offline Queue & Monthly Summary */}
        <div className="flex flex-col gap-4 lg:col-span-7">
          {offlineQueue.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-amber-900">
                  <ShieldAlert className="h-4 w-4" />
                  <span className="text-sm font-semibold">
                    Offline Queue ({offlineQueue.length} item(s) Pending Sync — Unverified Device Capture)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleSyncNow}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Sync Now
                </button>
              </div>
              <div className="mt-2 space-y-1 text-xs text-amber-800">
                {offlineQueue.map((item) => (
                  <div key={item.eventId} className="flex items-center justify-between font-mono">
                    <span>
                      {item.type} · {item.deviceTimestamp}
                    </span>
                    <span>{item.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="metallic-surface flex-1 overflow-hidden rounded-2xl">
            <div className="h-1 w-full bg-gradient-to-r from-blue-600 to-indigo-500" />
            <div className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    Attendance Register &amp; Google Maps Location Logs
                  </h2>
                  <p className="text-xs text-slate-500">
                    {records.length} record(s) in {monthFilter} · Total Overtime:{' '}
                    <span className="font-mono font-semibold text-emerald-700">{totalOvertimeHours.toFixed(2)} hrs</span> (&gt; {overtimeThreshold}h duty)
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openRegularizeModal(undefined, isAdmin ? 'ADMIN_EDIT' : 'EMPLOYEE_REQUEST')}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    {isAdmin ? 'Regularize / Add Attendance' : 'Regularize Attendance'}
                  </button>
                  <input
                    type="month"
                    value={monthFilter}
                    onChange={(e) => setMonthFilter(e.target.value)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      exportToCsv(
                        `Attendance_${monthFilter}.csv`,
                        [
                          'Employee ID',
                          'Name',
                          'Date',
                          'Check In Time',
                          'Check In Address',
                          'Check In GPS',
                          'Check Out Time',
                          'Check Out Address',
                          'Check Out GPS',
                          'Hours',
                          'Overtime (h)',
                          'Status',
                          'Verification',
                          'Regularization Status',
                        ],
                        records.map((r) => [
                          r.employeeId,
                          r.employeeName,
                          r.date,
                          r.checkInTime,
                          r.checkInAddress || '',
                          r.checkInLat != null ? `${r.checkInLat},${r.checkInLng}` : '',
                          r.checkOutTime,
                          r.checkOutAddress || '',
                          r.checkOutLat != null ? `${r.checkOutLat},${r.checkOutLng}` : '',
                          r.workingHours,
                          r.overtimeHours ?? 0,
                          r.status,
                          r.verificationStatus,
                          r.correctionStatus || 'NONE',
                        ]),
                      )
                    }
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      exportReportToPdf(
                        'Attendance Register',
                        `Month: ${monthFilter} · Overtime after ${overtimeThreshold}h duty`,
                        ['ID', 'Name', 'Date', 'In', 'Out', 'Hrs', 'OT', 'Status'],
                        records.map((r) => [
                          r.employeeId,
                          r.employeeName,
                          r.date,
                          r.checkInTime ? r.checkInTime.slice(11, 16) : '—',
                          r.checkOutTime ? r.checkOutTime.slice(11, 16) : '—',
                          r.workingHours,
                          r.overtimeHours ?? 0,
                          r.status,
                        ]),
                        `Attendance_${monthFilter}.pdf`,
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-lg bg-[#0B1B36] px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    <Download className="h-3.5 w-3.5" />
                    PDF
                  </button>
                </div>
              </div>

              {pendingRegularizations.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-950">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-700" />
                    <span className="font-semibold">
                      {pendingRegularizations.length} Pending Attendance Regularization Request(s)
                    </span>
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => openRegularizeModal(pendingRegularizations[0], 'ADMIN_REVIEW')}
                      className="rounded-lg bg-amber-900 px-3 py-1 font-semibold text-white hover:bg-amber-800"
                    >
                      Review Next Request
                    </button>
                  )}
                </div>
              )}

              <div className="mt-4 overflow-x-auto">
                {loading ? (
                  <p className="py-6 text-center text-xs text-slate-500">Loading attendance logs...</p>
                ) : records.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-500">
                    No attendance entries recorded for {monthFilter}.
                  </p>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-3 py-2.5">Employee / Date</th>
                        <th className="px-3 py-2.5">Check-In &amp; Location</th>
                        <th className="px-3 py-2.5">Check-Out &amp; Location</th>
                        <th className="px-3 py-2.5">Hours</th>
                        <th className="px-3 py-2.5">Status</th>
                        <th className="px-3 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {records.map((r) => (
                        <tr key={r.attendanceId} className="align-top hover:bg-slate-50/70">
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-slate-900">{r.employeeName}</p>
                            <p className="font-mono text-slate-500">
                              {r.employeeId} · {r.date}
                            </p>
                          </td>
                          <td className="px-3 py-2.5 max-w-[230px]">
                            <div className="flex items-start gap-2">
                              {r.checkInPhotoRef && (
                                <img
                                  src={r.checkInPhotoRef}
                                  alt="Check-in selfie"
                                  className="mt-0.5 h-8 w-8 shrink-0 rounded border border-slate-200 object-cover"
                                />
                              )}
                              <div className="min-w-0 space-y-0.5">
                                <p className="font-mono font-semibold text-emerald-800 tabular-nums">
                                  {r.checkInTime ? r.checkInTime.slice(11, 19) : '—'}
                                </p>
                                {r.checkInAddress && (
                                  <p className="text-[11px] leading-snug text-slate-800">{r.checkInAddress}</p>
                                )}
                                {r.checkInLat != null && r.checkInLng != null ? (
                                  <a
                                    href={buildGoogleMapsUrl(
                                      Number(r.checkInLat),
                                      Number(r.checkInLng),
                                      r.checkInPlaceId,
                                    )}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 font-mono text-[11px] text-blue-700 hover:underline tabular-nums"
                                  >
                                    {Number(r.checkInLat).toFixed(5)}, {Number(r.checkInLng).toFixed(5)}
                                    {r.checkInAccuracy != null ? ` (±${r.checkInAccuracy}m)` : ''}
                                    <ExternalLink className="h-2.5 w-2.5" />
                                  </a>
                                ) : (
                                  <p className="font-mono text-[11px] text-slate-400">No GPS</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 max-w-[230px]">
                            {r.checkOutTime ? (
                              <div className="flex items-start gap-2">
                                {r.checkOutPhotoRef && (
                                  <img
                                    src={r.checkOutPhotoRef}
                                    alt="Check-out selfie"
                                    className="mt-0.5 h-8 w-8 shrink-0 rounded border border-slate-200 object-cover"
                                  />
                                )}
                                <div className="min-w-0 space-y-0.5">
                                  <p className="font-mono font-semibold text-blue-800 tabular-nums">
                                    {r.checkOutTime.slice(11, 19)}
                                  </p>
                                  {r.checkOutAddress && (
                                    <p className="text-[11px] leading-snug text-slate-800">{r.checkOutAddress}</p>
                                  )}
                                  {r.checkOutLat != null && r.checkOutLng != null ? (
                                    <a
                                      href={buildGoogleMapsUrl(
                                        Number(r.checkOutLat),
                                        Number(r.checkOutLng),
                                        r.checkOutPlaceId,
                                      )}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 font-mono text-[11px] text-blue-700 hover:underline tabular-nums"
                                    >
                                      {Number(r.checkOutLat).toFixed(5)}, {Number(r.checkOutLng).toFixed(5)}
                                      {r.checkOutAccuracy != null ? ` (±${r.checkOutAccuracy}m)` : ''}
                                      <ExternalLink className="h-2.5 w-2.5" />
                                    </a>
                                  ) : (
                                    <p className="font-mono text-[11px] text-slate-400">No GPS</p>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="font-mono text-slate-400">Active / Missing</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 font-mono tabular-nums whitespace-nowrap">
                            {r.workingHours}h {r.overtimeHours > 0 ? `(+${r.overtimeHours} OT)` : ''}
                          </td>
                          <td className="px-3 py-2.5">
                            <p
                              className={`font-semibold ${
                                r.status === 'PRESENT'
                                  ? 'text-emerald-700'
                                  : r.status === 'LATE'
                                    ? 'text-amber-700'
                                    : r.status === 'HALF_DAY'
                                      ? 'text-blue-700'
                                      : 'text-red-600'
                              }`}
                            >
                              {r.status}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {r.verificationStatus === 'DEVICE_CAPTURED_UNVERIFIED'
                                ? 'Device-Captured (Unverified)'
                                : 'Verified'}
                            </p>
                            {r.correctionStatus && r.correctionStatus !== 'NONE' && (
                              <div className="mt-1 space-y-0.5 rounded bg-slate-50 p-1.5 text-[10px]">
                                <p
                                  className={`font-semibold ${
                                    r.correctionStatus === 'APPROVED'
                                      ? 'text-emerald-700'
                                      : r.correctionStatus === 'PENDING'
                                        ? 'text-amber-700'
                                        : 'text-red-600'
                                  }`}
                                >
                                  Reg: {r.correctionStatus}
                                  {r.regularizationType ? ` · ${REGULARIZATION_LABELS[r.regularizationType] || r.regularizationType}` : ''}
                                </p>
                                {(r.requestedCheckInTime || r.requestedCheckOutTime) && r.correctionStatus === 'PENDING' && (
                                  <p className="font-mono text-slate-700">
                                    Req: {toTimeInput(r.requestedCheckInTime) || '—'}–{toTimeInput(r.requestedCheckOutTime) || '—'}
                                  </p>
                                )}
                                {r.correctionReason && <p className="text-slate-600">{r.correctionReason}</p>}
                                {r.regularizedBy && <p className="text-slate-500">By {r.regularizedBy}</p>}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <div className="inline-flex flex-wrap justify-end gap-1.5">
                              {(r.checkInLat != null || r.checkOutLat != null) && (
                                <button
                                  type="button"
                                  onClick={() => setMapModalRecord(r)}
                                  className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-800 hover:bg-blue-100"
                                >
                                  <MapPin className="h-3 w-3" />
                                  View Map
                                </button>
                              )}
                              {r.correctionStatus === 'PENDING' && isAdmin ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openRegularizeModal(r, 'ADMIN_REVIEW')}
                                    className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900"
                                  >
                                    Review / Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleReviewCorrection(r.attendanceId, 'APPROVED')}
                                    className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleReviewCorrection(r.attendanceId, 'REJECTED')}
                                    className="rounded bg-red-600 px-2 py-1 text-[11px] font-medium text-white"
                                  >
                                    Reject
                                  </button>
                                </>
                              ) : isAdmin ? (
                                <button
                                  type="button"
                                  onClick={() => openRegularizeModal(r, 'ADMIN_EDIT')}
                                  className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                                >
                                  <Edit3 className="h-3 w-3" />
                                  Edit / Regularize
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openRegularizeModal(r, 'EMPLOYEE_REQUEST')}
                                  className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
                                >
                                  <Clock className="h-3 w-3" />
                                  Regularize
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Google Maps Check-In / Check-Out Modal */}
      {mapModalRecord && <AttendanceLocationModal record={mapModalRecord} onClose={() => setMapModalRecord(null)} />}

      {/* Attendance Regularization & Admin Edit Modal */}
      {showRegModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  {regMode === 'ADMIN_REVIEW'
                    ? 'Review & Apply Attendance Regularization'
                    : regMode === 'ADMIN_EDIT'
                      ? 'Admin Attendance Edit & Regularization'
                      : 'Request Attendance Regularization'}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {isAdmin
                    ? 'Regularize missed punches, mark absent dates present, or adjust shift timings.'
                    : 'Submit missed check-in/out or timing corrections for any date to HR Admin.'}
                </p>
              </div>
              <button type="button" onClick={() => setShowRegModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitRegularization} className="mt-4 space-y-3.5 text-xs">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {isAdmin && (
                  <div>
                    <label className="block font-medium text-slate-700">Employee *</label>
                    <select
                      required
                      disabled={Boolean(regForm.attendanceId)}
                      value={regForm.employeeId}
                      onChange={(e) => setRegForm({...regForm, employeeId: e.target.value})}
                      className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                    >
                      {employees.map((emp) => (
                        <option key={emp.employeeId} value={emp.employeeId}>
                          {emp.employeeId} — {emp.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block font-medium text-slate-700">Attendance Date *</label>
                  <input
                    required
                    type="date"
                    disabled={Boolean(regForm.attendanceId)}
                    value={regForm.date}
                    onChange={(e) => setRegForm({...regForm, date: e.target.value})}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-2 font-mono disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700">Regularization Type</label>
                  <select
                    value={regForm.regularizationType}
                    onChange={(e) => setRegForm({...regForm, regularizationType: e.target.value as RegularizationType})}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    {(Object.keys(REGULARIZATION_LABELS) as RegularizationType[]).map((key) => (
                      <option key={key} value={key}>
                        {REGULARIZATION_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700">Work Mode</label>
                  <select
                    value={regForm.attendanceType}
                    onChange={(e) =>
                      setRegForm({...regForm, attendanceType: e.target.value as 'OFFICE' | 'FIELD' | 'REMOTE'})
                    }
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="OFFICE">Office</option>
                    <option value="FIELD">Field Site</option>
                    <option value="REMOTE">Remote</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block font-medium text-slate-700">Check-In Time (HH:MM)</label>
                  <input
                    type="time"
                    value={regForm.checkInTime}
                    onChange={(e) => {
                      const nextIn = e.target.value;
                      const calc = computeTimesSummary(nextIn, regForm.checkOutTime, overtimeThreshold);
                      setOtManualOverride(false);
                      setRegForm({
                        ...regForm,
                        checkInTime: nextIn,
                        workingHours: calc.workingHours,
                        overtimeHours: calc.overtimeHours,
                      });
                    }}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700">Check-Out Time (HH:MM)</label>
                  <input
                    type="time"
                    value={regForm.checkOutTime}
                    onChange={(e) => {
                      const nextOut = e.target.value;
                      const calc = computeTimesSummary(regForm.checkInTime, nextOut, overtimeThreshold);
                      setOtManualOverride(false);
                      setRegForm({
                        ...regForm,
                        checkOutTime: nextOut,
                        workingHours: calc.workingHours,
                        overtimeHours: calc.overtimeHours,
                      });
                    }}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700">Attendance Status</label>
                  <select
                    value={regForm.status}
                    onChange={(e) => setRegForm({...regForm, status: e.target.value as AttendanceStatus})}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="PRESENT">PRESENT</option>
                    <option value="LATE">LATE</option>
                    <option value="HALF_DAY">HALF_DAY</option>
                    <option value="ON_LEAVE">ON_LEAVE</option>
                    <option value="ABSENT">ABSENT</option>
                    <option value="HOLIDAY">HOLIDAY</option>
                  </select>
                </div>
              </div>

              {isAdmin && (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="block font-medium text-slate-700">Working Hours (blank = auto)</label>
                      <input
                        type="number"
                        step="0.25"
                        min={0}
                        value={regForm.workingHours}
                        onChange={(e) => {
                          const val = e.target.value;
                          setOtManualOverride(false);
                          if (val === '') {
                            setRegForm({...regForm, workingHours: '', overtimeHours: ''});
                          } else {
                            const w = Number(val);
                            const autoOt =
                              Number.isFinite(w) && w > overtimeThreshold
                                ? String(Math.round((w - overtimeThreshold) * 100) / 100)
                                : '0';
                            setRegForm({...regForm, workingHours: val, overtimeHours: autoOt});
                          }
                        }}
                        placeholder="Auto from In/Out"
                        className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700">Overtime Hours</label>
                      <input
                        type="number"
                        step="0.25"
                        min={0}
                        value={regForm.overtimeHours}
                        onChange={(e) => {
                          setOtManualOverride(true);
                          setRegForm({...regForm, overtimeHours: e.target.value});
                        }}
                        placeholder={`Auto (>${overtimeThreshold}h)`}
                        className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700">Regularization Status</label>
                      <select
                        value={regForm.correctionStatus}
                        onChange={(e) =>
                          setRegForm({
                            ...regForm,
                            correctionStatus: e.target.value as 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED',
                          })
                        }
                        className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-2"
                      >
                        <option value="APPROVED">APPROVED</option>
                        <option value="PENDING">PENDING</option>
                        <option value="REJECTED">REJECTED</option>
                        <option value="NONE">NONE</option>
                      </select>
                    </div>
                  </div>
                  <p className="text-[11px] text-emerald-700">
                    Any duty beyond {overtimeThreshold} hrs is automatically counted as Overtime (supports overnight shifts).
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block font-medium text-slate-700">Check-In Location / Address</label>
                      <input
                        type="text"
                        value={regForm.checkInAddress}
                        onChange={(e) => setRegForm({...regForm, checkInAddress: e.target.value})}
                        placeholder="Optional office or field site address"
                        className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700">Check-Out Location / Address</label>
                      <input
                        type="text"
                        value={regForm.checkOutAddress}
                        onChange={(e) => setRegForm({...regForm, checkOutAddress: e.target.value})}
                        placeholder="Optional check-out address"
                        className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block font-medium text-slate-700">
                  Reason / Remarks {regMode === 'EMPLOYEE_REQUEST' ? '*' : ''}
                </label>
                <textarea
                  required={regMode === 'EMPLOYEE_REQUEST'}
                  rows={2}
                  value={regForm.reason}
                  onChange={(e) => setRegForm({...regForm, reason: e.target.value})}
                  placeholder="Explain missed punch, field client visit, biometric/GPS issue, or admin adjustment..."
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-xs"
                />
              </div>

              {isAdmin && (
                <div>
                  <label className="block font-medium text-slate-700">Internal Admin Notes</label>
                  <input
                    type="text"
                    value={regForm.notes}
                    onChange={(e) => setRegForm({...regForm, notes: e.target.value})}
                    placeholder="Optional internal HR remarks"
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
              )}

              {isAdmin && regMode === 'ADMIN_EDIT' && (
                <label className="flex items-center gap-2 font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={regForm.applyImmediately}
                    onChange={(e) => setRegForm({...regForm, applyImmediately: e.target.checked})}
                  />
                  Apply attendance changes immediately (uncheck to log as a Pending Regularization request)
                </label>
              )}

              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setShowRegModal(false)}
                  className="min-h-[40px] rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium"
                >
                  Cancel
                </button>
                {regMode === 'ADMIN_REVIEW' && regForm.attendanceId && (
                  <button
                    type="button"
                    onClick={async () => {
                      await handleReviewCorrection(regForm.attendanceId, 'REJECTED');
                      setShowRegModal(false);
                    }}
                    className="min-h-[40px] rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white"
                  >
                    Reject
                  </button>
                )}
                <button
                  type="submit"
                  disabled={savingReg}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#0B1B36] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {savingReg
                    ? 'Saving...'
                    : regMode === 'ADMIN_REVIEW'
                      ? 'Approve & Apply'
                      : regMode === 'ADMIN_EDIT'
                        ? 'Save Attendance'
                        : 'Submit Regularization'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
