import {
  AlertTriangle,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Lock,
  MapPin,
  Navigation,
  RefreshCw,
} from 'lucide-react';
import {useEffect, useMemo, useState} from 'react';
import {callRpc} from '../../services/apiClient';
import {buildGoogleMapsUrl} from '../../services/mapsService';
import {exportReportToPdf, exportToCsv} from '../../services/pdfExports';
import type {AuthUser, EmployeeRecord, LiveLocationRecord, LocationHistoryPoint} from '../../types/hrms';
import {LiveTrackingGoogleMap} from '../maps/GoogleMapsWidgets';

interface LocationTrackingViewProps {
  user: AuthUser;
  onToast: (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;
}

type StatusFilter = 'ALL' | 'LIVE' | 'FIELD' | 'ALERT';

export function LocationTrackingView({user, onToast}: LocationTrackingViewProps) {
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'HR_ADMIN';

  const [liveLocations, setLiveLocations] = useState<LiveLocationRecord[]>([]);
  const [history, setHistory] = useState<LocationHistoryPoint[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);

  const loadTrackingData = async () => {
    if (!isAdmin) return;
    try {
      const [liveRes, histRes, empRes] = await Promise.all([
        callRpc<{ok: boolean; locations: LiveLocationRecord[]}>('getLiveLocations'),
        callRpc<{ok: boolean; history: LocationHistoryPoint[]}>('getLocationHistory', {
          employeeId: selectedEmpId || undefined,
          date: filterDate,
        }),
        callRpc<{ok: boolean; employees: EmployeeRecord[]}>('getEmployees'),
      ]);
      setLiveLocations(liveRes.locations || []);
      setHistory(histRes.history || []);
      setEmployees(empRes.employees || []);
    } catch (err: any) {
      onToast('error', 'Location load failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    setLoading(true);
    loadTrackingData();
  }, [isAdmin, selectedEmpId, filterDate]);

  useEffect(() => {
    if (!isAdmin || !autoRefresh) return;
    const poll = window.setInterval(() => {
      if (navigator.onLine) loadTrackingData();
    }, 15000);
    return () => clearInterval(poll);
  }, [isAdmin, autoRefresh, selectedEmpId, filterDate]);

  const filteredLiveLocations = useMemo(() => {
    return liveLocations.filter((loc) => {
      if (statusFilter === 'LIVE') return !loc.isStale;
      if (statusFilter === 'FIELD') return Boolean(loc.isFieldEmployee || loc.attendanceType === 'FIELD');
      if (statusFilter === 'ALERT') {
        return (
          loc.locationPermissionStatus === 'PERMISSION_DENIED' ||
          loc.locationPermissionStatus === 'GPS_UNAVAILABLE'
        );
      }
      return true;
    });
  }, [liveLocations, statusFilter]);

  const gpsAlertCount = useMemo(
    () =>
      liveLocations.filter(
        (l) =>
          l.locationPermissionStatus === 'PERMISSION_DENIED' ||
          l.locationPermissionStatus === 'GPS_UNAVAILABLE',
      ).length,
    [liveLocations],
  );

  const activeLiveCount = useMemo(
    () => liveLocations.filter((l) => !l.isStale).length,
    [liveLocations],
  );

  const selectedRouteDistanceMeters = useMemo(() => {
    const pts = selectedEmpId ? history.filter((h) => h.employeeId === selectedEmpId) : history;
    return pts.reduce((sum, p) => sum + Number(p.distanceFromPrevMeters || 0), 0);
  }, [history, selectedEmpId]);

  if (!isAdmin) {
    return (
      <div className="metallic-surface flex flex-col items-center justify-center rounded-2xl p-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
          <Lock className="h-6 w-6" />
        </div>
        <h2 className="mt-3 font-display text-base font-bold text-slate-900">Admin Access Only</h2>
        <p className="mt-1 max-w-md text-xs text-slate-600">
          Live Field GPS tracking and employee movement trails are restricted to authorized HR &amp; Operations
          Administrators. Your check-in to check-out field GPS continues logging automatically in the background.
        </p>
      </div>
    );
  }

  const handleExportCsv = () => {
    exportToCsv(
      `IDEAL_Field_GPS_Trail_${filterDate}_${selectedEmpId || 'ALL'}.csv`,
      [
        'Timestamp',
        'Employee ID',
        'Name',
        'Department',
        'Work Mode',
        'Source',
        'Latitude',
        'Longitude',
        'Accuracy (m)',
        'Distance Step (m)',
        'Speed (km/h)',
        'Google Maps Address',
        'Google Maps URL',
        'Verification',
      ],
      history.map((h) => [
        h.timestamp,
        h.employeeId,
        h.employeeName,
        h.department,
        h.attendanceType || 'FIELD',
        h.source,
        h.latitude,
        h.longitude,
        h.accuracy,
        h.distanceFromPrevMeters ?? 0,
        h.speedMps != null ? Number((h.speedMps * 3.6).toFixed(1)) : '',
        h.address || '',
        h.mapsUrl || buildGoogleMapsUrl(Number(h.latitude), Number(h.longitude), h.placeId),
        h.verificationStatus,
      ]),
    );
    onToast('success', 'GPS Movement Trail CSV Exported');
  };

  const handleExportPdf = () => {
    exportReportToPdf(
      `Field Location Trail (${filterDate})`,
      `Employee: ${selectedEmpId || 'All Tracked Staff'} · Total Trail Points: ${history.length} · Distance: ${(selectedRouteDistanceMeters / 1000).toFixed(2)} km`,
      ['Time', 'Employee', 'Mode / Source', 'Address', 'Lat, Lng', 'Dist Step'],
      history.map((h) => [
        new Date(h.timestamp).toLocaleTimeString(),
        `${h.employeeName} (${h.employeeId})`,
        `${h.attendanceType || 'FIELD'} / ${h.source}`,
        h.address || 'Coordinates recorded',
        `${Number(h.latitude).toFixed(5)}, ${Number(h.longitude).toFixed(5)}`,
        `${Math.round(Number(h.distanceFromPrevMeters || 0))}m`,
      ]),
      `IDEAL_Field_GPS_Trail_${filterDate}_${selectedEmpId || 'ALL'}.pdf`,
    );
    onToast('success', 'GPS Movement Trail PDF Exported');
  };

  return (
    <div className="space-y-5">
      {/* Admin Live Field Tracking Banner */}
      <div className="metallic-navy-panel overflow-hidden rounded-2xl text-white">
        <div className="h-1 w-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-amber-400" />
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-xl font-semibold text-white">
                Admin Field Workforce Live GPS &amp; Route Trail
              </h1>
              <span className="rounded bg-white/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-300">
                ADMIN ONLY · SHEETS SYNCED
              </span>
            </div>
            <p className="mt-1 text-xs text-sky-100/85">
              Mandatory Check-In to Check-Out continuous tracking for Field Employees · Recorded in Live_Location &amp;
              Attendance_Location_History sheets
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs">
              <span className="text-emerald-300">
                Live Active: <strong className="font-mono">{activeLiveCount}</strong>
              </span>
              <span className="text-sky-200">
                Trail Points ({filterDate}): <strong className="font-mono">{history.length}</strong>
              </span>
              <span className="text-amber-300">
                Tracked Distance:{' '}
                <strong className="font-mono">{(selectedRouteDistanceMeters / 1000).toFixed(2)} km</strong>
              </span>
              {gpsAlertCount > 0 && (
                <span className="font-semibold text-rose-300">
                  GPS Permission Alerts: <span className="font-mono">{gpsAlertCount}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3 text-xs font-medium text-white">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="accent-emerald-400"
              />
              Auto-Refresh (15s)
            </label>
            <button
              type="button"
              onClick={loadTrackingData}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3.5 text-xs font-medium text-white hover:bg-white/20"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3 text-xs font-medium text-white hover:bg-white/20"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-300" />
              CSV
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              className="metallic-btn-gold inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold"
            >
              <Download className="h-3.5 w-3.5" />
              PDF
            </button>
          </div>
        </div>
      </div>

      {/* GPS Permission Alert Banner for Admin */}
      {gpsAlertCount > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs text-rose-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <div>
            <strong>{gpsAlertCount} Employee GPS Permission Alert(s):</strong> Checked-in field staff currently have
            device location turned OFF or permission denied. Check red pins/cards below.
          </div>
        </div>
      )}

      {/* Google Map + Live Employee List */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="metallic-surface overflow-hidden rounded-xl lg:col-span-8">
          <LiveTrackingGoogleMap
            liveLocations={filteredLiveLocations}
            history={history}
            selectedEmpId={selectedEmpId}
            onSelectEmpId={setSelectedEmpId}
          />
        </div>

        <div className="metallic-surface flex flex-col rounded-xl p-4 lg:col-span-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold text-slate-900">Employee Live Status</h2>
            {selectedEmpId && (
              <button
                type="button"
                onClick={() => setSelectedEmpId('')}
                className="text-[11px] font-semibold text-blue-700 hover:underline"
              >
                Show All
              </button>
            )}
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {(
              [
                ['ALL', 'All'],
                ['LIVE', 'Live'],
                ['FIELD', 'Field Duty'],
                ['ALERT', `GPS Alerts (${gpsAlertCount})`],
              ] as [StatusFilter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  statusFilter === key
                    ? 'border-[#0B1B36] bg-[#0B1B36] text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-3 max-h-[380px] flex-1 space-y-2.5 overflow-y-auto">
            {filteredLiveLocations.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">
                No employees match the selected live tracking filter.
              </p>
            ) : (
              filteredLiveLocations.map((loc) => {
                const isSelected = selectedEmpId === loc.employeeId;
                const isAlert =
                  loc.locationPermissionStatus === 'PERMISSION_DENIED' ||
                  loc.locationPermissionStatus === 'GPS_UNAVAILABLE';
                const speedKmh =
                  loc.speedMps != null && Number.isFinite(Number(loc.speedMps))
                    ? (Number(loc.speedMps) * 3.6).toFixed(1)
                    : null;
                const distKm =
                  loc.distanceTodayMeters != null
                    ? (Number(loc.distanceTodayMeters) / 1000).toFixed(2)
                    : '0.00';
                return (
                  <div
                    key={loc.employeeId}
                    onClick={() => setSelectedEmpId(loc.employeeId)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedEmpId(loc.employeeId);
                    }}
                    className={`w-full cursor-pointer rounded-lg border p-3 text-left transition-colors ${
                      isAlert
                        ? 'border-rose-300 bg-rose-50/70'
                        : isSelected
                          ? 'border-blue-500 bg-blue-50/60'
                          : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900">{loc.employeeName}</span>
                      <span
                        className={`text-[11px] font-semibold ${
                          isAlert
                            ? 'text-rose-700'
                            : loc.locationPermissionStatus === 'CHECKED_OUT'
                              ? 'text-blue-700'
                              : loc.isStale
                                ? 'text-slate-500'
                                : 'text-emerald-700'
                        }`}
                      >
                        {isAlert
                          ? 'GPS OFF ALERT'
                          : loc.locationPermissionStatus === 'CHECKED_OUT'
                            ? 'Checked Out'
                            : loc.isStale
                              ? 'Stale / Inactive'
                              : 'Live Active'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {loc.employeeId} · {loc.department} · {loc.attendanceType || (loc.isFieldEmployee ? 'FIELD' : 'OFFICE')}
                    </p>
                    {loc.address && <p className="mt-1 text-xs font-medium text-slate-800">{loc.address}</p>}
                    <p className="mt-1 font-mono text-[11px] text-slate-600 tabular-nums">
                      {Number(loc.latitude).toFixed(5)}, {Number(loc.longitude).toFixed(5)} (±{loc.accuracy}m)
                    </p>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-slate-600">
                      <span>Today: {distKm} km{speedKmh ? ` · ${speedKmh} km/h` : ''}</span>
                      {Number(loc.latitude) !== 0 && Number(loc.longitude) !== 0 && (
                        <a
                          href={loc.mapsUrl || buildGoogleMapsUrl(Number(loc.latitude), Number(loc.longitude), loc.placeId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 font-sans font-semibold text-blue-700 hover:underline"
                        >
                          Maps <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </div>
                    <p className="mt-1 text-[10px] text-slate-400">
                      Updated: {new Date(loc.lastUpdatedAt).toLocaleTimeString()}
                      {loc.shiftCheckedInAt ? ` · In: ${loc.shiftCheckedInAt.slice(11, 16)}` : ''}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Movement Timeline Recorded in Attendance_Location_History Sheet */}
      <div className="metallic-surface overflow-hidden rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Complete Travel Route Log (Recorded in Attendance_Location_History Sheet)
            </h2>
            <p className="text-xs text-slate-500">
              {history.length} GPS checkpoint(s) on {filterDate} · Total step distance:{' '}
              <strong className="font-mono text-slate-800">{(selectedRouteDistanceMeters / 1000).toFixed(2)} km</strong>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
            >
              <option value="">All Employees</option>
              {employees.map((e) => (
                <option key={e.employeeId} value={e.employeeId}>
                  {e.employeeId} — {e.fullName}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-mono text-xs"
            />
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          {history.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">No GPS trail points recorded for {filterDate}.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2.5">Timestamp</th>
                  <th className="px-3 py-2.5">Employee</th>
                  <th className="px-3 py-2.5">Google Maps Location &amp; Coordinates</th>
                  <th className="px-3 py-2.5">Step / Speed</th>
                  <th className="px-3 py-2.5">Mode &amp; Source</th>
                  <th className="px-3 py-2.5">Verification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...history].reverse().map((h) => {
                  const speedKmh =
                    h.speedMps != null && Number.isFinite(Number(h.speedMps))
                      ? `${(Number(h.speedMps) * 3.6).toFixed(1)} km/h`
                      : '—';
                  return (
                    <tr key={h.historyId} className="align-top hover:bg-slate-50/70">
                      <td className="px-3 py-2.5 font-mono text-slate-800 tabular-nums whitespace-nowrap">
                        {new Date(h.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-900">{h.employeeName}</p>
                        <p className="font-mono text-slate-500">{h.employeeId}</p>
                      </td>
                      <td className="max-w-[320px] px-3 py-2.5">
                        {h.address && <p className="font-medium text-slate-800">{h.address}</p>}
                        <a
                          href={h.mapsUrl || buildGoogleMapsUrl(Number(h.latitude), Number(h.longitude), h.placeId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-0.5 inline-flex items-center gap-1 font-mono text-[11px] text-blue-700 hover:underline tabular-nums"
                        >
                          <MapPin className="h-3 w-3 shrink-0" />
                          {Number(h.latitude).toFixed(6)}, {Number(h.longitude).toFixed(6)} (±{h.accuracy}m)
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-slate-700 tabular-nums whitespace-nowrap">
                        <div>+{Math.round(Number(h.distanceFromPrevMeters || 0))}m</div>
                        <div className="text-slate-500">{speedKmh}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1 font-medium text-slate-800">
                          <Navigation className="h-3 w-3 text-blue-700" />
                          {h.source}
                        </span>
                        <div className="font-mono text-[10px] text-slate-500">{h.attendanceType || 'FIELD'}</div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{h.verificationStatus}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
