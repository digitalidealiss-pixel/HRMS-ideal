import {
  Bike,
  Calculator,
  Car,
  CheckCircle2,
  Compass,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Flag,
  IndianRupee,
  MapPin,
  Navigation,
  Play,
  RefreshCw,
  Route,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react';
import {useEffect, useMemo, useRef, useState, type FormEvent} from 'react';
import {callRpc} from '../../services/apiClient';
import {buildGoogleMapsUrl, reverseGeocodeLocation} from '../../services/mapsService';
import {exportReportToPdf, exportToCsv} from '../../services/pdfExports';
import type {
  AuthUser,
  EmployeeRecord,
  TravelClaimRecord,
  TravelClaimStatus,
  TravelVehicleType,
} from '../../types/hrms';
import {TravelRouteMapModal, TravelTripMap, buildGoogleDirectionsUrl} from '../maps/GoogleMapsWidgets';

interface TravelConveyanceViewProps {
  user: AuthUser;
  onToast: (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;
}

interface ConveyanceRates {
  bike: number;
  car: number;
}

interface LiveGpsFix {
  lat: number;
  lng: number;
  accuracy: number;
  address: string;
  placeId: string;
  speedMps: number | null;
  headingDeg: number | null;
  timestamp: string;
}

interface RoutePreviewData {
  vehicleType: TravelVehicleType;
  ratePerKm: number;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  toAddress: string;
  toPlaceId: string;
  googleRouteDistanceKm: number;
  straightLineDistanceKm: number;
  distanceKm: number;
  distanceSource: string;
  routeDurationText: string;
  routePolyline: string;
  estimatedAmount: number;
}

function getStatusTextClass(status: TravelClaimStatus): string {
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

export function TravelConveyanceView({user, onToast}: TravelConveyanceViewProps) {
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'HR_ADMIN';

  const [claims, setClaims] = useState<TravelClaimRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [rates, setRates] = useState<ConveyanceRates>({bike: 4.5, car: 14});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Live GPS & Active Trip state
  const [liveGps, setLiveGps] = useState<LiveGpsFix | null>(null);
  const [gpsError, setGpsError] = useState('');
  const [locatingGps, setLocatingGps] = useState(false);
  const [vehicleType, setVehicleType] = useState<TravelVehicleType>('BIKE');
  const [purpose, setPurpose] = useState('');
  const [remarks, setRemarks] = useState('');

  // Quick Rate Calculator & Google A->B Preview state
  const [calcKm, setCalcKm] = useState<string>('10');
  const [previewDest, setPreviewDest] = useState('');
  const [previewResult, setPreviewResult] = useState<RoutePreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Filters & Modals
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [employeeFilter, setEmployeeFilter] = useState<string>('');
  const [monthFilter, setMonthFilter] = useState<string>(new Date().toISOString().slice(0, 7));
  const [inspectClaim, setInspectClaim] = useState<TravelClaimRecord | null>(null);
  const [rejectModalClaim, setRejectModalClaim] = useState<TravelClaimRecord | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const watchIdRef = useRef<number | null>(null);
  const lastWaypointSentRef = useRef<{lat: number; lng: number; timeMs: number} | null>(null);

  const activeTrip = useMemo(
    () => claims.find((c) => c.employeeId === user.employeeId && c.status === 'IN_PROGRESS') || null,
    [claims, user.employeeId],
  );
  const isActivelyMovingTrip = Boolean(activeTrip && !activeTrip.endedAt);

  const loadClaims = async () => {
    setLoading(true);
    try {
      const [claimRes, empRes] = await Promise.all([
        callRpc<{ok: boolean; claims: TravelClaimRecord[]; rates: ConveyanceRates}>('getTravelClaims', {
          status: statusFilter,
          employeeId: isAdmin && employeeFilter ? employeeFilter : undefined,
          month: monthFilter || undefined,
        }),
        isAdmin
          ? callRpc<{ok: boolean; employees: EmployeeRecord[]}>('getEmployees')
          : Promise.resolve({ok: true, employees: [] as EmployeeRecord[]}),
      ]);
      setClaims(claimRes.claims || []);
      if (claimRes.rates) {
        setRates({
          bike: Number(claimRes.rates.bike ?? 4.5),
          car: Number(claimRes.rates.car ?? 14),
        });
      }
      if (isAdmin) {
        setEmployees(empRes.employees || []);
      }
    } catch (err: any) {
      onToast('error', 'Failed to load travel claims', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClaims();
  }, [statusFilter, employeeFilter, monthFilter]);

  useEffect(() => {
    if (activeTrip) {
      setVehicleType(activeTrip.vehicleType);
      if (activeTrip.purpose && !purpose) setPurpose(activeTrip.purpose);
      if (activeTrip.remarks && !remarks) setRemarks(activeTrip.remarks);
    }
  }, [activeTrip?.claimId]);

  const acquireCurrentLiveGps = async (silent = false): Promise<LiveGpsFix | null> => {
    if (!navigator.geolocation) {
      const msg = 'Device GPS / Geolocation is not supported on this browser.';
      setGpsError(msg);
      if (!silent) onToast('error', 'GPS Unavailable', msg);
      return null;
    }
    setLocatingGps(true);
    setGpsError('');
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 15000,
        });
      });
      const lat = Number(pos.coords.latitude.toFixed(6));
      const lng = Number(pos.coords.longitude.toFixed(6));
      const accuracy = Math.round(pos.coords.accuracy || 0);
      const speedMps =
        pos.coords.speed != null && Number.isFinite(pos.coords.speed) ? Number(pos.coords.speed.toFixed(2)) : null;
      const headingDeg =
        pos.coords.heading != null && Number.isFinite(pos.coords.heading)
          ? Number(pos.coords.heading.toFixed(1))
          : null;

      let address = '';
      let placeId = '';
      if (navigator.onLine) {
        const geo = await reverseGeocodeLocation(lat, lng);
        address = geo.address;
        placeId = geo.placeId;
      }
      const fix: LiveGpsFix = {
        lat,
        lng,
        accuracy,
        address,
        placeId,
        speedMps,
        headingDeg,
        timestamp: new Date().toISOString(),
      };
      setLiveGps(fix);
      return fix;
    } catch (err: any) {
      const msg =
        err?.code === 1
          ? 'Location permission denied. Enable GPS & allow browser location access for 100% live travel capture.'
          : err?.message || 'Unable to obtain live GPS fix. Move to open sky or enable High Accuracy Location.';
      setGpsError(msg);
      if (!silent) onToast('warning', 'Live GPS Required', msg);
      return null;
    } finally {
      setLocatingGps(false);
    }
  };

  useEffect(() => {
    acquireCurrentLiveGps(true);
  }, []);

  // Continuous 100% live GPS tracking loop while employee trip is in transit (Location A -> Location B)
  useEffect(() => {
    if (!isActivelyMovingTrip || !activeTrip || !navigator.geolocation) {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    const sendWaypoint = async (pos: GeolocationPosition, force = false) => {
      const lat = Number(pos.coords.latitude.toFixed(6));
      const lng = Number(pos.coords.longitude.toFixed(6));
      const accuracy = Math.round(pos.coords.accuracy || 0);
      const nowMs = Date.now();
      const prev = lastWaypointSentRef.current;

      const approxMeters = prev
        ? Math.hypot((lat - prev.lat) * 111320, (lng - prev.lng) * 111320 * Math.cos((lat * Math.PI) / 180))
        : 999999;
      const elapsed = prev ? nowMs - prev.timeMs : 999999;

      setLiveGps((curr) => ({
        lat,
        lng,
        accuracy,
        address: curr?.address || '',
        placeId: curr?.placeId || '',
        speedMps:
          pos.coords.speed != null && Number.isFinite(pos.coords.speed) ? Number(pos.coords.speed.toFixed(2)) : null,
        headingDeg:
          pos.coords.heading != null && Number.isFinite(pos.coords.heading)
            ? Number(pos.coords.heading.toFixed(1))
            : null,
        timestamp: new Date(nowMs).toISOString(),
      }));

      if (!force && prev && approxMeters < 18 && elapsed < 25000) return;

      lastWaypointSentRef.current = {lat, lng, timeMs: nowMs};
      try {
        let address = '';
        let placeId = '';
        if (navigator.onLine && (!prev || approxMeters >= 40)) {
          const geo = await reverseGeocodeLocation(lat, lng);
          address = geo.address;
          placeId = geo.placeId;
          if (address) {
            setLiveGps((curr) => (curr ? {...curr, address, placeId} : curr));
          }
        }
        const res = await callRpc<{ok: boolean; claim: TravelClaimRecord}>('addTravelWaypoint', {
          claimId: activeTrip.claimId,
          latitude: lat,
          longitude: lng,
          accuracy,
          address,
          placeId,
          speedMps:
            pos.coords.speed != null && Number.isFinite(pos.coords.speed) ? Number(pos.coords.speed.toFixed(2)) : null,
          headingDeg:
            pos.coords.heading != null && Number.isFinite(pos.coords.heading)
              ? Number(pos.coords.heading.toFixed(1))
              : null,
          force,
          deviceTimestamp: new Date(nowMs).toISOString(),
        });
        if (res.claim) {
          setClaims((prevList) => prevList.map((c) => (c.claimId === res.claim.claimId ? res.claim : c)));
        }
      } catch {
        // Silent retry on next interval/movement
      }
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsError('');
        sendWaypoint(pos, false);
      },
      (err) => {
        if (err.code === 1) {
          setGpsError('Location permission turned off! Keep Location ON from Location A to Location B.');
        }
      },
      {enableHighAccuracy: true, maximumAge: 0, timeout: 20000},
    );

    const timer = window.setInterval(() => {
      if (!lastWaypointSentRef.current || Date.now() - lastWaypointSentRef.current.timeMs >= 25000) {
        navigator.geolocation.getCurrentPosition(
          (pos) => sendWaypoint(pos, false),
          () => {},
          {enableHighAccuracy: true, maximumAge: 0, timeout: 15000},
        );
      }
    }, 20000);

    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      window.clearInterval(timer);
    };
  }, [isActivelyMovingTrip, activeTrip?.claimId]);

  const handleStartTrip = async () => {
    setBusy(true);
    try {
      const fix = await acquireCurrentLiveGps(false);
      if (!fix) return;
      const res = await callRpc<{ok: boolean; claim: TravelClaimRecord; quotaExceeded?: boolean}>('startTravelTrip', {
        latitude: fix.lat,
        longitude: fix.lng,
        accuracy: fix.accuracy,
        address: fix.address,
        placeId: fix.placeId,
        speedMps: fix.speedMps,
        vehicleType,
        purpose: purpose.trim(),
        deviceTimestamp: fix.timestamp,
      });
      if (res.quotaExceeded) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      lastWaypointSentRef.current = {lat: fix.lat, lng: fix.lng, timeMs: Date.now()};
      onToast(
        'success',
        `Trip Started at Location A (${res.claim.claimId})`,
        `${res.claim.fromAddress} · Live GPS recording @ ₹${res.claim.ratePerKm}/km`,
      );
      await loadClaims();
    } catch (err: any) {
      onToast('error', 'Could not start trip', err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleLogManualCheckpoint = async () => {
    if (!activeTrip) return;
    setBusy(true);
    try {
      const fix = await acquireCurrentLiveGps(false);
      if (!fix) return;
      const res = await callRpc<{ok: boolean; claim: TravelClaimRecord}>('addTravelWaypoint', {
        claimId: activeTrip.claimId,
        latitude: fix.lat,
        longitude: fix.lng,
        accuracy: fix.accuracy,
        address: fix.address,
        placeId: fix.placeId,
        speedMps: fix.speedMps,
        headingDeg: fix.headingDeg,
        force: true,
        deviceTimestamp: fix.timestamp,
      });
      lastWaypointSentRef.current = {lat: fix.lat, lng: fix.lng, timeMs: Date.now()};
      if (res.claim) {
        setClaims((prev) => prev.map((c) => (c.claimId === res.claim.claimId ? res.claim : c)));
      }
      onToast(
        'success',
        'Live Checkpoint Recorded',
        `${fix.address || `${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)}`}`,
      );
    } catch (err: any) {
      onToast('error', 'Checkpoint failed', err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleEndTripAtLocationB = async (submitNow = false) => {
    if (!activeTrip) return;
    if (submitNow && !purpose.trim()) {
      onToast('warning', 'Purpose Required', 'Enter the travel purpose before submitting the claim.');
      return;
    }
    setBusy(true);
    try {
      const fix = await acquireCurrentLiveGps(false);
      if (!fix) return;
      const res = await callRpc<{ok: boolean; claim: TravelClaimRecord; quotaExceeded?: boolean}>('completeTravelTrip', {
        claimId: activeTrip.claimId,
        latitude: fix.lat,
        longitude: fix.lng,
        accuracy: fix.accuracy,
        address: fix.address,
        placeId: fix.placeId,
        vehicleType,
        purpose: purpose.trim(),
        remarks: remarks.trim(),
        submitNow,
        deviceTimestamp: fix.timestamp,
      });
      if (res.quotaExceeded) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      if (submitNow) {
        setPurpose('');
        setRemarks('');
        onToast(
          'success',
          `Claim Submitted · ₹${res.claim.claimAmount.toFixed(2)}`,
          `${res.claim.distanceKm.toFixed(2)} km × ₹${res.claim.ratePerKm}/km sent for Admin approval.`,
        );
      } else {
        onToast(
          'success',
          'Location B Captured · Route & Amount Calculated',
          `${res.claim.distanceKm.toFixed(2)} km × ₹${res.claim.ratePerKm}/km = ₹${res.claim.claimAmount.toFixed(2)}`,
        );
      }
      await loadClaims();
    } catch (err: any) {
      onToast('error', 'Could not complete trip', err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitCompletedTrip = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeTrip) return;
    if (!purpose.trim()) {
      onToast('warning', 'Purpose Required', 'Please specify the business / field travel purpose.');
      return;
    }
    setBusy(true);
    try {
      const res = await callRpc<{ok: boolean; claim: TravelClaimRecord}>('submitTravelClaim', {
        claimId: activeTrip.claimId,
        vehicleType,
        purpose: purpose.trim(),
        remarks: remarks.trim(),
      });
      setPurpose('');
      setRemarks('');
      onToast(
        'success',
        `Conveyance Claim Submitted (${res.claim.claimId})`,
        `₹${res.claim.claimAmount.toFixed(2)} (${res.claim.distanceKm.toFixed(2)} km · ${res.claim.vehicleType} @ ₹${res.claim.ratePerKm}/km)`,
      );
      await loadClaims();
    } catch (err: any) {
      onToast('error', 'Claim submission failed', err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCancelActiveTrip = async () => {
    if (!activeTrip) return;
    setBusy(true);
    try {
      await callRpc('cancelTravelTrip', {claimId: activeTrip.claimId});
      setPurpose('');
      setRemarks('');
      onToast('info', 'Active Trip Discarded', `${activeTrip.claimId} was cancelled before submission.`);
      await loadClaims();
    } catch (err: any) {
      onToast('error', 'Cancel failed', err.message);
    } finally {
      setBusy(false);
    }
  };

  const handlePreviewGoogleRoute = async (e: FormEvent) => {
    e.preventDefault();
    if (!previewDest.trim()) {
      onToast('warning', 'Destination Required', 'Enter Location B address or landmark to estimate Google Road distance.');
      return;
    }
    setPreviewLoading(true);
    try {
      const fix = liveGps || (await acquireCurrentLiveGps(false));
      if (!fix) return;
      const res = await callRpc<{ok: boolean; preview: RoutePreviewData; quotaExceeded?: boolean}>(
        'computeTravelRoutePreview',
        {
          fromLat: fix.lat,
          fromLng: fix.lng,
          toAddress: previewDest.trim(),
          vehicleType,
        },
      );
      if (res.quotaExceeded) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      setPreviewResult(res.preview);
      setCalcKm(String(res.preview.distanceKm));
    } catch (err: any) {
      onToast('error', 'Route Estimate Failed', err.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleReviewClaim = async (claim: TravelClaimRecord, decision: 'APPROVED' | 'REJECTED' | 'PAID', reason = '') => {
    setBusy(true);
    try {
      await callRpc('reviewTravelClaim', {
        claimId: claim.claimId,
        decision,
        rejectionReason: reason,
      });
      setRejectModalClaim(null);
      setRejectReason('');
      onToast('success', `Claim ${decision}`, `${claim.claimId} (${claim.employeeName}) marked ${decision}.`);
      await loadClaims();
    } catch (err: any) {
      onToast('error', 'Review update failed', err.message);
    } finally {
      setBusy(false);
    }
  };

  const activeRate = vehicleType === 'CAR' ? rates.car : rates.bike;
  const parsedCalcKm = Math.max(0, Number(calcKm) || 0);
  const calcTotalAmount = Math.round(parsedCalcKm * activeRate * 100) / 100;

  const summary = useMemo(() => {
    const submittedOrFinal = claims.filter((c) => c.status !== 'IN_PROGRESS');
    const totalKm = submittedOrFinal.reduce((sum, c) => sum + Number(c.distanceKm || 0), 0);
    const pendingList = submittedOrFinal.filter((c) => c.status === 'SUBMITTED');
    const approvedList = submittedOrFinal.filter((c) => c.status === 'APPROVED' || c.status === 'PAID');
    return {
      totalClaims: submittedOrFinal.length,
      totalKm: Math.round(totalKm * 100) / 100,
      pendingCount: pendingList.length,
      pendingAmount: Math.round(pendingList.reduce((s, c) => s + Number(c.claimAmount || 0), 0) * 100) / 100,
      approvedAmount: Math.round(approvedList.reduce((s, c) => s + Number(c.claimAmount || 0), 0) * 100) / 100,
    };
  }, [claims]);

  const handleExportCsv = () => {
    const headers = [
      'Claim ID',
      'Date',
      'Employee ID',
      'Employee Name',
      'Department',
      'Vehicle',
      'Rate (INR/km)',
      'Location A',
      'A Coords',
      'Location B',
      'B Coords',
      'Live GPS km',
      'Google Route km',
      'Claimed km',
      'Claim Amount (INR)',
      'Purpose',
      'Status',
      'Reviewed By',
    ];
    const rows = claims.map((c) => [
      c.claimId,
      c.travelDate,
      c.employeeId,
      c.employeeName,
      c.department,
      c.vehicleType,
      c.ratePerKm,
      c.fromAddress,
      `${c.fromLat},${c.fromLng}`,
      c.toAddress || '',
      c.toLat != null && c.toLng != null ? `${c.toLat},${c.toLng}` : '',
      c.gpsTrackedDistanceKm,
      c.googleRouteDistanceKm,
      c.distanceKm,
      c.claimAmount,
      c.purpose,
      c.status,
      c.reviewedBy || '',
    ]);
    exportToCsv(`Travel_Conveyance_${monthFilter || 'ALL'}.csv`, headers, rows);
    onToast('success', 'CSV Exported', 'Travel & local conveyance register downloaded.');
  };

  const handleExportPdf = () => {
    const headers = ['Claim ID', 'Date', 'Employee', 'Mode', 'Route (A → B)', 'Dist (km)', 'Rate', 'Amount (INR)', 'Status'];
    const rows = claims.map((c) => [
      c.claimId,
      c.travelDate,
      `${c.employeeName} (${c.employeeId})`,
      c.vehicleType,
      `${(c.fromAddress || '').slice(0, 28)} → ${(c.toAddress || 'Transit').slice(0, 28)}`,
      Number(c.distanceKm || 0).toFixed(2),
      `₹${c.ratePerKm}/km`,
      `₹${Number(c.claimAmount || 0).toFixed(2)}`,
      c.status,
    ]);
    exportReportToPdf(
      'Employee Travel & Local Conveyance Claims',
      monthFilter ? `Period: ${monthFilter}` : 'All Periods',
      headers,
      rows,
      `Travel_Conveyance_${monthFilter || 'ALL'}.pdf`,
    );
    onToast('success', 'PDF Exported', 'Travel conveyance claim report downloaded.');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900">
            Employee Travel &amp; Local Conveyance
          </h1>
          <p className="text-xs text-slate-500">
            100% live Google GPS Location A → Location B tracking with automated Bike (₹{rates.bike}/km) &amp; Car (₹{rates.car}/km) rate calculator and in-app claim approval.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => acquireCurrentLiveGps(false)}
            disabled={locatingGps}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Compass className="h-3.5 w-3.5 text-emerald-700" />
            {locatingGps ? 'Locking GPS...' : 'Refresh Live GPS'}
          </button>
          <button
            type="button"
            onClick={loadClaims}
            disabled={loading}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="metallic-surface rounded-xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Submitted Claims</p>
          <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">{summary.totalClaims}</p>
          <p className="mt-1 text-[11px] text-slate-500">{isAdmin ? 'Organization travel claims' : 'Your submitted trips'}</p>
        </div>
        <div className="metallic-surface rounded-xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Verified Distance</p>
          <p className="mt-1 font-mono text-2xl font-bold text-blue-700 tabular-nums">
            {summary.totalKm.toFixed(2)} km
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Live GPS trail + Google Routes A→B</p>
        </div>
        <div className="metallic-surface rounded-xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Pending Review</p>
          <p className="mt-1 font-mono text-2xl font-bold text-amber-700 tabular-nums">
            ₹{summary.pendingAmount.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">{summary.pendingCount} claim(s) awaiting approval</p>
        </div>
        <div className="metallic-surface rounded-xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Approved &amp; Paid</p>
          <p className="mt-1 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
            ₹{summary.approvedAmount.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Bike ₹{rates.bike}/km · Car ₹{rates.car}/km</p>
        </div>
      </div>

      {/* Main Split: Live Location A -> B Recorder (7 cols) + Auto Rate Calculator (5 cols) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Location A -> B Live Trip Recorder */}
        <div className="metallic-surface rounded-xl p-5 lg:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Navigation className="h-4 w-4 text-emerald-700" />
              <h2 className="font-display text-sm font-semibold text-slate-900">
                100% Live Location A → Location B Trip Recorder
              </h2>
            </div>
            <span className="font-mono text-[11px] font-semibold text-slate-600">
              {activeTrip
                ? activeTrip.endedAt
                  ? `READY TO SUBMIT · ${activeTrip.claimId}`
                  : `LIVE TRACKING · ${activeTrip.claimId}`
                : 'NO ACTIVE TRIP'}
            </span>
          </div>

          {gpsError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              {gpsError}
            </div>
          )}

          {/* Current Live GPS Readout */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-800">Current Device GPS Fix (Live Google Geocode)</span>
              {liveGps && (
                <a
                  href={buildGoogleMapsUrl(liveGps.lat, liveGps.lng, liveGps.placeId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                >
                  Open Pin in Google Maps <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            {liveGps ? (
              <div className="mt-1.5 space-y-0.5">
                <p className="font-medium text-slate-900">
                  {liveGps.address || 'Coordinates locked (Google street lookup ready)'}
                </p>
                <p className="font-mono text-[11px] text-slate-600 tabular-nums">
                  Lat/Lng: {liveGps.lat.toFixed(6)}, {liveGps.lng.toFixed(6)} · Accuracy ±{liveGps.accuracy}m · Captured{' '}
                  {new Date(liveGps.timestamp).toLocaleTimeString()}
                </p>
              </div>
            ) : (
              <p className="mt-1 text-slate-500">Acquiring high-accuracy satellite/network GPS coordinates...</p>
            )}
          </div>

          {/* Vehicle Mode Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Conveyance Vehicle &amp; Automatic Rate
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={Boolean(activeTrip && activeTrip.status === 'IN_PROGRESS' && !activeTrip.endedAt)}
                onClick={() => setVehicleType('BIKE')}
                className={`flex min-h-[56px] items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition-all ${
                  vehicleType === 'BIKE'
                    ? 'border-[#0B1B36] bg-[#0B1B36] text-white shadow-sm'
                    : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                } disabled:opacity-75`}
              >
                <div className="flex items-center gap-2.5">
                  <Bike className={`h-5 w-5 ${vehicleType === 'BIKE' ? 'text-amber-300' : 'text-slate-600'}`} />
                  <div>
                    <div className="text-xs font-bold">Two-Wheeler / Bike</div>
                    <div className={`text-[11px] ${vehicleType === 'BIKE' ? 'text-sky-200' : 'text-slate-500'}`}>
                      Two-Wheel Mode
                    </div>
                  </div>
                </div>
                <span className="font-mono text-sm font-bold tabular-nums">₹{rates.bike}/km</span>
              </button>

              <button
                type="button"
                disabled={Boolean(activeTrip && activeTrip.status === 'IN_PROGRESS' && !activeTrip.endedAt)}
                onClick={() => setVehicleType('CAR')}
                className={`flex min-h-[56px] items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition-all ${
                  vehicleType === 'CAR'
                    ? 'border-[#0B1B36] bg-[#0B1B36] text-white shadow-sm'
                    : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                } disabled:opacity-75`}
              >
                <div className="flex items-center gap-2.5">
                  <Car className={`h-5 w-5 ${vehicleType === 'CAR' ? 'text-amber-300' : 'text-slate-600'}`} />
                  <div>
                    <div className="text-xs font-bold">Four-Wheeler / Car</div>
                    <div className={`text-[11px] ${vehicleType === 'CAR' ? 'text-sky-200' : 'text-slate-500'}`}>
                      Drive Route Mode
                    </div>
                  </div>
                </div>
                <span className="font-mono text-sm font-bold tabular-nums">₹{rates.car}/km</span>
              </button>
            </div>
            {vehicleType === 'BIKE' && (
              <p className="mt-1.5 text-[11px] text-slate-500">
                Note: Google Maps two-wheeler routing is in beta and may occasionally miss narrow paths or shortcuts; live GPS waypoints are also captured.
              </p>
            )}
          </div>

          {/* Step-based Trip Controls */}
          {!activeTrip ? (
            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Trip Purpose / Client Visit (Optional now, required before final claim)
                </label>
                <input
                  type="text"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g., Client site inspection at Industrial Estate Sector 4"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>
              <button
                type="button"
                disabled={busy || locatingGps}
                onClick={handleStartTrip}
                className="metallic-btn-emerald inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
              >
                <Play className="h-4 w-4" />
                {busy
                  ? 'Locking Location A...'
                  : `Start Trip at Location A (Live GPS · ${vehicleType} ₹${activeRate}/km)`}
              </button>
            </div>
          ) : !activeTrip.endedAt ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-emerald-900">
                    Trip In Transit · Location A Locked at {new Date(activeTrip.startedAt).toLocaleTimeString()}
                  </span>
                  <span className="font-mono font-semibold text-emerald-800 tabular-nums">
                    {(activeTrip.waypoints || []).length} live waypoints
                  </span>
                </div>
                <p className="text-slate-800">{activeTrip.fromAddress}</p>
                <div className="grid grid-cols-3 gap-2 border-t border-emerald-200/80 pt-2 font-mono tabular-nums">
                  <div>
                    <div className="text-[10px] uppercase text-slate-500">Live Trail</div>
                    <div className="text-sm font-bold text-slate-900">{activeTrip.gpsTrackedDistanceKm.toFixed(2)} km</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-slate-500">Applied Rate</div>
                    <div className="text-sm font-bold text-slate-900">₹{activeTrip.ratePerKm}/km</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-slate-500">Running Amount</div>
                    <div className="text-sm font-bold text-emerald-800">₹{activeTrip.claimAmount.toFixed(2)}</div>
                  </div>
                </div>
              </div>

              <TravelTripMap claim={activeTrip} liveGps={liveGps} heightClass="h-[250px]" />

              <div>
                <label className="block text-xs font-medium text-slate-700">Purpose / Visit Details</label>
                <input
                  type="text"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="Enter visit purpose to include when ending trip"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleLogManualCheckpoint}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                >
                  <MapPin className="h-4 w-4 text-amber-600" />
                  Log GPS Point
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleEndTripAtLocationB(false)}
                  className="metallic-btn-primary inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold sm:col-span-2"
                >
                  <Flag className="h-4 w-4" />
                  {busy ? 'Computing Google Route...' : 'Arrived at Location B — Capture & Calculate'}
                </button>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleCancelActiveTrip}
                  className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 hover:underline"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Discard Active Trip
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmitCompletedTrip} className="space-y-4">
              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-xs space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-blue-950">
                    Location A → Location B Captured · Ready to Claim
                  </span>
                  <span className="font-mono font-bold text-emerald-700 tabular-nums text-sm">
                    ₹{(Math.round(Number(activeTrip.distanceKm || 0) * activeRate * 100) / 100).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <div className="text-[10px] font-bold uppercase text-emerald-800">From (Location A)</div>
                    <p className="text-slate-900">{activeTrip.fromAddress}</p>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase text-blue-800">To (Location B)</div>
                    <p className="text-slate-900">{activeTrip.toAddress}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-blue-200/80 pt-2 font-mono text-[11px] text-slate-700 tabular-nums">
                  <span>
                    GPS Trail: {activeTrip.gpsTrackedDistanceKm.toFixed(2)} km · Google Road:{' '}
                    {activeTrip.googleRouteDistanceKm.toFixed(2)} km
                    {activeTrip.routeDurationText ? ` (${activeTrip.routeDurationText})` : ''}
                  </span>
                  <span>
                    Payable: <strong>{activeTrip.distanceKm.toFixed(2)} km</strong> × ₹{activeRate}/km
                  </span>
                </div>
              </div>

              <TravelTripMap claim={activeTrip} heightClass="h-[240px]" />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700">Purpose of Travel *</label>
                  <input
                    required
                    type="text"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder="e.g., Client visit / material delivery / site audit"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700">Remarks / Receipt Reference</label>
                  <input
                    type="text"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Optional parking / toll / site reference note"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleCancelActiveTrip}
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Discard Trip
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="metallic-btn-emerald inline-flex min-h-[44px] items-center gap-2 rounded-xl px-5 py-2 text-xs font-semibold"
                >
                  <Send className="h-4 w-4" />
                  {busy
                    ? 'Submitting Claim...'
                    : `Submit Claim for ₹${(Math.round(Number(activeTrip.distanceKm || 0) * activeRate * 100) / 100).toFixed(2)}`}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Automatic Conveyance Rate Calculator & Google A->B Estimator */}
        <div className="metallic-surface rounded-xl p-5 lg:col-span-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
            <Calculator className="h-4 w-4 text-blue-700" />
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Automatic Conveyance Rate Calculator
              </h2>
              <p className="text-[11px] text-slate-500">
                Authoritative server calculation: Bike ₹{rates.bike}/km · Car ₹{rates.car}/km
              </p>
            </div>
          </div>

          {/* Live Formula Box */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700">Distance (km)</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={activeTrip ? String(activeTrip.distanceKm) : calcKm}
                  disabled={Boolean(activeTrip)}
                  onChange={(e) => setCalcKm(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm font-semibold disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700">Vehicle Rate (₹/km)</label>
                <div className="mt-1 flex h-[38px] items-center rounded-lg border border-slate-300 bg-slate-100 px-3 font-mono text-sm font-bold text-slate-800 tabular-nums">
                  ₹{activeRate.toFixed(2)} ({vehicleType})
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-emerald-200 bg-white p-3">
              <div className="text-[11px] font-semibold uppercase text-slate-500">
                {activeTrip ? 'Active Trip Claim Amount' : 'Calculated Conveyance Amount'}
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="font-mono text-xs text-slate-600 tabular-nums">
                  {(activeTrip ? activeTrip.distanceKm : parsedCalcKm).toFixed(2)} km × ₹{activeRate.toFixed(2)}/km
                </span>
                <span className="font-mono text-2xl font-bold text-emerald-700 tabular-nums">
                  ₹
                  {(activeTrip
                    ? Math.round(Number(activeTrip.distanceKm || 0) * activeRate * 100) / 100
                    : calcTotalAmount
                  ).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-600 tabular-nums">
              <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                Bike (₹{rates.bike}/km):{' '}
                <strong className="text-slate-900">
                  ₹{((activeTrip ? activeTrip.distanceKm : parsedCalcKm) * rates.bike).toFixed(2)}
                </strong>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                Car (₹{rates.car}/km):{' '}
                <strong className="text-slate-900">
                  ₹{((activeTrip ? activeTrip.distanceKm : parsedCalcKm) * rates.car).toFixed(2)}
                </strong>
              </div>
            </div>
          </div>

          {/* Google Routes API A -> B Preview Estimator */}
          <form onSubmit={handlePreviewGoogleRoute} className="space-y-3 border-t border-slate-200 pt-3">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                <Route className="h-3.5 w-3.5 text-blue-700" />
                Google Maps A → B Route Estimator (From Current Live GPS)
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  type="text"
                  value={previewDest}
                  onChange={(e) => setPreviewDest(e.target.value)}
                  placeholder="Enter Location B (e.g., MIDC Chakan, Pune)"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
                <button
                  type="submit"
                  disabled={previewLoading}
                  className="metallic-btn-primary shrink-0 rounded-lg px-3 py-2 text-xs font-semibold"
                >
                  {previewLoading ? 'Calculating...' : 'Estimate'}
                </button>
              </div>
            </div>

            {previewResult && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-blue-950">Google Routes Preview</span>
                  <span className="font-mono font-bold text-emerald-700 tabular-nums">
                    ₹{previewResult.estimatedAmount.toFixed(2)}
                  </span>
                </div>
                <p className="text-slate-700">To: {previewResult.toAddress}</p>
                <p className="font-mono text-[11px] text-slate-600 tabular-nums">
                  Distance: {previewResult.distanceKm.toFixed(2)} km ({previewResult.distanceSource})
                  {previewResult.routeDurationText ? ` · ${previewResult.routeDurationText}` : ''}
                </p>
                <a
                  href={buildGoogleDirectionsUrl(
                    previewResult.fromLat,
                    previewResult.fromLng,
                    previewResult.toLat,
                    previewResult.toLng,
                    previewResult.vehicleType,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                >
                  Preview A→B in Google Maps <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </form>

          <p className="text-[11px] leading-relaxed text-slate-500">
            Note: Final claimable distance &amp; ₹ amount are calculated automatically on the server from live Location A → B GPS coordinates and Google Routes API road distance to prevent tampering.
          </p>
        </div>
      </div>

      {/* Claims Register & Admin Review Table */}
      <div className="metallic-surface rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900">
              {isAdmin ? 'Organization Travel & Conveyance Claims' : 'My Travel & Conveyance Claims'} ({claims.length})
            </h2>
            <p className="text-[11px] text-slate-500">
              Audit Google Maps A → B routes, approve claims, or mark conveyance reimbursements as paid.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono"
            />
            {isAdmin && (
              <select
                value={employeeFilter}
                onChange={(e) => setEmployeeFilter(e.target.value)}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5"
              >
                <option value="">All Employees</option>
                {employees.map((e) => (
                  <option key={e.employeeId} value={e.employeeId}>
                    {e.employeeId} — {e.fullName}
                  </option>
                ))}
              </select>
            )}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5"
            >
              <option value="ALL">All Statuses</option>
              <option value="SUBMITTED">Submitted (Pending)</option>
              <option value="APPROVED">Approved</option>
              <option value="PAID">Paid</option>
              <option value="REJECTED">Rejected</option>
              <option value="IN_PROGRESS">In Progress</option>
            </select>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
              CSV
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5 text-blue-700" />
              PDF
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-3 py-2.5">Claim / Date</th>
                {isAdmin && <th className="px-3 py-2.5">Employee</th>}
                <th className="px-3 py-2.5">Route (Location A → Location B)</th>
                <th className="px-3 py-2.5">Mode &amp; Rate</th>
                <th className="px-3 py-2.5 text-right">Distance</th>
                <th className="px-3 py-2.5 text-right">Claim Amount</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {claims.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="px-3 py-8 text-center text-slate-500">
                    No travel or local conveyance claims found for this filter.
                  </td>
                </tr>
              ) : (
                claims.map((c) => (
                  <tr key={c.claimId} className="hover:bg-slate-50/70">
                    <td className="px-3 py-3 align-top">
                      <div className="font-mono font-semibold text-slate-900">{c.claimId}</div>
                      <div className="font-mono text-[11px] text-slate-500 tabular-nums">{c.travelDate}</div>
                    </td>
                    {isAdmin && (
                      <td className="px-3 py-3 align-top">
                        <div className="font-semibold text-slate-900">{c.employeeName}</div>
                        <div className="font-mono text-[11px] text-slate-500">
                          {c.employeeId} · {c.department}
                        </div>
                      </td>
                    )}
                    <td className="px-3 py-3 align-top max-w-[300px]">
                      <div className="text-slate-900">
                        <span className="font-semibold text-emerald-700">A:</span> {c.fromAddress}
                      </div>
                      <div className="mt-0.5 text-slate-700">
                        <span className="font-semibold text-blue-700">B:</span> {c.toAddress || 'In Transit...'}
                      </div>
                      {c.purpose && <div className="mt-1 text-[11px] text-slate-500">Purpose: {c.purpose}</div>}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="inline-flex items-center gap-1 font-semibold text-slate-800">
                        {c.vehicleType === 'CAR' ? (
                          <Car className="h-3.5 w-3.5 text-blue-700" />
                        ) : (
                          <Bike className="h-3.5 w-3.5 text-emerald-700" />
                        )}
                        {c.vehicleType}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 tabular-nums">₹{c.ratePerKm}/km</div>
                    </td>
                    <td className="px-3 py-3 align-top text-right font-mono tabular-nums">
                      <div className="font-semibold text-slate-900">{Number(c.distanceKm || 0).toFixed(2)} km</div>
                      <div className="text-[10px] text-slate-500">
                        GPS {Number(c.gpsTrackedDistanceKm || 0).toFixed(2)} · Maps {Number(c.googleRouteDistanceKm || 0).toFixed(2)}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top text-right font-mono tabular-nums">
                      <div className="font-bold text-emerald-700">
                        ₹{Number(c.claimAmount || 0).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span className={`font-semibold ${getStatusTextClass(c.status)}`}>{c.status}</span>
                      {c.reviewedBy && (
                        <div className="text-[11px] text-slate-500">By {c.reviewedBy}</div>
                      )}
                      {c.rejectionReason && (
                        <div className="text-[11px] text-rose-700">{c.rejectionReason}</div>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top text-right">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setInspectClaim(c)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <MapPin className="h-3 w-3 text-blue-700" />
                          Map
                        </button>
                        {isAdmin && c.status === 'SUBMITTED' && (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleReviewClaim(c, 'APPROVED')}
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setRejectModalClaim(c);
                                setRejectReason('');
                              }}
                              className="inline-flex items-center gap-1 rounded-md bg-rose-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-rose-800"
                            >
                              <XCircle className="h-3 w-3" />
                              Reject
                            </button>
                          </>
                        )}
                        {isAdmin && c.status === 'APPROVED' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleReviewClaim(c, 'PAID')}
                            className="inline-flex items-center gap-1 rounded-md bg-blue-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-800"
                          >
                            <IndianRupee className="h-3 w-3" />
                            Mark Paid
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Google Route Audit Modal */}
      {inspectClaim && <TravelRouteMapModal claim={inspectClaim} onClose={() => setInspectClaim(null)} />}

      {/* Admin Rejection Reason Modal */}
      {rejectModalClaim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="metallic-surface w-full max-w-md rounded-2xl p-5 shadow-2xl space-y-4">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Reject Travel Claim ({rejectModalClaim.claimId})
            </h3>
            <p className="text-xs text-slate-600">
              {rejectModalClaim.employeeName} · {rejectModalClaim.distanceKm.toFixed(2)} km · ₹
              {rejectModalClaim.claimAmount.toFixed(2)}
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-700">Reason for Rejection *</label>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explain route mismatch or policy issue..."
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectModalClaim(null)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  handleReviewClaim(
                    rejectModalClaim,
                    'REJECTED',
                    rejectReason.trim() || 'Declined after route verification',
                  )
                }
                className="rounded-lg bg-rose-700 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-800"
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
