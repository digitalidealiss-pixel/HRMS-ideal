import {Bell, Check, Megaphone} from 'lucide-react';
import {useEffect, useState, type FormEvent} from 'react';
import {callRpc} from '../../services/apiClient';
import type {AuthUser, NotificationRecord} from '../../types/hrms';
import {AdminOtpInbox} from '../common/AdminOtpInbox';

interface NotificationsViewProps {
  user: AuthUser;
  onToast: (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;
  onUnreadCountChange: (count: number) => void;
}

export function NotificationsView({user, onToast, onUnreadCountChange}: NotificationsViewProps) {
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'HR_ADMIN';

  const loadNotifications = async () => {
    try {
      const res = await callRpc<{ok: boolean; notifications: NotificationRecord[]}>('getNotifications');
      const list = res.notifications || [];
      setItems(list);
      onUnreadCountChange(list.filter((n) => !n.isRead).length);
    } catch (err: any) {
      onToast('error', 'Failed to load notifications', err.message);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const handleMarkRead = async (notificationId: string) => {
    await callRpc('markNotificationRead', {notificationId});
    await loadNotifications();
  };

  const handleAnnounce = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await callRpc('createAnnouncement', {title, message});
      setTitle('');
      setMessage('');
      onToast('success', 'HR Announcement published');
      await loadNotifications();
    } catch (err: any) {
      onToast('error', 'Publish failed', err.message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="metallic-navy-panel overflow-hidden rounded-2xl text-white">
        <div className="h-1 w-full bg-gradient-to-r from-rose-400 via-amber-400 to-blue-400" />
        <div className="p-5">
          <h1 className="font-display text-xl font-semibold text-white">Notifications &amp; HR Announcements</h1>
          <p className="mt-0.5 text-xs text-sky-100/85">
            Attendance alerts, leave approvals, payslip releases, and company circulars
          </p>
        </div>
      </div>

      {isAdmin && <AdminOtpInbox user={user} onToast={onToast} />}

      {isAdmin && (
        <form onSubmit={handleAnnounce} className="metallic-surface rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Megaphone className="h-4 w-4 text-amber-600" />
            Broadcast HR Announcement
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              required
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Announcement Title"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
            />
            <input
              required
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Announcement message to all employees..."
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:col-span-2"
            />
          </div>
          <div className="flex justify-end">
            <button type="submit" className="metallic-btn-primary rounded-lg px-4 py-2 text-xs font-semibold">
              Send Broadcast
            </button>
          </div>
        </form>
      )}

      <div className="metallic-surface divide-y divide-slate-200/70 rounded-xl">
        {items.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            <Bell className="mx-auto mb-2 h-6 w-6 text-slate-300" />
            No notifications yet.
          </div>
        ) : (
          items.map((n) => (
            <div key={n.notificationId} className={`flex items-start justify-between gap-4 p-4 ${n.isRead ? 'bg-white' : 'bg-slate-50/80'}`}>
              <div>
                <p className="text-xs font-semibold text-slate-900">
                  {n.title}{' '}
                  <span className="font-normal text-slate-500">
                    · {n.category} · {new Date(n.createdAt).toLocaleString()}
                  </span>
                </p>
                <p className="mt-1 text-xs text-slate-600">{n.message}</p>
              </div>
              {!n.isRead && (
                <button
                  type="button"
                  onClick={() => handleMarkRead(n.notificationId)}
                  className="inline-flex shrink-0 items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                >
                  <Check className="h-3 w-3" /> Mark Read
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
