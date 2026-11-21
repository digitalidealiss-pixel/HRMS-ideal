import {
  AdvancedMarker,
  APIProvider,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {Clock, ExternalLink, MapPin, Navigation, Route, X} from 'lucide-react';
import {useEffect, useMemo, useState, type ReactNode} from 'react';
import {buildGoogleMapsUrl, getGoogleMapsApiKey} from '../../services/mapsService';
import type {AttendanceRecord, LiveLocationRecord, LocationHistoryPoint, TravelClaimRecord} from '../../types/hrms';

const DEFAULT_INDIA_CENTER = {lat: 20.5937, lng: 78.9629};
const ATTRIBUTION_IDS = ['gmp_mcp_codeassist_v1_aistudio'];

export function GmpApiWrapper({
  children,
  fallbackHeightClass = 'h-[360px]',
}: {
  children: ReactNode;
  fallbackHeightClass?: string;
}) {
  const [apiKey, setApiKey] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getGoogleMapsApiKey().then((k) => {
      if (mounted) setApiKey(k);
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (apiKey === null) {
    return (
      <div className={`flex ${fallbackHeightClass} w-full items-center justify-center bg-slate-100 text-xs text-slate-500`}>
        Initializing Google Maps...
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div
        className={`flex ${fallbackHeightClass} w-full flex-col items-center justify-center gap-2 bg-slate-100 p-4 text-center text-xs text-slate-600`}
      >
        <MapPin className="h-6 w-6 text-emerald-700" />
        <p className="font-semibold text-slate-800">GPS Coordinates &amp; Google Maps Links Active</p>
        <p className="max-w-sm text-slate-500">
          All Check-In, Check-Out, and Live GPS coordinates work without an API key. Use the{' '}
          <strong>Open in Google Maps</strong> links to view pins directly, or set{' '}
          <code className="font-mono text-slate-700">GOOGLE_MAPS_API_KEY</code> to enable the embedded map canvas.
        </p>
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey} libraries={['marker']} language="en" region="IN">
      {children}
    </APIProvider>
  );
}

function AutoFitBounds({points}: {points: {lat: number; lng: number}[]}) {
  const map = useMap();
  const coreLib = useMapsLibrary('core');

  useEffect(() => {
    if (!map || !coreLib || points.length === 0) return;
    if (points.length === 1) {
      map.panTo(points[0]);
      if ((map.getZoom() || 0) < 15) map.setZoom(16);
      return;
    }
    const bounds = new coreLib.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 48);
  }, [map, coreLib, points]);

  return null;
}

function TrailPolyline({points, color = '#0B1B36'}: {points: {lat: number; lng: number}[]; color?: string}) {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !mapsLib || points.length < 2) return;
    const line = new mapsLib.Polyline({
      path: points,
      geodesic: true,
      strokeColor: color,
      strokeOpacity: 0.85,
      strokeWeight: 3.5,
      map,
    });
    return () => {
      line.setMap(null);
    };
  }, [map, mapsLib, points, color]);

  return null;
}

interface PinItem {
  id: string;
  position: {lat: number; lng: number};
  title: string;
  glyph: string;
  background: string;
  borderColor: string;
  glyphColor: string;
  content: ReactNode;
}

function InteractivePin({
  item,
  isOpen,
  onOpen,
  onClose,
}: {
  item: PinItem;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker ref={markerRef} position={item.position} title={item.title} onClick={onOpen}>
        <Pin
          background={item.background}
          borderColor={item.borderColor}
          glyphColor={item.glyphColor}
          glyph={item.glyph}
        />
      </AdvancedMarker>
      {isOpen && marker && (
        <InfoWindow anchor={marker} maxWidth={290} onCloseClick={onClose}>
          <div className="p-1 text-xs text-slate-800">{item.content}</div>
        </InfoWindow>
      )}
    </>
  );
}

export function CheckInOutPreviewMap({
  liveCapture,
  todayRecord,
}: {
  liveCapture: {lat: number; lng: number; accuracy: number; address?: string; placeId?: string} | null;
  todayRecord?: AttendanceRecord;
}) {
  const [openPinId, setOpenPinId] = useState<string | null>(null);

  const pins = useMemo<PinItem[]>(() => {
    const list: PinItem[] = [];
    if (todayRecord?.checkInLat != null && todayRecord?.checkInLng != null) {
      const lat = Number(todayRecord.checkInLat);
      const lng = Number(todayRecord.checkInLng);
      list.push({
        id: 'today-in',
        position: {lat, lng},
        title: 'Today Check-In Location',
        glyph: 'IN',
        background: '#059669',
        borderColor: '#065F46',
        glyphColor: '#FFFFFF',
        content: (
          <div className="space-y-1">
            <p className="font-semibold text-emerald-800">Check-In ({todayRecord.checkInTime.slice(11, 19)})</p>
            <p className="text-slate-700">{todayRecord.checkInAddress || 'GPS Coordinates Captured'}</p>
            <p className="font-mono text-[11px] text-slate-500">
              {lat.toFixed(6)}, {lng.toFixed(6)} (±{todayRecord.checkInAccuracy ?? 0}m)
            </p>
            <a
              href={buildGoogleMapsUrl(lat, lng, todayRecord.checkInPlaceId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
            >
              Open in Google Maps <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        ),
      });
    }
    if (todayRecord?.checkOutLat != null && todayRecord?.checkOutLng != null) {
      const lat = Number(todayRecord.checkOutLat);
      const lng = Number(todayRecord.checkOutLng);
      list.push({
        id: 'today-out',
        position: {lat, lng},
        title: 'Today Check-Out Location',
        glyph: 'OUT',
        background: '#2563EB',
        borderColor: '#1E40AF',
        glyphColor: '#FFFFFF',
        content: (
          <div className="space-y-1">
            <p className="font-semibold text-blue-800">Check-Out ({todayRecord.checkOutTime.slice(11, 19)})</p>
            <p className="text-slate-700">{todayRecord.checkOutAddress || 'GPS Coordinates Captured'}</p>
            <p className="font-mono text-[11px] text-slate-500">
              {lat.toFixed(6)}, {lng.toFixed(6)} (±{todayRecord.checkOutAccuracy ?? 0}m)
            </p>
            <a
              href={buildGoogleMapsUrl(lat, lng, todayRecord.checkOutPlaceId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
            >
              Open in Google Maps <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        ),
      });
    }
    if (liveCapture && (!todayRecord?.checkInTime || !todayRecord?.checkOutTime)) {
      list.push({
        id: 'current-gps',
        position: {lat: liveCapture.lat, lng: liveCapture.lng},
        title: 'Current Captured GPS Position',
        glyph: 'GPS',
        background: '#D97706',
        borderColor: '#92400E',
        glyphColor: '#FFFFFF',
        content: (
          <div className="space-y-1">
            <p className="font-semibold text-amber-800">Ready to Submit GPS</p>
            <p className="text-slate-700">{liveCapture.address || 'Exact device GPS fix'}</p>
            <p className="font-mono text-[11px] text-slate-500">
              {liveCapture.lat.toFixed(6)}, {liveCapture.lng.toFixed(6)} (±{liveCapture.accuracy}m)
            </p>
            <a
              href={buildGoogleMapsUrl(liveCapture.lat, liveCapture.lng, liveCapture.placeId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
            >
              Verify on Google Maps <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        ),
      });
    }
    return list;
  }, [liveCapture, todayRecord]);

  const points = useMemo(() => pins.map((p) => p.position), [pins]);

  if (pins.length === 0) return null;

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      <div className="h-44 w-full">
        <GmpApiWrapper fallbackHeightClass="h-44">
          <GoogleMap
            mapId="DEMO_MAP_ID"
            internalUsageAttributionIds={ATTRIBUTION_IDS}
            defaultCenter={points[0] || DEFAULT_INDIA_CENTER}
            defaultZoom={16}
            gestureHandling="cooperative"
            disableDefaultUI={false}
            streetViewControl={false}
            mapTypeControl={false}
            className="h-44 w-full"
          >
            <AutoFitBounds points={points} />
            {pins.length >= 2 && <TrailPolyline points={points} color="#0F766E" />}
            {pins.map((p) => (
              <InteractivePin
                key={p.id}
                item={p}
                isOpen={openPinId === p.id}
                onOpen={() => setOpenPinId(p.id)}
                onClose={() => setOpenPinId(null)}
              />
            ))}
          </GoogleMap>
        </GmpApiWrapper>
      </div>
    </div>
  );
}

export function AttendanceLocationModal({
  record,
  onClose,
}: {
  record: AttendanceRecord;
  onClose: () => void;
}) {
  const [openPinId, setOpenPinId] = useState<string | null>('modal-in');

  const pins = useMemo<PinItem[]>(() => {
    const items: PinItem[] = [];
    if (record.checkInLat != null && record.checkInLng != null) {
      const lat = Number(record.checkInLat);
      const lng = Number(record.checkInLng);
      items.push({
        id: 'modal-in',
        position: {lat, lng},
        title: `Check-In · ${record.employeeName}`,
        glyph: 'IN',
        background: '#059669',
        borderColor: '#065F46',
        glyphColor: '#FFFFFF',
        content: (
          <div className="space-y-1">
            <p className="font-semibold text-emerald-800">Check-In · {record.checkInTime.slice(11, 19)}</p>
            <p className="text-slate-700">{record.checkInAddress || 'Coordinates recorded'}</p>
            <p className="font-mono text-[11px] text-slate-500">
              {lat.toFixed(6)}, {lng.toFixed(6)} (±{record.checkInAccuracy ?? 0}m)
            </p>
          </div>
        ),
      });
    }
    if (record.checkOutLat != null && record.checkOutLng != null) {
      const lat = Number(record.checkOutLat);
      const lng = Number(record.checkOutLng);
      items.push({
        id: 'modal-out',
        position: {lat, lng},
        title: `Check-Out · ${record.employeeName}`,
        glyph: 'OUT',
        background: '#2563EB',
        borderColor: '#1E40AF',
        glyphColor: '#FFFFFF',
        content: (
          <div className="space-y-1">
            <p className="font-semibold text-blue-800">Check-Out · {record.checkOutTime.slice(11, 19)}</p>
            <p className="text-slate-700">{record.checkOutAddress || 'Coordinates recorded'}</p>
            <p className="font-mono text-[11px] text-slate-500">
              {lat.toFixed(6)}, {lng.toFixed(6)} (±{record.checkOutAccuracy ?? 0}m)
            </p>
          </div>
        ),
      });
    }
    return items;
  }, [record]);

  const points = useMemo(() => pins.map((p) => p.position), [pins]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
      <div className="metallic-surface w-full max-w-3xl overflow-hidden rounded-2xl shadow-2xl">
        <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-blue-600 to-amber-500" />
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900">
              Google Maps Check-In &amp; Check-Out Verification
            </h3>
            <p className="text-xs text-slate-500">
              {record.employeeName} ({record.employeeId}) · {record.date} · {record.attendanceType}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close location modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {points.length > 0 ? (
            <div className="h-[320px] w-full overflow-hidden rounded-xl border border-slate-200">
              <GmpApiWrapper fallbackHeightClass="h-[320px]">
                <GoogleMap
                  mapId="DEMO_MAP_ID"
                  internalUsageAttributionIds={ATTRIBUTION_IDS}
                  defaultCenter={points[0]}
                  defaultZoom={15}
                  gestureHandling="greedy"
                  className="h-[320px] w-full"
                >
                  <AutoFitBounds points={points} />
                  {points.length >= 2 && <TrailPolyline points={points} color="#1D4ED8" />}
                  {pins.map((p) => (
                    <InteractivePin
                      key={p.id}
                      item={p}
                      isOpen={openPinId === p.id}
                      onOpen={() => setOpenPinId(p.id)}
                      onClose={() => setOpenPinId(null)}
                    />
                  ))}
                </GoogleMap>
              </GmpApiWrapper>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
              No GPS coordinates were captured for this attendance record.
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Check-In Details Card */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
              <div className="flex items-center justify-between">
                <span className="font-display text-xs font-bold uppercase tracking-wide text-emerald-800">
                  Check-In Location
                </span>
                <span className="font-mono text-xs font-semibold text-emerald-900 tabular-nums">
                  {record.checkInTime ? record.checkInTime.slice(11, 19) : '—'}
                </span>
              </div>
              <div className="mt-2.5 flex items-start gap-3">
                {record.checkInPhotoRef && (
                  <img
                    src={record.checkInPhotoRef}
                    alt="Check-in selfie"
                    className="h-14 w-14 shrink-0 rounded-lg border border-emerald-200 object-cover"
                  />
                )}
                <div className="min-w-0 space-y-1 text-xs">
                  <p className="font-medium text-slate-900">
                    {record.checkInAddress || (record.checkInLat != null ? 'Address pending / unavailable' : 'No GPS recorded')}
                  </p>
                  {record.checkInLat != null && record.checkInLng != null && (
                    <>
                      <p className="font-mono text-[11px] text-slate-600 tabular-nums">
                        {Number(record.checkInLat).toFixed(6)}, {Number(record.checkInLng).toFixed(6)} (±
                        {record.checkInAccuracy ?? 0}m)
                      </p>
                      <a
                        href={buildGoogleMapsUrl(Number(record.checkInLat), Number(record.checkInLng), record.checkInPlaceId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline"
                      >
                        Open in Google Maps <ExternalLink className="h-3 w-3" />
                      </a>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Check-Out Details Card */}
            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
              <div className="flex items-center justify-between">
                <span className="font-display text-xs font-bold uppercase tracking-wide text-blue-800">
                  Check-Out Location
                </span>
                <span className="font-mono text-xs font-semibold text-blue-900 tabular-nums">
                  {record.checkOutTime ? record.checkOutTime.slice(11, 19) : 'Not Checked Out'}
                </span>
              </div>
              <div className="mt-2.5 flex items-start gap-3">
                {record.checkOutPhotoRef && (
                  <img
                    src={record.checkOutPhotoRef}
                    alt="Check-out selfie"
                    className="h-14 w-14 shrink-0 rounded-lg border border-blue-200 object-cover"
                  />
                )}
                <div className="min-w-0 space-y-1 text-xs">
                  <p className="font-medium text-slate-900">
                    {record.checkOutTime
                      ? record.checkOutAddress ||
                        (record.checkOutLat != null ? 'Address pending / unavailable' : 'No GPS recorded')
                      : 'Employee has not checked out yet'}
                  </p>
                  {record.checkOutLat != null && record.checkOutLng != null && (
                    <>
                      <p className="font-mono text-[11px] text-slate-600 tabular-nums">
                        {Number(record.checkOutLat).toFixed(6)}, {Number(record.checkOutLng).toFixed(6)} (±
                        {record.checkOutAccuracy ?? 0}m)
                      </p>
                      <a
                        href={buildGoogleMapsUrl(
                          Number(record.checkOutLat),
                          Number(record.checkOutLng),
                          record.checkOutPlaceId,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                      >
                        Open in Google Maps <ExternalLink className="h-3 w-3" />
                      </a>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LiveTrackingGoogleMap({
  liveLocations,
  history,
  selectedEmpId,
  onSelectEmpId,
}: {
  liveLocations: LiveLocationRecord[];
  history: LocationHistoryPoint[];
  selectedEmpId: string;
  onSelectEmpId: (empId: string) => void;
}) {
  const [openPinId, setOpenPinId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedEmpId) {
      setOpenPinId(`live-${selectedEmpId}`);
    }
  }, [selectedEmpId]);

  const livePins = useMemo<PinItem[]>(() => {
    return liveLocations
      .filter((loc) => Number(loc.latitude) && Number(loc.longitude))
      .map((loc) => {
        const lat = Number(loc.latitude);
        const lng = Number(loc.longitude);
        const isAlert =
          loc.locationPermissionStatus === 'PERMISSION_DENIED' ||
          loc.locationPermissionStatus === 'GPS_UNAVAILABLE';
        const isLive = !loc.isStale && !isAlert;
        const speedKmh =
          loc.speedMps != null && Number.isFinite(Number(loc.speedMps))
            ? `${(Number(loc.speedMps) * 3.6).toFixed(1)} km/h`
            : null;
        return {
          id: `live-${loc.employeeId}`,
          position: {lat, lng},
          title: `${loc.employeeName} (${loc.employeeId})`,
          glyph: isAlert ? '!' : loc.employeeName.slice(0, 2).toUpperCase(),
          background: isAlert ? '#DC2626' : isLive ? '#059669' : '#64748B',
          borderColor: isAlert ? '#991B1B' : isLive ? '#065F46' : '#334155',
          glyphColor: '#FFFFFF',
          content: (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">{loc.employeeName}</span>
                <span
                  className={`font-semibold ${
                    isAlert ? 'text-rose-700' : isLive ? 'text-emerald-700' : 'text-slate-500'
                  }`}
                >
                  {isAlert ? 'GPS OFF ALERT' : isLive ? 'Live Active' : 'Stale / Inactive'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                {loc.employeeId} · {loc.department} · {loc.attendanceType || (loc.isFieldEmployee ? 'FIELD' : 'OFFICE')}
              </p>
              <p className="font-medium text-slate-800">{loc.address || 'Address lookup pending'}</p>
              <p className="font-mono text-[11px] text-slate-500 tabular-nums">
                {lat.toFixed(6)}, {lng.toFixed(6)} (±{loc.accuracy}m)
              </p>
              {loc.distanceTodayMeters != null && (
                <p className="font-mono text-[11px] text-slate-600 tabular-nums">
                  Traveled today: {(Number(loc.distanceTodayMeters) / 1000).toFixed(2)} km
                  {speedKmh ? ` · ${speedKmh}` : ''}
                </p>
              )}
              <p className="flex items-center gap-1 text-[11px] text-slate-500">
                <Clock className="h-3 w-3" />
                {new Date(loc.lastUpdatedAt).toLocaleString()}
              </p>
              <a
                href={loc.mapsUrl || buildGoogleMapsUrl(lat, lng, loc.placeId)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
              >
                Open in Google Maps <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          ),
        };
      });
  }, [liveLocations]);

  const trailPins = useMemo<PinItem[]>(() => {
    const checkInOutPins = history
      .filter((h) => Number(h.latitude) && Number(h.longitude) && (h.source === 'CHECK_IN' || h.source === 'CHECK_OUT'))
      .map((h) => {
        const lat = Number(h.latitude);
        const lng = Number(h.longitude);
        const isIn = h.source === 'CHECK_IN';
        return {
          id: `hist-${h.historyId}`,
          position: {lat, lng},
          title: `${h.source} · ${h.employeeName}`,
          glyph: isIn ? 'IN' : 'OUT',
          background: isIn ? '#0D9488' : '#2563EB',
          borderColor: isIn ? '#115E59' : '#1E40AF',
          glyphColor: '#FFFFFF',
          content: (
            <div className="space-y-1">
              <p className="font-semibold text-slate-900">
                {isIn ? 'Check-In Point' : 'Check-Out Point'} · {h.employeeName}
              </p>
              <p className="text-slate-700">{h.address || 'Coordinates recorded'}</p>
              <p className="font-mono text-[11px] text-slate-500 tabular-nums">
                {lat.toFixed(6)}, {lng.toFixed(6)} (±{h.accuracy}m)
              </p>
              <p className="text-[11px] text-slate-500">{new Date(h.timestamp).toLocaleTimeString()}</p>
              <a
                href={h.mapsUrl || buildGoogleMapsUrl(lat, lng, h.placeId)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
              >
                Open in Google Maps <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          ),
        };
      });

    if (!selectedEmpId) return checkInOutPins;

    const waypointRows = history.filter(
      (h) =>
        h.employeeId === selectedEmpId &&
        Number(h.latitude) &&
        Number(h.longitude) &&
        h.source !== 'CHECK_IN' &&
        h.source !== 'CHECK_OUT',
    );
    const step = waypointRows.length > 35 ? Math.ceil(waypointRows.length / 35) : 1;
    const waypointPins: PinItem[] = [];
    waypointRows.forEach((h, idx) => {
      if (idx % step !== 0 && idx !== waypointRows.length - 1) return;
      const lat = Number(h.latitude);
      const lng = Number(h.longitude);
      waypointPins.push({
        id: `wp-${h.historyId}`,
        position: {lat, lng},
        title: `Route Stop #${idx + 1} · ${new Date(h.timestamp).toLocaleTimeString()}`,
        glyph: String(idx + 1),
        background: '#D97706',
        borderColor: '#92400E',
        glyphColor: '#FFFFFF',
        content: (
          <div className="space-y-1">
            <p className="font-semibold text-amber-900">
              Route Waypoint #{idx + 1} · {new Date(h.timestamp).toLocaleTimeString()}
            </p>
            <p className="text-slate-700">{h.address || 'Travel GPS checkpoint'}</p>
            <p className="font-mono text-[11px] text-slate-500 tabular-nums">
              {lat.toFixed(6)}, {lng.toFixed(6)} (±{h.accuracy}m)
            </p>
            {h.distanceFromPrevMeters != null && (
              <p className="font-mono text-[11px] text-slate-600">
                Step: +{Math.round(Number(h.distanceFromPrevMeters))}m ({h.source})
              </p>
            )}
            <a
              href={h.mapsUrl || buildGoogleMapsUrl(lat, lng, h.placeId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
            >
              Open in Google Maps <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        ),
      });
    });

    return [...checkInOutPins, ...waypointPins];
  }, [history, selectedEmpId]);

  const routePoints = useMemo(() => {
    const filtered = selectedEmpId ? history.filter((h) => h.employeeId === selectedEmpId) : history;
    return filtered
      .filter((h) => Number(h.latitude) && Number(h.longitude))
      .map((h) => ({lat: Number(h.latitude), lng: Number(h.longitude)}));
  }, [history, selectedEmpId]);

  const allFitPoints = useMemo(() => {
    const focusLive = selectedEmpId
      ? livePins.filter((p) => p.id === `live-${selectedEmpId}`).map((p) => p.position)
      : livePins.map((p) => p.position);
    const combined = [...focusLive, ...routePoints];
    return combined.length > 0 ? combined : livePins.map((p) => p.position);
  }, [livePins, routePoints, selectedEmpId]);

  return (
    <div className="relative h-[460px] w-full">
      <GmpApiWrapper fallbackHeightClass="h-[460px]">
        <GoogleMap
          mapId="DEMO_MAP_ID"
          internalUsageAttributionIds={ATTRIBUTION_IDS}
          defaultCenter={allFitPoints[0] || DEFAULT_INDIA_CENTER}
          defaultZoom={allFitPoints.length > 0 ? 13 : 5}
          gestureHandling="greedy"
          className="h-[460px] w-full"
        >
          <AutoFitBounds points={allFitPoints} />
          {routePoints.length >= 2 && <TrailPolyline points={routePoints} color="#0B1B36" />}
          {trailPins.map((p) => (
            <InteractivePin
              key={p.id}
              item={p}
              isOpen={openPinId === p.id}
              onOpen={() => setOpenPinId(p.id)}
              onClose={() => setOpenPinId(null)}
            />
          ))}
          {livePins.map((p) => (
            <InteractivePin
              key={p.id}
              item={p}
              isOpen={openPinId === p.id}
              onOpen={() => {
                setOpenPinId(p.id);
                onSelectEmpId(p.id.replace('live-', ''));
              }}
              onClose={() => setOpenPinId(null)}
            />
          ))}
        </GoogleMap>
      </GmpApiWrapper>

      {/* Map Legend */}
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200/90 bg-white/95 px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm backdrop-blur-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
          Live Active
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-600" />
          GPS Off Alert
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-600" />
          Route Waypoint
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
          Stale / Checked Out
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Navigation className="h-3 w-3 text-[#0B1B36]" />
          Travel Route
        </span>
      </div>
    </div>
  );
}

export function decodeEncodedPolyline(encoded: string): {lat: number; lng: number}[] {
  if (!encoded) return [];
  const points: {lat: number; lng: number}[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    const dLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dLat;

    result = 0;
    shift = 0;
    do {
      if (index >= encoded.length) break;
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dLng;

    points.push({lat: lat / 1e5, lng: lng / 1e5});
  }
  return points;
}

export function buildGoogleDirectionsUrl(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  vehicleType: 'BIKE' | 'CAR' = 'BIKE',
): string {
  const mode = vehicleType === 'BIKE' ? 'two-wheeler' : 'driving';
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${fromLat},${fromLng}`)}&destination=${encodeURIComponent(`${toLat},${toLng}`)}&travelmode=${mode}`;
}

export function TravelTripMap({
  claim,
  liveGps,
  heightClass = 'h-[300px]',
}: {
  claim: TravelClaimRecord;
  liveGps?: {lat: number; lng: number; accuracy: number; address?: string} | null;
  heightClass?: string;
}) {
  const [openPinId, setOpenPinId] = useState<string | null>(null);

  const decodedRoute = useMemo(
    () => decodeEncodedPolyline(claim.routePolyline || ''),
    [claim.routePolyline],
  );

  const gpsTrailPoints = useMemo(() => {
    const pts = (claim.waypoints || [])
      .filter((w) => Number.isFinite(Number(w.latitude)) && Number.isFinite(Number(w.longitude)) && (Number(w.latitude) !== 0 || Number(w.longitude) !== 0))
      .map((w) => ({lat: Number(w.latitude), lng: Number(w.longitude)}));
    if (pts.length === 0 && claim.fromLat && claim.fromLng) {
      pts.push({lat: Number(claim.fromLat), lng: Number(claim.fromLng)});
    }
    if (liveGps && claim.status === 'IN_PROGRESS' && !claim.endedAt) {
      pts.push({lat: liveGps.lat, lng: liveGps.lng});
    }
    if (claim.toLat != null && claim.toLng != null) {
      pts.push({lat: Number(claim.toLat), lng: Number(claim.toLng)});
    }
    return pts;
  }, [claim, liveGps]);

  const pins = useMemo<PinItem[]>(() => {
    const items: PinItem[] = [];
    if (claim.fromLat && claim.fromLng) {
      items.push({
        id: 'trip-a',
        position: {lat: Number(claim.fromLat), lng: Number(claim.fromLng)},
        title: 'Location A (Origin)',
        glyph: 'A',
        background: '#059669',
        borderColor: '#065F46',
        glyphColor: '#FFFFFF',
        content: (
          <div className="space-y-1">
            <p className="font-semibold text-emerald-800">Location A · Start ({new Date(claim.startedAt).toLocaleTimeString()})</p>
            <p className="text-slate-700">{claim.fromAddress || 'Start GPS Point'}</p>
            <p className="font-mono text-[11px] text-slate-500 tabular-nums">
              {Number(claim.fromLat).toFixed(6)}, {Number(claim.fromLng).toFixed(6)} (±{claim.fromAccuracy}m)
            </p>
          </div>
        ),
      });
    }
    if (claim.toLat != null && claim.toLng != null) {
      items.push({
        id: 'trip-b',
        position: {lat: Number(claim.toLat), lng: Number(claim.toLng)},
        title: 'Location B (Destination)',
        glyph: 'B',
        background: '#2563EB',
        borderColor: '#1E40AF',
        glyphColor: '#FFFFFF',
        content: (
          <div className="space-y-1">
            <p className="font-semibold text-blue-800">
              Location B · End {claim.endedAt ? `(${new Date(claim.endedAt).toLocaleTimeString()})` : ''}
            </p>
            <p className="text-slate-700">{claim.toAddress || 'End GPS Point'}</p>
            <p className="font-mono text-[11px] text-slate-500 tabular-nums">
              {Number(claim.toLat).toFixed(6)}, {Number(claim.toLng).toFixed(6)} (±{claim.toAccuracy ?? 0}m)
            </p>
          </div>
        ),
      });
    } else if (liveGps && claim.status === 'IN_PROGRESS') {
      items.push({
        id: 'trip-live',
        position: {lat: liveGps.lat, lng: liveGps.lng},
        title: 'Live Travelling Position',
        glyph: 'NOW',
        background: '#D97706',
        borderColor: '#92400E',
        glyphColor: '#FFFFFF',
        content: (
          <div className="space-y-1">
            <p className="font-semibold text-amber-800">Live Position (En Route)</p>
            <p className="text-slate-700">{liveGps.address || 'Active GPS Tracking'}</p>
            <p className="font-mono text-[11px] text-slate-500 tabular-nums">
              {liveGps.lat.toFixed(6)}, {liveGps.lng.toFixed(6)} (±{liveGps.accuracy}m)
            </p>
          </div>
        ),
      });
    }
    return items;
  }, [claim, liveGps]);

  const fitPoints = useMemo(() => {
    const combined = [...decodedRoute, ...gpsTrailPoints, ...pins.map((p) => p.position)];
    return combined.length > 0 ? combined : [DEFAULT_INDIA_CENTER];
  }, [decodedRoute, gpsTrailPoints, pins]);

  return (
    <div className={`relative ${heightClass} w-full overflow-hidden rounded-xl border border-slate-200`}>
      <GmpApiWrapper fallbackHeightClass={heightClass}>
        <GoogleMap
          mapId="DEMO_MAP_ID"
          internalUsageAttributionIds={ATTRIBUTION_IDS}
          defaultCenter={fitPoints[0]}
          defaultZoom={14}
          gestureHandling="greedy"
          className={`${heightClass} w-full`}
        >
          <AutoFitBounds points={fitPoints} />
          {decodedRoute.length >= 2 && <TrailPolyline points={decodedRoute} color="#2563EB" />}
          {gpsTrailPoints.length >= 2 && <TrailPolyline points={gpsTrailPoints} color="#059669" />}
          {pins.map((p) => (
            <InteractivePin
              key={p.id}
              item={p}
              isOpen={openPinId === p.id}
              onOpen={() => setOpenPinId(p.id)}
              onClose={() => setOpenPinId(null)}
            />
          ))}
        </GoogleMap>
      </GmpApiWrapper>
      <div className="pointer-events-none absolute bottom-2.5 left-2.5 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200/90 bg-white/95 px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-sm">
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
          Location A / Live Trail
        </span>
        {decodedRoute.length >= 2 && (
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
            Google Road Route
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-600" />
          {claim.toLat != null ? 'Location B' : 'Live GPS'}
        </span>
      </div>
    </div>
  );
}

export function TravelRouteMapModal({
  claim,
  onClose,
}: {
  claim: TravelClaimRecord;
  onClose: () => void;
}) {
  const hasB = claim.toLat != null && claim.toLng != null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
      <div className="metallic-surface w-full max-w-3xl overflow-hidden rounded-2xl shadow-2xl">
        <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-blue-600 to-amber-500" />
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Route className="h-5 w-5 text-blue-700" />
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900">
                Travel Route Audit · {claim.claimId}
              </h3>
              <p className="text-xs text-slate-500">
                {claim.employeeName} ({claim.employeeId}) · {claim.travelDate} · {claim.vehicleType} (₹{claim.ratePerKm}/km)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close route modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <TravelTripMap claim={claim} heightClass="h-[320px]" />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] font-semibold uppercase text-slate-500">Verified Distance</div>
              <div className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums">
                {Number(claim.distanceKm || 0).toFixed(2)} km
              </div>
              <div className="text-[11px] text-slate-500">
                Live GPS: {Number(claim.gpsTrackedDistanceKm || 0).toFixed(2)} km · Google Route: {Number(claim.googleRouteDistanceKm || 0).toFixed(2)} km
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] font-semibold uppercase text-slate-500">Auto Rate Calculation</div>
              <div className="mt-1 font-mono text-lg font-bold text-emerald-700 tabular-nums">
                ₹{Number(claim.claimAmount || 0).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
              </div>
              <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                {Number(claim.distanceKm || 0).toFixed(2)} km × ₹{claim.ratePerKm}/km ({claim.vehicleType})
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] font-semibold uppercase text-slate-500">Waypoints &amp; Duration</div>
              <div className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums">
                {(claim.waypoints || []).length} pts
              </div>
              <div className="text-[11px] text-slate-500">
                {claim.routeDurationText ? `Est. travel: ${claim.routeDurationText}` : 'Source: ' + claim.distanceSource}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 text-xs">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5">
              <div className="flex items-center justify-between">
                <span className="font-bold uppercase text-emerald-800">Location A (Origin)</span>
                <span className="font-mono text-emerald-900 tabular-nums">{claim.startedAt.slice(11, 19)}</span>
              </div>
              <p className="mt-1 font-medium text-slate-900">{claim.fromAddress}</p>
              <p className="mt-0.5 font-mono text-[11px] text-slate-600 tabular-nums">
                {Number(claim.fromLat).toFixed(6)}, {Number(claim.fromLng).toFixed(6)} (±{claim.fromAccuracy}m)
              </p>
              <a
                href={claim.fromMapsUrl || buildGoogleMapsUrl(Number(claim.fromLat), Number(claim.fromLng), claim.fromPlaceId)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline"
              >
                Open Pin A in Google Maps <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3.5">
              <div className="flex items-center justify-between">
                <span className="font-bold uppercase text-blue-800">Location B (Destination)</span>
                <span className="font-mono text-blue-900 tabular-nums">{claim.endedAt ? claim.endedAt.slice(11, 19) : 'In Transit'}</span>
              </div>
              <p className="mt-1 font-medium text-slate-900">{claim.toAddress || 'Trip still in progress'}</p>
              {hasB && (
                <>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-600 tabular-nums">
                    {Number(claim.toLat).toFixed(6)}, {Number(claim.toLng).toFixed(6)} (±{claim.toAccuracy ?? 0}m)
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-3">
                    <a
                      href={claim.toMapsUrl || buildGoogleMapsUrl(Number(claim.toLat), Number(claim.toLng), claim.toPlaceId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                    >
                      Open Pin B <ExternalLink className="h-3 w-3" />
                    </a>
                    <a
                      href={buildGoogleDirectionsUrl(Number(claim.fromLat), Number(claim.fromLng), Number(claim.toLat), Number(claim.toLng), claim.vehicleType)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-indigo-700 hover:underline"
                    >
                      Open A→B Route in Google Maps <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>
          {claim.vehicleType === 'BIKE' && (
            <p className="text-[11px] text-slate-500">
              Note: Google Maps two-wheeler routing is in beta and may occasionally miss narrow paths or shortcuts; live GPS trail waypoints are logged alongside the route.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
