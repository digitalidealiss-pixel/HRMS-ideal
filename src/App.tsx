import {
  Award,
  Bell,
  CalendarDays,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileBarChart2,
  FolderCode,
  IndianRupee,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Navigation,
  RefreshCw,
  Route,
  Settings,
  ShieldAlert,
  Users,
  UtensilsCrossed,
  WifiOff,
  X,
} from 'lucide-react';
import {useEffect, useMemo, useState} from 'react';
import {AttendanceView} from './components/attendance/AttendanceView';
import {LoginView} from './components/auth/LoginView';
import {PWAInstallButton} from './components/common/PWAInstallButton';
import {ConfirmDialog, ToastHost, type ToastItem} from './components/common/ToastAndConfirm';
import {DashboardView} from './components/dashboard/DashboardView';
import {DeploymentKitView} from './components/deployment/DeploymentKitView';
import {EmployeesView} from './components/employees/EmployeesView';
import {FoodAllowanceView} from './components/food/FoodAllowanceView';
import {LeavesView} from './components/leaves/LeavesView';
import {LocationTrackingView} from './components/location/LocationTrackingView';
import {NotificationsView} from './components/notifications/NotificationsView';
import {PayrollView} from './components/payroll/PayrollView';
import {PerformanceView} from './components/performance/PerformanceView';
import {ReportsView} from './components/reports/ReportsView';
import {SettingsView} from './components/settings/SettingsView';
import {TasksView} from './components/tasks/TasksView';
import {TravelConveyanceView} from './components/travel/TravelConveyanceView';
import {useMandatoryFieldTracker} from './hooks/useMandatoryFieldTracker';
import {useOnlineStatus} from './hooks/useOnlineStatus';
import {
  callRpc,
  clearSession,
  getStoredToken,
  getStoredUser,
  syncPendingOfflineEvents,
} from './services/apiClient';
import {getOfflineQueue} from './services/offlineDb';
import type {AuthUser, NotificationRecord} from './types/hrms';

interface NavItem {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: AuthUser['role'][];
  accentColor: string;
}

const NAV_ITEMS: NavItem[] = [
  {id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['SUPER_ADMIN', 'HR_ADMIN', 'EMPLOYEE'], accentColor: 'text-sky-400'},
  {id: 'attendance', label: 'Attendance', icon: Clock, roles: ['SUPER_ADMIN', 'HR_ADMIN', 'EMPLOYEE'], accentColor: 'text-emerald-400'},
  {id: 'location', label: 'Live GPS', icon: MapPin, roles: ['SUPER_ADMIN', 'HR_ADMIN'], accentColor: 'text-cyan-400'},
  {id: 'travel', label: 'Travel & Conveyance', icon: Route, roles: ['SUPER_ADMIN', 'HR_ADMIN', 'EMPLOYEE'], accentColor: 'text-amber-300'},
  {id: 'food', label: 'Food Allowance', icon: UtensilsCrossed, roles: ['SUPER_ADMIN', 'HR_ADMIN', 'EMPLOYEE'], accentColor: 'text-amber-300'},
  {id: 'employees', label: 'Employees', icon: Users, roles: ['SUPER_ADMIN', 'HR_ADMIN', 'EMPLOYEE'], accentColor: 'text-indigo-300'},
  {id: 'leaves', label: 'Leaves', icon: CalendarDays, roles: ['SUPER_ADMIN', 'HR_ADMIN', 'EMPLOYEE'], accentColor: 'text-amber-400'},
  {id: 'payroll', label: 'Payroll', icon: IndianRupee, roles: ['SUPER_ADMIN', 'HR_ADMIN', 'EMPLOYEE'], accentColor: 'text-emerald-300'},
  {id: 'performance', label: 'Performance', icon: Award, roles: ['SUPER_ADMIN', 'HR_ADMIN', 'EMPLOYEE'], accentColor: 'text-amber-300'},
  {id: 'tasks', label: 'Tasks', icon: CheckSquare, roles: ['SUPER_ADMIN', 'HR_ADMIN', 'EMPLOYEE'], accentColor: 'text-sky-300'},
  {id: 'notifications', label: 'Notifications', icon: Bell, roles: ['SUPER_ADMIN', 'HR_ADMIN', 'EMPLOYEE'], accentColor: 'text-rose-300'},
  {id: 'reports', label: 'Reports', icon: FileBarChart2, roles: ['SUPER_ADMIN', 'HR_ADMIN'], accentColor: 'text-teal-300'},
  {id: 'settings', label: 'Settings & Audit', icon: Settings, roles: ['SUPER_ADMIN'], accentColor: 'text-slate-300'},
  {id: 'deployment', label: 'GAS & Hostinger', icon: FolderCode, roles: ['SUPER_ADMIN', 'HR_ADMIN'], accentColor: 'text-amber-300'},
];

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(() => (getStoredToken() ? getStoredUser() : null));
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);
  const isOnline = useOnlineStatus();
  const fieldTracker = useMandatoryFieldTracker(user);

  useEffect(() => {
    const onQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  const pushToast = (type: ToastItem['type'], title: string, message?: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, {id, type, title, message}]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const refreshQueueAndUnread = async () => {
    const queue = await getOfflineQueue();
    setPendingSyncCount(queue.length);
    if (user && isOnline) {
      try {
        const res = await callRpc<{ok: boolean; notifications: NotificationRecord[]}>('getNotifications');
        setUnreadCount((res.notifications || []).filter((n) => !n.isRead).length);
      } catch {
        // Ignore silent background notification poll failures
      }
    }
  };

  useEffect(() => {
    if (!user) return;
    refreshQueueAndUnread();
  }, [user]);

  useEffect(() => {
    if (!user || !isOnline) return;
    const runSync = async () => {
      const res = await syncPendingOfflineEvents();
      if (res.synced > 0) {
        pushToast('success', 'Offline Records Synchronized', `${res.synced} queued event(s) synced.`);
        window.dispatchEvent(new CustomEvent('ideal-attendance-updated'));
      }
      if (res.failed > 0) {
        pushToast('warning', 'Offline Sync Attention', `${res.failed} queued event(s) failed validation.`);
      }
      refreshQueueAndUnread();
    };
    runSync();
  }, [isOnline, user]);

  const visibleNav = useMemo(() => {
    if (!user) return [];
    return NAV_ITEMS.filter((item) => item.roles.includes(user.role)).map((item) => {
      if (user.role === 'EMPLOYEE' && item.id === 'employees') {
        return {...item, label: 'My Profile'};
      }
      if (user.role === 'EMPLOYEE' && item.id === 'payroll') {
        return {...item, label: 'Payslips'};
      }
      return item;
    });
  }, [user]);

  const handleLogout = async () => {
    try {
      await callRpc('logout');
    } catch {
      // Clear local session regardless
    }
    clearSession();
    setUser(null);
    setConfirmLogout(false);
    setActiveTab('dashboard');
  };

  const quotaBanner = gmpQuotaExceeded ? (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
      <span>
        Google Maps Platform quota reached. If you are the app owner, visit{' '}
        <a
          href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-semibold text-amber-950 hover:text-amber-800"
        >
          maps developer site
        </a>{' '}
        for instructions to update your account.
      </span>
    </div>
  ) : null;

  if (!user) {
    return (
      <>
        {quotaBanner}
        <ToastHost toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />
        <LoginView
          onLoginSuccess={(loggedUser) => {
            setUser(loggedUser);
            setActiveTab('dashboard');
            pushToast('success', `Welcome, ${loggedUser.fullName}`, `${loggedUser.employeeId} · ${loggedUser.role}`);
          }}
        />
      </>
    );
  }

  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'HR_ADMIN';
  const currentNavLabel = visibleNav.find((n) => n.id === activeTab)?.label || 'Dashboard';

  return (
    <div className="flex min-h-screen flex-col text-slate-900">
      {quotaBanner}
      <div className="flex min-h-screen flex-1">
      <ToastHost toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />

      {/* Desktop Collapsible Anodized Metallic Sidebar */}
      <aside
        className={`metallic-sidebar hidden md:flex md:flex-col md:sticky md:top-0 md:h-screen text-white transition-all duration-200 ${
          sidebarCollapsed ? 'w-[74px]' : 'w-[254px]'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/15 px-3">
          {!sidebarCollapsed ? (
            <div className="flex items-center gap-2 min-w-0">
              <div className="rounded-lg bg-white px-2 py-1 shadow-sm border border-white/60">
                <img
                  src="/assets/aistudio/logo_33dbe725.png"
                  alt="IDEAL Industrial Synergy Solutions Pvt. Ltd."
                  referrerPolicy="no-referrer"
                  className="h-7 w-auto max-w-[148px] object-contain"
                />
              </div>
            </div>
          ) : (
            <div className="mx-auto rounded-md bg-white p-1 shadow-xs">
              <img
                src="/assets/aistudio/logo_33dbe725.png"
                alt="IDEAL"
                referrerPolicy="no-referrer"
                className="h-5 w-7 object-contain"
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white shrink-0"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex min-h-[42px] w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-all whitespace-nowrap ${
                  active
                    ? 'bg-gradient-to-r from-white via-slate-50 to-sky-50 text-[#0B1B36] font-semibold shadow-md'
                    : 'text-slate-200 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-blue-700' : item.accentColor}`} />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                {!sidebarCollapsed && item.id === 'notifications' && unreadCount > 0 && (
                  <span className="ml-auto font-mono text-[11px] font-bold text-amber-300 tabular-nums">
                    {unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/15 bg-black/15 p-3">
          {!sidebarCollapsed && (
            <div className="mb-2.5 flex items-center gap-2.5 px-1.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 font-display text-xs font-bold text-white shadow">
                {user.fullName.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-white">{user.fullName}</p>
                <p className="truncate font-mono text-[11px] text-sky-200/80">
                  {user.employeeId} · {user.role}
                </p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setConfirmLogout(true)}
            className="flex min-h-[40px] w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4 shrink-0 text-rose-300" />
            {!sidebarCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-slate-950/55 backdrop-blur-xs" onClick={() => setMobileMenuOpen(false)} />
          <aside className="metallic-sidebar relative z-10 flex w-72 flex-col text-white">
            <div className="flex h-14 items-center justify-between border-b border-white/15 px-4">
              <div className="rounded-lg bg-white px-2.5 py-1 shadow-xs">
                <img
                  src="/assets/aistudio/logo_33dbe725.png"
                  alt="IDEAL Industrial Synergy Solutions"
                  referrerPolicy="no-referrer"
                  className="h-6 w-auto object-contain"
                />
              </div>
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="p-2 text-slate-300">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {visibleNav.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-sm font-medium ${
                      active ? 'bg-white text-[#0B1B36] font-semibold shadow-sm' : 'text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-blue-700' : item.accentColor}`} />
                    <span className="truncate">{item.label}</span>
                    {item.id === 'notifications' && unreadCount > 0 && (
                      <span className="ml-auto font-mono text-xs font-bold text-amber-300 tabular-nums">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
            <div className="border-t border-white/15 bg-black/15 p-3">
              <div className="mb-2.5 flex items-center gap-2.5 px-1.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 font-display text-xs font-bold text-white shadow">
                  {user.fullName.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-white">{user.fullName}</p>
                  <p className="truncate font-mono text-[11px] text-sky-200/80">
                    {user.employeeId} · {user.role}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setConfirmLogout(true);
                }}
                className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-sm text-slate-200 hover:bg-white/10"
              >
                <LogOut className="h-4 w-4 text-rose-300" />
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
        {/* Top Bar Contract */}
        <header className="metallic-header sticky top-0 z-30 flex h-14 items-center justify-between gap-4 px-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-700 hover:bg-slate-200/60 md:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden sm:flex items-center rounded-md bg-white px-2 py-1 border border-slate-200 shadow-2xs">
              <img
                src="/assets/aistudio/logo_33dbe725.png"
                alt="IDEAL"
                referrerPolicy="no-referrer"
                className="h-5 w-auto object-contain"
              />
            </div>
            <span className="truncate font-display text-sm font-semibold text-slate-900">
              IDEAL HRMS <span className="text-amber-600">/</span> {currentNavLabel}
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {!isOnline && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                <WifiOff className="h-3.5 w-3.5" />
                Offline
              </span>
            )}
            {pendingSyncCount > 0 && (
              <button
                type="button"
                onClick={async () => {
                  const res = await syncPendingOfflineEvents();
                  pushToast('info', 'Offline Sync', `Synced: ${res.synced} · Failed: ${res.failed}`);
                  refreshQueueAndUnread();
                }}
                className="metallic-btn-gold inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold"
              >
                <RefreshCw className="h-3 w-3" />
                Sync ({pendingSyncCount})
              </button>
            )}
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => setActiveTab('notifications')}
              className="relative inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-xs hover:bg-slate-50"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4 text-blue-700" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-gradient-to-r from-amber-500 to-rose-600 px-1 font-mono text-[10px] font-semibold text-white">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {fieldTracker.isTrackingRequired && !fieldTracker.gpsBlockedReason && (
          <div className="border-b border-emerald-200 bg-emerald-50/90 px-4 py-2 text-xs text-emerald-950 lg:px-8">
            <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-medium">
                <Navigation className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                <span>
                  Field Duty GPS Active · Mandatory check-in to check-out tracking is logging continuously to Google Sheets
                </span>
              </div>
              <span className="font-mono text-[11px] text-emerald-800 tabular-nums">
                {fieldTracker.lastCapture
                  ? `Last fix: ${new Date(fieldTracker.lastCapture.timestamp).toLocaleTimeString()} (±${fieldTracker.lastCapture.accuracy}m)`
                  : 'Locking satellite GPS fix...'}
              </span>
            </div>
          </div>
        )}

        <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 lg:p-7">
          {activeTab === 'dashboard' && <DashboardView user={user} onNavigate={setActiveTab} />}
          {activeTab === 'employees' && <EmployeesView user={user} onToast={pushToast} />}
          {activeTab === 'attendance' && <AttendanceView user={user} onToast={pushToast} />}
          {activeTab === 'location' && isAdmin && <LocationTrackingView user={user} onToast={pushToast} />}
          {activeTab === 'travel' && <TravelConveyanceView user={user} onToast={pushToast} />}
          {activeTab === 'food' && <FoodAllowanceView user={user} onToast={pushToast} />}
          {activeTab === 'leaves' && <LeavesView user={user} onToast={pushToast} />}
          {activeTab === 'payroll' && <PayrollView user={user} onToast={pushToast} />}
          {activeTab === 'performance' && <PerformanceView user={user} onToast={pushToast} />}
          {activeTab === 'tasks' && <TasksView user={user} onToast={pushToast} />}
          {activeTab === 'notifications' && (
            <NotificationsView user={user} onToast={pushToast} onUnreadCountChange={setUnreadCount} />
          )}
          {activeTab === 'reports' && <ReportsView user={user} onToast={pushToast} />}
          {activeTab === 'settings' && <SettingsView user={user} onToast={pushToast} />}
          {activeTab === 'deployment' && <DeploymentKitView onToast={pushToast} />}
        </main>
      </div>

      {/* Mobile Bottom Thumb Navigation */}
      <nav className="metallic-header fixed bottom-0 left-0 right-0 z-40 grid h-14 grid-cols-5 border-t border-slate-300 pb-safe md:hidden">
        {[
          {id: 'dashboard', label: 'Home', icon: LayoutDashboard},
          {id: 'attendance', label: 'Check In', icon: Clock},
          isAdmin
            ? {id: 'location', label: 'GPS', icon: MapPin}
            : {id: 'travel', label: 'Travel', icon: Route},
          {id: 'leaves', label: 'Leaves', icon: CalendarDays},
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex min-h-[44px] flex-col items-center justify-center text-[10px] font-semibold ${
                active ? 'text-blue-700' : 'text-slate-600'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="mt-0.5">{tab.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className={`flex min-h-[44px] flex-col items-center justify-center text-[10px] font-semibold ${
            !['dashboard', 'attendance', isAdmin ? 'location' : 'travel', 'leaves'].includes(activeTab)
              ? 'text-blue-700'
              : 'text-slate-600'
          }`}
        >
          <Menu className="h-4 w-4" />
          <span className="mt-0.5">Menu</span>
        </button>
      </nav>

      {/* Mandatory Blocking GPS Alert for Active Field Duty Employees */}
      {fieldTracker.isTrackingRequired && fieldTracker.gpsBlockedReason && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-rose-300 bg-white shadow-2xl">
            <div className="h-1.5 w-full bg-gradient-to-r from-rose-600 to-amber-500" />
            <div className="space-y-4 p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900">
                    Mandatory Location Required for Field Duty
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    {fieldTracker.gpsBlockedReason}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                <p className="font-semibold">Admin Alert Logged</p>
                <p className="mt-0.5 text-[11px] leading-relaxed">
                  While checked in on Field Duty, device Location Services must remain ON until you complete Check-Out.
                  Enable Location in your phone settings and allow browser location access, then tap below.
                </p>
              </div>
              <button
                type="button"
                onClick={fieldTracker.retryLocation}
                className="metallic-btn-emerald min-h-[44px] w-full rounded-xl px-4 py-2.5 text-sm font-semibold"
              >
                Verify Location &amp; Resume Field Duty
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmLogout}
        title="Sign out of IDEAL HRMS?"
        description="Your active session token will be invalidated on the server."
        confirmLabel="Sign Out"
        onCancel={() => setConfirmLogout(false)}
        onConfirm={handleLogout}
      />
      </div>
    </div>
  );
}
