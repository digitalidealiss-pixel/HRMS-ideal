/**
 * IDEAL HRMS - Security, Password Hashing, Session & RBAC Layer
 */

function hashPassword_(password, salt) {
  var secret = getHmacSecret_();
  var current = String(password) + ':' + String(salt) + ':' + secret;
  for (var i = 0; i < 1200; i++) {
    var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, current, Utilities.Charset.UTF_8);
    current = digest.map(function (b) {
      var v = (b < 0 ? b + 256 : b).toString(16);
      return v.length === 1 ? '0' + v : v;
    }).join('');
  }
  return current;
}

function constantTimeEquals_(a, b) {
  var sa = String(a || '');
  var sb = String(b || '');
  if (sa.length !== sb.length) return false;
  var diff = 0;
  for (var i = 0; i < sa.length; i++) {
    diff |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
  }
  return diff === 0;
}

function sanitizeInput_(val) {
  if (typeof val !== 'string') return val;
  var trimmed = val.trim();
  // Neutralize spreadsheet formula injection and script tags
  if (/^[=+\-@]/.test(trimmed)) {
    trimmed = "'" + trimmed;
  }
  return trimmed.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
}

function createSessionToken_(user) {
  var sessionId = 'SES-' + Utilities.getUuid();
  var rawToken = sessionId + '.' + user.userId + '.' + Utilities.getUuid();
  var sigBytes = Utilities.computeHmacSha256Signature(rawToken, getHmacSecret_());
  var sigHex = sigBytes.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
  var fullToken = rawToken + '.' + sigHex;
  var tokenHash = hashPassword_(fullToken, 'SESSION');
  var now = new Date();
  var expiresAt = new Date(now.getTime() + COMPANY_CONFIG.SESSION_TTL_HOURS * 3600 * 1000);

  appendRowObj_(SHEET_NAMES.LOGIN_HISTORY, {
    sessionId: sessionId,
    userId: user.userId,
    employeeId: user.employeeId,
    role: user.role,
    tokenHash: tokenHash,
    expiresAt: expiresAt.toISOString(),
    loginAt: now.toISOString(),
    status: 'ACTIVE',
    userAgent: 'WebApp'
  });

  return { token: fullToken, expiresAt: expiresAt.toISOString(), sessionId: sessionId };
}

function requireAuth_(token) {
  if (!token) {
    throw new Error('UNAUTHORIZED: Missing session token.');
  }
  var parts = String(token).split('.');
  if (parts.length !== 4) {
    throw new Error('UNAUTHORIZED: Malformed session token.');
  }
  var rawToken = parts[0] + '.' + parts[1] + '.' + parts[2];
  var sigBytes = Utilities.computeHmacSha256Signature(rawToken, getHmacSecret_());
  var expectedSig = sigBytes.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');

  if (!constantTimeEquals_(parts[3], expectedSig)) {
    throw new Error('UNAUTHORIZED: Invalid token signature.');
  }

  var tokenHash = hashPassword_(token, 'SESSION');
  var sessions = readSheetAsObjects_(SHEET_NAMES.LOGIN_HISTORY);
  var activeSession = null;
  for (var i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i].sessionId === parts[0] && constantTimeEquals_(sessions[i].tokenHash, tokenHash)) {
      activeSession = sessions[i];
      break;
    }
  }
  if (!activeSession || activeSession.status !== 'ACTIVE') {
    throw new Error('UNAUTHORIZED: Session expired or revoked.');
  }
  if (new Date(activeSession.expiresAt).getTime() < new Date().getTime()) {
    updateRowByKey_(SHEET_NAMES.LOGIN_HISTORY, 'sessionId', activeSession.sessionId, { status: 'EXPIRED' });
    throw new Error('UNAUTHORIZED: Session expired. Please sign in again.');
  }

  var users = readSheetAsObjects_(SHEET_NAMES.USERS);
  var user = users.filter(function (u) { return u.userId === activeSession.userId; })[0];
  if (!user || user.status !== 'ACTIVE') {
    throw new Error('FORBIDDEN: User account is inactive.');
  }

  var emp = readSheetAsObjects_(SHEET_NAMES.EMPLOYEES).filter(function (e) {
    return e.employeeId === user.employeeId;
  })[0] || {};

  return {
    sessionId: activeSession.sessionId,
    userId: user.userId,
    employeeId: user.employeeId,
    email: user.email,
    role: user.role,
    fullName: emp.fullName || user.email,
    department: emp.department || '',
    designation: emp.designation || '',
    profilePhotoUrl: emp.profilePhotoUrl || '',
    isFieldEmployee: String(emp.isFieldEmployee) === 'true'
  };
}

function requireRole_(authUser, allowedRoles) {
  if (allowedRoles.indexOf(authUser.role) === -1) {
    throw new Error('FORBIDDEN: Insufficient permissions for role ' + authUser.role);
  }
}

function logAudit_(actor, action, moduleName, targetId, details) {
  appendRowObj_(SHEET_NAMES.AUDIT_LOGS, {
    logId: 'LOG-' + Utilities.getUuid().slice(0, 8).toUpperCase(),
    timestamp: new Date().toISOString(),
    actorUserId: actor ? actor.userId : 'SYSTEM',
    actorName: actor ? actor.fullName : 'System',
    actorRole: actor ? actor.role : 'SUPER_ADMIN',
    action: action,
    module: moduleName,
    targetId: targetId || '',
    details: typeof details === 'string' ? details : JSON.stringify(details || {})
  });
}

function checkDuplicateTransaction_(transactionId) {
  if (!transactionId) return false;
  var cache = CacheService.getScriptCache();
  var key = 'TX_' + transactionId;
  if (cache.get(key)) return true;
  cache.put(key, '1', 300);
  return false;
}
