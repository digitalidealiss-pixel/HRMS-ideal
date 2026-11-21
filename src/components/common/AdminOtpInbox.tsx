import {Check, Copy, KeyRound, MailCheck, RefreshCw, Send, ShieldAlert, XCircle} from 'lucide-react';
import {useEffect, useState, type FormEvent} from 'react';
import {callRpc} from '../../services/apiClient';
import type {AuthUser, PasswordResetOtpRecord} from '../../types/hrms';

interface AdminOtpInboxProps {
  user: AuthUser;
  onToast: (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;
}

export function AdminOtpInbox({user, onToast}: AdminOtpInboxProps) {
  const [otps, setOtps] = useState<PasswordResetOtpRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [issueIdentifier, setIssueIdentifier] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [copiedId, setCopiedId] = useState('');
  const [nowTick, setNowTick] = useState(Date.now());

  const loadOtps = async () => {
    setLoading(true);
    try {
      const res = await callRpc<{ok: boolean; otps: PasswordResetOtpRecord[]}>('getPasswordResetOtps');
      setOtps(res.otps || []);
    } catch (err: any) {
      onToast('error', 'Failed to load OTP dispatch inbox', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOtps();
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleIssueOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (!issueIdentifier.trim()) return;
    setIssuing(true);
    try {
      const res = await callRpc<{ok: boolean; otp: PasswordResetOtpRecord}>('adminIssuePasswordResetOtp', {
        identifier: issueIdentifier.trim(),
      });
      setIssueIdentifier('');
      onToast(
        'success',
        `OTP Issued: ${res.otp.otpCode}`,
        `Share 6-digit OTP ${res.otp.otpCode} with ${res.otp.employeeName} (${res.otp.employeeId}). Valid for 10 min.`,
      );
      await loadOtps();
    } catch (err: any) {
      onToast('error', 'Unable to issue OTP', err.message);
    } finally {
      setIssuing(false);
    }
  };

  const handleRevoke = async (otpId: string) => {
    try {
      await callRpc('revokePasswordResetOtp', {otpId});
      onToast('info', 'OTP Revoked', `${otpId} can no longer be used.`);
      await loadOtps();
    } catch (err: any) {
      onToast('error', 'Revoke failed', err.message);
    }
  };

  const handleCopyOtp = async (rec: PasswordResetOtpRecord) => {
    try {
      await navigator.clipboard.writeText(rec.otpCode);
      setCopiedId(rec.otpId);
      setTimeout(() => setCopiedId(''), 2000);
      onToast('success', 'OTP Copied', `${rec.otpCode} copied for ${rec.employeeName}.`);
    } catch {
      onToast('info', 'OTP Code', rec.otpCode);
    }
  };

  const formatCountdown = (expiresAt: string) => {
    const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - nowTick) / 1000));
    const m = Math.floor(diff / 60);
    const s = diff % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const pendingCount = otps.filter(
    (o) => o.status === 'PENDING' && new Date(o.expiresAt).getTime() > nowTick,
  ).length;

  return (
    <div className="metallic-surface overflow-hidden rounded-2xl">
      <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-rose-500 to-blue-600" />
      <div className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-rose-600 text-white shadow-sm">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Password Reset OTP Dispatch Console
              </h2>
              <p className="text-xs text-slate-600">
                Receive &amp; manage 6-digit password reset OTPs requested by employees
                {user.role === 'SUPER_ADMIN' ? ' and administrators' : ''} (10-minute single-use validity)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 font-mono text-xs font-semibold text-amber-800 tabular-nums">
              {pendingCount} Active OTP{pendingCount === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              onClick={loadOtps}
              disabled={loading}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Admin Direct OTP Issuance */}
        <form onSubmit={handleIssueOtp} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 sm:flex-row sm:items-center">
          <div className="flex-1">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              Proactively Issue Reset OTP for Employee{user.role === 'SUPER_ADMIN' ? ' / Admin' : ''}
            </label>
            <input
              type="text"
              required
              value={issueIdentifier}
              onChange={(e) => setIssueIdentifier(e.target.value)}
              placeholder="Enter Employee ID (e.g. IISS-0002), Official Email, or Registered Mobile"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={issuing}
            className="metallic-btn-gold mt-auto inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold whitespace-nowrap disabled:opacity-60"
          >
            <Send className="h-3.5 w-3.5" />
            {issuing ? 'Generating...' : 'Generate 6-Digit OTP'}
          </button>
        </form>

        {/* OTP Requests Table */}
        {otps.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-8 text-center text-xs text-slate-500">
            <ShieldAlert className="mx-auto mb-2 h-6 w-6 text-slate-400" />
            No password reset OTP requests received yet. When any user clicks &ldquo;Forgot Password?&rdquo; on the
            login screen, their 6-digit OTP appears here immediately and is emailed to the configured Admin address.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="metallic-table-head">
                <tr>
                  <th className="px-4 py-2.5">Request ID</th>
                  <th className="px-4 py-2.5">Account</th>
                  <th className="px-4 py-2.5">6-Digit Numeric OTP</th>
                  <th className="px-4 py-2.5">Status &amp; Validity</th>
                  <th className="px-4 py-2.5">Dispatched To</th>
                  <th className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {otps.map((rec) => {
                  const isExpiredNow =
                    rec.status === 'PENDING' && new Date(rec.expiresAt).getTime() <= nowTick;
                  const effectiveStatus = isExpiredNow ? 'EXPIRED' : rec.status;
                  const isActive = effectiveStatus === 'PENDING';

                  return (
                    <tr key={rec.otpId} className={isActive ? 'bg-amber-50/40' : ''}>
                      <td className="px-4 py-3 font-mono font-semibold text-slate-800">{rec.otpId}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{rec.employeeName}</div>
                        <div className="font-mono text-[11px] text-slate-600">
                          {rec.employeeId} · {rec.userRole} · {rec.userEmail}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {isActive ? (
                          <div className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 px-3 py-1.5">
                            <span className="font-mono text-base font-bold tracking-[0.22em] text-[#0B1B36] tabular-nums">
                              {rec.otpCode}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyOtp(rec)}
                              className="rounded p-1 text-amber-800 hover:bg-amber-200/60"
                              title="Copy 6-digit OTP"
                            >
                              {copiedId === rec.otpId ? (
                                <Check className="h-3.5 w-3.5 text-emerald-700" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="font-mono text-slate-400 tracking-widest">••••••</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span
                            className={`font-semibold ${
                              effectiveStatus === 'PENDING'
                                ? 'text-amber-700'
                                : effectiveStatus === 'USED'
                                  ? 'text-emerald-700'
                                  : 'text-slate-500'
                            }`}
                          >
                            {effectiveStatus}
                          </span>
                          <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                            {isActive
                              ? `Expires in ${formatCountdown(rec.expiresAt)}`
                              : new Date(rec.usedAt || rec.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[11px] text-slate-600 max-w-[240px]">
                        <div className="flex items-start gap-1">
                          <MailCheck className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${rec.emailSent ? 'text-emerald-600' : 'text-blue-600'}`} />
                          <span className="break-words">{rec.dispatchedTo}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isActive && (
                          <button
                            type="button"
                            onClick={() => handleRevoke(rec.otpId)}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
