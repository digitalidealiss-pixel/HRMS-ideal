import {useCallback, useEffect, useRef, useState} from 'react';
import {callRpc} from '../services/apiClient';
import {reverseGeocodeLocation} from '../services/mapsService';
import {enqueueOfflineEvent} from '../services/offlineDb';
import type {AttendanceRecord, AuthUser} from '../types/hrms';

export interface FieldCaptureStatus {
  lat: number;
  lng: number;
  accuracy: number;
  speedMps: number | null;
  headingDeg: number | null;
  address?: string;
  placeId?: string;
  timestamp: string;
}

export interface MandatoryFieldTrackerState {
  isTrackingRequired: boolean;
  activeShiftRecord: AttendanceRecord | null;
  gpsBlockedReason: string | null;
  lastCapture: FieldCaptureStatus | null;
  pointsRecordedToday: number;
  retryLocation: () => void;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useMandatoryFieldTracker(user: AuthUser | null): MandatoryFieldTrackerState {
  const [activeShiftRecord, setActiveShiftRecord] = useState<AttendanceRecord | null>(null);
  const [gpsBlockedReason, setGpsBlockedReason] = useState<string | null>(null);
  const [lastCapture, setLastCapture] = useState<FieldCaptureStatus | null>(null);
  const [pointsRecordedToday, setPointsRecordedToday] = useState(0);

  const watchIdRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);
  const lastSentRef = useRef<{
    lat: number;
    lng: number;
    timeMs: number;
    address: string;
    placeId: string;
    geoTimeMs: number;
  } | null>(null);
  const lastReportedAlertStatusRef = useRef<string>('');
  const sendingRef = useRef(false);

  const isTrackingRequired = Boolean(
    user &&
      activeShiftRecord &&
      activeShiftRecord.checkInTime &&
      !activeShiftRecord.checkOutTime &&
      (user.isFieldEmployee || activeShiftRecord.attendanceType === 'FIELD'),
  );

  const refreshActiveShift = useCallback(async () => {
    if (!user) {
      setActiveShiftRecord(null);
      return;
    }
    try {
      const month = new Date().toISOString().slice(0, 7);
      const today = new Date().toISOString().slice(0, 10);
      const res = await callRpc<{ok: boolean; records: AttendanceRecord[]}>(
        'getAttendance',
        {month},
        {cacheKey: `attendance_${user.employeeId}_${month}`},
      );
      const todayRec =
        (res.records || []).find((r) => r.employeeId === user.employeeId && r.date === today) || null;
      setActiveShiftRecord(todayRec);
    } catch {
      // Keep prior shift state on transient network error
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setActiveShiftRecord(null);
      setGpsBlockedReason(null);
      setLastCapture(null);
      setPointsRecordedToday(0);
      return;
    }
    refreshActiveShift();
    const pollId = window.setInterval(refreshActiveShift, 60000);
    const onAttUpdated = () => {
      refreshActiveShift();
    };
    window.addEventListener('ideal-attendance-updated', onAttUpdated);
    return () => {
      clearInterval(pollId);
      window.removeEventListener('ideal-attendance-updated', onAttUpdated);
    };
  }, [user, refreshActiveShift]);

  const reportPermissionAlert = useCallback(
    async (status: 'PERMISSION_DENIED' | 'GPS_UNAVAILABLE', message: string) => {
      setGpsBlockedReason(message);
      if (!user || !isTrackingRequired) return;
      if (lastReportedAlertStatusRef.current === status) return;
      lastReportedAlertStatusRef.current = status;

      const now = new Date().toISOString();
      const payload = {
        latitude: lastSentRef.current?.lat || 0,
        longitude: lastSentRef.current?.lng || 0,
        accuracy: 0,
        address: lastSentRef.current?.address || '',
        placeId: lastSentRef.current?.placeId || '',
        attendanceType: activeShiftRecord?.attendanceType || 'FIELD',
        locationPermissionStatus: status,
        isSharingActive: false,
        deviceTimestamp: now,
      };
      if (navigator.onLine) {
        try {
          await callRpc('updateLiveLocation', payload);
        } catch {
          // Ignore silent background alert failure
        }
      }
    },
    [user, isTrackingRequired, activeShiftRecord],
  );

  const processPosition = useCallback(
    async (pos: GeolocationPosition, forceSend = false) => {
      if (!user || !isTrackingRequired) return;

      const lat = Number(pos.coords.latitude.toFixed(6));
      const lng = Number(pos.coords.longitude.toFixed(6));
      const accuracy = Math.round(pos.coords.accuracy || 0);
      const speedMps =
        pos.coords.speed != null && Number.isFinite(pos.coords.speed)
          ? Number(pos.coords.speed.toFixed(2))
          : null;
      const headingDeg =
        pos.coords.heading != null && Number.isFinite(pos.coords.heading)
          ? Number(pos.coords.heading.toFixed(1))
          : null;
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      // Clear any permission/GPS block since we have a valid live fix
      setGpsBlockedReason(null);
      lastReportedAlertStatusRef.current = '';

      // Ignore wildly coarse cell/IP jumps (> 400m) when we already have a recent tighter fix
      if (accuracy > 400 && lastSentRef.current && nowMs - lastSentRef.current.timeMs < 120000) {
        return;
      }

      const prev = lastSentRef.current;
      const distMoved = prev ? haversineMeters(prev.lat, prev.lng, lat, lng) : 999999;
      const elapsedMs = prev ? nowMs - prev.timeMs : 999999;

      // Record every >= 15m of travel or every >= 30s heartbeat
      if (!forceSend && prev && distMoved < 15 && elapsedMs < 30000) {
        return;
      }
      if (sendingRef.current) return;
      sendingRef.current = true;

      try {
        let address = prev?.address || '';
        let placeId = prev?.placeId || '';
        const shouldGeocode =
          !prev ||
          !address ||
          haversineMeters(prev.lat, prev.lng, lat, lng) >= 40 ||
          nowMs - prev.geoTimeMs >= 180000;

        if (navigator.onLine && shouldGeocode) {
          try {
            const geo = await reverseGeocodeLocation(lat, lng);
            if (geo.address) {
              address = geo.address;
              placeId = geo.placeId || '';
            }
          } catch {
            // Keep prior/empty address if reverse geocode fails
          }
        }

        const capture: FieldCaptureStatus = {
          lat,
          lng,
          accuracy,
          speedMps,
          headingDeg,
          address,
          placeId,
          timestamp: nowIso,
        };
        setLastCapture(capture);

        const payload = {
          latitude: lat,
          longitude: lng,
          accuracy,
          address,
          placeId,
          attendanceType: activeShiftRecord?.attendanceType || 'FIELD',
          speedMps,
          headingDeg,
          locationPermissionStatus: 'ACTIVE',
          isSharingActive: true,
          deviceTimestamp: nowIso,
        };

        if (!navigator.onLine) {
          await enqueueOfflineEvent({
            eventId: `EVT-LOC-${user.employeeId}-${nowMs}`,
            type: 'LOCATION_PING',
            employeeId: user.employeeId,
            deviceTimestamp: nowIso,
            payload,
            status: 'PENDING_SYNC',
            retryCount: 0,
          });
        } else {
          try {
            await callRpc('updateLiveLocation', payload);
          } catch (err: any) {
            if (err instanceof TypeError || !navigator.onLine) {
              await enqueueOfflineEvent({
                eventId: `EVT-LOC-${user.employeeId}-${nowMs}`,
                type: 'LOCATION_PING',
                employeeId: user.employeeId,
                deviceTimestamp: nowIso,
                payload,
                status: 'PENDING_SYNC',
                retryCount: 0,
              });
            }
          }
        }

        lastSentRef.current = {
          lat,
          lng,
          timeMs: nowMs,
          address,
          placeId,
          geoTimeMs: shouldGeocode ? nowMs : prev?.geoTimeMs || nowMs,
        };
        setPointsRecordedToday((c) => c + 1);
      } finally {
        sendingRef.current = false;
      }
    },
    [user, isTrackingRequired, activeShiftRecord],
  );

  const requestImmediateFix = useCallback(
    (forceSend = false) => {
      if (!isTrackingRequired) return;
      if (!navigator.geolocation) {
        reportPermissionAlert(
          'GPS_UNAVAILABLE',
          'Browser Geolocation is unavailable. Field duty requires a GPS-enabled browser/device.',
        );
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          processPosition(pos, forceSend);
        },
        (err) => {
          if (err.code === 1) {
            reportPermissionAlert(
              'PERMISSION_DENIED',
              'Location permission was blocked or turned off. Enable Location permission in your browser settings to continue Field Duty.',
            );
          } else {
            reportPermissionAlert(
              'GPS_UNAVAILABLE',
              'Device GPS signal is turned off or unavailable. Turn ON device Location / GPS services to continue Field Duty.',
            );
          }
        },
        {enableHighAccuracy: true, maximumAge: 0, timeout: 20000},
      );
    },
    [isTrackingRequired, processPosition, reportPermissionAlert],
  );

  useEffect(() => {
    if (!isTrackingRequired) {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (heartbeatTimerRef.current !== null) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      if (wakeLockRef.current) {
        wakeLockRef.current.release?.().catch(() => {});
        wakeLockRef.current = null;
      }
      setGpsBlockedReason(null);
      return;
    }

    let cancelled = false;
    let permStatusObj: PermissionStatus | null = null;

    // Best-effort screen wake lock while actively tracking in field
    const navAny = navigator as any;
    if (navAny.wakeLock?.request) {
      navAny.wakeLock
        .request('screen')
        .then((sentinel: any) => {
          if (cancelled) {
            sentinel?.release?.().catch(() => {});
          } else {
            wakeLockRef.current = sentinel;
          }
        })
        .catch(() => {});
    }

    if (navigator.permissions?.query) {
      navigator.permissions
        .query({name: 'geolocation'})
        .then((perm) => {
          if (cancelled) return;
          permStatusObj = perm;
          if (perm.state === 'denied') {
            reportPermissionAlert(
              'PERMISSION_DENIED',
              'Location permission is denied. Field employees must keep device Location ON from Check-In until Check-Out.',
            );
          }
          perm.onchange = () => {
            if (perm.state === 'denied') {
              reportPermissionAlert(
                'PERMISSION_DENIED',
                'Location permission was disabled during your field shift. Re-enable Location permission immediately.',
              );
            } else if (perm.state === 'granted') {
              setGpsBlockedReason(null);
              lastReportedAlertStatusRef.current = '';
              requestImmediateFix(true);
            }
          };
        })
        .catch(() => {});
    }

    if (!navigator.geolocation) {
      reportPermissionAlert(
        'GPS_UNAVAILABLE',
        'Geolocation is not supported on this device/browser.',
      );
    } else {
      requestImmediateFix(true);
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          processPosition(pos, false);
        },
        (err) => {
          if (err.code === 1) {
            reportPermissionAlert(
              'PERMISSION_DENIED',
              'Location permission is OFF. Turn ON device Location and allow browser access immediately.',
            );
          } else if (err.code === 2) {
            reportPermissionAlert(
              'GPS_UNAVAILABLE',
              'GPS sensor/Location service appears disabled or unreachable. Ensure device Location is ON.',
            );
          }
        },
        {enableHighAccuracy: true, maximumAge: 0, timeout: 20000},
      );

      // 15-second heartbeat fallback guarantees continuous capture even on mobile browsers that throttle watchPosition
      heartbeatTimerRef.current = window.setInterval(() => {
        const lastMs = lastSentRef.current?.timeMs || 0;
        if (Date.now() - lastMs >= 25000) {
          requestImmediateFix(false);
        }
      }, 15000);
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestImmediateFix(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (permStatusObj) permStatusObj.onchange = null;
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (heartbeatTimerRef.current !== null) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      if (wakeLockRef.current) {
        wakeLockRef.current.release?.().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [isTrackingRequired, processPosition, reportPermissionAlert, requestImmediateFix]);

  const retryLocation = useCallback(() => {
    lastReportedAlertStatusRef.current = '';
    requestImmediateFix(true);
  }, [requestImmediateFix]);

  return {
    isTrackingRequired,
    activeShiftRecord,
    gpsBlockedReason,
    lastCapture,
    pointsRecordedToday,
    retryLocation,
  };
}
