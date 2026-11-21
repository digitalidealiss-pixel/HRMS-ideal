import type {AuthUser, OfflineSyncItem} from '../types/hrms';
import {
  enqueueOfflineEvent,
  getOfflineQueue,
  loadSnapshot,
  removeOfflineEvent,
  saveSnapshot,
  updateOfflineEvent,
} from './offlineDb';

const TOKEN_KEY = 'ideal_hrms_session_token';
const USER_KEY = 'ideal_hrms_session_user';
const GAS_URL_KEY = 'ideal_hrms_gas_webapp_url';

export function getStoredToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getGasWebAppUrl(): string {
  return localStorage.getItem(GAS_URL_KEY) || '';
}

export function setGasWebAppUrl(url: string): void {
  const cleaned = url.trim();
  if (cleaned) localStorage.setItem(GAS_URL_KEY, cleaned);
  else localStorage.removeItem(GAS_URL_KEY);
}

function generateTxId(): string {
  return `TX-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function callRpc<T = any>(
  action: string,
  payload: Record<string, any> = {},
  options?: {cacheKey?: string; useGasUrlOverride?: string},
): Promise<T> {
  const gasUrl = options?.useGasUrlOverride !== undefined ? options.useGasUrlOverride : getGasWebAppUrl();
  const endpoint = gasUrl || '/api/rpc';
  const token = getStoredToken();

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        // text/plain prevents CORS preflight against Google Apps Script Web Apps
        'Content-Type': gasUrl ? 'text/plain;charset=utf-8' : 'application/json',
      },
      body: JSON.stringify({
        action,
        token,
        payload,
        transactionId: generateTxId(),
      }),
    });

    const data = await res.json();
    if (!res.ok || data.ok === false) {
      const msg = data.error || `Request failed (${res.status})`;
      if (msg.startsWith('UNAUTHORIZED')) {
        clearSession();
      }
      throw new Error(msg);
    }

    if (options?.cacheKey) {
      await saveSnapshot(options.cacheKey, data);
    }
    return data as T;
  } catch (err: any) {
    if (!navigator.onLine && options?.cacheKey) {
      const cached = await loadSnapshot<T>(options.cacheKey);
      if (cached) return cached;
    }
    throw err;
  }
}

export async function submitAttendanceWithOfflineFallback(
  type: 'CHECK_IN' | 'CHECK_OUT',
  employeeId: string,
  payload: Record<string, any>,
): Promise<{offlineQueued: boolean; response?: any; eventId: string}> {
  const eventId = `EVT-${type}-${employeeId}-${Date.now()}`;
  const deviceTimestamp = new Date().toISOString();
  const action = type === 'CHECK_IN' ? 'checkIn' : 'checkOut';

  if (!navigator.onLine) {
    const item: OfflineSyncItem = {
      eventId,
      type,
      employeeId,
      deviceTimestamp,
      payload,
      status: 'PENDING_SYNC',
      retryCount: 0,
    };
    await enqueueOfflineEvent(item);
    return {offlineQueued: true, eventId};
  }

  try {
    const response = await callRpc(action, {...payload, deviceTimestamp, eventId});
    return {offlineQueued: false, response, eventId};
  } catch (err: any) {
    // Queue only on network failure, not business validation errors
    if (err instanceof TypeError || !navigator.onLine) {
      await enqueueOfflineEvent({
        eventId,
        type,
        employeeId,
        deviceTimestamp,
        payload,
        status: 'PENDING_SYNC',
        retryCount: 0,
      });
      return {offlineQueued: true, eventId};
    }
    throw err;
  }
}

export async function syncPendingOfflineEvents(): Promise<{synced: number; failed: number}> {
  if (!navigator.onLine || !getStoredToken()) return {synced: 0, failed: 0};
  const queue = await getOfflineQueue();
  const pending = queue.filter((q) => q.status === 'PENDING_SYNC' || q.status === 'FAILED');
  if (pending.length === 0) return {synced: 0, failed: 0};

  try {
    const res = await callRpc<{ok: boolean; results: {eventId: string; status: string; error?: string}[]}>(
      'syncOfflineQueue',
      {items: pending},
    );
    let synced = 0;
    let failed = 0;
    for (const r of res.results || []) {
      const item = pending.find((p) => p.eventId === r.eventId);
      if (!item) continue;
      if (r.status === 'SYNCED') {
        await removeOfflineEvent(r.eventId);
        synced++;
      } else {
        await updateOfflineEvent({
          ...item,
          status: 'FAILED',
          retryCount: item.retryCount + 1,
          lastError: r.error || 'Server validation rejected event',
        });
        failed++;
      }
    }
    return {synced, failed};
  } catch {
    return {synced: 0, failed: pending.length};
  }
}
