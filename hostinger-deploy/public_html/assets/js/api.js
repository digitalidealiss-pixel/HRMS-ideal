(function (global) {
  const TOKEN_KEY = 'ideal_hrms_token';
  const USER_KEY = 'ideal_hrms_user';

  global.IdealApi = {
    getToken: () => localStorage.getItem(TOKEN_KEY) || '',
    getUser: () => {
      try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
    },
    saveSession: (token, user) => {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    },
    clearSession: () => {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    },
    call: async function (action, payload) {
      const url = (global.IDEAL_HRMS_CONFIG && global.IDEAL_HRMS_CONFIG.GAS_WEBAPP_URL) || '';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: action,
          token: this.getToken(),
          payload: payload || {},
          transactionId: 'TX-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)
        })
      });
      const data = await res.json();
      if (!data.ok) {
        if (String(data.error || '').startsWith('UNAUTHORIZED')) this.clearSession();
        throw new Error(data.error || 'Apps Script API Error');
      }
      return data;
    },
    syncOfflineQueue: async function () {
      if (!navigator.onLine || !this.getToken()) return { synced: 0 };
      const items = await global.IdealIndexedDb.getAll();
      if (!items.length) return { synced: 0 };
      const res = await this.call('syncOfflineQueue', { items: items });
      let synced = 0;
      for (const r of (res.results || [])) {
        if (r.status === 'SYNCED') {
          await global.IdealIndexedDb.remove(r.eventId);
          synced++;
        }
      }
      return { synced: synced };
    }
  };
})(window);
