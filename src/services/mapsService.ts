import {callRpc} from './apiClient';

let cachedApiKey: string | null = null;
let inflightKeyPromise: Promise<string> | null = null;
const reverseGeocodeCache: Record<string, {address: string; placeId: string; ts: number}> = {};

export async function getGoogleMapsApiKey(): Promise<string> {
  const envKey = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  if (envKey) return envKey;
  if (cachedApiKey !== null) return cachedApiKey;
  if (inflightKeyPromise) return inflightKeyPromise;

  inflightKeyPromise = callRpc<{ok: boolean; apiKey: string}>('getMapsConfig')
    .then((res) => {
      cachedApiKey = String(res.apiKey || '').trim();
      return cachedApiKey;
    })
    .catch(() => '')
    .finally(() => {
      inflightKeyPromise = null;
    });

  return inflightKeyPromise;
}

export async function reverseGeocodeLocation(
  lat: number,
  lng: number,
): Promise<{address: string; placeId: string; quotaExceeded?: boolean}> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    return {address: '', placeId: ''};
  }
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cached = reverseGeocodeCache[key];
  if (cached && Date.now() - cached.ts < 15 * 60000) {
    return {address: cached.address, placeId: cached.placeId};
  }

  try {
    const res = await callRpc<{ok: boolean; address?: string; placeId?: string; quotaExceeded?: boolean}>(
      'reverseGeocode',
      {latitude: lat, longitude: lng},
    );
    if (res.quotaExceeded) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      return {address: '', placeId: '', quotaExceeded: true};
    }
    const address = String(res.address || '').trim();
    const placeId = String(res.placeId || '').trim();
    if (address) {
      reverseGeocodeCache[key] = {address, placeId, ts: Date.now()};
    }
    return {address, placeId};
  } catch (err: any) {
    const msg = String(err?.message || '');
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('OVER_QUERY_LIMIT')) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
    return {address: '', placeId: ''};
  }
}

export function buildGoogleMapsUrl(lat: number, lng: number, placeId?: string): string {
  const base = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
  return placeId ? `${base}&query_place_id=${encodeURIComponent(placeId)}` : base;
}

export function formatCoords(lat: number | null | undefined, lng: number | null | undefined): string {
  if (lat == null || lng == null) return 'No GPS';
  return `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
}
