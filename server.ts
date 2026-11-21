import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type {Request, Response} from 'express';
import {createServer as createViteServer} from 'vite';

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.cwd(), 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'hrms_db.json');

fs.mkdirSync(UPLOADS_DIR, {recursive: true});

interface UserAccount {
  userId: string;
  employeeId: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  role: 'SUPER_ADMIN' | 'HR_ADMIN' | 'EMPLOYEE';
  status: 'ACTIVE' | 'INACTIVE';
  failedAttempts: number;
  lockedUntil: string;
  lastLoginAt: string;
  createdAt: string;
}

interface LoginSession {
  sessionId: string;
  userId: string;
  employeeId: string;
  role: 'SUPER_ADMIN' | 'HR_ADMIN' | 'EMPLOYEE';
  tokenHash: string;
  expiresAt: string;
  loginAt: string;
  status: 'ACTIVE' | 'LOGGED_OUT' | 'EXPIRED';
  userAgent: string;
}

interface PasswordResetOtpDbRecord {
  otpId: string;
  userId: string;
  employeeId: string;
  employeeName: string;
  userEmail: string;
  userRole: 'SUPER_ADMIN' | 'HR_ADMIN' | 'EMPLOYEE';
  otpCode: string; // '******' once used/expired/revoked
  otpHash: string;
  otpSalt: string;
  status: 'PENDING' | 'USED' | 'EXPIRED' | 'REVOKED';
  attempts: number;
  dispatchedTo: string;
  emailSent: boolean;
  expiresAt: string;
  createdAt: string;
  usedAt?: string;
}

interface DatabaseSchema {
  hmacSecret: string;
  employees: any[];
  users: UserAccount[];
  departments: any[];
  designations: any[];
  attendance: any[];
  attendanceLocationHistory: any[];
  liveLocation: any[];
  leaveTypes: any[];
  leaveApplications: any[];
  leaveBalances: any[];
  holidays: any[];
  salaryStructure: any[];
  payroll: any[];
  payslips: any[];
  performanceReviews: any[];
  performanceKpis: any[];
  tasks: any[];
  notifications: any[];
  documents: any[];
  auditLogs: any[];
  appSettings: Record<string, any>;
  loginHistory: LoginSession[];
  syncQueue: any[];
  passwordResetOtps: PasswordResetOtpDbRecord[];
  travelConveyance: any[];
  foodAllowances: any[];
}

function getDefaultDepartments() {
  const now = new Date().toISOString();
  return [
    {departmentId: 'DEPT-EXEC', name: 'Executive & Administration', code: 'EXEC', headEmployeeId: '', createdAt: now},
    {departmentId: 'DEPT-HR', name: 'Human Resources', code: 'HR', headEmployeeId: '', createdAt: now},
    {departmentId: 'DEPT-OPS', name: 'Operations & Field Services', code: 'OPS', headEmployeeId: '', createdAt: now},
    {departmentId: 'DEPT-ENG', name: 'Engineering & Projects', code: 'ENG', headEmployeeId: '', createdAt: now},
    {departmentId: 'DEPT-FIN', name: 'Finance & Accounts', code: 'FIN', headEmployeeId: '', createdAt: now},
    {departmentId: 'DEPT-SALES', name: 'Sales & Business Development', code: 'SALES', headEmployeeId: '', createdAt: now},
  ];
}

function getDefaultDesignations() {
  return [
    {designationId: 'DES-MD', title: 'Managing Director', department: 'Executive & Administration', level: 'L1', status: 'ACTIVE'},
    {designationId: 'DES-ED', title: 'Executive Director', department: 'Executive & Administration', level: 'L1', status: 'ACTIVE'},
    {designationId: 'DES-HRM', title: 'HR Manager', department: 'Human Resources', level: 'L2', status: 'ACTIVE'},
    {designationId: 'DES-HRE', title: 'HR Executive', department: 'Human Resources', level: 'L3', status: 'ACTIVE'},
    {designationId: 'DES-OPM', title: 'Operations Manager', department: 'Operations & Field Services', level: 'L2', status: 'ACTIVE'},
    {designationId: 'DES-PE', title: 'Project Engineer', department: 'Engineering & Projects', level: 'L3', status: 'ACTIVE'},
    {designationId: 'DES-SE', title: 'Site Engineer', department: 'Operations & Field Services', level: 'L3', status: 'ACTIVE'},
    {designationId: 'DES-FE', title: 'Field Executive', department: 'Operations & Field Services', level: 'L4', status: 'ACTIVE'},
    {designationId: 'DES-ACC', title: 'Accounts Executive', department: 'Finance & Accounts', level: 'L3', status: 'ACTIVE'},
    {designationId: 'DES-TECH', title: 'Technician', department: 'Operations & Field Services', level: 'L4', status: 'ACTIVE'},
  ];
}

function createInitialDb(): DatabaseSchema {
  return {
    hmacSecret: crypto.randomBytes(32).toString('hex'),
    employees: [],
    users: [],
    departments: getDefaultDepartments(),
    designations: getDefaultDesignations(),
    attendance: [],
    attendanceLocationHistory: [],
    liveLocation: [],
    leaveTypes: [
      {leaveTypeId: 'LT-CL', name: 'Casual Leave', code: 'CL', annualQuota: 12, isPaid: true, requiresDocument: false},
      {leaveTypeId: 'LT-SL', name: 'Sick Leave', code: 'SL', annualQuota: 8, isPaid: true, requiresDocument: true},
      {leaveTypeId: 'LT-EL', name: 'Earned Leave', code: 'EL', annualQuota: 15, isPaid: true, requiresDocument: false},
      {leaveTypeId: 'LT-PL', name: 'Privilege Leave', code: 'PL', annualQuota: 10, isPaid: true, requiresDocument: false},
      {leaveTypeId: 'LT-UL', name: 'Unpaid Leave', code: 'LWP', annualQuota: 365, isPaid: false, requiresDocument: false},
      {leaveTypeId: 'LT-CO', name: 'Compensatory Off', code: 'CO', annualQuota: 6, isPaid: true, requiresDocument: false},
    ],
    leaveApplications: [],
    leaveBalances: [],
    holidays: [],
    salaryStructure: [],
    payroll: [],
    payslips: [],
    performanceReviews: [],
    performanceKpis: [],
    tasks: [],
    notifications: [],
    documents: [],
    auditLogs: [],
    appSettings: {
      companyName: 'IDEAL INDUSTRIAL SYNERGY SOLUTIONS PRIVATE LIMITED',
      companyCode: 'IISS',
      shiftStartTime: '09:30',
      shiftEndTime: '18:30',
      lateGraceMinutes: 15,
      halfDayThresholdHours: 4.5,
      overtimeEnabled: true,
      overtimeAfterHours: 9,
      overtimeRateMode: 'BASIC_PERCENT_PER_HOUR',
      overtimeBasicPercentPerHour: 1.5,
      conveyanceBikeRatePerKm: 4.5,
      conveyanceCarRatePerKm: 14,
      foodAllowanceEnabled: true,
      foodBreakfastAmount: 70,
      foodLunchAmount: 90,
      foodDinnerAmount: 90,
      requireCheckoutSelfie: true,
      locationStaleMinutes: 5,
      weeklyOffDay: 'Sunday',
      adminRecoveryEmail: '',
      otpWebhookUrl: '',
      gasWebAppUrl: '',
    },
    loginHistory: [],
    syncQueue: [],
    passwordResetOtps: [],
    travelConveyance: [],
    foodAllowances: [],
  };
}

function getOvertimePolicy(db: DatabaseSchema) {
  const afterRaw = Number(db.appSettings?.overtimeAfterHours ?? 9);
  const pctRaw = Number(db.appSettings?.overtimeBasicPercentPerHour ?? 1.5);
  return {
    enabled: db.appSettings?.overtimeEnabled !== false,
    afterHours: Number.isFinite(afterRaw) && afterRaw > 0 ? afterRaw : 9,
    rateMode: (db.appSettings?.overtimeRateMode === 'FIXED_HOURLY_RATE'
      ? 'FIXED_HOURLY_RATE'
      : 'BASIC_PERCENT_PER_HOUR') as 'BASIC_PERCENT_PER_HOUR' | 'FIXED_HOURLY_RATE',
    basicPercentPerHour: Number.isFinite(pctRaw) && pctRaw >= 0 ? pctRaw : 1.5,
  };
}

function getOvertimeThresholdHours(db: DatabaseSchema): number {
  return getOvertimePolicy(db).afterHours;
}

function computeDutyAndOvertime(checkInIso: string, checkOutIso: string, dutyHoursThreshold = 9) {
  const inMs = new Date(checkInIso).getTime();
  let outMs = new Date(checkOutIso).getTime();
  if (!Number.isFinite(inMs) || !Number.isFinite(outMs)) {
    return {workingHours: 0, overtimeHours: 0};
  }
  if (outMs < inMs && outMs + 86400000 - inMs <= 86400000) {
    outMs += 86400000;
  }
  const workingHours = Math.round(Math.max(0, (outMs - inMs) / 3600000) * 100) / 100;
  const overtimeHours = workingHours > dutyHoursThreshold
    ? Math.round((workingHours - dutyHoursThreshold) * 100) / 100
    : 0;
  return {workingHours, overtimeHours};
}

function loadDb(): DatabaseSchema {
  if (!fs.existsSync(DB_FILE)) {
    const fresh = createInitialDb();
    saveDb(fresh);
    return fresh;
  }
  const raw = fs.readFileSync(DB_FILE, 'utf-8');
  const parsed = JSON.parse(raw) as DatabaseSchema;
  let dirty = false;
  if (!Array.isArray(parsed.passwordResetOtps)) {
    parsed.passwordResetOtps = [];
    dirty = true;
  }
  if (!Array.isArray(parsed.departments) || parsed.departments.length === 0) {
    parsed.departments = getDefaultDepartments();
    dirty = true;
  }
  if (!Array.isArray(parsed.designations) || parsed.designations.length === 0) {
    parsed.designations = getDefaultDesignations();
    dirty = true;
  }
  if (!parsed.appSettings) {
    parsed.appSettings = createInitialDb().appSettings;
    dirty = true;
  }
  if (!parsed.appSettings.overtimeAfterHours) {
    parsed.appSettings.overtimeAfterHours = 9;
    dirty = true;
  }
  if (parsed.appSettings.overtimeEnabled === undefined) {
    parsed.appSettings.overtimeEnabled = true;
    dirty = true;
  }
  if (!parsed.appSettings.overtimeRateMode) {
    parsed.appSettings.overtimeRateMode = 'BASIC_PERCENT_PER_HOUR';
    dirty = true;
  }
  if (parsed.appSettings.overtimeBasicPercentPerHour === undefined) {
    parsed.appSettings.overtimeBasicPercentPerHour = 1.5;
    dirty = true;
  }
  if (parsed.appSettings.conveyanceBikeRatePerKm === undefined) {
    parsed.appSettings.conveyanceBikeRatePerKm = 4.5;
    dirty = true;
  }
  if (parsed.appSettings.conveyanceCarRatePerKm === undefined) {
    parsed.appSettings.conveyanceCarRatePerKm = 14;
    dirty = true;
  }
  if (parsed.appSettings.foodAllowanceEnabled === undefined) {
    parsed.appSettings.foodAllowanceEnabled = true;
    dirty = true;
  }
  if (parsed.appSettings.foodBreakfastAmount === undefined) {
    parsed.appSettings.foodBreakfastAmount = 70;
    dirty = true;
  }
  if (parsed.appSettings.foodLunchAmount === undefined) {
    parsed.appSettings.foodLunchAmount = 90;
    dirty = true;
  }
  if (parsed.appSettings.foodDinnerAmount === undefined) {
    parsed.appSettings.foodDinnerAmount = 90;
    dirty = true;
  }
  if (!Array.isArray(parsed.travelConveyance)) {
    parsed.travelConveyance = [];
    dirty = true;
  }
  if (!Array.isArray(parsed.foodAllowances)) {
    parsed.foodAllowances = [];
    dirty = true;
  }
  if (dirty) saveDb(parsed);
  return parsed;
}

function saveDb(db: DatabaseSchema): void {
  const temp = DB_FILE + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(temp, DB_FILE);
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password: string, salt: string, storedHash: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const target = Buffer.from(storedHash, 'hex');
  if (derived.length !== target.length) return false;
  return crypto.timingSafeEqual(derived, target);
}

function signToken(raw: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(raw).digest('hex');
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function normalizePhoneDigits(raw: unknown): string {
  return String(raw || '').replace(/\D/g, '');
}

function isMobileMatch(storedMobile: unknown, inputRaw: string): boolean {
  const trimmed = String(inputRaw || '').trim();
  if (!trimmed || trimmed.includes('@') || /[a-zA-Z]/.test(trimmed)) {
    return false;
  }
  const inputDigits = normalizePhoneDigits(trimmed);
  const storedDigits = normalizePhoneDigits(storedMobile);
  if (inputDigits.length < 7 || storedDigits.length < 7) {
    return false;
  }
  if (storedDigits === inputDigits) {
    return true;
  }
  return storedDigits.length >= 10 && inputDigits.length >= 10 && storedDigits.slice(-10) === inputDigits.slice(-10);
}

function findUserByIdentifier(db: DatabaseSchema, rawIdentifier: unknown): UserAccount | undefined {
  const trimmed = String(rawIdentifier || '').trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLowerCase();

  const direct = db.users.find(
    (u) => u.email.toLowerCase() === lower || u.employeeId.toLowerCase() === lower,
  );
  if (direct) return direct;

  if (!trimmed.includes('@') && !/[a-zA-Z]/.test(trimmed)) {
    const inputDigits = normalizePhoneDigits(trimmed);
    if (inputDigits.length >= 7) {
      const matchedEmpIds = new Set(
        db.employees
          .filter((e) => isMobileMatch(e.mobile, trimmed))
          .map((e) => e.employeeId),
      );
      const mobileUsers = db.users.filter(
        (u) => matchedEmpIds.has(u.employeeId) || isMobileMatch((u as any).mobile, trimmed),
      );
      if (mobileUsers.length > 1) {
        throw new Error(
          'Multiple accounts share this mobile number. Please sign in with your Official Email or Employee ID.',
        );
      }
      if (mobileUsers.length === 1) {
        return mobileUsers[0];
      }
    }
  }

  return undefined;
}

function saveBase64File(prefix: string, fileName: string, dataUrl?: string): string {
  if (!dataUrl || typeof dataUrl !== 'string') return '';
  if (!dataUrl.startsWith('data:')) return dataUrl;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return '';
  const safeName = `${prefix}_${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const fullPath = path.join(UPLOADS_DIR, safeName);
  fs.writeFileSync(fullPath, Buffer.from(match[2], 'base64'));
  return `/api/uploads/${safeName}`;
}

function appendAudit(db: DatabaseSchema, actor: any, action: string, moduleName: string, targetId: string, details: string) {
  db.auditLogs.push({
    logId: `LOG-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
    timestamp: new Date().toISOString(),
    actorUserId: actor ? actor.userId : 'SYSTEM',
    actorName: actor ? actor.fullName : 'System',
    actorRole: actor ? actor.role : 'SUPER_ADMIN',
    action,
    module: moduleName,
    targetId,
    details,
  });
}

function appendNotification(db: DatabaseSchema, recipientEmployeeId: string, category: string, title: string, message: string) {
  db.notifications.push({
    notificationId: `NTF-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
    recipientEmployeeId,
    category,
    title,
    message,
    isRead: false,
    createdAt: new Date().toISOString(),
  });
}

const processedTransactions = new Map<string, number>();
const geocodeCache = new Map<string, {address: string; placeId: string; cachedAt: number}>();

function getGoogleMapsServerKey(): string {
  return (process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
}

function buildMapsUrl(lat: number, lng: number, placeId?: string): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return '';
  const base = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
  return placeId ? `${base}&query_place_id=${encodeURIComponent(placeId)}` : base;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

async function reverseGeocodeCoords(
  lat: number | null | undefined,
  lng: number | null | undefined,
): Promise<{address: string; placeId: string; quotaExceeded?: boolean}> {
  if (lat == null || lng == null) return {address: '', placeId: ''};
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (!Number.isFinite(numLat) || !Number.isFinite(numLng) || (numLat === 0 && numLng === 0)) {
    return {address: '', placeId: ''};
  }

  const cacheKey = `${numLat.toFixed(5)},${numLng.toFixed(5)}`;
  const cached = geocodeCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < 15 * 60000) {
    return {address: cached.address, placeId: cached.placeId};
  }

  const apiKey = getGoogleMapsServerKey();
  if (!apiKey) return {address: '', placeId: ''};

  try {
    const v4Url = new URL('https://geocode.googleapis.com/v4/geocode/location');
    v4Url.searchParams.set('location.latitude', String(numLat));
    v4Url.searchParams.set('location.longitude', String(numLng));
    v4Url.searchParams.set('languageCode', 'en');
    v4Url.searchParams.set('regionCode', 'IN');

    const v4Res = await fetch(v4Url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'results.placeId,results.formattedAddress,plusCode',
        'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
      },
    });

    if (v4Res.status === 429) {
      return {address: '', placeId: '', quotaExceeded: true};
    }

    const v4Data: any = await v4Res.json().catch(() => ({}));
    if (v4Data?.error?.status === 'RESOURCE_EXHAUSTED') {
      return {address: '', placeId: '', quotaExceeded: true};
    }

    if (v4Res.ok && Array.isArray(v4Data?.results) && v4Data.results.length > 0) {
      const top = v4Data.results[0];
      const address = String(top.formattedAddress || '');
      const placeId = String(top.placeId || '');
      if (address) {
        geocodeCache.set(cacheKey, {address, placeId, cachedAt: Date.now()});
        return {address, placeId};
      }
    }

    // Fallback to standard Geocoding JSON endpoint if v4 route is unavailable
    const legacyUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    legacyUrl.searchParams.set('latlng', `${numLat},${numLng}`);
    legacyUrl.searchParams.set('language', 'en');
    legacyUrl.searchParams.set('region', 'in');
    legacyUrl.searchParams.set('key', apiKey);

    const legRes = await fetch(legacyUrl.toString(), {
      headers: {'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio'},
    });
    if (legRes.status === 429) {
      return {address: '', placeId: '', quotaExceeded: true};
    }
    const legData: any = await legRes.json().catch(() => ({}));
    if (legData?.status === 'OVER_QUERY_LIMIT' || legData?.status === 'OVER_DAILY_LIMIT') {
      return {address: '', placeId: '', quotaExceeded: true};
    }
    if (legData?.status === 'OK' && Array.isArray(legData?.results) && legData.results.length > 0) {
      const top = legData.results[0];
      const address = String(top.formatted_address || '');
      const placeId = String(top.place_id || '');
      if (address) {
        geocodeCache.set(cacheKey, {address, placeId, cachedAt: Date.now()});
      }
      return {address, placeId};
    }
  } catch (err) {
    console.warn('[IDEAL HRMS] Reverse geocode lookup skipped:', (err as Error)?.message || err);
  }

  return {address: '', placeId: ''};
}

function getConveyanceRates(db: DatabaseSchema) {
  const bikeRaw = Number(db.appSettings?.conveyanceBikeRatePerKm ?? 4.5);
  const carRaw = Number(db.appSettings?.conveyanceCarRatePerKm ?? 14);
  return {
    bike: Number.isFinite(bikeRaw) && bikeRaw >= 0 ? Math.round(bikeRaw * 100) / 100 : 4.5,
    car: Number.isFinite(carRaw) && carRaw >= 0 ? Math.round(carRaw * 100) / 100 : 14,
  };
}

function normalizeVehicleType(raw: unknown): 'BIKE' | 'CAR' {
  return String(raw || '').toUpperCase() === 'CAR' ? 'CAR' : 'BIKE';
}

function getConveyanceRateForVehicle(db: DatabaseSchema, vehicleType: 'BIKE' | 'CAR'): number {
  const rates = getConveyanceRates(db);
  return vehicleType === 'CAR' ? rates.car : rates.bike;
}

function getFoodAllowancePolicy(db: DatabaseSchema) {
  const bRaw = Number(db.appSettings?.foodBreakfastAmount ?? 70);
  const lRaw = Number(db.appSettings?.foodLunchAmount ?? 90);
  const dRaw = Number(db.appSettings?.foodDinnerAmount ?? 90);
  return {
    enabled: db.appSettings?.foodAllowanceEnabled !== false,
    breakfast: Number.isFinite(bRaw) && bRaw >= 0 ? Math.round(bRaw * 100) / 100 : 70,
    lunch: Number.isFinite(lRaw) && lRaw >= 0 ? Math.round(lRaw * 100) / 100 : 90,
    dinner: Number.isFinite(dRaw) && dRaw >= 0 ? Math.round(dRaw * 100) / 100 : 90,
  };
}

function evaluateFoodWorkingHoursEligibility(db: DatabaseSchema, employeeId: string, nowDate = new Date()) {
  const nowMs = nowDate.getTime();
  const todayStr = nowDate.toISOString().slice(0, 10);
  let att = db.attendance.find((a) => a.employeeId === employeeId && a.date === todayStr);
  if (!att || !att.checkInTime) {
    const openShift = db.attendance
      .filter((a) => a.employeeId === employeeId && a.checkInTime && !a.checkOutTime)
      .sort((a, b) => String(b.checkInTime).localeCompare(String(a.checkInTime)))
      .find((a) => {
        const startMs = new Date(a.checkInTime).getTime();
        return Number.isFinite(startMs) && nowMs >= startMs && nowMs - startMs <= 24 * 3600000;
      });
    if (openShift) att = openShift;
  }

  if (!att || !att.checkInTime) {
    return {
      eligible: false,
      reason: 'Food allowance is applicable during active working hours only. Complete Attendance Check-In first.',
      date: todayStr,
      attendanceId: att?.attendanceId || '',
      checkInTime: '',
      checkOutTime: '',
      attendanceStatus: att?.status || 'NOT_CHECKED_IN',
    };
  }

  const stUpper = String(att.status || '').toUpperCase();
  if (['ABSENT', 'ON_LEAVE', 'WEEKLY_OFF', 'HOLIDAY'].includes(stUpper)) {
    return {
      eligible: false,
      reason: `Attendance status is ${stUpper}. Food allowance applies during active working hours only.`,
      date: att.date || todayStr,
      attendanceId: att.attendanceId || '',
      checkInTime: att.checkInTime || '',
      checkOutTime: att.checkOutTime || '',
      attendanceStatus: stUpper,
    };
  }

  const inMs = new Date(att.checkInTime).getTime();
  if (!Number.isFinite(inMs) || nowMs < inMs) {
    return {
      eligible: false,
      reason: 'Current server time is outside your recorded working hours.',
      date: att.date || todayStr,
      attendanceId: att.attendanceId || '',
      checkInTime: att.checkInTime || '',
      checkOutTime: att.checkOutTime || '',
      attendanceStatus: stUpper || 'PRESENT',
    };
  }

  if (att.checkOutTime) {
    let outMs = new Date(att.checkOutTime).getTime();
    if (Number.isFinite(outMs)) {
      if (outMs < inMs && outMs + 86400000 - inMs <= 86400000) {
        outMs += 86400000;
      }
      if (nowMs > outMs) {
        return {
          eligible: false,
          reason: 'Your working hours have ended (Checked Out). Food allowance is applicable during working hours only.',
          date: att.date || todayStr,
          attendanceId: att.attendanceId || '',
          checkInTime: att.checkInTime || '',
          checkOutTime: att.checkOutTime || '',
          attendanceStatus: stUpper || 'PRESENT',
        };
      }
    }
  } else if (nowMs - inMs > 24 * 3600000) {
    return {
      eligible: false,
      reason: 'Shift exceeded 24 hours without Check-Out. Regularize attendance before claiming food allowance.',
      date: att.date || todayStr,
      attendanceId: att.attendanceId || '',
      checkInTime: att.checkInTime || '',
      checkOutTime: '',
      attendanceStatus: stUpper || 'PRESENT',
    };
  }

  return {
    eligible: true,
    reason: 'Active working hours verified (Checked In). Eligible to claim meals during duty.',
    date: att.date || todayStr,
    attendanceId: att.attendanceId || '',
    checkInTime: att.checkInTime || '',
    checkOutTime: att.checkOutTime || '',
    attendanceStatus: stUpper || 'PRESENT',
  };
}

function formatRouteDuration(durationStr: unknown): string {
  const secs = Number(String(durationStr || '').replace(/s$/i, ''));
  if (!Number.isFinite(secs) || secs <= 0) return '';
  const totalMins = Math.max(1, Math.round(secs / 60));
  if (totalMins < 60) return `${totalMins} min`;
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins > 0 ? `${hrs} hr ${mins} min` : `${hrs} hr`;
}

function computeGpsTrailKm(points: Array<{latitude: number; longitude: number}>): number {
  let meters = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (
      Number.isFinite(Number(a.latitude)) &&
      Number.isFinite(Number(a.longitude)) &&
      Number.isFinite(Number(b.latitude)) &&
      Number.isFinite(Number(b.longitude))
    ) {
      meters += haversineMeters(Number(a.latitude), Number(a.longitude), Number(b.latitude), Number(b.longitude));
    }
  }
  return Math.round((meters / 1000) * 100) / 100;
}

async function geocodeAddressText(
  addressText: string,
): Promise<{lat: number; lng: number; address: string; placeId: string; quotaExceeded?: boolean} | null> {
  const query = String(addressText || '').trim();
  if (!query) return null;
  const apiKey = getGoogleMapsServerKey();
  if (!apiKey) return null;
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', query);
    url.searchParams.set('language', 'en');
    url.searchParams.set('region', 'in');
    url.searchParams.set('key', apiKey);
    const res = await fetch(url.toString(), {
      headers: {'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio'},
    });
    if (res.status === 429) {
      return {lat: 0, lng: 0, address: '', placeId: '', quotaExceeded: true};
    }
    const data: any = await res.json().catch(() => ({}));
    if (data?.status === 'OVER_QUERY_LIMIT' || data?.status === 'OVER_DAILY_LIMIT') {
      return {lat: 0, lng: 0, address: '', placeId: '', quotaExceeded: true};
    }
    if (data?.status === 'OK' && Array.isArray(data.results) && data.results.length > 0) {
      const top = data.results[0];
      const loc = top.geometry?.location;
      if (loc && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng))) {
        return {
          lat: Number(loc.lat),
          lng: Number(loc.lng),
          address: String(top.formatted_address || query),
          placeId: String(top.place_id || ''),
        };
      }
    }
  } catch (err) {
    console.warn('[IDEAL HRMS] Forward geocode skipped:', (err as Error)?.message || err);
  }
  return null;
}

async function computeGoogleTravelRoute(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  vehicleType: 'BIKE' | 'CAR',
): Promise<{
  googleRouteDistanceKm: number;
  routeDurationText: string;
  routePolyline: string;
  quotaExceeded?: boolean;
}> {
  if (
    !Number.isFinite(fromLat) ||
    !Number.isFinite(fromLng) ||
    !Number.isFinite(toLat) ||
    !Number.isFinite(toLng) ||
    (fromLat === toLat && fromLng === toLng)
  ) {
    return {googleRouteDistanceKm: 0, routeDurationText: '', routePolyline: ''};
  }

  const apiKey = getGoogleMapsServerKey();
  if (!apiKey) {
    return {googleRouteDistanceKm: 0, routeDurationText: '', routePolyline: ''};
  }

  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
        'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
      },
      body: JSON.stringify({
        origin: {
          location: {
            latLng: {latitude: fromLat, longitude: fromLng},
          },
        },
        destination: {
          location: {
            latLng: {latitude: toLat, longitude: toLng},
          },
        },
        travelMode: vehicleType === 'BIKE' ? 'TWO_WHEELER' : 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        computeAlternativeRoutes: false,
        languageCode: 'en',
        units: 'METRIC',
      }),
    });

    if (res.status === 429) {
      return {googleRouteDistanceKm: 0, routeDurationText: '', routePolyline: '', quotaExceeded: true};
    }

    const data: any = await res.json().catch(() => ({}));
    if (data?.error?.status === 'RESOURCE_EXHAUSTED') {
      return {googleRouteDistanceKm: 0, routeDurationText: '', routePolyline: '', quotaExceeded: true};
    }

    if (res.ok && Array.isArray(data?.routes) && data.routes.length > 0) {
      const route = data.routes[0];
      const meters = Number(route.distanceMeters || 0);
      return {
        googleRouteDistanceKm: Math.round((meters / 1000) * 100) / 100,
        routeDurationText: formatRouteDuration(route.duration),
        routePolyline: String(route.polyline?.encodedPolyline || ''),
      };
    }
  } catch (err) {
    console.warn('[IDEAL HRMS] Google Routes API lookup skipped:', (err as Error)?.message || err);
  }

  return {googleRouteDistanceKm: 0, routeDurationText: '', routePolyline: ''};
}

function authenticate(db: DatabaseSchema, token: string, userAgent = 'WebApp') {
  if (!token) throw new Error('UNAUTHORIZED: Missing session token.');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('UNAUTHORIZED: Malformed session token.');
  const raw = `${parts[0]}.${parts[1]}`;
  const expectedSig = signToken(raw, db.hmacSecret);
  if (expectedSig !== parts[2]) throw new Error('UNAUTHORIZED: Invalid token signature.');

  const tHash = hashToken(token);
  const session = db.loginHistory.find((s) => s.sessionId === parts[0] && s.tokenHash === tHash);
  if (!session || session.status !== 'ACTIVE') throw new Error('UNAUTHORIZED: Session expired or revoked.');
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    session.status = 'EXPIRED';
    saveDb(db);
    throw new Error('UNAUTHORIZED: Session expired. Please sign in again.');
  }

  const user = db.users.find((u) => u.userId === session.userId);
  if (!user || user.status !== 'ACTIVE') throw new Error('FORBIDDEN: Account inactive.');
  const emp = db.employees.find((e) => e.employeeId === user.employeeId);

  return {
    sessionId: session.sessionId,
    userId: user.userId,
    employeeId: user.employeeId,
    email: user.email,
    role: user.role,
    fullName: emp?.fullName || user.email,
    department: emp?.department || '',
    designation: emp?.designation || '',
    profilePhotoUrl: emp?.profilePhotoUrl || '',
    isFieldEmployee: Boolean(emp?.isFieldEmployee),
    userAgent,
  };
}

function requireRole(authUser: {role: string}, allowed: string[]) {
  if (!allowed.includes(authUser.role)) {
    throw new Error(`FORBIDDEN: Role ${authUser.role} lacks permission for this action.`);
  }
}

function expireStaleOtps(db: DatabaseSchema): boolean {
  let changed = false;
  const now = Date.now();
  for (const item of db.passwordResetOtps) {
    if (item.status === 'PENDING' && new Date(item.expiresAt).getTime() <= now) {
      item.status = 'EXPIRED';
      item.otpCode = '******';
      changed = true;
    }
  }
  return changed;
}

function createAndDispatchPasswordResetOtp(
  db: DatabaseSchema,
  targetUser: UserAccount,
  initiatedByActor?: any,
): {record: PasswordResetOtpDbRecord; maskedRecipients: string} {
  expireStaleOtps(db);

  // Revoke any prior pending OTPs for the same user
  for (const existing of db.passwordResetOtps) {
    if (existing.userId === targetUser.userId && existing.status === 'PENDING') {
      existing.status = 'REVOKED';
      existing.otpCode = '******';
    }
  }

  const emp = db.employees.find((e) => e.employeeId === targetUser.employeeId);
  const fullName = emp?.fullName || targetUser.email;
  const otpPlain = String(crypto.randomInt(100000, 1000000));
  const otpSalt = crypto.randomBytes(16).toString('hex');
  const otpHash = hashPassword(otpPlain, otpSalt);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60000).toISOString();
  const otpId = `REQ-${crypto.randomInt(100000, 1000000)}`;

  // Determine eligible Admins who receive this OTP:
  // - EMPLOYEE reset -> SUPER_ADMIN and HR_ADMIN
  // - HR_ADMIN / SUPER_ADMIN reset -> SUPER_ADMIN only
  const adminUsers = db.users.filter(
    (u) =>
      u.status === 'ACTIVE' &&
      (targetUser.role === 'EMPLOYEE' ? u.role === 'SUPER_ADMIN' || u.role === 'HR_ADMIN' : u.role === 'SUPER_ADMIN'),
  );

  const recoveryEmail = String(db.appSettings.adminRecoveryEmail || '').trim();
  const recipientEmails = Array.from(
    new Set([
      ...adminUsers.map((a) => a.email),
      ...(recoveryEmail ? [recoveryEmail] : []),
    ]),
  );

  const maskEmail = (e: string) => {
    const [local, dom] = e.split('@');
    if (!dom) return '***';
    return `${local.slice(0, 2)}***@${dom}`;
  };
  const maskedRecipients = recipientEmails.map(maskEmail).join(', ') || 'Administrator Console';
  const dispatchedTo =
    recipientEmails.length > 0
      ? `Admin OTP Console & ${recipientEmails.join(', ')}`
      : 'Admin OTP Console';

  const record: PasswordResetOtpDbRecord = {
    otpId,
    userId: targetUser.userId,
    employeeId: targetUser.employeeId,
    employeeName: fullName,
    userEmail: targetUser.email,
    userRole: targetUser.role,
    otpCode: otpPlain,
    otpHash,
    otpSalt,
    status: 'PENDING',
    attempts: 0,
    dispatchedTo,
    emailSent: Boolean(db.appSettings.otpWebhookUrl),
    expiresAt,
    createdAt: now.toISOString(),
  };

  db.passwordResetOtps.push(record);

  // Notify every eligible Admin inside HRMS Notifications with the 6-digit numeric OTP
  for (const admin of adminUsers) {
    appendNotification(
      db,
      admin.employeeId,
      'SECURITY',
      `Password Reset OTP: ${otpPlain} (${targetUser.employeeId})`,
      `6-Digit Numeric OTP: ${otpPlain} — ${fullName} (${targetUser.role}) requested a password reset. Share this 6-digit number only (valid 10 min · Request ${otpId}).`,
    );
  }

  appendAudit(
    db,
    initiatedByActor || {userId: targetUser.userId, fullName, role: targetUser.role},
    'REQUEST_PASSWORD_RESET_OTP',
    'AUTH',
    targetUser.employeeId,
    `OTP ${otpId} dispatched to ${dispatchedTo}`,
  );

  // Optional webhook relay for external email/SMS delivery
  const webhookUrl = String(db.appSettings.otpWebhookUrl || '').trim();
  if (webhookUrl) {
    fetch(webhookUrl, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        event: 'PASSWORD_RESET_OTP',
        company: db.appSettings.companyName,
        otpId,
        employeeId: targetUser.employeeId,
        employeeName: fullName,
        userEmail: targetUser.email,
        userRole: targetUser.role,
        otpCode: otpPlain,
        expiresAt,
        adminEmails: recipientEmails,
      }),
    }).catch(() => {});
  }

  console.info(
    `[IDEAL HRMS OTP DISPATCH] Request=${otpId} User=${targetUser.employeeId} (${targetUser.role}) Expires=${expiresAt} Recipients=${dispatchedTo}`,
  );

  return {record, maskedRecipients};
}

async function checkInEmployee(db: DatabaseSchema, authUser: any, payload: any) {
  const dateStr = (payload.deviceTimestamp || new Date().toISOString()).slice(0, 10);
  const existing = db.attendance.find((a) => a.employeeId === authUser.employeeId && a.date === dateStr);
  if (existing && existing.checkInTime) {
    throw new Error(`Duplicate check-in prevented for ${dateStr}`);
  }
  const attType = payload.attendanceType || (authUser.isFieldEmployee ? 'FIELD' : 'OFFICE');
  const latNum = payload.latitude != null && payload.latitude !== '' ? Number(payload.latitude) : NaN;
  const lngNum = payload.longitude != null && payload.longitude !== '' ? Number(payload.longitude) : NaN;
  const hasCoords = Number.isFinite(latNum) && Number.isFinite(lngNum) && !(latNum === 0 && lngNum === 0);
  if ((attType === 'FIELD' || authUser.isFieldEmployee) && !hasCoords) {
    throw new Error('Mandatory GPS location is required for field attendance Check-In. Keep device Location ON.');
  }

  const nowIso = payload.isOfflineSync ? payload.deviceTimestamp : new Date().toISOString();
  const selfieUrl = payload.selfieDataUrl
    ? saveBase64File(`${authUser.employeeId}_${dateStr}_IN`, 'selfie.jpg', payload.selfieDataUrl)
    : '';
  const shiftStart = db.appSettings.shiftStartTime || '09:30';
  const grace = Number(db.appSettings.lateGraceMinutes || 15);
  const checkInDate = new Date(nowIso);
  const [hh, mm] = shiftStart.split(':').map(Number);
  const cutoff = new Date(checkInDate);
  cutoff.setHours(hh, mm + grace, 0, 0);
  const status = checkInDate.getTime() > cutoff.getTime() ? 'LATE' : 'PRESENT';

  let resolvedAddress = String(payload.address || '').trim();
  let resolvedPlaceId = String(payload.placeId || '').trim();
  if (!resolvedAddress && hasCoords) {
    const geo = await reverseGeocodeCoords(latNum, lngNum);
    resolvedAddress = geo.address;
    resolvedPlaceId = geo.placeId;
  }

  const record = {
    attendanceId: `ATT-${authUser.employeeId}-${dateStr}`,
    employeeId: authUser.employeeId,
    employeeName: authUser.fullName,
    department: authUser.department,
    date: dateStr,
    checkInTime: nowIso,
    checkInLat: hasCoords ? latNum : null,
    checkInLng: hasCoords ? lngNum : null,
    checkInAccuracy: payload.accuracy ?? null,
    checkInAddress: resolvedAddress,
    checkInPlaceId: resolvedPlaceId,
    checkInPhotoRef: selfieUrl,
    checkOutTime: '',
    checkOutLat: null,
    checkOutLng: null,
    checkOutAccuracy: null,
    checkOutAddress: '',
    checkOutPlaceId: '',
    checkOutPhotoRef: '',
    attendanceType: attType,
    workingHours: 0,
    overtimeHours: 0,
    status,
    verificationStatus: payload.isOfflineSync ? 'DEVICE_CAPTURED_UNVERIFIED' : 'VERIFIED',
    correctionRequested: false,
    correctionReason: '',
    correctionStatus: 'NONE',
    notes: payload.notes || '',
    eventId: payload.eventId || '',
  };
  db.attendance.push(record);

  if (hasCoords) {
    const mapsUrl = buildMapsUrl(latNum, lngNum, resolvedPlaceId);
    db.attendanceLocationHistory.push({
      historyId: `LOC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      employeeId: authUser.employeeId,
      employeeName: authUser.fullName,
      department: authUser.department,
      date: dateStr,
      timestamp: nowIso,
      latitude: latNum,
      longitude: lngNum,
      accuracy: Number(payload.accuracy || 0),
      address: resolvedAddress,
      placeId: resolvedPlaceId,
      attendanceType: attType,
      speedMps: null,
      headingDeg: null,
      distanceFromPrevMeters: 0,
      mapsUrl,
      source: payload.isOfflineSync ? 'OFFLINE_DEVICE' : 'CHECK_IN',
      verificationStatus: record.verificationStatus,
    });

    const emp = db.employees.find((e) => e.employeeId === authUser.employeeId);
    const liveEntry = {
      employeeId: authUser.employeeId,
      employeeName: authUser.fullName,
      department: authUser.department,
      reportingManagerName: emp?.reportingManagerName || '',
      latitude: latNum,
      longitude: lngNum,
      accuracy: Number(payload.accuracy || 0),
      address: resolvedAddress,
      placeId: resolvedPlaceId,
      attendanceType: attType,
      speedMps: null,
      headingDeg: null,
      locationPermissionStatus: 'ACTIVE',
      mapsUrl,
      shiftCheckedInAt: nowIso,
      isSharingActive: attType === 'FIELD' || Boolean(authUser.isFieldEmployee),
      lastUpdatedAt: nowIso,
    };
    const existingLive = db.liveLocation.find((l) => l.employeeId === authUser.employeeId);
    if (existingLive) Object.assign(existingLive, liveEntry);
    else db.liveLocation.push(liveEntry);
  }
  const locSnippet = resolvedAddress ? ` at ${resolvedAddress}` : '';
  appendNotification(db, authUser.employeeId, 'ATTENDANCE', 'Check-In Recorded', `Checked in on ${dateStr} (${status})${locSnippet}.`);
  appendAudit(db, authUser, 'CHECK_IN', 'ATTENDANCE', record.attendanceId, `${status}${locSnippet}`);
  return record;
}

async function checkOutEmployee(db: DatabaseSchema, authUser: any, payload: any) {
  const refIso = payload.deviceTimestamp || new Date().toISOString();
  const dateStr = refIso.slice(0, 10);
  let existing = db.attendance.find((a) => a.employeeId === authUser.employeeId && a.date === dateStr);
  if (!existing || !existing.checkInTime) {
    const refMs = new Date(refIso).getTime();
    const openShifts = db.attendance.filter(
      (a) =>
        a.employeeId === authUser.employeeId &&
        Boolean(a.checkInTime) &&
        !a.checkOutTime &&
        Number.isFinite(refMs) &&
        refMs - new Date(a.checkInTime).getTime() >= 0 &&
        refMs - new Date(a.checkInTime).getTime() <= 24 * 3600000,
    );
    if (openShifts.length > 0) {
      existing = openShifts[openShifts.length - 1];
    }
  }
  if (!existing || !existing.checkInTime) {
    throw new Error(`Cannot check out without an active check-in for ${dateStr}`);
  }
  if (existing.checkOutTime) {
    throw new Error(`Check-out already recorded for ${dateStr}`);
  }
  const latNum = payload.latitude != null && payload.latitude !== '' ? Number(payload.latitude) : NaN;
  const lngNum = payload.longitude != null && payload.longitude !== '' ? Number(payload.longitude) : NaN;
  const hasCoords = Number.isFinite(latNum) && Number.isFinite(lngNum) && !(latNum === 0 && lngNum === 0);
  if ((existing.attendanceType === 'FIELD' || authUser.isFieldEmployee) && !hasCoords) {
    throw new Error('Mandatory GPS location is required for field attendance Check-Out. Keep device Location ON.');
  }

  const nowIso = payload.isOfflineSync ? payload.deviceTimestamp : new Date().toISOString();
  const selfieUrl = payload.selfieDataUrl
    ? saveBase64File(`${authUser.employeeId}_${dateStr}_OUT`, 'selfie.jpg', payload.selfieDataUrl)
    : '';
  const otThreshold = getOvertimeThresholdHours(db);
  const computed = computeDutyAndOvertime(existing.checkInTime, nowIso, otThreshold);
  const hours = computed.workingHours;
  const halfThreshold = Number(db.appSettings.halfDayThresholdHours || 4.5);
  let finalStatus = existing.status;
  if (hours < halfThreshold) finalStatus = 'HALF_DAY';
  const overtime = computed.overtimeHours;

  let resolvedAddress = String(payload.address || '').trim();
  let resolvedPlaceId = String(payload.placeId || '').trim();
  if (!resolvedAddress && hasCoords) {
    const geo = await reverseGeocodeCoords(latNum, lngNum);
    resolvedAddress = geo.address;
    resolvedPlaceId = geo.placeId;
  }

  existing.checkOutTime = nowIso;
  existing.checkOutLat = hasCoords ? latNum : null;
  existing.checkOutLng = hasCoords ? lngNum : null;
  existing.checkOutAccuracy = payload.accuracy ?? null;
  existing.checkOutAddress = resolvedAddress;
  existing.checkOutPlaceId = resolvedPlaceId;
  existing.checkOutPhotoRef = selfieUrl;
  existing.workingHours = hours;
  existing.overtimeHours = overtime;
  existing.status = finalStatus;

  if (hasCoords) {
    const prevPoints = db.attendanceLocationHistory.filter(
      (h) => h.employeeId === authUser.employeeId && h.date === dateStr && h.latitude && h.longitude,
    );
    const prev = prevPoints[prevPoints.length - 1];
    const dist = prev ? haversineMeters(Number(prev.latitude), Number(prev.longitude), latNum, lngNum) : 0;
    const mapsUrl = buildMapsUrl(latNum, lngNum, resolvedPlaceId);

    db.attendanceLocationHistory.push({
      historyId: `LOC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      employeeId: authUser.employeeId,
      employeeName: authUser.fullName,
      department: authUser.department,
      date: dateStr,
      timestamp: nowIso,
      latitude: latNum,
      longitude: lngNum,
      accuracy: Number(payload.accuracy || 0),
      address: resolvedAddress,
      placeId: resolvedPlaceId,
      attendanceType: existing.attendanceType,
      speedMps: null,
      headingDeg: null,
      distanceFromPrevMeters: dist,
      mapsUrl,
      source: payload.isOfflineSync ? 'OFFLINE_DEVICE' : 'CHECK_OUT',
      verificationStatus: payload.isOfflineSync ? 'DEVICE_CAPTURED_UNVERIFIED' : 'VERIFIED',
    });

    const existingLive = db.liveLocation.find((l) => l.employeeId === authUser.employeeId);
    if (existingLive) {
      existingLive.latitude = latNum;
      existingLive.longitude = lngNum;
      existingLive.accuracy = Number(payload.accuracy || 0);
      existingLive.address = resolvedAddress;
      existingLive.placeId = resolvedPlaceId;
      existingLive.mapsUrl = mapsUrl;
      existingLive.isSharingActive = false;
      existingLive.locationPermissionStatus = 'CHECKED_OUT';
      existingLive.lastUpdatedAt = nowIso;
    }
  } else {
    const existingLive = db.liveLocation.find((l) => l.employeeId === authUser.employeeId);
    if (existingLive) {
      existingLive.isSharingActive = false;
      existingLive.locationPermissionStatus = 'CHECKED_OUT';
      existingLive.lastUpdatedAt = nowIso;
    }
  }

  const locSnippet = resolvedAddress ? ` from ${resolvedAddress}` : '';
  const otNote = overtime > 0 ? ` (includes ${overtime}h overtime after ${otThreshold}h duty)` : '';
  appendNotification(db, authUser.employeeId, 'ATTENDANCE', 'Check-Out Recorded', `Worked ${hours} hrs on ${dateStr}${otNote}${locSnippet}.`);
  appendAudit(db, authUser, 'CHECK_OUT', 'ATTENDANCE', existing.attendanceId, `Hours: ${hours}${overtime > 0 ? `, OT: ${overtime}h` : ''}${locSnippet}`);
  return existing;
}

async function updateLiveLoc(db: DatabaseSchema, authUser: any, payload: any) {
  const nowIso = payload.deviceTimestamp || new Date().toISOString();
  const dateStr = nowIso.slice(0, 10);
  const emp = db.employees.find((e) => e.employeeId === authUser.employeeId);
  const existing = db.liveLocation.find((l) => l.employeeId === authUser.employeeId);
  const todayAtt = db.attendance.find((a) => a.employeeId === authUser.employeeId && a.date === dateStr);

  const lat = Number(payload.latitude || 0);
  const lng = Number(payload.longitude || 0);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  const permStatus = String(payload.locationPermissionStatus || (payload.isSharingActive ? 'ACTIVE' : 'CHECKED_OUT'));
  const attType = payload.attendanceType || todayAtt?.attendanceType || (authUser.isFieldEmployee ? 'FIELD' : 'OFFICE');

  let resolvedAddress = String(payload.address || '').trim();
  let resolvedPlaceId = String(payload.placeId || '').trim();
  if (!resolvedAddress && hasCoords) {
    if (
      existing?.address &&
      existing.latitude &&
      existing.longitude &&
      haversineMeters(Number(existing.latitude), Number(existing.longitude), lat, lng) < 40
    ) {
      resolvedAddress = existing.address;
      resolvedPlaceId = existing.placeId || '';
    } else {
      const geo = await reverseGeocodeCoords(lat, lng);
      resolvedAddress = geo.address;
      resolvedPlaceId = geo.placeId;
    }
  }

  const mapsUrl = hasCoords ? buildMapsUrl(lat, lng, resolvedPlaceId) : existing?.mapsUrl || '';
  const speedMps = payload.speedMps != null && Number.isFinite(Number(payload.speedMps)) ? Number(payload.speedMps) : null;
  const headingDeg = payload.headingDeg != null && Number.isFinite(Number(payload.headingDeg)) ? Number(payload.headingDeg) : null;

  const prevStatus = existing?.locationPermissionStatus;
  if (
    (permStatus === 'PERMISSION_DENIED' || permStatus === 'GPS_UNAVAILABLE') &&
    prevStatus !== permStatus
  ) {
    const admins = db.users.filter((u) => u.status === 'ACTIVE' && (u.role === 'SUPER_ADMIN' || u.role === 'HR_ADMIN'));
    for (const adm of admins) {
      appendNotification(
        db,
        adm.employeeId,
        'ATTENDANCE',
        `Field GPS Alert: ${authUser.fullName}`,
        `${authUser.fullName} (${authUser.employeeId}) has location disabled (${permStatus}) while checked in on field duty.`,
      );
    }
    appendAudit(db, authUser, 'GPS_PERMISSION_ALERT', 'LOCATION', authUser.employeeId, `Location status changed to ${permStatus}`);
  }

  const entry = {
    employeeId: authUser.employeeId,
    employeeName: authUser.fullName,
    department: authUser.department,
    reportingManagerName: emp?.reportingManagerName || '',
    latitude: hasCoords ? lat : (existing?.latitude ?? 0),
    longitude: hasCoords ? lng : (existing?.longitude ?? 0),
    accuracy: hasCoords ? Number(payload.accuracy || 0) : (existing?.accuracy ?? 0),
    address: resolvedAddress || existing?.address || '',
    placeId: resolvedPlaceId || existing?.placeId || '',
    attendanceType: attType,
    speedMps,
    headingDeg,
    locationPermissionStatus: permStatus,
    mapsUrl,
    shiftCheckedInAt: todayAtt?.checkInTime || existing?.shiftCheckedInAt || '',
    isSharingActive: Boolean(payload.isSharingActive) && permStatus === 'ACTIVE',
    lastUpdatedAt: nowIso,
  };
  if (existing) Object.assign(existing, entry);
  else db.liveLocation.push(entry);

  if (payload.isSharingActive && hasCoords && payload.recordTrail !== false) {
    const prevPoints = db.attendanceLocationHistory.filter(
      (h) => h.employeeId === authUser.employeeId && h.date === dateStr && h.latitude && h.longitude,
    );
    const prev = prevPoints[prevPoints.length - 1];
    const dist = prev ? haversineMeters(Number(prev.latitude), Number(prev.longitude), lat, lng) : 0;

    db.attendanceLocationHistory.push({
      historyId: `LOC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      employeeId: authUser.employeeId,
      employeeName: authUser.fullName,
      department: authUser.department,
      date: dateStr,
      timestamp: nowIso,
      latitude: lat,
      longitude: lng,
      accuracy: Number(payload.accuracy || 0),
      address: resolvedAddress,
      placeId: resolvedPlaceId,
      attendanceType: attType,
      speedMps,
      headingDeg,
      distanceFromPrevMeters: dist,
      mapsUrl,
      source: payload.isOfflineSync ? 'OFFLINE_DEVICE' : 'LIVE_TRACK',
      verificationStatus: payload.isOfflineSync ? 'DEVICE_CAPTURED_UNVERIFIED' : 'VERIFIED',
    });
  }
}

function collectDeploymentFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  const roots = ['google-apps-script', 'hostinger-deploy', 'docs'];
  for (const r of roots) {
    const abs = path.resolve(process.cwd(), r);
    if (!fs.existsSync(abs)) continue;
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else {
          const rel = path.relative(process.cwd(), full).replace(/\\/g, '/');
          files[rel] = fs.readFileSync(full, 'utf-8');
        }
      }
    };
    walk(abs);
  }
  return files;
}

async function startServer() {
  const app = express();
  app.use(express.json({limit: '15mb'}));

  app.use('/api/uploads', express.static(UPLOADS_DIR));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ok: true, service: 'IDEAL HRMS Server', timestamp: new Date().toISOString()});
  });

  app.get('/api/deployment-kit', (req: Request, res: Response) => {
    try {
      const db = loadDb();
      const token = String(req.headers.authorization || '').replace('Bearer ', '');
      const authUser = authenticate(db, token);
      requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
      res.json({ok: true, files: collectDeploymentFiles()});
    } catch (err: any) {
      res.status(401).json({ok: false, error: err.message});
    }
  });

  app.post('/api/rpc', async (req: Request, res: Response) => {
    const db = loadDb();
    try {
      const {action, token, payload = {}, transactionId} = req.body || {};

      if (transactionId) {
        const prev = processedTransactions.get(transactionId);
        if (prev && Date.now() - prev < 300000) {
          res.json({ok: true, duplicateIgnored: true});
          return;
        }
        processedTransactions.set(transactionId, Date.now());
      }

      if (action === 'health') {
        res.json({ok: true, company: db.appSettings.companyName, timestamp: new Date().toISOString()});
        return;
      }

      if (action === 'setupStatus') {
        res.json({
          ok: true,
          needsInitialSetup: db.users.length === 0,
          companyName: db.appSettings.companyName,
        });
        return;
      }

      if (action === 'initSuperAdmin') {
        if (db.users.length > 0) {
          throw new Error('System is already initialized. Please sign in.');
        }
        const now = new Date().toISOString();
        const employeeId = `${db.appSettings.companyCode || 'IISS'}-0001`;
        const userId = `USR-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = hashPassword(payload.password, salt);
        const deptName = payload.department || 'Executive & Administration';
        const desTitle = payload.designation || 'Managing Director';

        if (!db.departments.some((d) => d.name.toLowerCase() === deptName.toLowerCase())) {
          db.departments.push({
            departmentId: `DEPT-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
            name: deptName,
            code: deptName.slice(0, 4).toUpperCase().replace(/[^A-Z]/g, '') || 'EXEC',
            headEmployeeId: employeeId,
            createdAt: now,
          });
        } else {
          const existingDept = db.departments.find((d) => d.name.toLowerCase() === deptName.toLowerCase());
          if (existingDept && !existingDept.headEmployeeId) existingDept.headEmployeeId = employeeId;
        }

        if (!db.designations.some((d) => d.title.toLowerCase() === desTitle.toLowerCase())) {
          db.designations.push({
            designationId: `DES-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
            title: desTitle,
            department: deptName,
            level: 'L1',
            status: 'ACTIVE',
          });
        }

        const emp = {
          employeeId,
          fullName: payload.fullName,
          profilePhotoUrl: '',
          fatherName: '',
          dob: '',
          gender: '',
          mobile: String(payload.mobile || '').trim(),
          personalEmail: payload.email,
          officialEmail: String(payload.email).toLowerCase(),
          emergencyContact: '',
          currentAddress: '',
          permanentAddress: '',
          dateOfJoining: now.slice(0, 10),
          department: deptName,
          designation: payload.designation || 'Managing Director / Super Admin',
          reportingManagerId: '',
          reportingManagerName: 'Board',
          employmentType: 'FULL_TIME',
          workLocation: payload.workLocation || 'Headquarters',
          isFieldEmployee: false,
          role: 'SUPER_ADMIN' as const,
          bankName: '',
          bankAccountNumber: '',
          ifscCode: '',
          panNumber: '',
          aadhaarNumber: '',
          status: 'ACTIVE' as const,
          onboardingChecklist: {
            profileCompleted: true,
            photoUploaded: false,
            kycVerified: true,
            bankDetailsAdded: false,
            salaryConfigured: false,
            credentialsIssued: true,
          },
          createdAt: now,
          updatedAt: now,
        };
        db.employees.push(emp);

        db.users.push({
          userId,
          employeeId,
          email: String(payload.email).toLowerCase(),
          passwordHash,
          passwordSalt: salt,
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          failedAttempts: 0,
          lockedUntil: '',
          lastLoginAt: now,
          createdAt: now,
        });

        const year = new Date().getFullYear();
        for (const lt of db.leaveTypes) {
          db.leaveBalances.push({
            balanceId: `BAL-${employeeId}-${lt.code}-${year}`,
            employeeId,
            leaveTypeId: lt.leaveTypeId,
            leaveTypeName: lt.name,
            year,
            allocated: lt.annualQuota,
            used: 0,
            remaining: lt.annualQuota,
          });
        }

        const sessionId = `SES-${crypto.randomBytes(6).toString('hex')}`;
        const raw = `${sessionId}.${userId}`;
        const fullToken = `${raw}.${signToken(raw, db.hmacSecret)}`;
        db.loginHistory.push({
          sessionId,
          userId,
          employeeId,
          role: 'SUPER_ADMIN',
          tokenHash: hashToken(fullToken),
          expiresAt: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
          loginAt: now,
          status: 'ACTIVE',
          userAgent: req.headers['user-agent'] || 'WebApp',
        });

        appendAudit(db, {userId, fullName: payload.fullName, role: 'SUPER_ADMIN'}, 'INIT_SUPER_ADMIN', 'SYSTEM', employeeId, 'Initial Super Admin created');
        if (!db.appSettings.adminRecoveryEmail) {
          db.appSettings.adminRecoveryEmail = String(payload.email).toLowerCase();
        }
        saveDb(db);

        res.json({
          ok: true,
          token: fullToken,
          user: {
            userId,
            employeeId,
            fullName: payload.fullName,
            email: String(payload.email).toLowerCase(),
            role: 'SUPER_ADMIN',
            department: deptName,
            designation: emp.designation,
            profilePhotoUrl: '',
            isFieldEmployee: false,
          },
        });
        return;
      }

      if (action === 'login') {
        const identifier = String(payload.identifier || '').trim();
        const password = String(payload.password || '');
        if (!identifier || !password) {
          throw new Error('Official Email, Employee ID, or Mobile Number and password are required.');
        }
        const user = findUserByIdentifier(db, identifier);
        if (!user) throw new Error('Invalid email, employee ID, mobile number, or password.');
        if (user.status !== 'ACTIVE') throw new Error('Account is deactivated. Contact HR Administrator.');
        if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
          throw new Error('Account temporarily locked due to repeated failed attempts.');
        }

        if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) {
          user.failedAttempts = (user.failedAttempts || 0) + 1;
          if (user.failedAttempts >= 5) {
            user.lockedUntil = new Date(Date.now() + 15 * 60000).toISOString();
          }
          saveDb(db);
          throw new Error('Invalid email, employee ID, mobile number, or password.');
        }

        user.failedAttempts = 0;
        user.lockedUntil = '';
        user.lastLoginAt = new Date().toISOString();
        const emp = db.employees.find((e) => e.employeeId === user.employeeId);

        const sessionId = `SES-${crypto.randomBytes(6).toString('hex')}`;
        const raw = `${sessionId}.${user.userId}`;
        const fullToken = `${raw}.${signToken(raw, db.hmacSecret)}`;
        db.loginHistory.push({
          sessionId,
          userId: user.userId,
          employeeId: user.employeeId,
          role: user.role,
          tokenHash: hashToken(fullToken),
          expiresAt: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
          loginAt: user.lastLoginAt,
          status: 'ACTIVE',
          userAgent: req.headers['user-agent'] || 'WebApp',
        });

        appendAudit(db, {userId: user.userId, fullName: emp?.fullName || user.email, role: user.role}, 'LOGIN', 'AUTH', user.employeeId, 'Successful sign-in');
        saveDb(db);

        res.json({
          ok: true,
          token: fullToken,
          user: {
            userId: user.userId,
            employeeId: user.employeeId,
            fullName: emp?.fullName || user.email,
            email: user.email,
            role: user.role,
            department: emp?.department || '',
            designation: emp?.designation || '',
            profilePhotoUrl: emp?.profilePhotoUrl || '',
            isFieldEmployee: Boolean(emp?.isFieldEmployee),
          },
        });
        return;
      }

      if (action === 'requestPasswordResetOtp') {
        const identifier = String(payload.identifier || '').trim();
        if (!identifier) {
          throw new Error('Please enter your Official Email, Employee ID, or Registered Mobile Number.');
        }
        const user = findUserByIdentifier(db, identifier);
        if (!user) {
          throw new Error('No account found matching that Official Email, Employee ID, or Mobile Number.');
        }
        if (user.status !== 'ACTIVE') {
          throw new Error('Account is deactivated. Contact HR Administrator.');
        }
        const recentPending = db.passwordResetOtps.find(
          (o) =>
            o.userId === user.userId &&
            o.status === 'PENDING' &&
            Date.now() - new Date(o.createdAt).getTime() < 30000,
        );
        if (recentPending) {
          throw new Error('An OTP was already dispatched to Admin moments ago. Please wait 30 seconds before requesting another.');
        }

        const {record, maskedRecipients} = createAndDispatchPasswordResetOtp(db, user);
        saveDb(db);
        res.json({
          ok: true,
          otpId: record.otpId,
          expiresAt: record.expiresAt,
          targetRole: user.role,
          maskedAdminRecipients: maskedRecipients,
          message: `Password reset request (${record.otpId}) sent to Administrator (${maskedRecipients}). Request the 6-digit numeric OTP from your Admin to reset your password.`,
        });
        return;
      }

      if (action === 'verifyPasswordResetOtp') {
        const identifier = String(payload.identifier || '').trim();
        const otp = String(payload.otp || '').trim();
        const newPassword = String(payload.newPassword || '');

        if (!identifier || !otp) {
          throw new Error('Email/Employee ID/Mobile Number and 6-digit OTP are required.');
        }
        if (!/^\d{6}$/.test(otp)) {
          throw new Error('OTP must be a 6-digit numeric code (digits 0-9 only).');
        }
        if (newPassword.length < 8) {
          throw new Error('New password must be at least 8 characters long.');
        }

        const user = findUserByIdentifier(db, identifier);
        if (!user || user.status !== 'ACTIVE') {
          throw new Error('Invalid or inactive user account.');
        }

        expireStaleOtps(db);
        const otpRecord = [...db.passwordResetOtps]
          .reverse()
          .find((o) => o.userId === user.userId && o.status === 'PENDING');

        if (!otpRecord) {
          saveDb(db);
          throw new Error('No active OTP found or OTP has expired. Please request a new OTP.');
        }

        if (new Date(otpRecord.expiresAt).getTime() <= Date.now()) {
          otpRecord.status = 'EXPIRED';
          otpRecord.otpCode = '******';
          saveDb(db);
          throw new Error('OTP has expired. Please request a new OTP.');
        }

        if (!verifyPassword(otp, otpRecord.otpSalt, otpRecord.otpHash)) {
          otpRecord.attempts = (otpRecord.attempts || 0) + 1;
          if (otpRecord.attempts >= 5) {
            otpRecord.status = 'REVOKED';
            otpRecord.otpCode = '******';
          }
          saveDb(db);
          throw new Error(
            otpRecord.status === 'REVOKED'
              ? 'Too many incorrect OTP attempts. OTP has been revoked; please request a new one.'
              : `Invalid 6-digit OTP. ${5 - otpRecord.attempts} attempt(s) remaining.`,
          );
        }

        const now = new Date().toISOString();
        const newSalt = crypto.randomBytes(16).toString('hex');
        user.passwordSalt = newSalt;
        user.passwordHash = hashPassword(newPassword, newSalt);
        user.failedAttempts = 0;
        user.lockedUntil = '';

        otpRecord.status = 'USED';
        otpRecord.usedAt = now;
        otpRecord.otpCode = '******';

        // Revoke active sessions on password reset
        for (const ses of db.loginHistory) {
          if (ses.userId === user.userId && ses.status === 'ACTIVE') {
            ses.status = 'LOGGED_OUT';
          }
        }

        const emp = db.employees.find((e) => e.employeeId === user.employeeId);
        appendNotification(
          db,
          user.employeeId,
          'SECURITY',
          'Password Reset Completed',
          `Your password was reset via Admin-verified OTP (${otpRecord.otpId}) on ${new Date(now).toLocaleString()}.`,
        );
        appendAudit(
          db,
          {userId: user.userId, fullName: emp?.fullName || user.email, role: user.role},
          'PASSWORD_RESET_OTP',
          'AUTH',
          user.employeeId,
          `Password reset completed using OTP ${otpRecord.otpId}`,
        );
        saveDb(db);

        res.json({
          ok: true,
          message: 'Password updated successfully. You can now sign in with your new password.',
        });
        return;
      }

      const authUser = authenticate(db, token, req.headers['user-agent'] || 'WebApp');

      switch (action) {
        case 'logout': {
          const ses = db.loginHistory.find((s) => s.sessionId === authUser.sessionId);
          if (ses) ses.status = 'LOGGED_OUT';
          appendAudit(db, authUser, 'LOGOUT', 'AUTH', authUser.employeeId, 'User signed out');
          saveDb(db);
          res.json({ok: true});
          return;
        }

        case 'getEmployees': {
          const employees = authUser.role === 'EMPLOYEE'
            ? db.employees.filter((e) => e.employeeId === authUser.employeeId)
            : db.employees;
          const documents = authUser.role === 'EMPLOYEE'
            ? db.documents.filter((d) => d.employeeId === authUser.employeeId)
            : db.documents;
          res.json({
            ok: true,
            employees,
            departments: db.departments,
            designations: db.designations,
            documents,
          });
          return;
        }

        case 'createEmployee': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          let n = db.employees.length + 1;
          const code = db.appSettings.companyCode || 'IISS';
          let employeeId = `${code}-${String(n).padStart(4, '0')}`;
          while (db.employees.some((e) => e.employeeId === employeeId)) {
            n++;
            employeeId = `${code}-${String(n).padStart(4, '0')}`;
          }
          const email = String(payload.officialEmail || '').trim().toLowerCase();
          if (!email || db.users.some((u) => u.email.toLowerCase() === email)) {
            throw new Error('A user with this official email already exists.');
          }
          const cleanMobile = String(payload.mobile || '').trim();
          if (
            normalizePhoneDigits(cleanMobile).length >= 7 &&
            db.employees.some((e) => isMobileMatch(e.mobile, cleanMobile))
          ) {
            throw new Error('Another employee is already registered with this mobile number.');
          }
          const now = new Date().toISOString();
          const photoUrl = saveBase64File(`${employeeId}_photo`, 'avatar.jpg', payload.profilePhotoUrl);
          const requestedRole = String(payload.role || 'EMPLOYEE').toUpperCase();
          const role: 'SUPER_ADMIN' | 'HR_ADMIN' | 'EMPLOYEE' =
            authUser.role === 'SUPER_ADMIN'
              ? requestedRole === 'SUPER_ADMIN' || requestedRole === 'HR_ADMIN'
                ? requestedRole
                : 'EMPLOYEE'
              : requestedRole === 'HR_ADMIN'
                ? 'HR_ADMIN'
                : 'EMPLOYEE';

          const emp = {
            employeeId,
            fullName: payload.fullName,
            profilePhotoUrl: photoUrl,
            fatherName: payload.fatherName || '',
            dob: payload.dob || '',
            gender: payload.gender || '',
            mobile: cleanMobile,
            personalEmail: payload.personalEmail || '',
            officialEmail: email,
            emergencyContact: payload.emergencyContact || '',
            currentAddress: payload.currentAddress || '',
            permanentAddress: payload.permanentAddress || '',
            dateOfJoining: payload.dateOfJoining || now.slice(0, 10),
            department: payload.department || 'Operations & Field Services',
            designation: payload.designation || 'Executive',
            reportingManagerId: payload.reportingManagerId || '',
            reportingManagerName: payload.reportingManagerName || '',
            employmentType: payload.employmentType || 'FULL_TIME',
            workLocation: payload.workLocation || 'Headquarters',
            isFieldEmployee: Boolean(payload.isFieldEmployee),
            role,
            bankName: payload.bankName || '',
            bankAccountNumber: payload.bankAccountNumber || '',
            ifscCode: payload.ifscCode || '',
            panNumber: payload.panNumber || '',
            aadhaarNumber: payload.aadhaarNumber || '',
            status: 'ACTIVE',
            onboardingChecklist: payload.onboardingChecklist || {
              profileCompleted: true,
              photoUploaded: Boolean(photoUrl),
              kycVerified: false,
              bankDetailsAdded: Boolean(payload.bankAccountNumber),
              salaryConfigured: false,
              credentialsIssued: true,
            },
            createdAt: now,
            updatedAt: now,
          };
          db.employees.push(emp);

          const salt = crypto.randomBytes(16).toString('hex');
          const userId = `USR-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
          db.users.push({
            userId,
            employeeId,
            email,
            passwordHash: hashPassword(payload.initialPassword || 'Ideal@2026', salt),
            passwordSalt: salt,
            role,
            status: 'ACTIVE',
            failedAttempts: 0,
            lockedUntil: '',
            lastLoginAt: '',
            createdAt: now,
          });

          const year = new Date().getFullYear();
          for (const lt of db.leaveTypes) {
            db.leaveBalances.push({
              balanceId: `BAL-${employeeId}-${lt.code}-${year}`,
              employeeId,
              leaveTypeId: lt.leaveTypeId,
              leaveTypeName: lt.name,
              year,
              allocated: lt.annualQuota,
              used: 0,
              remaining: lt.annualQuota,
            });
          }

          appendNotification(db, employeeId, 'SYSTEM', 'Welcome to IDEAL HRMS', `Your profile (${employeeId}) is ready.`);
          appendAudit(db, authUser, 'CREATE_EMPLOYEE', 'EMPLOYEES', employeeId, payload.fullName);
          saveDb(db);
          res.json({ok: true, employeeId, employee: emp});
          return;
        }

        case 'updateEmployee': {
          const targetId = payload.employeeId;
          if (authUser.role === 'EMPLOYEE' && targetId !== authUser.employeeId) {
            throw new Error('FORBIDDEN: Cannot update another employee profile.');
          }
          const emp = db.employees.find((e) => e.employeeId === targetId);
          if (!emp) throw new Error('Employee not found.');
          const linkedUser = db.users.find((u) => u.employeeId === targetId);

          if (authUser.role !== 'EMPLOYEE' && payload.officialEmail) {
            const nextEmail = String(payload.officialEmail).trim().toLowerCase();
            if (!nextEmail) throw new Error('Official email cannot be empty.');
            if (
              nextEmail !== String(emp.officialEmail).toLowerCase() &&
              db.users.some((u) => u.employeeId !== targetId && u.email.toLowerCase() === nextEmail)
            ) {
              throw new Error('Another user account already uses this official email.');
            }
          }
          if (payload.mobile !== undefined) {
            const nextMobile = String(payload.mobile || '').trim();
            if (
              normalizePhoneDigits(nextMobile).length >= 7 &&
              db.employees.some((e) => e.employeeId !== targetId && isMobileMatch(e.mobile, nextMobile))
            ) {
              throw new Error('Another employee account already uses this mobile number.');
            }
          }

          const allowedSelf = ['mobile', 'personalEmail', 'emergencyContact', 'currentAddress', 'profilePhotoUrl'];
          const keys = authUser.role === 'EMPLOYEE' ? allowedSelf : Object.keys(payload);
          for (const k of keys) {
            if (k === 'employeeId' || k === 'createdAt' || k === 'initialPassword') continue;
            if (k === 'role') {
              if (authUser.role === 'SUPER_ADMIN') {
                emp.role = payload.role;
              } else if (authUser.role === 'HR_ADMIN' && emp.role !== 'SUPER_ADMIN' && payload.role !== 'SUPER_ADMIN') {
                emp.role = payload.role;
              }
              continue;
            }
            if (k === 'officialEmail') {
              emp.officialEmail = String(payload.officialEmail).trim().toLowerCase();
              continue;
            }
            if (k === 'profilePhotoUrl' && typeof payload.profilePhotoUrl === 'string' && payload.profilePhotoUrl.startsWith('data:')) {
              emp.profilePhotoUrl = saveBase64File(`${targetId}_photo`, 'avatar.jpg', payload.profilePhotoUrl);
            } else if (k in payload) {
              emp[k] = payload[k];
            }
          }

          if (linkedUser && authUser.role !== 'EMPLOYEE') {
            linkedUser.email = String(emp.officialEmail).toLowerCase();
            linkedUser.role = emp.role;
            if (payload.status) {
              linkedUser.status = payload.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE';
            }
          }
          emp.updatedAt = new Date().toISOString();
          appendAudit(db, authUser, 'UPDATE_EMPLOYEE', 'EMPLOYEES', targetId, 'Profile updated');
          saveDb(db);
          res.json({ok: true, employee: emp});
          return;
        }

        case 'toggleEmployeeStatus': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          const emp = db.employees.find((e) => e.employeeId === payload.employeeId);
          if (!emp) throw new Error('Employee not found.');
          emp.status = payload.status;
          emp.updatedAt = new Date().toISOString();
          const user = db.users.find((u) => u.employeeId === payload.employeeId);
          if (user) user.status = payload.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE';
          appendAudit(db, authUser, 'TOGGLE_STATUS', 'EMPLOYEES', payload.employeeId, payload.status);
          saveDb(db);
          res.json({ok: true});
          return;
        }

        case 'uploadDocument': {
          if (authUser.role === 'EMPLOYEE' && payload.employeeId !== authUser.employeeId) {
            throw new Error('FORBIDDEN');
          }
          const fileUrl = saveBase64File(`${payload.employeeId}_doc`, payload.fileName || 'document.pdf', payload.fileDataUrl);
          const doc = {
            documentId: `DOC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
            employeeId: payload.employeeId,
            documentType: payload.documentType,
            fileName: payload.fileName,
            fileUrl,
            mimeType: payload.mimeType || 'application/octet-stream',
            verificationStatus: 'PENDING',
            verifiedBy: '',
            uploadedAt: new Date().toISOString(),
          };
          db.documents.push(doc);
          appendAudit(db, authUser, 'UPLOAD_DOCUMENT', 'DOCUMENTS', doc.documentId, payload.documentType);
          saveDb(db);
          res.json({ok: true, document: doc});
          return;
        }

        case 'verifyDocument': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          const doc = db.documents.find((d) => d.documentId === payload.documentId);
          if (!doc) throw new Error('Document not found.');
          doc.verificationStatus = payload.verificationStatus;
          doc.verifiedBy = authUser.fullName;
          appendAudit(db, authUser, 'VERIFY_DOCUMENT', 'DOCUMENTS', doc.documentId, payload.verificationStatus);
          saveDb(db);
          res.json({ok: true});
          return;
        }

        case 'deleteDocument': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          const idx = db.documents.findIndex((d) => d.documentId === payload.documentId);
          if (idx === -1) throw new Error('Document not found.');
          db.documents.splice(idx, 1);
          appendAudit(db, authUser, 'DELETE_DOCUMENT', 'DOCUMENTS', payload.documentId, 'Removed document');
          saveDb(db);
          res.json({ok: true});
          return;
        }

        case 'getMapsConfig': {
          res.json({ok: true, apiKey: getGoogleMapsServerKey()});
          return;
        }

        case 'reverseGeocode': {
          const geo = await reverseGeocodeCoords(payload?.latitude, payload?.longitude);
          res.json({ok: true, ...geo});
          return;
        }

        case 'checkIn': {
          const rec = await checkInEmployee(db, authUser, payload);
          saveDb(db);
          res.json({ok: true, record: rec});
          return;
        }

        case 'checkOut': {
          const rec = await checkOutEmployee(db, authUser, payload);
          saveDb(db);
          res.json({ok: true, record: rec});
          return;
        }

        case 'getAttendance': {
          let records = authUser.role === 'EMPLOYEE'
            ? db.attendance.filter((a) => a.employeeId === authUser.employeeId)
            : db.attendance;
          if (payload?.month) {
            records = records.filter((r) => String(r.date).startsWith(payload.month));
          }
          res.json({ok: true, records: [...records].reverse()});
          return;
        }

        case 'regularizeAttendance':
        case 'requestAttendanceCorrection': {
          const isAdminActor = authUser.role === 'SUPER_ADMIN' || authUser.role === 'HR_ADMIN';
          const targetEmployeeId = isAdminActor && payload.employeeId ? String(payload.employeeId) : authUser.employeeId;
          if (!isAdminActor && targetEmployeeId !== authUser.employeeId) {
            throw new Error('FORBIDDEN: Cannot regularize another employee attendance.');
          }
          const targetEmp = db.employees.find((e) => e.employeeId === targetEmployeeId);
          if (!targetEmp) throw new Error('Employee not found.');

          const dateStr = String(payload.date || '').slice(0, 10);
          let att = payload.attendanceId
            ? db.attendance.find((a) => a.attendanceId === payload.attendanceId)
            : dateStr
              ? db.attendance.find((a) => a.employeeId === targetEmployeeId && a.date === dateStr)
              : undefined;

          if (!att && !dateStr) {
            throw new Error('Attendance date is required for regularization.');
          }

          const toIsoTime = (d: string, val?: string) => {
            const raw = String(val || '').trim();
            if (!raw) return '';
            if (raw.includes('T')) return raw;
            if (/^\d{2}:\d{2}$/.test(raw)) return `${d}T${raw}:00.000Z`;
            if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) return `${d}T${raw}.000Z`;
            return raw;
          };

          const effDate = att?.date || dateStr;
          const reqInIso = toIsoTime(effDate, payload.requestedCheckInTime ?? payload.checkInTime);
          const reqOutIso = toIsoTime(effDate, payload.requestedCheckOutTime ?? payload.checkOutTime);
          const reason = String(payload.reason || payload.correctionReason || '').trim();
          if (!reason) throw new Error('Regularization reason is required.');

          const applyNow = isAdminActor && payload.applyImmediately !== false;
          const now = new Date().toISOString();

          if (!att) {
            att = {
              attendanceId: `ATT-${targetEmployeeId}-${effDate}`,
              employeeId: targetEmployeeId,
              employeeName: targetEmp.fullName,
              department: targetEmp.department,
              date: effDate,
              checkInTime: '',
              checkInLat: null,
              checkInLng: null,
              checkInAccuracy: null,
              checkInAddress: '',
              checkInPlaceId: '',
              checkInPhotoRef: '',
              checkOutTime: '',
              checkOutLat: null,
              checkOutLng: null,
              checkOutAccuracy: null,
              checkOutAddress: '',
              checkOutPlaceId: '',
              checkOutPhotoRef: '',
              attendanceType: payload.requestedAttendanceType || payload.attendanceType || (targetEmp.isFieldEmployee ? 'FIELD' : 'OFFICE'),
              workingHours: 0,
              overtimeHours: 0,
              status: applyNow ? payload.requestedStatus || payload.status || 'PRESENT' : 'ABSENT',
              verificationStatus: applyNow ? 'VERIFIED' : 'DEVICE_CAPTURED_UNVERIFIED',
              correctionRequested: true,
              correctionReason: reason,
              correctionStatus: applyNow ? 'APPROVED' : 'PENDING',
              regularizationType: payload.regularizationType || (applyNow ? 'ADMIN_ADJUSTMENT' : 'FULL_DAY_REGULARIZATION'),
              requestedCheckInTime: reqInIso,
              requestedCheckOutTime: reqOutIso,
              requestedStatus: payload.requestedStatus || payload.status || 'PRESENT',
              requestedAttendanceType: payload.requestedAttendanceType || payload.attendanceType || (targetEmp.isFieldEmployee ? 'FIELD' : 'OFFICE'),
              regularizedBy: applyNow ? authUser.fullName : '',
              regularizedAt: applyNow ? now : '',
              notes: payload.notes || '',
              eventId: '',
            };
            db.attendance.push(att);
          } else {
            att.correctionRequested = true;
            att.correctionReason = reason;
            att.regularizationType = payload.regularizationType || att.regularizationType || 'TIMING_CORRECTION';
            if (reqInIso) att.requestedCheckInTime = reqInIso;
            if (reqOutIso) att.requestedCheckOutTime = reqOutIso;
            if (payload.requestedStatus || payload.status) att.requestedStatus = payload.requestedStatus || payload.status;
            if (payload.requestedAttendanceType || payload.attendanceType) {
              att.requestedAttendanceType = payload.requestedAttendanceType || payload.attendanceType;
            }
            if (payload.notes !== undefined) att.notes = payload.notes;
          }

          if (applyNow) {
            if (reqInIso) att.checkInTime = reqInIso;
            if (reqOutIso) att.checkOutTime = reqOutIso;
            if (payload.requestedAttendanceType || payload.attendanceType) {
              att.attendanceType = payload.requestedAttendanceType || payload.attendanceType;
            }
            if (payload.requestedStatus || payload.status) {
              att.status = payload.requestedStatus || payload.status;
            } else if (att.status === 'ABSENT') {
              att.status = 'PRESENT';
            }
            const otThreshold = getOvertimeThresholdHours(db);
            if (att.checkInTime && att.checkOutTime) {
              const computed = computeDutyAndOvertime(att.checkInTime, att.checkOutTime, otThreshold);
              att.workingHours = payload.workingHours !== undefined && payload.workingHours !== '' ? Number(payload.workingHours) : computed.workingHours;
              att.overtimeHours = payload.overtimeHours !== undefined && payload.overtimeHours !== ''
                ? Number(payload.overtimeHours)
                : att.workingHours > otThreshold ? Math.round((att.workingHours - otThreshold) * 100) / 100 : 0;
            } else if (payload.workingHours !== undefined && payload.workingHours !== '') {
              att.workingHours = Number(payload.workingHours);
              att.overtimeHours = payload.overtimeHours !== undefined && payload.overtimeHours !== ''
                ? Number(payload.overtimeHours)
                : att.workingHours > otThreshold ? Math.round((att.workingHours - otThreshold) * 100) / 100 : 0;
            } else if (payload.overtimeHours !== undefined && payload.overtimeHours !== '') {
              att.overtimeHours = Number(payload.overtimeHours);
            }
            att.correctionStatus = 'APPROVED';
            att.verificationStatus = 'VERIFIED';
            att.regularizedBy = authUser.fullName;
            att.regularizedAt = now;
            appendNotification(db, att.employeeId, 'ATTENDANCE', 'Attendance Regularized', `Your attendance for ${att.date} was regularized (${att.status}) by ${authUser.fullName}.`);
            appendAudit(db, authUser, 'REGULARIZE_ATTENDANCE_ADMIN', 'ATTENDANCE', att.attendanceId, `${att.status} · ${reason}`);
          } else {
            att.correctionStatus = 'PENDING';
            appendNotification(db, 'ALL', 'ATTENDANCE', 'Attendance Regularization Request', `${att.employeeName} (${att.employeeId}) requested attendance regularization for ${att.date}: ${reason}`);
            appendAudit(db, authUser, 'REQUEST_REGULARIZATION', 'ATTENDANCE', att.attendanceId, reason);
          }

          saveDb(db);
          res.json({ok: true, record: att});
          return;
        }

        case 'approveAttendanceCorrection': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          const att = db.attendance.find((a) => a.attendanceId === payload.attendanceId);
          if (!att) throw new Error('Attendance record not found.');

          const toIsoTime = (d: string, val?: string) => {
            const raw = String(val || '').trim();
            if (!raw) return '';
            if (raw.includes('T')) return raw;
            if (/^\d{2}:\d{2}$/.test(raw)) return `${d}T${raw}:00.000Z`;
            if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) return `${d}T${raw}.000Z`;
            return raw;
          };

          att.correctionStatus = payload.decision;
          if (payload.decision === 'APPROVED') {
            const nextIn = toIsoTime(att.date, payload.checkInTime || att.requestedCheckInTime);
            const nextOut = toIsoTime(att.date, payload.checkOutTime || att.requestedCheckOutTime);
            if (nextIn) att.checkInTime = nextIn;
            if (nextOut) att.checkOutTime = nextOut;
            if (payload.attendanceType || att.requestedAttendanceType) {
              att.attendanceType = payload.attendanceType || att.requestedAttendanceType;
            }
            att.status = payload.status || att.requestedStatus || (att.status === 'ABSENT' ? 'PRESENT' : att.status);
            const otThreshold = getOvertimeThresholdHours(db);
            if (payload.workingHours !== undefined && payload.workingHours !== '') {
              att.workingHours = Number(payload.workingHours);
            } else if (att.checkInTime && att.checkOutTime) {
              att.workingHours = computeDutyAndOvertime(att.checkInTime, att.checkOutTime, otThreshold).workingHours;
            }
            if (payload.overtimeHours !== undefined && payload.overtimeHours !== '') {
              att.overtimeHours = Number(payload.overtimeHours);
            } else {
              att.overtimeHours = att.workingHours > otThreshold ? Math.round((att.workingHours - otThreshold) * 100) / 100 : 0;
            }
            if (payload.notes !== undefined) att.notes = payload.notes;
            att.verificationStatus = 'VERIFIED';
            att.regularizedBy = authUser.fullName;
            att.regularizedAt = new Date().toISOString();
          }
          appendNotification(db, att.employeeId, 'ATTENDANCE', `Attendance Regularization ${payload.decision}`, `Regularization for ${att.date} was ${payload.decision.toLowerCase()}.`);
          appendAudit(db, authUser, 'REVIEW_CORRECTION', 'ATTENDANCE', att.attendanceId, payload.decision);
          saveDb(db);
          res.json({ok: true, record: att});
          return;
        }

        case 'adminSaveAttendance': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          const emp = db.employees.find((e) => e.employeeId === payload.employeeId);
          const dateStr = String(payload.date || '').slice(0, 10);
          let att = payload.attendanceId
            ? db.attendance.find((a) => a.attendanceId === payload.attendanceId)
            : db.attendance.find((a) => a.employeeId === payload.employeeId && a.date === dateStr);
          if (!att && (!emp || !dateStr)) throw new Error('Employee and date are required.');

          const toIsoTime = (d: string, val?: string) => {
            const raw = String(val || '').trim();
            if (!raw) return '';
            if (raw.includes('T')) return raw;
            if (/^\d{2}:\d{2}$/.test(raw)) return `${d}T${raw}:00.000Z`;
            if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) return `${d}T${raw}.000Z`;
            return raw;
          };
          const effDate = att?.date || dateStr;
          const nextIn = payload.checkInTime !== undefined ? toIsoTime(effDate, payload.checkInTime) : att?.checkInTime || '';
          const nextOut = payload.checkOutTime !== undefined ? toIsoTime(effDate, payload.checkOutTime) : att?.checkOutTime || '';
          const otThreshold = getOvertimeThresholdHours(db);
          let hrs = payload.workingHours !== undefined && payload.workingHours !== '' ? Number(payload.workingHours) : att?.workingHours || 0;
          if (payload.recalculateHours !== false && nextIn && nextOut && (payload.workingHours === undefined || payload.workingHours === '')) {
            hrs = computeDutyAndOvertime(nextIn, nextOut, otThreshold).workingHours;
          }
          const ot = payload.overtimeHours !== undefined && payload.overtimeHours !== ''
            ? Number(payload.overtimeHours)
            : hrs > otThreshold ? Math.round((hrs - otThreshold) * 100) / 100 : 0;

          if (!att && emp) {
            att = {
              attendanceId: `ATT-${emp.employeeId}-${effDate}`,
              employeeId: emp.employeeId,
              employeeName: emp.fullName,
              department: emp.department,
              date: effDate,
              checkInTime: nextIn,
              checkInLat: null,
              checkInLng: null,
              checkInAccuracy: null,
              checkInAddress: payload.checkInAddress || '',
              checkInPlaceId: '',
              checkInPhotoRef: '',
              checkOutTime: nextOut,
              checkOutLat: null,
              checkOutLng: null,
              checkOutAccuracy: null,
              checkOutAddress: payload.checkOutAddress || '',
              checkOutPlaceId: '',
              checkOutPhotoRef: '',
              attendanceType: payload.attendanceType || (emp.isFieldEmployee ? 'FIELD' : 'OFFICE'),
              workingHours: hrs,
              overtimeHours: ot,
              status: payload.status || 'PRESENT',
              verificationStatus: payload.verificationStatus || 'VERIFIED',
              correctionRequested: true,
              correctionReason: payload.correctionReason || payload.notes || 'Admin attendance regularization',
              correctionStatus: payload.correctionStatus || 'APPROVED',
              regularizationType: payload.regularizationType || 'ADMIN_ADJUSTMENT',
              regularizedBy: authUser.fullName,
              regularizedAt: new Date().toISOString(),
              notes: payload.notes || '',
              eventId: '',
            };
            db.attendance.push(att);
          } else if (att) {
            att.checkInTime = nextIn;
            att.checkOutTime = nextOut;
            if (payload.checkInAddress !== undefined) att.checkInAddress = payload.checkInAddress;
            if (payload.checkOutAddress !== undefined) att.checkOutAddress = payload.checkOutAddress;
            if (payload.attendanceType) att.attendanceType = payload.attendanceType;
            if (payload.status) att.status = payload.status;
            if (payload.verificationStatus) att.verificationStatus = payload.verificationStatus;
            if (payload.correctionStatus) att.correctionStatus = payload.correctionStatus;
            if (payload.correctionReason !== undefined) att.correctionReason = payload.correctionReason;
            if (payload.notes !== undefined) att.notes = payload.notes;
            att.workingHours = hrs;
            att.overtimeHours = ot;
            att.regularizedBy = authUser.fullName;
            att.regularizedAt = new Date().toISOString();
          }

          appendAudit(db, authUser, 'ADMIN_EDIT_ATTENDANCE', 'ATTENDANCE', att!.attendanceId, `${att!.status} (${att!.workingHours}h)`);
          saveDb(db);
          res.json({ok: true, record: att});
          return;
        }

        case 'updateLiveLocation': {
          await updateLiveLoc(db, authUser, payload);
          saveDb(db);
          res.json({ok: true});
          return;
        }

        case 'getLiveLocations': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          const staleMs = Number(db.appSettings.locationStaleMinutes || 5) * 60000;
          const now = Date.now();
          const todayStr = new Date().toISOString().slice(0, 10);
          const locations = db.liveLocation.map((r) => {
            const emp = db.employees.find((e) => e.employeeId === r.employeeId);
            const todayPts = db.attendanceLocationHistory.filter(
              (h) => h.employeeId === r.employeeId && h.date === todayStr && h.latitude && h.longitude,
            );
            let distMeters = 0;
            for (let i = 1; i < todayPts.length; i++) {
              distMeters += haversineMeters(
                Number(todayPts[i - 1].latitude),
                Number(todayPts[i - 1].longitude),
                Number(todayPts[i].latitude),
                Number(todayPts[i].longitude),
              );
            }
            return {
              ...r,
              isFieldEmployee: Boolean(emp?.isFieldEmployee),
              distanceTodayMeters: distMeters,
              isStale: !r.isSharingActive || now - new Date(r.lastUpdatedAt).getTime() > staleMs,
            };
          });
          res.json({ok: true, locations});
          return;
        }

        case 'getLocationHistory': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          let history = db.attendanceLocationHistory;
          if (payload?.employeeId) history = history.filter((h) => h.employeeId === payload.employeeId);
          if (payload?.date) history = history.filter((h) => h.date === payload.date);
          res.json({ok: true, history});
          return;
        }

        case 'getTravelClaims': {
          const rates = getConveyanceRates(db);
          let claims = authUser.role === 'EMPLOYEE'
            ? db.travelConveyance.filter((c) => c.employeeId === authUser.employeeId)
            : [...db.travelConveyance];
          if (authUser.role !== 'EMPLOYEE' && payload?.employeeId) {
            claims = claims.filter((c) => c.employeeId === payload.employeeId);
          }
          if (payload?.status && payload.status !== 'ALL') {
            claims = claims.filter((c) => c.status === payload.status);
          }
          if (payload?.month) {
            claims = claims.filter((c) => String(c.travelDate || '').startsWith(String(payload.month)));
          }
          claims.sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')));
          res.json({ok: true, claims, rates});
          return;
        }

        case 'computeTravelRoutePreview': {
          const vt = normalizeVehicleType(payload?.vehicleType);
          const ratePerKm = getConveyanceRateForVehicle(db, vt);
          const fromLat = Number(payload?.fromLat);
          const fromLng = Number(payload?.fromLng);
          if (!Number.isFinite(fromLat) || !Number.isFinite(fromLng) || (fromLat === 0 && fromLng === 0)) {
            throw new Error('Valid Location A GPS coordinates are required.');
          }
          let toLat = Number(payload?.toLat);
          let toLng = Number(payload?.toLng);
          let toAddress = String(payload?.toAddress || '').trim();
          let toPlaceId = String(payload?.toPlaceId || '').trim();
          let quotaExceeded = false;

          if (!Number.isFinite(toLat) || !Number.isFinite(toLng) || (toLat === 0 && toLng === 0)) {
            if (!toAddress) throw new Error('Provide Location B GPS coordinates or destination address.');
            const geoDest = await geocodeAddressText(toAddress);
            if (!geoDest) {
              throw new Error('Unable to locate destination address on Google Maps. Use live Location B GPS instead.');
            }
            if (geoDest.quotaExceeded) quotaExceeded = true;
            if (!geoDest.lat || !geoDest.lng) {
              throw new Error('Destination geocoding failed or quota exceeded.');
            }
            toLat = geoDest.lat;
            toLng = geoDest.lng;
            toAddress = geoDest.address;
            toPlaceId = geoDest.placeId;
          } else if (!toAddress) {
            const revDest = await reverseGeocodeCoords(toLat, toLng);
            if (revDest.quotaExceeded) quotaExceeded = true;
            toAddress = revDest.address;
            toPlaceId = revDest.placeId;
          }

          const routeInfo = await computeGoogleTravelRoute(fromLat, fromLng, toLat, toLng, vt);
          if (routeInfo.quotaExceeded) quotaExceeded = true;
          const straightKm = Math.round((haversineMeters(fromLat, fromLng, toLat, toLng) / 1000) * 100) / 100;
          const distanceKm = routeInfo.googleRouteDistanceKm > 0 ? routeInfo.googleRouteDistanceKm : straightKm;
          const estimatedAmount = Math.round(distanceKm * ratePerKm * 100) / 100;

          res.json({
            ok: true,
            quotaExceeded,
            preview: {
              vehicleType: vt,
              ratePerKm,
              fromLat,
              fromLng,
              toLat,
              toLng,
              toAddress,
              toPlaceId,
              googleRouteDistanceKm: routeInfo.googleRouteDistanceKm,
              straightLineDistanceKm: straightKm,
              distanceKm,
              distanceSource: routeInfo.googleRouteDistanceKm > 0 ? 'GOOGLE_ROUTES_API' : 'LIVE_GPS_TRAIL',
              routeDurationText: routeInfo.routeDurationText,
              routePolyline: routeInfo.routePolyline,
              estimatedAmount,
            },
          });
          return;
        }

        case 'startTravelTrip': {
          const lat = Number(payload?.latitude);
          const lng = Number(payload?.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
            throw new Error('100% live GPS Location A coordinates are required to start a travel trip.');
          }
          const existingOpen = db.travelConveyance.find(
            (c) => c.employeeId === authUser.employeeId && c.status === 'IN_PROGRESS',
          );
          if (existingOpen) {
            throw new Error(`You already have an active trip (${existingOpen.claimId}). End or cancel it before starting a new trip.`);
          }

          const vt = normalizeVehicleType(payload?.vehicleType);
          const ratePerKm = getConveyanceRateForVehicle(db, vt);
          const nowIso = String(payload?.deviceTimestamp || new Date().toISOString());
          const dateStr = nowIso.slice(0, 10);
          const accuracy = Math.round(Number(payload?.accuracy || 0));

          let fromAddress = String(payload?.address || '').trim();
          let fromPlaceId = String(payload?.placeId || '').trim();
          let quotaExceeded = false;
          if (!fromAddress) {
            const geo = await reverseGeocodeCoords(lat, lng);
            if (geo.quotaExceeded) quotaExceeded = true;
            fromAddress = geo.address;
            fromPlaceId = geo.placeId;
          }

          const claimId = `TRV-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
          const initialWaypoint = {
            timestamp: nowIso,
            latitude: lat,
            longitude: lng,
            accuracy,
            address: fromAddress,
            placeId: fromPlaceId,
            speedMps: payload?.speedMps != null && Number.isFinite(Number(payload.speedMps)) ? Number(payload.speedMps) : null,
            distanceFromPrevMeters: 0,
          };

          const claim = {
            claimId,
            employeeId: authUser.employeeId,
            employeeName: authUser.fullName,
            department: authUser.department,
            designation: authUser.designation,
            travelDate: dateStr,
            vehicleType: vt,
            ratePerKm,
            fromAddress: fromAddress || `GPS (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
            fromLat: lat,
            fromLng: lng,
            fromAccuracy: accuracy,
            fromPlaceId,
            fromMapsUrl: buildMapsUrl(lat, lng, fromPlaceId),
            startedAt: nowIso,
            toAddress: '',
            toLat: null,
            toLng: null,
            toAccuracy: null,
            toPlaceId: '',
            toMapsUrl: '',
            endedAt: '',
            waypoints: [initialWaypoint],
            gpsTrackedDistanceKm: 0,
            googleRouteDistanceKm: 0,
            distanceKm: 0,
            distanceSource: 'LIVE_GPS_TRAIL',
            routeDurationText: '',
            routePolyline: '',
            claimAmount: 0,
            purpose: String(payload?.purpose || '').trim(),
            remarks: '',
            status: 'IN_PROGRESS',
            submittedAt: '',
            reviewedBy: '',
            reviewerRole: '',
            reviewedAt: '',
            rejectionReason: '',
            paidAt: '',
            updatedAt: nowIso,
          };

          db.travelConveyance.push(claim);
          await updateLiveLoc(db, authUser, {
            latitude: lat,
            longitude: lng,
            accuracy,
            address: claim.fromAddress,
            placeId: fromPlaceId,
            attendanceType: 'FIELD',
            locationPermissionStatus: 'ACTIVE',
            isSharingActive: true,
            deviceTimestamp: nowIso,
          });
          appendAudit(db, authUser, 'START_TRAVEL_TRIP', 'TRAVEL', claimId, `${vt} @ ₹${ratePerKm}/km from ${claim.fromAddress}`);
          saveDb(db);
          res.json({ok: true, claim, rates: getConveyanceRates(db), quotaExceeded});
          return;
        }

        case 'addTravelWaypoint': {
          const claim = db.travelConveyance.find((c) => c.claimId === payload?.claimId);
          if (!claim) throw new Error('Travel trip not found.');
          if (authUser.role === 'EMPLOYEE' && claim.employeeId !== authUser.employeeId) {
            throw new Error('FORBIDDEN: Cannot update another employee travel trip.');
          }
          if (claim.status !== 'IN_PROGRESS') {
            throw new Error('Cannot record live waypoints after claim submission.');
          }

          const lat = Number(payload?.latitude);
          const lng = Number(payload?.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
            throw new Error('Valid GPS waypoint coordinates required.');
          }

          const nowIso = String(payload?.deviceTimestamp || new Date().toISOString());
          const accuracy = Math.round(Number(payload?.accuracy || 0));
          const waypoints = Array.isArray(claim.waypoints) ? claim.waypoints : [];
          const prev = waypoints[waypoints.length - 1];
          const stepMeters = prev ? haversineMeters(Number(prev.latitude), Number(prev.longitude), lat, lng) : 0;
          const elapsedMs = prev ? Date.now() - new Date(prev.timestamp).getTime() : 999999;

          let address = String(payload?.address || '').trim();
          let placeId = String(payload?.placeId || '').trim();
          if (!address && (!prev || stepMeters >= 40)) {
            const geo = await reverseGeocodeCoords(lat, lng);
            address = geo.address;
            placeId = geo.placeId;
          } else if (!address && prev?.address) {
            address = prev.address;
            placeId = prev.placeId || '';
          }

          if (payload?.force || !prev || stepMeters >= 15 || elapsedMs >= 20000) {
            waypoints.push({
              timestamp: nowIso,
              latitude: lat,
              longitude: lng,
              accuracy,
              address,
              placeId,
              speedMps: payload?.speedMps != null && Number.isFinite(Number(payload.speedMps)) ? Number(payload.speedMps) : null,
              distanceFromPrevMeters: stepMeters,
            });
            claim.waypoints = waypoints;
          }

          const gpsKm = computeGpsTrailKm(claim.waypoints);
          claim.gpsTrackedDistanceKm = gpsKm;
          claim.distanceKm = gpsKm;
          claim.distanceSource = 'LIVE_GPS_TRAIL';
          claim.ratePerKm = getConveyanceRateForVehicle(db, normalizeVehicleType(claim.vehicleType));
          claim.claimAmount = Math.round(gpsKm * claim.ratePerKm * 100) / 100;
          claim.updatedAt = nowIso;

          await updateLiveLoc(db, authUser, {
            latitude: lat,
            longitude: lng,
            accuracy,
            address,
            placeId,
            attendanceType: 'FIELD',
            speedMps: payload?.speedMps,
            headingDeg: payload?.headingDeg,
            locationPermissionStatus: 'ACTIVE',
            isSharingActive: true,
            deviceTimestamp: nowIso,
          });
          saveDb(db);
          res.json({ok: true, claim});
          return;
        }

        case 'completeTravelTrip': {
          const claim = db.travelConveyance.find((c) => c.claimId === payload?.claimId);
          if (!claim) throw new Error('Travel trip not found.');
          if (authUser.role === 'EMPLOYEE' && claim.employeeId !== authUser.employeeId) {
            throw new Error('FORBIDDEN: Cannot end another employee travel trip.');
          }
          if (claim.status !== 'IN_PROGRESS') {
            throw new Error('This travel trip has already been submitted or finalized.');
          }

          const lat = Number(payload?.latitude);
          const lng = Number(payload?.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
            throw new Error('100% live GPS Location B coordinates are required to end the trip.');
          }

          const vt = payload?.vehicleType ? normalizeVehicleType(payload.vehicleType) : normalizeVehicleType(claim.vehicleType);
          const ratePerKm = getConveyanceRateForVehicle(db, vt);
          const nowIso = String(payload?.deviceTimestamp || new Date().toISOString());
          const accuracy = Math.round(Number(payload?.accuracy || 0));

          let toAddress = String(payload?.address || '').trim();
          let toPlaceId = String(payload?.placeId || '').trim();
          let quotaExceeded = false;
          if (!toAddress) {
            const geo = await reverseGeocodeCoords(lat, lng);
            if (geo.quotaExceeded) quotaExceeded = true;
            toAddress = geo.address;
            toPlaceId = geo.placeId;
          }

          const waypoints = Array.isArray(claim.waypoints) ? [...claim.waypoints] : [];
          const prev = waypoints[waypoints.length - 1];
          const stepMeters = prev ? haversineMeters(Number(prev.latitude), Number(prev.longitude), lat, lng) : 0;
          if (!prev || stepMeters > 0) {
            waypoints.push({
              timestamp: nowIso,
              latitude: lat,
              longitude: lng,
              accuracy,
              address: toAddress || `GPS (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
              placeId: toPlaceId,
              speedMps: null,
              distanceFromPrevMeters: stepMeters,
            });
          }

          const gpsKm = computeGpsTrailKm(waypoints);
          const routeInfo = await computeGoogleTravelRoute(
            Number(claim.fromLat),
            Number(claim.fromLng),
            lat,
            lng,
            vt,
          );
          if (routeInfo.quotaExceeded) quotaExceeded = true;

          let distanceKm = gpsKm;
          let distanceSource: 'LIVE_GPS_TRAIL' | 'GOOGLE_ROUTES_API' = 'LIVE_GPS_TRAIL';
          if (routeInfo.googleRouteDistanceKm > 0 && (waypoints.length <= 2 || gpsKm < 0.05)) {
            distanceKm = routeInfo.googleRouteDistanceKm;
            distanceSource = 'GOOGLE_ROUTES_API';
          } else if (gpsKm >= 0.05) {
            distanceKm = gpsKm;
            distanceSource = 'LIVE_GPS_TRAIL';
          } else if (routeInfo.googleRouteDistanceKm > 0) {
            distanceKm = routeInfo.googleRouteDistanceKm;
            distanceSource = 'GOOGLE_ROUTES_API';
          }

          claim.vehicleType = vt;
          claim.ratePerKm = ratePerKm;
          claim.toAddress = toAddress || `GPS (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
          claim.toLat = lat;
          claim.toLng = lng;
          claim.toAccuracy = accuracy;
          claim.toPlaceId = toPlaceId;
          claim.toMapsUrl = buildMapsUrl(lat, lng, toPlaceId);
          claim.endedAt = nowIso;
          claim.waypoints = waypoints;
          claim.gpsTrackedDistanceKm = gpsKm;
          claim.googleRouteDistanceKm = routeInfo.googleRouteDistanceKm;
          claim.distanceKm = distanceKm;
          claim.distanceSource = distanceSource;
          claim.routeDurationText = routeInfo.routeDurationText;
          claim.routePolyline = routeInfo.routePolyline;
          claim.claimAmount = Math.round(distanceKm * ratePerKm * 100) / 100;
          if (payload?.purpose !== undefined) claim.purpose = String(payload.purpose || '').trim();
          if (payload?.remarks !== undefined) claim.remarks = String(payload.remarks || '').trim();
          claim.updatedAt = nowIso;

          if (payload?.submitNow) {
            if (!claim.purpose) {
              throw new Error('Travel purpose is required to submit the conveyance claim.');
            }
            claim.status = 'SUBMITTED';
            claim.submittedAt = nowIso;
            const admins = db.users.filter((u) => u.status === 'ACTIVE' && (u.role === 'SUPER_ADMIN' || u.role === 'HR_ADMIN'));
            for (const adm of admins) {
              appendNotification(
                db,
                adm.employeeId,
                'TRAVEL',
                `Travel Claim Submitted (${claim.claimId})`,
                `${authUser.fullName} claimed ₹${claim.claimAmount} (${distanceKm} km · ${vt} @ ₹${ratePerKm}/km) from ${claim.fromAddress} to ${claim.toAddress}.`,
              );
            }
          }

          await updateLiveLoc(db, authUser, {
            latitude: lat,
            longitude: lng,
            accuracy,
            address: claim.toAddress,
            placeId: toPlaceId,
            attendanceType: 'FIELD',
            locationPermissionStatus: 'ACTIVE',
            isSharingActive: true,
            deviceTimestamp: nowIso,
          });
          appendAudit(
            db,
            authUser,
            payload?.submitNow ? 'SUBMIT_TRAVEL_CLAIM' : 'COMPLETE_TRAVEL_TRIP',
            'TRAVEL',
            claim.claimId,
            `${vt} ${distanceKm} km @ ₹${ratePerKm}/km = ₹${claim.claimAmount} (${claim.fromAddress} -> ${claim.toAddress})`,
          );
          saveDb(db);
          res.json({ok: true, claim, quotaExceeded});
          return;
        }

        case 'submitTravelClaim': {
          const claim = db.travelConveyance.find((c) => c.claimId === payload?.claimId);
          if (!claim) throw new Error('Travel trip not found.');
          if (authUser.role === 'EMPLOYEE' && claim.employeeId !== authUser.employeeId) {
            throw new Error('FORBIDDEN: Cannot submit another employee claim.');
          }
          if (claim.status !== 'IN_PROGRESS') {
            throw new Error('Only completed active trips can be submitted.');
          }
          if (claim.toLat == null || claim.toLng == null || !claim.endedAt) {
            throw new Error('Capture Location B (End Trip) before submitting your claim.');
          }
          const purpose = String(payload?.purpose ?? claim.purpose ?? '').trim();
          if (!purpose) throw new Error('Purpose of travel is required.');

          const vt = payload?.vehicleType ? normalizeVehicleType(payload.vehicleType) : normalizeVehicleType(claim.vehicleType);
          const ratePerKm = getConveyanceRateForVehicle(db, vt);
          if (vt !== claim.vehicleType) {
            const routeInfo = await computeGoogleTravelRoute(
              Number(claim.fromLat),
              Number(claim.fromLng),
              Number(claim.toLat),
              Number(claim.toLng),
              vt,
            );
            if (routeInfo.googleRouteDistanceKm > 0) {
              claim.googleRouteDistanceKm = routeInfo.googleRouteDistanceKm;
              claim.routeDurationText = routeInfo.routeDurationText;
              claim.routePolyline = routeInfo.routePolyline;
              if (claim.distanceSource === 'GOOGLE_ROUTES_API' || claim.gpsTrackedDistanceKm < 0.05) {
                claim.distanceKm = routeInfo.googleRouteDistanceKm;
              }
            }
          }
          const nowIso = new Date().toISOString();
          claim.vehicleType = vt;
          claim.ratePerKm = ratePerKm;
          claim.claimAmount = Math.round(Number(claim.distanceKm || 0) * ratePerKm * 100) / 100;
          claim.purpose = purpose;
          claim.remarks = String(payload?.remarks ?? claim.remarks ?? '').trim();
          claim.status = 'SUBMITTED';
          claim.submittedAt = nowIso;
          claim.updatedAt = nowIso;

          const admins = db.users.filter((u) => u.status === 'ACTIVE' && (u.role === 'SUPER_ADMIN' || u.role === 'HR_ADMIN'));
          for (const adm of admins) {
            appendNotification(
              db,
              adm.employeeId,
              'TRAVEL',
              `Travel Claim Submitted (${claim.claimId})`,
              `${claim.employeeName} claimed ₹${claim.claimAmount} (${claim.distanceKm} km · ${vt} @ ₹${ratePerKm}/km) from ${claim.fromAddress} to ${claim.toAddress}.`,
            );
          }
          appendAudit(
            db,
            authUser,
            'SUBMIT_TRAVEL_CLAIM',
            'TRAVEL',
            claim.claimId,
            `Submitted ₹${claim.claimAmount} (${claim.distanceKm} km · ${vt} @ ₹${ratePerKm}/km)`,
          );
          saveDb(db);
          res.json({ok: true, claim});
          return;
        }

        case 'cancelTravelTrip': {
          const idx = db.travelConveyance.findIndex((c) => c.claimId === payload?.claimId);
          if (idx === -1) throw new Error('Travel trip not found.');
          const claim = db.travelConveyance[idx];
          if (authUser.role === 'EMPLOYEE' && claim.employeeId !== authUser.employeeId) {
            throw new Error('FORBIDDEN: Cannot cancel another employee trip.');
          }
          if (claim.status !== 'IN_PROGRESS') {
            throw new Error('Only unsubmitted in-progress trips can be cancelled.');
          }
          db.travelConveyance.splice(idx, 1);
          appendAudit(db, authUser, 'CANCEL_TRAVEL_TRIP', 'TRAVEL', claim.claimId, 'Cancelled unsubmitted trip');
          saveDb(db);
          res.json({ok: true});
          return;
        }

        case 'reviewTravelClaim': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          const claim = db.travelConveyance.find((c) => c.claimId === payload?.claimId);
          if (!claim) throw new Error('Travel claim not found.');
          if (claim.status === 'IN_PROGRESS') {
            throw new Error('Cannot review a trip that has not been submitted yet.');
          }
          const decision = String(payload?.decision || '').toUpperCase();
          if (!['APPROVED', 'REJECTED', 'PAID'].includes(decision)) {
            throw new Error('Decision must be APPROVED, REJECTED, or PAID.');
          }
          const nowIso = new Date().toISOString();
          claim.status = decision;
          claim.reviewedBy = authUser.fullName;
          claim.reviewerRole = authUser.role;
          claim.reviewedAt = nowIso;
          if (decision === 'REJECTED') {
            claim.rejectionReason = String(payload?.rejectionReason || 'Declined after route audit').trim();
          } else {
            claim.rejectionReason = '';
          }
          if (decision === 'PAID') {
            claim.paidAt = nowIso;
          }
          claim.updatedAt = nowIso;

          appendNotification(
            db,
            claim.employeeId,
            'TRAVEL',
            `Travel Claim ${decision} (${claim.claimId})`,
            `Your conveyance claim of ₹${claim.claimAmount} (${claim.distanceKm} km · ${claim.vehicleType}) was marked ${decision} by ${authUser.fullName}.`,
          );
          appendAudit(
            db,
            authUser,
            `TRAVEL_CLAIM_${decision}`,
            'TRAVEL',
            claim.claimId,
            `${claim.employeeId} · ₹${claim.claimAmount} (${claim.distanceKm} km)`,
          );
          saveDb(db);
          res.json({ok: true, claim});
          return;
        }

        case 'getFoodAllowances': {
          const policy = getFoodAllowancePolicy(db);
          const todayShift = evaluateFoodWorkingHoursEligibility(db, authUser.employeeId);
          let claims = authUser.role === 'EMPLOYEE'
            ? db.foodAllowances.filter((c) => c.employeeId === authUser.employeeId)
            : [...db.foodAllowances];
          if (authUser.role !== 'EMPLOYEE' && payload?.employeeId) {
            claims = claims.filter((c) => c.employeeId === payload.employeeId);
          }
          if (payload?.status && payload.status !== 'ALL') {
            claims = claims.filter((c) => c.status === payload.status);
          }
          if (payload?.mealType && payload.mealType !== 'ALL') {
            claims = claims.filter((c) => c.mealType === payload.mealType);
          }
          if (payload?.month) {
            claims = claims.filter((c) => String(c.date || '').startsWith(String(payload.month)));
          }
          claims.sort((a, b) => String(b.claimedAt || '').localeCompare(String(a.claimedAt || '')));
          res.json({ok: true, claims, policy, todayShift});
          return;
        }

        case 'claimFoodAllowance': {
          const policy = getFoodAllowancePolicy(db);
          if (!policy.enabled) {
            throw new Error('Food allowance claims are currently disabled by Super Admin.');
          }
          const mealType = String(payload?.mealType || '').toUpperCase();
          if (!['BREAKFAST', 'LUNCH', 'DINNER'].includes(mealType)) {
            throw new Error('Invalid meal type. Choose BREAKFAST, LUNCH, or DINNER.');
          }
          const now = new Date();
          const nowIso = now.toISOString();
          const eligibility = evaluateFoodWorkingHoursEligibility(db, authUser.employeeId, now);
          if (!eligibility.eligible) {
            throw new Error(eligibility.reason);
          }

          const duplicate = db.foodAllowances.find(
            (c) =>
              c.employeeId === authUser.employeeId &&
              c.date === eligibility.date &&
              c.mealType === mealType &&
              c.status !== 'REJECTED',
          );
          if (duplicate) {
            const label = mealType.charAt(0) + mealType.slice(1).toLowerCase();
            throw new Error(`${label} allowance has already been claimed for working date ${eligibility.date} (${duplicate.claimId}).`);
          }

          const amount =
            mealType === 'BREAKFAST'
              ? policy.breakfast
              : mealType === 'LUNCH'
                ? policy.lunch
                : policy.dinner;
          const claimId = `FOOD-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
          const claim = {
            claimId,
            employeeId: authUser.employeeId,
            employeeName: authUser.fullName,
            department: authUser.department,
            designation: authUser.designation,
            date: eligibility.date,
            mealType,
            amount,
            checkInTime: eligibility.checkInTime,
            checkOutTime: eligibility.checkOutTime,
            claimedAt: nowIso,
            notes: String(payload?.notes || '').trim(),
            status: 'SUBMITTED',
            reviewedBy: '',
            reviewerRole: '',
            reviewedAt: '',
            rejectionReason: '',
            paidAt: '',
            updatedAt: nowIso,
          };
          db.foodAllowances.push(claim);

          const admins = db.users.filter((u) => u.status === 'ACTIVE' && (u.role === 'SUPER_ADMIN' || u.role === 'HR_ADMIN'));
          for (const adm of admins) {
            appendNotification(
              db,
              adm.employeeId,
              'FOOD',
              `Food Allowance Claim (${claimId})`,
              `${authUser.fullName} claimed ₹${amount} for ${mealType} during working hours (${eligibility.date}).`,
            );
          }
          appendAudit(
            db,
            authUser,
            'CLAIM_FOOD_ALLOWANCE',
            'FOOD',
            claimId,
            `${mealType} ₹${amount} · Working date ${eligibility.date} (Checked in ${eligibility.checkInTime})`,
          );
          saveDb(db);
          res.json({ok: true, claim, policy, todayShift: eligibility});
          return;
        }

        case 'reviewFoodAllowance': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          const claim = db.foodAllowances.find((c) => c.claimId === payload?.claimId);
          if (!claim) throw new Error('Food allowance claim not found.');
          const decision = String(payload?.decision || '').toUpperCase();
          if (!['APPROVED', 'REJECTED', 'PAID'].includes(decision)) {
            throw new Error('Decision must be APPROVED, REJECTED, or PAID.');
          }
          if (claim.status === 'REJECTED' && decision !== 'REJECTED') {
            throw new Error('Rejected food allowance claims cannot be approved or paid.');
          }
          if (claim.status === 'PAID' && decision === 'REJECTED') {
            throw new Error('Paid food allowance claims cannot be rejected.');
          }
          const nowIso = new Date().toISOString();
          claim.status = decision;
          claim.reviewedBy = authUser.fullName;
          claim.reviewerRole = authUser.role;
          claim.reviewedAt = nowIso;
          if (decision === 'REJECTED') {
            claim.rejectionReason = String(payload?.rejectionReason || 'Declined after working-hours audit').trim();
          } else {
            claim.rejectionReason = '';
          }
          if (decision === 'PAID') {
            claim.paidAt = nowIso;
          }
          claim.updatedAt = nowIso;

          appendNotification(
            db,
            claim.employeeId,
            'FOOD',
            `Food Allowance ${decision} (${claim.claimId})`,
            `Your ${claim.mealType} allowance claim of ₹${claim.amount} (${claim.date}) was marked ${decision} by ${authUser.fullName}.`,
          );
          appendAudit(
            db,
            authUser,
            `FOOD_ALLOWANCE_${decision}`,
            'FOOD',
            claim.claimId,
            `${claim.employeeId} · ${claim.mealType} ₹${claim.amount}`,
          );
          saveDb(db);
          res.json({ok: true, claim});
          return;
        }

        case 'syncOfflineQueue': {
          const items = (Array.isArray(payload.items) ? [...payload.items] : []).sort((a, b) =>
            String(a.deviceTimestamp || '').localeCompare(String(b.deviceTimestamp || '')),
          );
          const results: any[] = [];
          for (const item of items) {
            if (db.syncQueue.some((q) => q.eventId === item.eventId)) {
              results.push({eventId: item.eventId, status: 'SYNCED', duplicateIgnored: true});
              continue;
            }
            try {
              const p = {...item.payload, deviceTimestamp: item.deviceTimestamp, isOfflineSync: true, eventId: item.eventId};
              if (item.type === 'CHECK_IN') await checkInEmployee(db, authUser, p);
              if (item.type === 'CHECK_OUT') await checkOutEmployee(db, authUser, p);
              if (item.type === 'LOCATION_PING') await updateLiveLoc(db, authUser, p);
              db.syncQueue.push({
                eventId: item.eventId,
                employeeId: authUser.employeeId,
                type: item.type,
                deviceTimestamp: item.deviceTimestamp,
                serverReceivedAt: new Date().toISOString(),
                verificationStatus: 'DEVICE_CAPTURED_UNVERIFIED',
              });
              results.push({eventId: item.eventId, status: 'SYNCED'});
            } catch (e: any) {
              results.push({eventId: item.eventId, status: 'FAILED', error: e.message});
            }
          }
          saveDb(db);
          res.json({ok: true, results});
          return;
        }

        case 'getLeaveData': {
          const applications = authUser.role === 'EMPLOYEE'
            ? db.leaveApplications.filter((a) => a.employeeId === authUser.employeeId)
            : db.leaveApplications;
          const balances = authUser.role === 'EMPLOYEE'
            ? db.leaveBalances.filter((b) => b.employeeId === authUser.employeeId)
            : db.leaveBalances;
          res.json({
            ok: true,
            leaveTypes: db.leaveTypes,
            applications: [...applications].reverse(),
            balances,
            holidays: db.holidays,
          });
          return;
        }

        case 'applyLeave': {
          const leaveId = `LV-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
          const now = new Date().toISOString();
          const docUrl = payload.documentDataUrl
            ? saveBase64File(leaveId, payload.documentName || 'support.pdf', payload.documentDataUrl)
            : '';
          const s = new Date(payload.startDate);
          const e = new Date(payload.endDate);
          const days = payload.isHalfDay ? 0.5 : Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
          const lt = db.leaveTypes.find((t) => t.leaveTypeId === payload.leaveTypeId);

          const record = {
            leaveId,
            employeeId: authUser.employeeId,
            employeeName: authUser.fullName,
            department: authUser.department,
            leaveTypeId: payload.leaveTypeId,
            leaveTypeName: lt?.name || payload.leaveTypeName || 'Leave',
            startDate: payload.startDate,
            endDate: payload.endDate,
            isHalfDay: Boolean(payload.isHalfDay),
            halfDaySession: payload.halfDaySession || '',
            totalDays: days,
            reason: payload.reason,
            documentUrl: docUrl,
            status: 'PENDING',
            reviewedBy: '',
            reviewerRole: '',
            rejectionReason: '',
            appliedAt: now,
            updatedAt: now,
          };
          db.leaveApplications.push(record);
          appendNotification(db, 'ALL', 'LEAVE', 'Leave Application Submitted', `${authUser.fullName} requested ${days} day(s) of ${record.leaveTypeName}.`);
          appendAudit(db, authUser, 'APPLY_LEAVE', 'LEAVES', leaveId, `${days} day(s)`);
          saveDb(db);
          res.json({ok: true, leave: record});
          return;
        }

        case 'reviewLeave': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          const app = db.leaveApplications.find((a) => a.leaveId === payload.leaveId);
          if (!app) throw new Error('Leave application not found.');
          app.status = payload.decision;
          app.reviewedBy = authUser.fullName;
          app.reviewerRole = authUser.role;
          app.rejectionReason = payload.rejectionReason || '';
          app.updatedAt = new Date().toISOString();
          if (payload.decision === 'APPROVED') {
            const bal = db.leaveBalances.find((b) => b.employeeId === app.employeeId && b.leaveTypeId === app.leaveTypeId);
            if (bal) {
              bal.used = Number(bal.used || 0) + Number(app.totalDays || 0);
              bal.remaining = Math.max(0, Number(bal.allocated || 0) - bal.used);
            }
          }
          appendNotification(db, app.employeeId, 'LEAVE', `Leave ${payload.decision}`, `Your leave (${app.leaveId}) was ${payload.decision.toLowerCase()}.`);
          appendAudit(db, authUser, 'REVIEW_LEAVE', 'LEAVES', app.leaveId, payload.decision);
          saveDb(db);
          res.json({ok: true});
          return;
        }

        case 'cancelLeave': {
          const app = db.leaveApplications.find((a) => a.leaveId === payload.leaveId);
          if (!app) throw new Error('Leave application not found.');
          if (authUser.role === 'EMPLOYEE' && app.employeeId !== authUser.employeeId) throw new Error('FORBIDDEN');
          if (app.status === 'APPROVED') {
            const bal = db.leaveBalances.find((b) => b.employeeId === app.employeeId && b.leaveTypeId === app.leaveTypeId);
            if (bal) {
              bal.used = Math.max(0, Number(bal.used || 0) - Number(app.totalDays || 0));
              bal.remaining = Math.max(0, Number(bal.allocated || 0) - bal.used);
            }
          }
          app.status = 'CANCELLED';
          app.updatedAt = new Date().toISOString();
          appendAudit(db, authUser, 'CANCEL_LEAVE', 'LEAVES', app.leaveId, 'Cancelled');
          saveDb(db);
          res.json({ok: true});
          return;
        }

        case 'updateLeaveApplication': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          const app = db.leaveApplications.find((a) => a.leaveId === payload.leaveId);
          if (!app) throw new Error('Leave application not found.');

          const prevStatus = app.status;
          const prevTypeId = app.leaveTypeId;
          const prevDays = Number(app.totalDays || 0);

          if (prevStatus === 'APPROVED') {
            const oldBal = db.leaveBalances.find((b) => b.employeeId === app.employeeId && b.leaveTypeId === prevTypeId);
            if (oldBal) {
              oldBal.used = Math.max(0, Number(oldBal.used || 0) - prevDays);
              oldBal.remaining = Math.max(0, Number(oldBal.allocated || 0) - oldBal.used);
            }
          }

          if (payload.leaveTypeId) {
            app.leaveTypeId = payload.leaveTypeId;
            const lt = db.leaveTypes.find((t) => t.leaveTypeId === payload.leaveTypeId);
            if (lt) app.leaveTypeName = lt.name;
          }
          if (payload.startDate) app.startDate = payload.startDate;
          if (payload.endDate) app.endDate = payload.endDate;
          if (payload.isHalfDay !== undefined) app.isHalfDay = Boolean(payload.isHalfDay);
          if (payload.halfDaySession !== undefined) app.halfDaySession = payload.halfDaySession;
          if (payload.totalDays !== undefined && payload.totalDays !== '') {
            app.totalDays = Number(payload.totalDays);
          } else {
            const s = new Date(app.startDate);
            const e = new Date(app.endDate);
            app.totalDays = app.isHalfDay ? 0.5 : Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
          }
          if (payload.reason !== undefined) app.reason = payload.reason;
          if (payload.status) app.status = payload.status;
          if (payload.rejectionReason !== undefined) app.rejectionReason = payload.rejectionReason;
          app.reviewedBy = authUser.fullName;
          app.reviewerRole = authUser.role;
          app.updatedAt = new Date().toISOString();

          if (app.status === 'APPROVED') {
            const newBal = db.leaveBalances.find((b) => b.employeeId === app.employeeId && b.leaveTypeId === app.leaveTypeId);
            if (newBal) {
              newBal.used = Number(newBal.used || 0) + Number(app.totalDays || 0);
              newBal.remaining = Math.max(0, Number(newBal.allocated || 0) - newBal.used);
            }
          }

          appendAudit(db, authUser, 'UPDATE_LEAVE', 'LEAVES', app.leaveId, `${app.status} (${app.totalDays}d)`);
          saveDb(db);
          res.json({ok: true, leave: app});
          return;
        }

        case 'updateLeaveBalance': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          const bal = db.leaveBalances.find((b) => b.balanceId === payload.balanceId);
          if (!bal) throw new Error('Leave balance record not found.');
          bal.allocated = Math.max(0, Number(payload.allocated ?? bal.allocated));
          bal.used = Math.max(0, Number(payload.used ?? bal.used));
          bal.remaining = Math.max(0, bal.allocated - bal.used);
          appendAudit(db, authUser, 'UPDATE_LEAVE_BALANCE', 'LEAVES', bal.balanceId, `Allocated ${bal.allocated}, Used ${bal.used}`);
          saveDb(db);
          res.json({ok: true, balance: bal});
          return;
        }

        case 'saveLeaveType': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          const existing = payload.leaveTypeId ? db.leaveTypes.find((lt) => lt.leaveTypeId === payload.leaveTypeId) : undefined;
          if (existing) {
            existing.name = payload.name ?? existing.name;
            existing.code = (payload.code ?? existing.code).toUpperCase();
            existing.annualQuota = Number(payload.annualQuota ?? existing.annualQuota);
            existing.isPaid = payload.isPaid !== undefined ? Boolean(payload.isPaid) : existing.isPaid;
            existing.requiresDocument = payload.requiresDocument !== undefined ? Boolean(payload.requiresDocument) : existing.requiresDocument;
            appendAudit(db, authUser, 'UPDATE_LEAVE_TYPE', 'LEAVES', existing.leaveTypeId, existing.name);
            saveDb(db);
            res.json({ok: true, leaveType: existing});
            return;
          }
          const lt = {
            leaveTypeId: `LT-${String(payload.code || crypto.randomBytes(2).toString('hex')).toUpperCase()}`,
            name: payload.name,
            code: String(payload.code || 'LV').toUpperCase(),
            annualQuota: Number(payload.annualQuota || 0),
            isPaid: payload.isPaid !== false,
            requiresDocument: Boolean(payload.requiresDocument),
          };
          db.leaveTypes.push(lt);
          appendAudit(db, authUser, 'CREATE_LEAVE_TYPE', 'LEAVES', lt.leaveTypeId, lt.name);
          saveDb(db);
          res.json({ok: true, leaveType: lt});
          return;
        }

        case 'getPayrollData': {
          let structures = db.salaryStructure;
          let payrolls = db.payroll;
          if (authUser.role === 'EMPLOYEE') {
            structures = structures.filter((s) => s.employeeId === authUser.employeeId);
            payrolls = payrolls.filter((p) => p.employeeId === authUser.employeeId && p.status !== 'DRAFT');
          } else if (payload?.month) {
            payrolls = payrolls.filter((p) => p.month === payload.month);
          }
          res.json({ok: true, structures, payrolls: [...payrolls].reverse()});
          return;
        }

        case 'saveSalaryStructure': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          const existing = db.salaryStructure.find((s) => s.employeeId === payload.employeeId);
          const rec = {
            ...payload,
            structureId: existing ? existing.structureId : `SAL-${payload.employeeId}`,
            updatedAt: new Date().toISOString(),
          };
          if (existing) Object.assign(existing, rec);
          else db.salaryStructure.push(rec);
          const emp = db.employees.find((e) => e.employeeId === payload.employeeId);
          if (emp && emp.onboardingChecklist) emp.onboardingChecklist.salaryConfigured = true;
          appendAudit(db, authUser, 'SAVE_SALARY_STRUCTURE', 'PAYROLL', payload.employeeId, 'Saved salary structure');
          saveDb(db);
          res.json({ok: true, structure: rec});
          return;
        }

        case 'generatePayroll': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          const month = payload.month;
          const activeEmps = db.employees.filter((e) => e.status === 'ACTIVE');
          const workingDaysInMonth = 26;
          const otPolicy = getOvertimePolicy(db);
          let count = 0;

          for (const emp of activeEmps) {
            const struct = db.salaryStructure.find((s) => s.employeeId === emp.employeeId);
            if (!struct) continue;
            const existing = db.payroll.find((p) => p.employeeId === emp.employeeId && p.month === month);
            if (existing && existing.status === 'PAID') continue;

            const empAtt = db.attendance.filter((a) => a.employeeId === emp.employeeId && String(a.date).startsWith(month));
            let presentDays = 0;
            let overtimeHours = 0;
            for (const a of empAtt) {
              presentDays += a.status === 'HALF_DAY' ? 0.5 : 1;
              const recHours = Number(a.workingHours || 0);
              const derivedOt = recHours > otPolicy.afterHours
                ? Math.round((recHours - otPolicy.afterHours) * 100) / 100
                : 0;
              const recOt = a.overtimeHours !== undefined && a.overtimeHours !== null && Number(a.overtimeHours) > 0
                ? Number(a.overtimeHours)
                : derivedOt;
              overtimeHours += recOt;
            }
            overtimeHours = Math.round(overtimeHours * 100) / 100;

            let paidLeaves = 0;
            let unpaidLeaves = 0;
            const empLeaves = db.leaveApplications.filter(
              (l) => l.employeeId === emp.employeeId && l.status === 'APPROVED' && String(l.startDate).startsWith(month),
            );
            for (const l of empLeaves) {
              const lt = db.leaveTypes.find((t) => t.leaveTypeId === l.leaveTypeId);
              if (lt && !lt.isPaid) unpaidLeaves += Number(l.totalDays || 0);
              else paidLeaves += Number(l.totalDays || 0);
            }

            const basic = Number(struct.basicSalary || 0);
            const hra = Number(struct.hra || 0);
            const allowances = Number(struct.conveyanceAllowance || 0) + Number(struct.specialAllowance || 0);
            const monthlyGrossBase = basic + hra + allowances;
            const unpaidDeduction = Math.round((monthlyGrossBase / workingDaysInMonth) * unpaidLeaves);
            const hourlyOtRate = !otPolicy.enabled
              ? 0
              : otPolicy.rateMode === 'FIXED_HOURLY_RATE'
                ? Number(struct.overtimeHourlyRate || 0)
                : Math.round(basic * (otPolicy.basicPercentPerHour / 100) * 100) / 100;
            const overtimePay = otPolicy.enabled ? Math.round(overtimeHours * hourlyOtRate * 100) / 100 : 0;
            const incentives = Number(payload.incentivesByEmployee?.[emp.employeeId] || 0);
            const grossEarnings = Math.round((monthlyGrossBase + overtimePay + incentives) * 100) / 100;

            const pfWage = Math.min(basic, Number(struct.pfWageCap || 15000));
            const pf = struct.pfApplicable ? Math.round(pfWage * (Number(struct.pfEmployeePercent || 12) / 100)) : 0;
            const esi = struct.esiApplicable && grossEarnings <= 21000
              ? Math.round(grossEarnings * (Number(struct.esiEmployeePercent || 0.75) / 100))
              : 0;
            const pt = struct.ptApplicable ? Number(struct.ptMonthlyAmount || 200) : 0;
            const tds = Number(struct.tdsMonthlyAmount || 0);
            const otherDed = Number(struct.otherFixedDeduction || 0);
            const totalDeductions = Math.round((unpaidDeduction + pf + esi + pt + tds + otherDed) * 100) / 100;
            const netPayable = Math.round(Math.max(0, grossEarnings - totalDeductions) * 100) / 100;

            const rec = {
              payrollId: existing ? existing.payrollId : `PAY-${month.replace('-', '')}-${emp.employeeId}`,
              month,
              employeeId: emp.employeeId,
              employeeName: emp.fullName,
              department: emp.department,
              designation: emp.designation,
              workingDaysInMonth,
              presentDays,
              paidLeaveDays: paidLeaves,
              unpaidLeaveDays: unpaidLeaves,
              overtimeHours,
              overtimeHourlyRateApplied: hourlyOtRate,
              overtimeBasicPercentApplied: otPolicy.rateMode === 'BASIC_PERCENT_PER_HOUR' ? otPolicy.basicPercentPerHour : 0,
              basicEarned: basic,
              hraEarned: hra,
              allowancesEarned: allowances,
              overtimePay,
              incentives,
              grossEarnings,
              unpaidDeduction,
              pfDeduction: pf,
              esiDeduction: esi,
              professionalTax: pt,
              tdsDeduction: tds,
              otherDeductions: otherDed,
              totalDeductions,
              netPayable,
              status: 'DRAFT',
              approvedBy: '',
              generatedAt: new Date().toISOString(),
              paidAt: '',
            };
            if (existing) Object.assign(existing, rec);
            else db.payroll.push(rec);
            count++;
          }
          const otSummary = otPolicy.enabled
            ? otPolicy.rateMode === 'FIXED_HOURLY_RATE'
              ? `Fixed hourly rate after ${otPolicy.afterHours}h duty`
              : `${otPolicy.basicPercentPerHour}% of Basic/hr after ${otPolicy.afterHours}h duty`
            : 'Overtime pay disabled';
          appendAudit(db, authUser, 'GENERATE_PAYROLL', 'PAYROLL', month, `Generated ${count} payroll(s) · OT Policy: ${otSummary}`);
          saveDb(db);
          res.json({ok: true, count});
          return;
        }

        case 'updatePayrollStatus': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          const rec = db.payroll.find((p) => p.payrollId === payload.payrollId);
          if (!rec) throw new Error('Payroll record not found.');
          rec.status = payload.status;
          if (payload.status === 'APPROVED') rec.approvedBy = authUser.fullName;
          if (payload.status === 'PAID') rec.paidAt = new Date().toISOString();
          if (payload.incentives !== undefined) {
            rec.incentives = Number(payload.incentives);
            rec.grossEarnings = Math.round((rec.basicEarned + rec.hraEarned + rec.allowancesEarned + rec.overtimePay + rec.incentives) * 100) / 100;
            rec.netPayable = Math.round(Math.max(0, rec.grossEarnings - rec.totalDeductions) * 100) / 100;
          }
          if (payload.status === 'APPROVED' || payload.status === 'PAID') {
            appendNotification(db, rec.employeeId, 'PAYROLL', `Payslip Available (${rec.month})`, `Your salary statement for ${rec.month} is ${payload.status.toLowerCase()}.`);
          }
          appendAudit(db, authUser, 'PAYROLL_STATUS', 'PAYROLL', rec.payrollId, payload.status);
          saveDb(db);
          res.json({ok: true});
          return;
        }

        case 'updatePayrollRecord': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          const rec = db.payroll.find((p) => p.payrollId === payload.payrollId);
          if (!rec) throw new Error('Payroll record not found.');
          const numKeys = [
            'workingDaysInMonth', 'presentDays', 'paidLeaveDays', 'unpaidLeaveDays', 'overtimeHours',
            'basicEarned', 'hraEarned', 'allowancesEarned', 'overtimePay', 'incentives',
            'unpaidDeduction', 'pfDeduction', 'esiDeduction', 'professionalTax', 'tdsDeduction', 'otherDeductions',
          ];
          for (const k of numKeys) {
            if (payload[k] !== undefined && payload[k] !== '') rec[k] = Number(payload[k]);
          }
          rec.grossEarnings = Math.round((Number(rec.basicEarned || 0) + Number(rec.hraEarned || 0) + Number(rec.allowancesEarned || 0) + Number(rec.overtimePay || 0) + Number(rec.incentives || 0)) * 100) / 100;
          rec.totalDeductions = Math.round((Number(rec.unpaidDeduction || 0) + Number(rec.pfDeduction || 0) + Number(rec.esiDeduction || 0) + Number(rec.professionalTax || 0) + Number(rec.tdsDeduction || 0) + Number(rec.otherDeductions || 0)) * 100) / 100;
          rec.netPayable = Math.round(Math.max(0, rec.grossEarnings - rec.totalDeductions) * 100) / 100;
          if (payload.status) {
            rec.status = payload.status;
            if (payload.status === 'APPROVED' && !rec.approvedBy) rec.approvedBy = authUser.fullName;
            if (payload.status === 'PAID' && !rec.paidAt) rec.paidAt = new Date().toISOString();
          }
          appendAudit(db, authUser, 'UPDATE_PAYROLL', 'PAYROLL', rec.payrollId, `Net ${rec.netPayable} (${rec.status})`);
          saveDb(db);
          res.json({ok: true, payroll: rec});
          return;
        }

        case 'getPerformanceData': {
          const reviews = authUser.role === 'EMPLOYEE'
            ? db.performanceReviews.filter((r) => r.employeeId === authUser.employeeId)
            : db.performanceReviews;
          const kpis = authUser.role === 'EMPLOYEE'
            ? db.performanceKpis.filter((k) => k.employeeId === authUser.employeeId)
            : db.performanceKpis;
          res.json({ok: true, reviews: [...reviews].reverse(), kpis});
          return;
        }

        case 'savePerformanceReview': {
          if (authUser.role === 'EMPLOYEE' && payload.employeeId !== authUser.employeeId) throw new Error('FORBIDDEN');
          const reviewId = payload.reviewId || `REV-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
          const existing = db.performanceReviews.find((r) => r.reviewId === reviewId);
          const now = new Date().toISOString();
          const rec = {
            reviewId,
            employeeId: payload.employeeId,
            employeeName: payload.employeeName,
            department: payload.department,
            cycleType: payload.cycleType || 'MONTHLY',
            periodLabel: payload.periodLabel,
            reviewerId: authUser.role === 'EMPLOYEE' ? existing?.reviewerId || '' : authUser.employeeId,
            reviewerName: authUser.role === 'EMPLOYEE' ? existing?.reviewerName || '' : authUser.fullName,
            criteria: payload.criteria || existing?.criteria || {
              attendancePunctuality: 4, workQuality: 4, productivity: 4, communication: 4,
              teamwork: 4, discipline: 4, targetAchievement: 4, initiative: 4,
            },
            selfAssessmentScore: Number(payload.selfAssessmentScore ?? existing?.selfAssessmentScore ?? 0),
            selfAssessmentNotes: payload.selfAssessmentNotes ?? existing?.selfAssessmentNotes ?? '',
            managerRating: authUser.role === 'EMPLOYEE' ? existing?.managerRating || 0 : Number(payload.managerRating || 0),
            managerFeedback: authUser.role === 'EMPLOYEE' ? existing?.managerFeedback || '' : payload.managerFeedback || '',
            hrComments: authUser.role === 'EMPLOYEE' ? existing?.hrComments || '' : payload.hrComments || '',
            strengths: payload.strengths ?? existing?.strengths ?? '',
            improvementAreas: payload.improvementAreas ?? existing?.improvementAreas ?? '',
            status: payload.status || 'MANAGER_REVIEW',
            updatedAt: now,
          };
          if (existing) Object.assign(existing, rec);
          else db.performanceReviews.push(rec);
          appendNotification(db, payload.employeeId, 'PERFORMANCE', 'Performance Review Updated', `Review for ${payload.periodLabel} updated.`);
          appendAudit(db, authUser, 'SAVE_REVIEW', 'PERFORMANCE', reviewId, payload.periodLabel);
          saveDb(db);
          res.json({ok: true, review: rec});
          return;
        }

        case 'saveKPI': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          const kpiId = payload.kpiId || `KPI-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
          const existing = db.performanceKpis.find((k) => k.kpiId === kpiId);
          const rec = {...payload, kpiId};
          if (existing) Object.assign(existing, rec);
          else db.performanceKpis.push(rec);
          appendAudit(db, authUser, 'SAVE_KPI', 'PERFORMANCE', kpiId, payload.title);
          saveDb(db);
          res.json({ok: true, kpi: rec});
          return;
        }

        case 'deleteKPI': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          const idx = db.performanceKpis.findIndex((k) => k.kpiId === payload.kpiId);
          if (idx === -1) throw new Error('KPI not found.');
          db.performanceKpis.splice(idx, 1);
          appendAudit(db, authUser, 'DELETE_KPI', 'PERFORMANCE', payload.kpiId, 'Deleted KPI');
          saveDb(db);
          res.json({ok: true});
          return;
        }

        case 'getTasks': {
          const tasks = authUser.role === 'EMPLOYEE'
            ? db.tasks.filter((t) => t.assignedToId === authUser.employeeId)
            : db.tasks;
          res.json({ok: true, tasks: [...tasks].reverse()});
          return;
        }

        case 'saveTask': {
          const existing = payload.taskId ? db.tasks.find((t) => t.taskId === payload.taskId) : null;
          if (authUser.role === 'EMPLOYEE' && (!existing || existing.assignedToId !== authUser.employeeId)) {
            throw new Error('FORBIDDEN');
          }
          const now = new Date().toISOString();
          if (existing) {
            if (payload.assignedToId && payload.assignedToId !== existing.assignedToId) {
              const emp = db.employees.find((e) => e.employeeId === payload.assignedToId);
              if (emp) {
                payload.assignedToName = emp.fullName;
                payload.department = emp.department;
              }
            }
            Object.assign(existing, payload, {updatedAt: now});
          } else {
            const task = {
              ...payload,
              taskId: `TSK-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
              assignedById: authUser.employeeId,
              assignedByName: authUser.fullName,
              createdAt: now,
              updatedAt: now,
            };
            db.tasks.push(task);
            appendNotification(db, task.assignedToId, 'TASK', 'New Task Assigned', `${task.title} (Due: ${task.deadline})`);
          }
          saveDb(db);
          res.json({ok: true});
          return;
        }

        case 'deleteTask': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          const idx = db.tasks.findIndex((t) => t.taskId === payload.taskId);
          if (idx === -1) throw new Error('Task not found.');
          db.tasks.splice(idx, 1);
          appendAudit(db, authUser, 'DELETE_TASK', 'TASKS', payload.taskId, 'Deleted task');
          saveDb(db);
          res.json({ok: true});
          return;
        }

        case 'getNotifications': {
          const notifications = db.notifications
            .filter((n) => n.recipientEmployeeId === 'ALL' || n.recipientEmployeeId === authUser.employeeId)
            .slice(-100)
            .reverse();
          res.json({ok: true, notifications});
          return;
        }

        case 'createAnnouncement': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          appendNotification(db, 'ALL', 'ANNOUNCEMENT', payload.title, payload.message);
          appendAudit(db, authUser, 'ANNOUNCEMENT', 'NOTIFICATIONS', 'ALL', payload.title);
          saveDb(db);
          res.json({ok: true});
          return;
        }

        case 'markNotificationRead': {
          const n = db.notifications.find((item) => item.notificationId === payload.notificationId);
          if (n) n.isRead = true;
          saveDb(db);
          res.json({ok: true});
          return;
        }

        case 'getAuditLogs': {
          requireRole(authUser, ['SUPER_ADMIN']);
          res.json({ok: true, logs: [...db.auditLogs].reverse().slice(0, 300)});
          return;
        }

        case 'getPasswordResetOtps': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          if (expireStaleOtps(db)) saveDb(db);
          const visible = db.passwordResetOtps
            .filter((o) => authUser.role === 'SUPER_ADMIN' || o.userRole === 'EMPLOYEE')
            .map(({otpHash: _h, otpSalt: _s, ...safe}) => safe)
            .reverse()
            .slice(0, 50);
          res.json({ok: true, otps: visible});
          return;
        }

        case 'adminIssuePasswordResetOtp': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          const identifier = String(payload.identifier || payload.employeeId || '').trim();
          const targetUser = findUserByIdentifier(db, identifier);
          if (!targetUser) throw new Error('User account not found.');
          if (targetUser.status !== 'ACTIVE') throw new Error('Account is inactive.');
          if (authUser.role === 'HR_ADMIN' && targetUser.role !== 'EMPLOYEE') {
            throw new Error('FORBIDDEN: Only Super Admin can issue OTPs for Admin accounts.');
          }
          const {record} = createAndDispatchPasswordResetOtp(db, targetUser, authUser);
          saveDb(db);
          const {otpHash: _h, otpSalt: _s, ...safeRecord} = record;
          res.json({ok: true, otp: safeRecord});
          return;
        }

        case 'revokePasswordResetOtp': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          const rec = db.passwordResetOtps.find((o) => o.otpId === payload.otpId);
          if (!rec) throw new Error('OTP record not found.');
          if (authUser.role === 'HR_ADMIN' && rec.userRole !== 'EMPLOYEE') {
            throw new Error('FORBIDDEN: Only Super Admin can revoke Admin OTPs.');
          }
          rec.status = 'REVOKED';
          rec.otpCode = '******';
          appendAudit(db, authUser, 'REVOKE_OTP', 'AUTH', rec.employeeId, `Revoked OTP ${rec.otpId}`);
          saveDb(db);
          res.json({ok: true});
          return;
        }

        case 'getSettings': {
          res.json({ok: true, settings: db.appSettings});
          return;
        }

        case 'saveSettings': {
          requireRole(authUser, ['SUPER_ADMIN']);
          const bikeRate = payload?.conveyanceBikeRatePerKm !== undefined
            ? Number(payload.conveyanceBikeRatePerKm)
            : Number(db.appSettings?.conveyanceBikeRatePerKm ?? 4.5);
          const carRate = payload?.conveyanceCarRatePerKm !== undefined
            ? Number(payload.conveyanceCarRatePerKm)
            : Number(db.appSettings?.conveyanceCarRatePerKm ?? 14);
          const bRate = payload?.foodBreakfastAmount !== undefined
            ? Number(payload.foodBreakfastAmount)
            : Number(db.appSettings?.foodBreakfastAmount ?? 70);
          const lRate = payload?.foodLunchAmount !== undefined
            ? Number(payload.foodLunchAmount)
            : Number(db.appSettings?.foodLunchAmount ?? 90);
          const dRate = payload?.foodDinnerAmount !== undefined
            ? Number(payload.foodDinnerAmount)
            : Number(db.appSettings?.foodDinnerAmount ?? 90);
          db.appSettings = {
            ...db.appSettings,
            ...payload,
            conveyanceBikeRatePerKm: Number.isFinite(bikeRate) && bikeRate >= 0 ? Math.round(bikeRate * 100) / 100 : 4.5,
            conveyanceCarRatePerKm: Number.isFinite(carRate) && carRate >= 0 ? Math.round(carRate * 100) / 100 : 14,
            foodAllowanceEnabled: payload?.foodAllowanceEnabled !== undefined ? Boolean(payload.foodAllowanceEnabled) : db.appSettings?.foodAllowanceEnabled !== false,
            foodBreakfastAmount: Number.isFinite(bRate) && bRate >= 0 ? Math.round(bRate * 100) / 100 : 70,
            foodLunchAmount: Number.isFinite(lRate) && lRate >= 0 ? Math.round(lRate * 100) / 100 : 90,
            foodDinnerAmount: Number.isFinite(dRate) && dRate >= 0 ? Math.round(dRate * 100) / 100 : 90,
          };
          const otPolicy = getOvertimePolicy(db);
          const otAuditDetails = otPolicy.enabled
            ? `OT enabled: >${otPolicy.afterHours}h duty, ${
                otPolicy.rateMode === 'FIXED_HOURLY_RATE'
                  ? 'Fixed Hourly Rate'
                  : `${otPolicy.basicPercentPerHour}% of Basic/hr`
              }`
            : 'OT auto-pay disabled';
          const rates = getConveyanceRates(db);
          const foodPolicy = getFoodAllowancePolicy(db);
          appendAudit(
            db,
            authUser,
            'SAVE_SETTINGS',
            'SETTINGS',
            'APP_SETTINGS',
            `Updated HRMS configuration · ${otAuditDetails} · Conveyance Bike ₹${rates.bike}/km, Car ₹${rates.car}/km · Food ${foodPolicy.enabled ? `B ₹${foodPolicy.breakfast}/L ₹${foodPolicy.lunch}/D ₹${foodPolicy.dinner}` : 'Disabled'}`,
          );
          saveDb(db);
          res.json({ok: true, settings: db.appSettings});
          return;
        }

        case 'getOvertimeAudit': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          const month = String(payload?.month || new Date().toISOString().slice(0, 7));
          const otPolicy = getOvertimePolicy(db);
          const records = db.attendance
            .filter((a) => String(a.date).startsWith(month))
            .map((a) => {
              const wHrs = Number(a.workingHours || 0);
              const derivedOt = wHrs > otPolicy.afterHours
                ? Math.round((wHrs - otPolicy.afterHours) * 100) / 100
                : 0;
              const otHrs = a.overtimeHours !== undefined && a.overtimeHours !== null && Number(a.overtimeHours) > 0
                ? Number(a.overtimeHours)
                : derivedOt;
              const struct = db.salaryStructure.find((s) => s.employeeId === a.employeeId);
              const basicSalary = Number(struct?.basicSalary || 0);
              const hourlyRate = !otPolicy.enabled
                ? 0
                : otPolicy.rateMode === 'FIXED_HOURLY_RATE'
                  ? Number(struct?.overtimeHourlyRate || 0)
                  : Math.round(basicSalary * (otPolicy.basicPercentPerHour / 100) * 100) / 100;
              const estimatedOtPay = otPolicy.enabled ? Math.round(otHrs * hourlyRate * 100) / 100 : 0;
              return {
                attendanceId: a.attendanceId,
                employeeId: a.employeeId,
                employeeName: a.employeeName,
                department: a.department,
                date: a.date,
                checkInTime: a.checkInTime || '',
                checkOutTime: a.checkOutTime || '',
                workingHours: wHrs,
                overtimeHours: otHrs,
                basicSalary,
                hourlyOtRate: hourlyRate,
                estimatedOtPay,
                rateMode: otPolicy.rateMode,
                basicPercentApplied: otPolicy.rateMode === 'BASIC_PERCENT_PER_HOUR' ? otPolicy.basicPercentPerHour : 0,
                status: a.status,
                verificationStatus: a.verificationStatus,
                correctionStatus: a.correctionStatus || 'NONE',
                regularizedBy: a.regularizedBy || '',
              };
            })
            .filter((r) => r.overtimeHours > 0)
            .reverse();

          const auditEvents = [...db.auditLogs]
            .filter(
              (log) =>
                log.module === 'PAYROLL' ||
                log.action === 'SAVE_SETTINGS' ||
                log.action === 'CHECK_OUT' ||
                log.action === 'ADMIN_EDIT_ATTENDANCE' ||
                log.action === 'REVIEW_CORRECTION' ||
                log.action === 'REGULARIZE_ATTENDANCE_ADMIN' ||
                /overtime|\bot\b/i.test(String(log.details || '')),
            )
            .reverse()
            .slice(0, 100);

          res.json({
            ok: true,
            month,
            policy: otPolicy,
            records,
            auditEvents,
          });
          return;
        }

        case 'saveDepartment': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          const name = String(payload.name || '').trim();
          const code = String(payload.code || '').trim().toUpperCase();
          if (!name || !code) throw new Error('Department name and code are required.');

          const existing = payload.departmentId
            ? db.departments.find((d) => d.departmentId === payload.departmentId)
            : undefined;
          if (existing) {
            const oldName = existing.name;
            existing.name = name;
            existing.code = code;
            existing.headEmployeeId = payload.headEmployeeId ?? existing.headEmployeeId;
            if (oldName !== name) {
              for (const emp of db.employees) {
                if (emp.department === oldName) emp.department = name;
              }
              for (const des of db.designations) {
                if (des.department === oldName) des.department = name;
              }
            }
            appendAudit(db, authUser, 'UPDATE_DEPARTMENT', 'SETTINGS', existing.departmentId, name);
            saveDb(db);
            res.json({ok: true, department: existing});
            return;
          }

          if (db.departments.some((d) => d.name.toLowerCase() === name.toLowerCase())) {
            throw new Error(`Department "${name}" already exists.`);
          }
          const dept = {
            departmentId: `DEPT-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
            name,
            code,
            headEmployeeId: payload.headEmployeeId || '',
            createdAt: new Date().toISOString(),
          };
          db.departments.push(dept);
          appendAudit(db, authUser, 'CREATE_DEPARTMENT', 'SETTINGS', dept.departmentId, dept.name);
          saveDb(db);
          res.json({ok: true, department: dept});
          return;
        }

        case 'deleteDepartment': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          const idx = db.departments.findIndex((d) => d.departmentId === payload.departmentId);
          if (idx === -1) throw new Error('Department not found.');
          const [removed] = db.departments.splice(idx, 1);
          appendAudit(db, authUser, 'DELETE_DEPARTMENT', 'SETTINGS', payload.departmentId, removed.name);
          saveDb(db);
          res.json({ok: true});
          return;
        }

        case 'saveDesignation': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          const title = String(payload.title || '').trim();
          const department = String(payload.department || '').trim() || 'Executive & Administration';
          const level = String(payload.level || 'L3').trim();
          if (!title) throw new Error('Role / Designation title is required.');

          const existing = payload.designationId
            ? db.designations.find((d) => d.designationId === payload.designationId)
            : undefined;
          if (existing) {
            const oldTitle = existing.title;
            existing.title = title;
            existing.department = department;
            existing.level = level;
            if (payload.status) existing.status = payload.status;
            if (oldTitle !== title) {
              for (const emp of db.employees) {
                if (emp.designation === oldTitle) emp.designation = title;
              }
            }
            appendAudit(db, authUser, 'UPDATE_DESIGNATION', 'SETTINGS', existing.designationId, title);
            saveDb(db);
            res.json({ok: true, designation: existing});
            return;
          }

          if (db.designations.some((d) => d.title.toLowerCase() === title.toLowerCase())) {
            throw new Error(`Role / Designation "${title}" already exists.`);
          }
          const designation = {
            designationId: `DES-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
            title,
            department,
            level,
            status: payload.status || 'ACTIVE',
          };
          db.designations.push(designation);
          appendAudit(db, authUser, 'CREATE_DESIGNATION', 'SETTINGS', designation.designationId, title);
          saveDb(db);
          res.json({ok: true, designation});
          return;
        }

        case 'deleteDesignation': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          const idx = db.designations.findIndex((d) => d.designationId === payload.designationId);
          if (idx === -1) throw new Error('Role / Designation not found.');
          const [removed] = db.designations.splice(idx, 1);
          appendAudit(db, authUser, 'DELETE_DESIGNATION', 'SETTINGS', payload.designationId, removed.title);
          saveDb(db);
          res.json({ok: true});
          return;
        }

        case 'saveHoliday': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          if (payload.holidayId) {
            const existing = db.holidays.find((h) => h.holidayId === payload.holidayId);
            if (!existing) throw new Error('Holiday not found.');
            existing.date = payload.date ?? existing.date;
            existing.name = payload.name ?? existing.name;
            existing.type = payload.type ?? existing.type;
            appendAudit(db, authUser, 'UPDATE_HOLIDAY', 'LEAVES', existing.holidayId, existing.name);
            saveDb(db);
            res.json({ok: true, holiday: existing});
            return;
          }
          const holiday = {
            holidayId: `HOL-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
            date: payload.date,
            name: payload.name,
            type: payload.type || 'COMPANY',
          };
          db.holidays.push(holiday);
          appendAudit(db, authUser, 'CREATE_HOLIDAY', 'LEAVES', holiday.holidayId, holiday.name);
          saveDb(db);
          res.json({ok: true, holiday});
          return;
        }

        case 'deleteHoliday': {
          requireRole(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
          const idx = db.holidays.findIndex((h) => h.holidayId === payload.holidayId);
          if (idx === -1) throw new Error('Holiday not found.');
          db.holidays.splice(idx, 1);
          appendAudit(db, authUser, 'DELETE_HOLIDAY', 'LEAVES', payload.holidayId, 'Deleted holiday');
          saveDb(db);
          res.json({ok: true});
          return;
        }

        case 'getDashboardAnalytics': {
          let employees = db.employees;
          let attendance = db.attendance;
          let leaves = db.leaveApplications;
          let payroll = db.payroll;
          let reviews = db.performanceReviews;
          let tasks = db.tasks;
          const liveLoc = db.liveLocation;

          if (authUser.role === 'EMPLOYEE') {
            employees = employees.filter((e) => e.employeeId === authUser.employeeId);
            attendance = attendance.filter((a) => a.employeeId === authUser.employeeId);
            leaves = leaves.filter((l) => l.employeeId === authUser.employeeId);
            payroll = payroll.filter((p) => p.employeeId === authUser.employeeId);
            reviews = reviews.filter((r) => r.employeeId === authUser.employeeId);
            tasks = tasks.filter((t) => t.assignedToId === authUser.employeeId);
          }

          if (payload?.department) {
            employees = employees.filter((e) => e.department === payload.department);
            attendance = attendance.filter((a) => a.department === payload.department);
            leaves = leaves.filter((l) => l.department === payload.department);
            tasks = tasks.filter((t) => t.department === payload.department);
          }

          if (payload?.employeeId && authUser.role !== 'EMPLOYEE') {
            employees = employees.filter((e) => e.employeeId === payload.employeeId);
            attendance = attendance.filter((a) => a.employeeId === payload.employeeId);
            leaves = leaves.filter((l) => l.employeeId === payload.employeeId);
            tasks = tasks.filter((t) => t.assignedToId === payload.employeeId);
          }

          const today = payload?.date || new Date().toISOString().slice(0, 10);
          const activeEmps = employees.filter((e) => e.status === 'ACTIVE');
          const todayAtt = attendance.filter((a) => a.date === today);
          const presentToday = todayAtt.length;
          const lateToday = todayAtt.filter((a) => a.status === 'LATE').length;
          const onLeaveToday = leaves.filter((l) => l.status === 'APPROVED' && l.startDate <= today && l.endDate >= today).length;
          const absentToday = Math.max(0, activeEmps.length - presentToday - onLeaveToday);
          const fieldEmps = activeEmps.filter((e) => e.isFieldEmployee).length;
          const staleMs = Number(db.appSettings.locationStaleMinutes || 5) * 60000;
          const sharingLive =
            authUser.role === 'EMPLOYEE'
              ? 0
              : liveLoc.filter(
                  (l) => l.isSharingActive && Date.now() - new Date(l.lastUpdatedAt).getTime() <= staleMs,
                ).length;
          const pendingLeaves = leaves.filter((l) => l.status === 'PENDING').length;
          const pendingCorrections = attendance.filter((a) => a.correctionStatus === 'PENDING').length;

          const deptMap: Record<string, number> = {};
          for (const e of activeEmps) deptMap[e.department] = (deptMap[e.department] || 0) + 1;

          const monthMap: Record<string, {label: string; present: number; absent: number; late: number; onLeave: number}> = {};
          for (const a of attendance) {
            const m = String(a.date).slice(0, 7);
            if (!monthMap[m]) monthMap[m] = {label: m, present: 0, absent: 0, late: 0, onLeave: 0};
            if (a.status === 'LATE') monthMap[m].late++;
            else monthMap[m].present++;
          }
          for (const l of leaves.filter((x) => x.status === 'APPROVED')) {
            const m = String(l.startDate).slice(0, 7);
            if (!monthMap[m]) monthMap[m] = {label: m, present: 0, absent: 0, late: 0, onLeave: 0};
            monthMap[m].onLeave += Number(l.totalDays || 1);
          }

          const leaveTypeMap: Record<string, number> = {};
          for (const l of leaves) {
            leaveTypeMap[l.leaveTypeName] = (leaveTypeMap[l.leaveTypeName] || 0) + Number(l.totalDays || 0);
          }

          const hoursMap: Record<string, {total: number; ot: number; count: number}> = {};
          for (const a of attendance) {
            if (!hoursMap[a.date]) hoursMap[a.date] = {total: 0, ot: 0, count: 0};
            hoursMap[a.date].total += Number(a.workingHours || 0);
            hoursMap[a.date].ot += Number(a.overtimeHours || 0);
            hoursMap[a.date].count++;
          }

          const payMap: Record<string, {gross: number; net: number}> = {};
          for (const p of payroll) {
            if (!payMap[p.month]) payMap[p.month] = {gross: 0, net: 0};
            payMap[p.month].gross += Number(p.grossEarnings || 0);
            payMap[p.month].net += Number(p.netPayable || 0);
          }

          const deptProd: Record<string, {sum: number; count: number}> = {};
          const taskStatusMap: Record<string, number> = {};
          for (const t of tasks) {
            const d = t.department || 'General';
            if (!deptProd[d]) deptProd[d] = {sum: 0, count: 0};
            deptProd[d].sum += Number(t.progressPercent || 0);
            deptProd[d].count++;
            taskStatusMap[t.status] = (taskStatusMap[t.status] || 0) + 1;
          }

          res.json({
            ok: true,
            analytics: {
              kpis: {
                totalEmployees: employees.length,
                activeEmployees: activeEmps.length,
                presentToday,
                absentToday,
                onLeaveToday,
                lateArrivalsToday: lateToday,
                fieldEmployees: fieldEmps,
                sharingLocationLive: sharingLive,
                pendingLeaveRequests: pendingLeaves,
                pendingApprovals: pendingLeaves + pendingCorrections,
              },
              departmentDistribution: Object.entries(deptMap).map(([department, count]) => ({department, count})),
              monthlyAttendanceTrends: Object.values(monthMap).sort((a, b) => a.label.localeCompare(b.label)),
              leaveStatsByType: Object.entries(leaveTypeMap).map(([type, count]) => ({type, count})),
              punctualityBreakdown: {
                onTime: attendance.filter((a) => a.status === 'PRESENT').length,
                late: attendance.filter((a) => a.status === 'LATE').length,
                earlyDeparture: attendance.filter((a) => a.status === 'HALF_DAY' || a.status === 'EARLY_DEPARTURE').length,
              },
              workingHoursTrend: Object.entries(hoursMap)
                .sort(([a], [b]) => a.localeCompare(b))
                .slice(-14)
                .map(([label, v]) => ({
                  label,
                  avgHours: v.count ? Math.round((v.total / v.count) * 100) / 100 : 0,
                  overtimeHours: Math.round(v.ot * 100) / 100,
                })),
              performanceRatings: reviews.slice(0, 12).map((r) => ({
                label: `${r.employeeName} (${r.periodLabel})`,
                avgRating: Number(r.managerRating || r.selfAssessmentScore || 0),
              })),
              payrollExpenditure: Object.entries(payMap)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([month, v]) => ({month, gross: v.gross, net: v.net})),
              departmentProductivity: Object.entries(deptProd).map(([department, v]) => ({
                department,
                completionRate: v.count ? Math.round(v.sum / v.count) : 0,
              })),
              taskStats: Object.entries(taskStatusMap).map(([status, count]) => ({status, count})),
            },
          });
          return;
        }

        default:
          res.status(400).json({ok: false, error: `Unknown action: ${action}`});
      }
    } catch (err: any) {
      const msg = err?.message || 'Server error';
      const code = msg.startsWith('UNAUTHORIZED') ? 401 : msg.startsWith('FORBIDDEN') ? 403 : 400;
      res.status(code).json({ok: false, error: msg});
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`IDEAL HRMS server listening on http://localhost:${PORT}`);
  });
}

startServer();
