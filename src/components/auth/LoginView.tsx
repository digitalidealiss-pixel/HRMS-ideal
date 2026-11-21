import {ArrowLeft, CheckCircle2, Eye, EyeOff, Globe, KeyRound, Lock, ShieldCheck, UserPlus} from 'lucide-react';
import {useEffect, useState, type FormEvent} from 'react';
import {callRpc, getGasWebAppUrl, saveSession, setGasWebAppUrl} from '../../services/apiClient';
import type {AuthUser} from '../../types/hrms';
import {PWAInstallButton} from '../common/PWAInstallButton';

interface LoginViewProps {
  onLoginSuccess: (user: AuthUser) => void;
}

export function LoginView({onLoginSuccess}: LoginViewProps) {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [showGasConfig, setShowGasConfig] = useState(false);
  const [gasUrlInput, setGasUrlInput] = useState(getGasWebAppUrl());
  const [gasTestMsg, setGasTestMsg] = useState('');

  // Login state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  // Initial Super Admin Setup state
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminMobile, setAdminMobile] = useState('');
  const [adminDept, setAdminDept] = useState('Executive & Administration');
  const [adminDesignation, setAdminDesignation] = useState('Managing Director');
  const [adminPassword, setAdminPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [imgHeroFailed, setImgHeroFailed] = useState(false);
  const [imgLogoFailed, setImgLogoFailed] = useState(false);

  // Forgot Password (Admin-Dispatched OTP) state
  const [authMode, setAuthMode] = useState<'login' | 'forgot'>('login');
  const [resetStep, setResetStep] = useState<'request' | 'verify'>('request');
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [otpDispatchInfo, setOtpDispatchInfo] = useState<{
    otpId: string;
    maskedAdminRecipients: string;
    message: string;
  } | null>(null);

  const checkSetupStatus = async () => {
    setError('');
    try {
      const res = await callRpc<{ok: boolean; needsInitialSetup: boolean}>('setupStatus');
      setNeedsSetup(res.needsInitialSetup);
    } catch (err: any) {
      setNeedsSetup(false);
      setError(err.message || 'Unable to reach backend service.');
    }
  };

  useEffect(() => {
    checkSetupStatus();
  }, []);

  const handleSaveGasUrl = async () => {
    setGasTestMsg('Testing endpoint...');
    try {
      const res = await callRpc<{ok: boolean; company?: string}>(
        'health',
        {},
        {useGasUrlOverride: gasUrlInput.trim()},
      );
      setGasWebAppUrl(gasUrlInput.trim());
      setGasTestMsg(`Connected: ${res.company || 'Backend ready'}`);
      await checkSetupStatus();
    } catch (err: any) {
      setGasTestMsg(`Connection failed: ${err.message}`);
    }
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await callRpc<{ok: boolean; token: string; user: AuthUser}>('login', {
        identifier,
        password,
      });
      saveSession(res.token, res.user);
      onLoginSuccess(res.user);
    } catch (err: any) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleInitSuperAdmin = async (e: FormEvent) => {
    e.preventDefault();
    if (adminPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await callRpc<{ok: boolean; token: string; user: AuthUser}>('initSuperAdmin', {
        fullName: adminName,
        email: adminEmail,
        mobile: adminMobile,
        department: adminDept,
        designation: adminDesignation,
        password: adminPassword,
      });
      saveSession(res.token, res.user);
      onLoginSuccess(res.user);
    } catch (err: any) {
      setError(err.message || 'Initialization failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);
    try {
      const res = await callRpc<{
        ok: boolean;
        otpId: string;
        maskedAdminRecipients: string;
        message: string;
      }>('requestPasswordResetOtp', {identifier: resetIdentifier.trim()});
      setOtpDispatchInfo({
        otpId: res.otpId,
        maskedAdminRecipients: res.maskedAdminRecipients,
        message: res.message,
      });
      setResetStep('verify');
    } catch (err: any) {
      setError(err.message || 'Failed to dispatch password reset OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtpReset = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await callRpc<{ok: boolean; message: string}>('verifyPasswordResetOtp', {
        identifier: resetIdentifier.trim(),
        otp: resetOtp.trim(),
        newPassword,
      });
      setSuccessMsg(res.message || 'Password reset successful. Sign in with your new password.');
      setIdentifier(resetIdentifier.trim());
      setPassword('');
      setResetOtp('');
      setNewPassword('');
      setConfirmNewPassword('');
      setOtpDispatchInfo(null);
      setResetStep('request');
      setAuthMode('login');
    } catch (err: any) {
      setError(err.message || 'OTP verification failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-12">
      {/* Left Brand Architectural Panel */}
      <div className="relative hidden lg:col-span-5 lg:flex lg:flex-col lg:justify-between bg-[#071329] text-white overflow-hidden">
        {!imgHeroFailed ? (
          <img
            src="/assets/aistudio/office_2_e582555b.png"
            alt="IDEAL Industrial Synergy Solutions corporate office building"
            referrerPolicy="no-referrer"
            onError={() => setImgHeroFailed(true)}
            className="absolute inset-0 h-full w-full object-cover opacity-75"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#061022] via-[#0F2A56] to-[#1D4ED8]" />
        )}
        <div className="relative z-10 flex flex-col justify-between h-full p-10 bg-gradient-to-t from-[#061022]/95 via-[#07162E]/45 to-[#06142A]/80">
          <div className="flex items-center gap-3.5">
            {!imgLogoFailed ? (
              <div className="rounded-xl bg-white/95 px-3.5 py-2 shadow-lg border border-white/70">
                <img
                  src="/assets/aistudio/logo_33dbe725.png"
                  alt="IDEAL Industrial Synergy Solutions Pvt. Ltd."
                  referrerPolicy="no-referrer"
                  onError={() => setImgLogoFailed(true)}
                  className="h-10 w-auto object-contain"
                />
              </div>
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-300/45 bg-[#13294B] font-display text-lg font-bold">
                IH
              </div>
            )}
            <div className="rounded-lg bg-black/35 px-3 py-1.5 backdrop-blur-xs border border-white/15">
              <p className="font-display text-sm font-bold tracking-tight text-white">IDEAL HRMS</p>
              <p className="text-[11px] font-medium text-amber-300">Workforce Suite</p>
            </div>
          </div>

          <div className="max-w-md space-y-4 rounded-2xl bg-[#061022]/70 p-6 backdrop-blur-xs border border-white/15 shadow-xl">
            <div className="h-1 w-20 rounded-full bg-gradient-to-r from-amber-400 via-emerald-400 to-sky-400" />
            <h1 className="font-display text-2xl xl:text-3xl font-semibold leading-tight text-white [text-wrap:balance]">
              IDEAL INDUSTRIAL SYNERGY SOLUTIONS PRIVATE LIMITED
            </h1>
            <p className="text-sm leading-relaxed text-slate-100">
              Unified employee onboarding, verified mobile attendance with selfie &amp; GPS coordinates, field
              tracking, Indian statutory payroll, leave workflows, and performance analytics.
            </p>
            <div className="pt-1 flex flex-wrap items-center gap-3 text-xs text-emerald-200 font-medium">
              <span>Google Sheets &amp; Apps Script Ready</span>
              <span aria-hidden="true">·</span>
              <span>Offline PWA Sync</span>
              <span aria-hidden="true">·</span>
              <span>Role-Based Security</span>
            </div>
          </div>

          <p className="text-xs text-slate-200 drop-shadow">
            © {new Date().getFullYear()} IDEAL INDUSTRIAL SYNERGY SOLUTIONS PRIVATE LIMITED
          </p>
        </div>
      </div>

      {/* Right Authentication / First-Time Initialization Panel */}
      <div className="flex min-h-screen flex-col justify-between px-4 py-5 sm:px-10 sm:py-8 lg:col-span-7 lg:px-16">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 lg:hidden">
            <div className="rounded-lg bg-white px-2.5 py-1.5 border border-slate-200 shadow-xs">
              <img
                src="/assets/aistudio/logo_33dbe725.png"
                alt="IDEAL HRMS"
                referrerPolicy="no-referrer"
                className="h-6 sm:h-7 w-auto object-contain"
              />
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => setShowGasConfig((v) => !v)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-xs hover:bg-slate-50 whitespace-nowrap"
            >
              <Globe className="h-3.5 w-3.5 text-blue-700" />
              {getGasWebAppUrl() ? 'Apps Script Connected' : 'Backend Endpoint'}
            </button>
          </div>
        </div>

        <div className="mx-auto my-auto w-full max-w-md py-5 sm:py-8">
          {showGasConfig && (
            <div className="metallic-surface mb-6 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Google Apps Script Web App Connector</h2>
                <button
                  type="button"
                  onClick={() => setShowGasConfig(false)}
                  className="text-xs font-medium text-slate-500 hover:text-slate-900"
                >
                  Close
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Leave blank to use the built-in Workspace Server, or paste your deployed Google Apps Script{' '}
                <code className="font-mono text-[11px]">/exec</code> URL to read/write directly to Google Sheets.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  type="url"
                  value={gasUrlInput}
                  onChange={(e) => setGasUrlInput(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSaveGasUrl}
                  className="metallic-btn-primary rounded-lg px-4 py-2 text-xs font-semibold whitespace-nowrap"
                >
                  Apply &amp; Test
                </button>
              </div>
              {gasTestMsg && <p className="mt-2 text-xs font-medium text-emerald-700">{gasTestMsg}</p>}
            </div>
          )}

          {needsSetup === null ? (
            <div className="metallic-surface rounded-xl p-8 text-center">
              <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-blue-700 border-t-transparent" />
              <p className="mt-3 text-sm text-slate-600">Checking workspace initialization status...</p>
            </div>
          ) : needsSetup ? (
            <div className="metallic-surface overflow-hidden rounded-2xl">
              <div className="h-1.5 w-full bg-gradient-to-r from-[#0F2B5C] via-blue-600 to-amber-500" />
              <div className="p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-700 to-indigo-800 text-white shadow-sm">
                    <UserPlus className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-xl font-semibold text-slate-900">
                      Initialize Super Admin Account
                    </h2>
                    <p className="text-xs text-slate-500">Fresh workspace · IDEAL INDUSTRIAL SYNERGY SOLUTIONS</p>
                  </div>
                </div>

                {error && (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
                    {error}
                  </div>
                )}

                <form onSubmit={handleInitSuperAdmin} className="mt-5 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Full Name</label>
                    <input
                      required
                      type="text"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      placeholder="e.g. Rajesh Kumar Sharma"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">Official Email</label>
                      <input
                        required
                        type="email"
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                        placeholder="admin@idealiss.in"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">Mobile Number</label>
                      <input
                        required
                        type="tel"
                        value={adminMobile}
                        onChange={(e) => setAdminMobile(e.target.value)}
                        placeholder="+91 98XXXXXXXX"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">Department</label>
                      <input
                        required
                        type="text"
                        value={adminDept}
                        onChange={(e) => setAdminDept(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">Designation</label>
                      <input
                        required
                        type="text"
                        value={adminDesignation}
                        onChange={(e) => setAdminDesignation(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Super Admin Password (min 8 characters)
                    </label>
                    <div className="relative mt-1">
                      <input
                        required
                        minLength={8}
                        type={showPass ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        placeholder="Create a strong password"
                        className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 pr-12 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass((v) => !v)}
                        className="absolute right-0.5 top-1/2 -translate-y-1/2 inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-slate-500 hover:text-slate-800"
                        aria-label={showPass ? 'Hide password' : 'Show password'}
                      >
                        {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="metallic-btn-primary mt-2 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    {loading ? 'Initializing Workspace...' : 'Create Super Admin & Launch HRMS'}
                  </button>
                </form>
              </div>
            </div>
          ) : authMode === 'forgot' ? (
            <div className="metallic-surface overflow-hidden rounded-2xl">
              <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-rose-500 to-blue-700" />
              <div className="p-6 sm:p-8">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setError('');
                    setOtpDispatchInfo(null);
                    setResetStep('request');
                  }}
                  className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Sign In
                </button>

                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-rose-600 text-white shadow-sm">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-xl font-semibold text-slate-900">
                      Reset Password via Admin OTP
                    </h2>
                    <p className="text-xs text-slate-600">
                      6-digit OTP is dispatched directly to your Administrator
                    </p>
                  </div>
                </div>

                {error && (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
                    {error}
                  </div>
                )}

                {otpDispatchInfo && (
                  <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50/90 px-3.5 py-3 text-xs text-amber-950">
                    <p className="font-semibold">
                      Reset Request Sent to Administrator ({otpDispatchInfo.otpId})
                    </p>
                    <p className="mt-1 text-amber-900">{otpDispatchInfo.message}</p>
                  </div>
                )}

                {resetStep === 'request' ? (
                  <form onSubmit={handleRequestOtp} className="mt-5 space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        Official Email, Employee ID, or Registered Mobile
                      </label>
                      <input
                        required
                        type="text"
                        autoComplete="username"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        value={resetIdentifier}
                        onChange={(e) => setResetIdentifier(e.target.value)}
                        placeholder="name@idealiss.in, IISS-0001, or +91 98XXXXXXXX"
                        className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="metallic-btn-gold flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                    >
                      <KeyRound className="h-4 w-4" />
                      {loading ? 'Dispatching OTP to Admin...' : 'Send 6-Digit OTP to Admin'}
                    </button>
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setError('');
                          setResetStep('verify');
                        }}
                        className="inline-flex min-h-[40px] items-center text-xs font-semibold text-blue-700 hover:underline"
                      >
                        Already received an OTP from Admin? Enter OTP
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyOtpReset} className="mt-5 space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        Official Email, Employee ID, or Registered Mobile
                      </label>
                      <input
                        required
                        type="text"
                        autoComplete="username"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        value={resetIdentifier}
                        onChange={(e) => setResetIdentifier(e.target.value)}
                        placeholder="name@idealiss.in, IISS-0001, or +91 98XXXXXXXX"
                        className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        6-Digit OTP (Received from Admin)
                      </label>
                      <input
                        required
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        value={resetOtp}
                        onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        className="mt-1 w-full min-h-[48px] rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-center font-mono text-lg font-bold tracking-[0.35em] text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        New Password (min 8 characters)
                      </label>
                      <div className="relative mt-1">
                        <input
                          required
                          minLength={8}
                          type={showPass ? 'text' : 'password'}
                          autoComplete="new-password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Create new password"
                          className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 pr-12 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPass((v) => !v)}
                          className="absolute right-0.5 top-1/2 -translate-y-1/2 inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-slate-500 hover:text-slate-800"
                          aria-label={showPass ? 'Hide password' : 'Show password'}
                        >
                          {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        Confirm New Password
                      </label>
                      <input
                        required
                        minLength={8}
                        type={showPass ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        placeholder="Re-enter new password"
                        className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="metallic-btn-emerald flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      {loading ? 'Verifying OTP...' : 'Verify OTP & Update Password'}
                    </button>
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setError('');
                          setResetStep('request');
                        }}
                        className="text-xs font-semibold text-slate-600 hover:text-slate-900 hover:underline"
                      >
                        Request a fresh OTP
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          ) : (
            <div className="metallic-surface overflow-hidden rounded-2xl">
              <div className="h-1.5 w-full bg-gradient-to-r from-[#0F2B5C] via-blue-600 to-amber-500" />
              <div className="p-6 sm:p-8">
                <div>
                  <h2 className="font-display text-2xl font-semibold text-slate-900">Sign in to IDEAL HRMS</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Sign in using your Official Email, Employee ID (e.g.{' '}
                    <span className="font-mono font-semibold text-blue-800">IISS-0001</span>), or Registered Mobile
                    Number
                  </p>
                </div>

                {successMsg && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{successMsg}</span>
                  </div>
                )}

                {error && (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
                    {error}
                  </div>
                )}

                <form onSubmit={handleLogin} className="mt-6 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Official Email, Employee ID, or Registered Mobile
                    </label>
                    <input
                      required
                      type="text"
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="next"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="name@idealiss.in, IISS-0001, or +91 98XXXXXXXX"
                      className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="block text-xs font-semibold text-slate-700">Password</label>
                      <button
                        type="button"
                        onClick={() => {
                          setResetIdentifier(identifier);
                          setError('');
                          setSuccessMsg('');
                          setAuthMode('forgot');
                          setResetStep('request');
                        }}
                        className="inline-flex min-h-[36px] items-center text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                      >
                        Forgot Password? (Admin OTP)
                      </button>
                    </div>
                    <div className="relative mt-1">
                      <input
                        required
                        type={showPass ? 'text' : 'password'}
                        autoComplete="current-password"
                        enterKeyHint="go"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 pr-12 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass((v) => !v)}
                        className="absolute right-0.5 top-1/2 -translate-y-1/2 inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-slate-500 hover:text-slate-800"
                        aria-label={showPass ? 'Hide password' : 'Show password'}
                      >
                        {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="metallic-btn-primary flex min-h-[46px] w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                  >
                    <Lock className="h-4 w-4" />
                    {loading ? 'Authenticating...' : 'Sign In'}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>

        <div className="text-center text-xs text-slate-500">
          Web-first enterprise portal · Accessible via Chrome, Safari, or mobile browser without app-store downloads.
        </div>
      </div>
    </div>
  );
}
