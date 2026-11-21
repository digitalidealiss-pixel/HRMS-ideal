/**
 * IDEAL HRMS - Primary Google Apps Script Web App API (doGet / doPost)
 * Handles batch sheet operations, authentication, and all HRMS modules.
 */

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'health';
  if (action === 'health') {
    return jsonResponse_({
      ok: true,
      service: 'IDEAL HRMS Google Apps Script API',
      company: COMPANY_CONFIG.COMPANY_NAME,
      timestamp: new Date().toISOString()
    });
  }
  if (action === 'setupStatus') {
    return jsonResponse_(handleSetupStatus_());
  }
  return jsonResponse_({ ok: false, error: 'Use POST for authenticated API operations.' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) ? e.postData.contents : '{}');
    var action = body.action || '';
    var token = body.token || '';
    var payload = body.payload || {};

    if (body.transactionId && checkDuplicateTransaction_(body.transactionId)) {
      return jsonResponse_({ ok: true, duplicateIgnored: true });
    }

    // Public endpoints
    if (action === 'health') {
      return jsonResponse_({ ok: true, company: COMPANY_CONFIG.COMPANY_NAME, timestamp: new Date().toISOString() });
    }
    if (action === 'setupStatus') {
      return jsonResponse_(handleSetupStatus_());
    }
    if (action === 'initSuperAdmin') {
      lock.waitLock(15000);
      return jsonResponse_(handleInitSuperAdmin_(payload));
    }
    if (action === 'login') {
      lock.waitLock(15000);
      return jsonResponse_(handleLogin_(payload));
    }
    if (action === 'requestPasswordResetOtp') {
      lock.waitLock(15000);
      return jsonResponse_(handleRequestPasswordResetOtp_(payload));
    }
    if (action === 'verifyPasswordResetOtp') {
      lock.waitLock(15000);
      return jsonResponse_(handleVerifyPasswordResetOtp_(payload));
    }

    // Authenticated endpoints
    var authUser = requireAuth_(token);
    lock.waitLock(15000);

    switch (action) {
      case 'logout':
        updateRowByKey_(SHEET_NAMES.LOGIN_HISTORY, 'sessionId', authUser.sessionId, { status: 'LOGGED_OUT' });
        logAudit_(authUser, 'LOGOUT', 'AUTH', authUser.employeeId, 'User signed out');
        return jsonResponse_({ ok: true });

      case 'getEmployees':
        return jsonResponse_(handleGetEmployees_(authUser));

      case 'createEmployee':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        return jsonResponse_(handleCreateEmployee_(authUser, payload));

      case 'updateEmployee':
        return jsonResponse_(handleUpdateEmployee_(authUser, payload));

      case 'toggleEmployeeStatus':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        return jsonResponse_(handleToggleEmployeeStatus_(authUser, payload));

      case 'uploadDocument':
        return jsonResponse_(handleUploadDocument_(authUser, payload));

      case 'verifyDocument':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        updateRowByKey_(SHEET_NAMES.DOCUMENTS, 'documentId', payload.documentId, {
          verificationStatus: payload.verificationStatus,
          verifiedBy: authUser.fullName
        });
        logAudit_(authUser, 'VERIFY_DOCUMENT', 'DOCUMENTS', payload.documentId, payload.verificationStatus);
        return jsonResponse_({ ok: true });

      case 'deleteDocument':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        deleteRowByKey_(SHEET_NAMES.DOCUMENTS, 'documentId', payload.documentId);
        logAudit_(authUser, 'DELETE_DOCUMENT', 'DOCUMENTS', payload.documentId, 'Removed document');
        return jsonResponse_({ ok: true });

      case 'getMapsConfig':
        return jsonResponse_({ ok: true, apiKey: PropertiesService.getScriptProperties().getProperty('GOOGLE_MAPS_API_KEY') || '' });

      case 'reverseGeocode':
        return jsonResponse_(Object.assign({ ok: true }, reverseGeocodeLatLng_(payload.latitude, payload.longitude)));

      case 'checkIn':
        return jsonResponse_(handleCheckIn_(authUser, payload));

      case 'checkOut':
        return jsonResponse_(handleCheckOut_(authUser, payload));

      case 'getAttendance':
        return jsonResponse_(handleGetAttendance_(authUser, payload));

      case 'regularizeAttendance':
      case 'requestAttendanceCorrection':
        return jsonResponse_(handleRequestCorrection_(authUser, payload));

      case 'approveAttendanceCorrection':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        return jsonResponse_(handleApproveCorrection_(authUser, payload));

      case 'adminSaveAttendance':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        return jsonResponse_(handleAdminSaveAttendance_(authUser, payload));

      case 'updateLiveLocation':
        return jsonResponse_(handleUpdateLiveLocation_(authUser, payload));

      case 'getLiveLocations':
        return jsonResponse_(handleGetLiveLocations_(authUser));

      case 'getLocationHistory':
        return jsonResponse_(handleGetLocationHistory_(authUser, payload));

      case 'getTravelClaims':
        return jsonResponse_(handleGetTravelClaims_(authUser, payload));

      case 'computeTravelRoutePreview':
        return jsonResponse_(handleComputeTravelRoutePreview_(payload));

      case 'startTravelTrip':
        return jsonResponse_(handleStartTravelTrip_(authUser, payload));

      case 'addTravelWaypoint':
        return jsonResponse_(handleAddTravelWaypoint_(authUser, payload));

      case 'completeTravelTrip':
        return jsonResponse_(handleCompleteTravelTrip_(authUser, payload));

      case 'submitTravelClaim':
        return jsonResponse_(handleSubmitTravelClaim_(authUser, payload));

      case 'cancelTravelTrip':
        return jsonResponse_(handleCancelTravelTrip_(authUser, payload));

      case 'reviewTravelClaim':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        return jsonResponse_(handleReviewTravelClaim_(authUser, payload));

      case 'getFoodAllowances':
        return jsonResponse_(handleGetFoodAllowances_(authUser, payload));

      case 'claimFoodAllowance':
        return jsonResponse_(handleClaimFoodAllowance_(authUser, payload));

      case 'reviewFoodAllowance':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        return jsonResponse_(handleReviewFoodAllowance_(authUser, payload));

      case 'syncOfflineQueue':
        return jsonResponse_(handleSyncOfflineQueue_(authUser, payload));

      case 'getLeaveData':
        return jsonResponse_(handleGetLeaveData_(authUser));

      case 'applyLeave':
        return jsonResponse_(handleApplyLeave_(authUser, payload));

      case 'reviewLeave':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        return jsonResponse_(handleReviewLeave_(authUser, payload));

      case 'cancelLeave':
        return jsonResponse_(handleCancelLeave_(authUser, payload));

      case 'updateLeaveApplication':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        return jsonResponse_(handleUpdateLeaveApplication_(authUser, payload));

      case 'updateLeaveBalance':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        return jsonResponse_(handleUpdateLeaveBalance_(authUser, payload));

      case 'saveLeaveType':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        return jsonResponse_(handleSaveLeaveType_(authUser, payload));

      case 'getPayrollData':
        return jsonResponse_(handleGetPayrollData_(authUser, payload));

      case 'saveSalaryStructure':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        return jsonResponse_(handleSaveSalaryStructure_(authUser, payload));

      case 'generatePayroll':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        return jsonResponse_(handleGeneratePayroll_(authUser, payload));

      case 'updatePayrollStatus':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        return jsonResponse_(handleUpdatePayrollStatus_(authUser, payload));

      case 'updatePayrollRecord':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        return jsonResponse_(handleUpdatePayrollRecord_(authUser, payload));

      case 'getPerformanceData':
        return jsonResponse_(handleGetPerformanceData_(authUser));

      case 'savePerformanceReview':
        return jsonResponse_(handleSavePerformanceReview_(authUser, payload));

      case 'saveKPI':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        return jsonResponse_(handleSaveKPI_(authUser, payload));

      case 'deleteKPI':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        return jsonResponse_(handleDeleteKPI_(authUser, payload));

      case 'getTasks':
        return jsonResponse_(handleGetTasks_(authUser));

      case 'saveTask':
        return jsonResponse_(handleSaveTask_(authUser, payload));

      case 'deleteTask':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        return jsonResponse_(handleDeleteTask_(authUser, payload));

      case 'getNotifications':
        return jsonResponse_(handleGetNotifications_(authUser));

      case 'createAnnouncement':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        appendNotification_('ALL', 'ANNOUNCEMENT', payload.title, payload.message);
        return jsonResponse_({ ok: true });

      case 'markNotificationRead':
        updateRowByKey_(SHEET_NAMES.NOTIFICATIONS, 'notificationId', payload.notificationId, { isRead: true });
        return jsonResponse_({ ok: true });

      case 'getDashboardAnalytics':
        return jsonResponse_(handleGetDashboardAnalytics_(authUser, payload));

      case 'getAuditLogs':
        requireRole_(authUser, ['SUPER_ADMIN']);
        return jsonResponse_({ ok: true, logs: readSheetAsObjects_(SHEET_NAMES.AUDIT_LOGS).reverse().slice(0, 300) });

      case 'getPasswordResetOtps':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        return jsonResponse_(handleGetPasswordResetOtps_(authUser));

      case 'adminIssuePasswordResetOtp':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        return jsonResponse_(handleAdminIssuePasswordResetOtp_(authUser, payload));

      case 'revokePasswordResetOtp':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        return jsonResponse_(handleRevokePasswordResetOtp_(authUser, payload));

      case 'getSettings':
        return jsonResponse_(handleGetSettings_());

      case 'saveSettings':
        requireRole_(authUser, ['SUPER_ADMIN']);
        return jsonResponse_(handleSaveSettings_(authUser, payload));

      case 'getOvertimeAudit':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        return jsonResponse_(handleGetOvertimeAudit_(authUser, payload));

      case 'saveDepartment':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        return jsonResponse_(handleSaveDepartment_(authUser, payload));

      case 'deleteDepartment':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        return jsonResponse_(handleDeleteDepartment_(authUser, payload));

      case 'saveDesignation':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        return jsonResponse_(handleSaveDesignation_(authUser, payload));

      case 'deleteDesignation':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        return jsonResponse_(handleDeleteDesignation_(authUser, payload));

      case 'saveHoliday':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        return jsonResponse_(handleSaveHoliday_(authUser, payload));

      case 'deleteHoliday':
        requireRole_(authUser, ['SUPER_ADMIN', 'HR_ADMIN']);
        return jsonResponse_(handleDeleteHoliday_(authUser, payload));

      default:
        return jsonResponse_({ ok: false, error: 'Unknown API action: ' + action });
    }
  } catch (err) {
    return jsonResponse_({ ok: false, error: err && err.message ? err.message : String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

/* ==================== BATCH SHEET HELPERS ==================== */

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function readSheetAsObjects_(sheetName) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      var val = values[r][c];
      if (val instanceof Date) val = val.toISOString();
      obj[headers[c]] = val;
    }
    rows.push(obj);
  }
  return rows;
}

function appendRowObj_(sheetName, obj) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = headers.map(function (h) {
    var v = obj.hasOwnProperty(h) ? obj[h] : '';
    return sanitizeInput_(v);
  });
  sheet.appendRow(row);
}

function updateRowByKey_(sheetName, keyCol, keyVal, patch) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return false;
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var keyIdx = headers.indexOf(keyCol);
  if (keyIdx === -1) return false;
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][keyIdx]) === String(keyVal)) {
      Object.keys(patch).forEach(function (k) {
        var colIdx = headers.indexOf(k);
        if (colIdx !== -1) values[r][colIdx] = sanitizeInput_(patch[k]);
      });
      sheet.getRange(r + 1, 1, 1, headers.length).setValues([values[r]]);
      return true;
    }
  }
  return false;
}

function deleteRowByKey_(sheetName, keyCol, keyVal) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return false;
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var keyIdx = headers.indexOf(keyCol);
  if (keyIdx === -1) return false;
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][keyIdx]) === String(keyVal)) {
      sheet.deleteRow(r + 1);
      return true;
    }
  }
  return false;
}

function ensureSheetColumns_(sheetName, requiredCols) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() === 0) return;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var missing = requiredCols.filter(function (c) { return headers.indexOf(c) === -1; });
  if (missing.length > 0) {
    var startCol = headers.length + 1;
    sheet.getRange(1, startCol, 1, missing.length).setValues([missing])
      .setBackground('#0B1B36').setFontColor('#FFFFFF').setFontWeight('bold');
  }
}

function appendNotification_(recipientEmployeeId, category, title, message) {
  appendRowObj_(SHEET_NAMES.NOTIFICATIONS, {
    notificationId: 'NTF-' + Utilities.getUuid().slice(0, 8).toUpperCase(),
    recipientEmployeeId: recipientEmployeeId,
    category: category,
    title: title,
    message: message,
    isRead: false,
    createdAt: new Date().toISOString()
  });
}

/* ==================== AUTH & INITIALIZATION HANDLERS ==================== */

function handleSetupStatus_() {
  var ss = getSpreadsheet_();
  if (!ss.getSheetByName(SHEET_NAMES.USERS)) {
    initializeDatabase();
  }
  var users = readSheetAsObjects_(SHEET_NAMES.USERS);
  return { ok: true, needsInitialSetup: users.length === 0, companyName: COMPANY_CONFIG.COMPANY_NAME };
}

function handleInitSuperAdmin_(payload) {
  var users = readSheetAsObjects_(SHEET_NAMES.USERS);
  if (users.length > 0) {
    throw new Error('System is already initialized. Please sign in.');
  }
  var now = new Date().toISOString();
  var employeeId = COMPANY_CONFIG.COMPANY_CODE + '-0001';
  var userId = 'USR-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  var salt = Utilities.getUuid();
  var passwordHash = hashPassword_(payload.password, salt);

  var deptName = payload.department || 'Executive & Administration';
  var existingDepts = readSheetAsObjects_(SHEET_NAMES.DEPARTMENTS);
  if (!existingDepts.some(function (d) { return String(d.name).toLowerCase() === deptName.toLowerCase(); })) {
    appendRowObj_(SHEET_NAMES.DEPARTMENTS, {
      departmentId: 'DEPT-' + Utilities.getUuid().slice(0, 6).toUpperCase(),
      name: deptName,
      code: deptName.slice(0, 4).toUpperCase().replace(/[^A-Z]/g, '') || 'EXEC',
      headEmployeeId: employeeId,
      createdAt: now
    });
  }
  var desTitle = payload.designation || 'Managing Director';
  var existingDes = readSheetAsObjects_(SHEET_NAMES.DESIGNATIONS);
  if (!existingDes.some(function (d) { return String(d.title).toLowerCase() === desTitle.toLowerCase(); })) {
    appendRowObj_(SHEET_NAMES.DESIGNATIONS, {
      designationId: 'DES-' + Utilities.getUuid().slice(0, 6).toUpperCase(),
      title: desTitle,
      department: deptName,
      level: 'L1',
      status: 'ACTIVE'
    });
  }

  appendRowObj_(SHEET_NAMES.EMPLOYEES, {
    employeeId: employeeId,
    fullName: payload.fullName,
    profilePhotoUrl: '',
    fatherName: '',
    dob: '',
    gender: '',
    mobile: String(payload.mobile || '').trim(),
    personalEmail: payload.email,
    officialEmail: String(payload.email || '').trim().toLowerCase(),
    emergencyContact: '',
    currentAddress: '',
    permanentAddress: '',
    dateOfJoining: now.slice(0, 10),
    department: payload.department || 'Executive & Administration',
    designation: payload.designation || 'Managing Director / Super Admin',
    reportingManagerId: '',
    reportingManagerName: 'Board',
    employmentType: 'FULL_TIME',
    workLocation: payload.workLocation || 'Headquarters',
    isFieldEmployee: false,
    role: 'SUPER_ADMIN',
    bankName: '',
    bankAccountNumber: '',
    ifscCode: '',
    panNumber: '',
    aadhaarNumber: '',
    status: 'ACTIVE',
    onboardingChecklistJson: JSON.stringify({
      profileCompleted: true, photoUploaded: false, kycVerified: true,
      bankDetailsAdded: false, salaryConfigured: false, credentialsIssued: true
    }),
    createdAt: now,
    updatedAt: now
  });

  appendRowObj_(SHEET_NAMES.USERS, {
    userId: userId,
    employeeId: employeeId,
    email: String(payload.email).toLowerCase(),
    passwordHash: passwordHash,
    passwordSalt: salt,
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    failedAttempts: 0,
    lockedUntil: '',
    lastLoginAt: now,
    createdAt: now
  });

  var session = createSessionToken_({ userId: userId, employeeId: employeeId, role: 'SUPER_ADMIN' });
  updateRowByKey_(SHEET_NAMES.APP_SETTINGS, 'settingKey', 'adminRecoveryEmail', {
    settingValue: String(payload.email).toLowerCase(),
    updatedAt: now
  });
  logAudit_({ userId: userId, fullName: payload.fullName, role: 'SUPER_ADMIN' }, 'INIT_SUPER_ADMIN', 'SYSTEM', employeeId, 'Initial Super Admin created');

  return {
    ok: true,
    token: session.token,
    user: {
      userId: userId,
      employeeId: employeeId,
      fullName: payload.fullName,
      email: String(payload.email).toLowerCase(),
      role: 'SUPER_ADMIN',
      department: payload.department || 'Executive & Administration',
      designation: payload.designation || 'Super Admin',
      profilePhotoUrl: '',
      isFieldEmployee: false
    }
  };
}

function normalizePhoneDigits_(raw) {
  return String(raw || '').replace(/\D/g, '');
}

function isMobileMatch_(storedMobile, inputRaw) {
  var trimmed = String(inputRaw || '').trim();
  if (!trimmed || trimmed.indexOf('@') !== -1 || /[a-zA-Z]/.test(trimmed)) {
    return false;
  }
  var inputDigits = normalizePhoneDigits_(trimmed);
  var storedDigits = normalizePhoneDigits_(storedMobile);
  if (inputDigits.length < 7 || storedDigits.length < 7) {
    return false;
  }
  if (storedDigits === inputDigits) {
    return true;
  }
  return storedDigits.length >= 10 && inputDigits.length >= 10 && storedDigits.slice(-10) === inputDigits.slice(-10);
}

function findUserByIdentifier_(rawIdentifier) {
  var trimmed = String(rawIdentifier || '').trim();
  if (!trimmed) return null;
  var lower = trimmed.toLowerCase();

  var users = readSheetAsObjects_(SHEET_NAMES.USERS);
  var direct = users.filter(function (u) {
    return String(u.email).toLowerCase() === lower || String(u.employeeId).toLowerCase() === lower;
  })[0];
  if (direct) return direct;

  if (trimmed.indexOf('@') === -1 && !/[a-zA-Z]/.test(trimmed)) {
    var inputDigits = normalizePhoneDigits_(trimmed);
    if (inputDigits.length >= 7) {
      var employees = readSheetAsObjects_(SHEET_NAMES.EMPLOYEES);
      var matchedEmpIds = {};
      employees.forEach(function (e) {
        if (isMobileMatch_(e.mobile, trimmed)) {
          matchedEmpIds[String(e.employeeId)] = true;
        }
      });
      var mobileUsers = users.filter(function (u) {
        return Boolean(matchedEmpIds[String(u.employeeId)]) || isMobileMatch_(u.mobile, trimmed);
      });
      if (mobileUsers.length > 1) {
        throw new Error('Multiple accounts share this mobile number. Please sign in with your Official Email or Employee ID.');
      }
      if (mobileUsers.length === 1) {
        return mobileUsers[0];
      }
    }
  }
  return null;
}

function handleLogin_(payload) {
  var identifier = String(payload.identifier || '').trim();
  var password = String(payload.password || '');
  if (!identifier || !password) throw new Error('Email, Employee ID, or Mobile Number and password are required.');

  var user = findUserByIdentifier_(identifier);

  if (!user) throw new Error('Invalid email, employee ID, mobile number, or password.');
  if (user.status !== 'ACTIVE') throw new Error('Account is deactivated. Contact HR Administrator.');
  if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
    throw new Error('Account temporarily locked due to repeated failed attempts.');
  }

  var candidateHash = hashPassword_(password, user.passwordSalt);
  if (!constantTimeEquals_(candidateHash, user.passwordHash)) {
    var attempts = Number(user.failedAttempts || 0) + 1;
    var patch = { failedAttempts: attempts };
    if (attempts >= COMPANY_CONFIG.MAX_LOGIN_ATTEMPTS) {
      patch.lockedUntil = new Date(Date.now() + COMPANY_CONFIG.LOCKOUT_MINUTES * 60000).toISOString();
    }
    updateRowByKey_(SHEET_NAMES.USERS, 'userId', user.userId, patch);
    throw new Error('Invalid credentials.');
  }

  var now = new Date().toISOString();
  updateRowByKey_(SHEET_NAMES.USERS, 'userId', user.userId, { failedAttempts: 0, lockedUntil: '', lastLoginAt: now });
  var emp = readSheetAsObjects_(SHEET_NAMES.EMPLOYEES).filter(function (e) { return e.employeeId === user.employeeId; })[0] || {};
  var session = createSessionToken_(user);

  logAudit_({ userId: user.userId, fullName: emp.fullName || user.email, role: user.role }, 'LOGIN', 'AUTH', user.employeeId, 'Successful login');

  return {
    ok: true,
    token: session.token,
    user: {
      userId: user.userId,
      employeeId: user.employeeId,
      fullName: emp.fullName || user.email,
      email: user.email,
      role: user.role,
      department: emp.department || '',
      designation: emp.designation || '',
      profilePhotoUrl: emp.profilePhotoUrl || '',
      isFieldEmployee: String(emp.isFieldEmployee) === 'true'
    }
  };
}

function expireStaleOtps_() {
  var ss = getSpreadsheet_();
  if (!ss.getSheetByName(SHEET_NAMES.PASSWORD_RESET_OTPS)) {
    initializeDatabase();
  }
  var otps = readSheetAsObjects_(SHEET_NAMES.PASSWORD_RESET_OTPS);
  var nowMs = Date.now();
  otps.forEach(function (item) {
    if (item.status === 'PENDING' && new Date(item.expiresAt).getTime() <= nowMs) {
      updateRowByKey_(SHEET_NAMES.PASSWORD_RESET_OTPS, 'otpId', item.otpId, {
        status: 'EXPIRED',
        otpCode: '******'
      });
    }
  });
}

function createAndDispatchOtp_(targetUser, initiatedByActor) {
  expireStaleOtps_();
  var allOtps = readSheetAsObjects_(SHEET_NAMES.PASSWORD_RESET_OTPS);
  allOtps.forEach(function (existing) {
    if (existing.userId === targetUser.userId && existing.status === 'PENDING') {
      updateRowByKey_(SHEET_NAMES.PASSWORD_RESET_OTPS, 'otpId', existing.otpId, {
        status: 'REVOKED',
        otpCode: '******'
      });
    }
  });

  var emp = readSheetAsObjects_(SHEET_NAMES.EMPLOYEES).filter(function (e) {
    return e.employeeId === targetUser.employeeId;
  })[0] || {};
  var fullName = emp.fullName || targetUser.email;

  // Generate 6-digit numeric OTP and numeric Request ID derived from CSPRNG UUID bytes
  var cleanUuid = Utilities.getUuid().replace(/-/g, '');
  var seedHex = cleanUuid.slice(0, 8);
  var otpNum = 100000 + (parseInt(seedHex, 16) % 900000);
  var otpPlain = String(otpNum);
  var otpSalt = Utilities.getUuid();
  var otpHash = hashPassword_(otpPlain, otpSalt);
  var now = new Date();
  var expiresAt = new Date(now.getTime() + 10 * 60000).toISOString();
  var refHex = cleanUuid.slice(8, 16);
  var otpId = 'REQ-' + String(100000 + (parseInt(refHex, 16) % 900000));

  var users = readSheetAsObjects_(SHEET_NAMES.USERS);
  var adminUsers = users.filter(function (u) {
    return u.status === 'ACTIVE' && (targetUser.role === 'EMPLOYEE'
      ? (u.role === 'SUPER_ADMIN' || u.role === 'HR_ADMIN')
      : u.role === 'SUPER_ADMIN');
  });

  var settingsMap = getSettingsMap_();
  var recoveryEmail = String(settingsMap.adminRecoveryEmail || '').trim();
  var recipientMap = {};
  adminUsers.forEach(function (a) { if (a.email) recipientMap[a.email] = true; });
  if (recoveryEmail) recipientMap[recoveryEmail] = true;
  var recipientEmails = Object.keys(recipientMap);

  var emailSent = false;
  if (recipientEmails.length > 0) {
    try {
      MailApp.sendEmail({
        to: recipientEmails.join(','),
        subject: '[IDEAL HRMS] Password Reset OTP Request (' + targetUser.employeeId + ')',
        htmlBody:
          '<h3>IDEAL HRMS — Password Reset OTP Dispatch</h3>' +
          '<p>A password reset was requested for:</p>' +
          '<ul>' +
          '<li><strong>Name:</strong> ' + fullName + '</li>' +
          '<li><strong>Employee ID:</strong> ' + targetUser.employeeId + '</li>' +
          '<li><strong>Role:</strong> ' + targetUser.role + '</li>' +
          '<li><strong>Email:</strong> ' + targetUser.email + '</li>' +
          '<li><strong>Request ID:</strong> ' + otpId + '</li>' +
          '</ul>' +
          '<p style="font-size:18px;"><strong>6-Digit Numeric OTP: <span style="letter-spacing:3px;color:#0B1B36;">' + otpPlain + '</span></strong></p>' +
          '<p>Valid until: ' + expiresAt + ' (10 minutes). Share this OTP only with the verified user.</p>'
      });
      emailSent = true;
    } catch (mailErr) {
      emailSent = false;
    }
  }

  var dispatchedTo = recipientEmails.length > 0
    ? 'Admin OTP Console & ' + recipientEmails.join(', ')
    : 'Admin OTP Console';

  var record = {
    otpId: otpId,
    userId: targetUser.userId,
    employeeId: targetUser.employeeId,
    employeeName: fullName,
    userEmail: targetUser.email,
    userRole: targetUser.role,
    otpCode: otpPlain,
    otpHash: otpHash,
    otpSalt: otpSalt,
    status: 'PENDING',
    attempts: 0,
    dispatchedTo: dispatchedTo,
    emailSent: emailSent,
    expiresAt: expiresAt,
    createdAt: now.toISOString(),
    usedAt: ''
  };
  appendRowObj_(SHEET_NAMES.PASSWORD_RESET_OTPS, record);

  adminUsers.forEach(function (admin) {
    appendNotification_(
      admin.employeeId,
      'SECURITY',
      'Password Reset OTP: ' + otpPlain + ' (' + targetUser.employeeId + ')',
      '6-Digit Numeric OTP: ' + otpPlain + ' — ' + fullName + ' (' + targetUser.role + ') requested a password reset. Share this 6-digit number only (valid 10 min · Request ' + otpId + ').'
    );
  });

  logAudit_(
    initiatedByActor || { userId: targetUser.userId, fullName: fullName, role: targetUser.role },
    'REQUEST_PASSWORD_RESET_OTP',
    'AUTH',
    targetUser.employeeId,
    'OTP ' + otpId + ' dispatched to ' + dispatchedTo
  );

  var maskedRecipients = recipientEmails.map(function (em) {
    var p = em.split('@');
    return p.length === 2 ? p[0].slice(0, 2) + '***@' + p[1] : '***';
  }).join(', ') || 'Administrator Console';

  return { record: record, maskedRecipients: maskedRecipients };
}

function handleRequestPasswordResetOtp_(payload) {
  var identifier = String(payload.identifier || '').trim();
  if (!identifier) throw new Error('Please enter your Official Email, Employee ID, or Registered Mobile Number.');

  var user = findUserByIdentifier_(identifier);
  if (!user) throw new Error('No account found matching that Official Email, Employee ID, or Mobile Number.');
  if (user.status !== 'ACTIVE') throw new Error('Account is deactivated. Contact HR Administrator.');

  var res = createAndDispatchOtp_(user, null);
  return {
    ok: true,
    otpId: res.record.otpId,
    expiresAt: res.record.expiresAt,
    targetRole: user.role,
    maskedAdminRecipients: res.maskedRecipients,
    message: 'Password reset request (' + res.record.otpId + ') sent to Administrator (' + res.maskedRecipients + '). Request the 6-digit numeric OTP from your Admin to reset your password.'
  };
}

function handleVerifyPasswordResetOtp_(payload) {
  var identifier = String(payload.identifier || '').trim();
  var otp = String(payload.otp || '').trim();
  var newPassword = String(payload.newPassword || '');
  if (!identifier || !otp) throw new Error('Email/Employee ID/Mobile Number and 6-digit OTP are required.');
  if (!/^\d{6}$/.test(otp)) throw new Error('OTP must be a 6-digit numeric code (digits 0-9 only).');
  if (newPassword.length < 8) throw new Error('New password must be at least 8 characters long.');

  var user = findUserByIdentifier_(identifier);
  if (!user || user.status !== 'ACTIVE') throw new Error('Invalid or inactive user account.');

  expireStaleOtps_();
  var otps = readSheetAsObjects_(SHEET_NAMES.PASSWORD_RESET_OTPS);
  var otpRecord = null;
  for (var i = otps.length - 1; i >= 0; i--) {
    if (otps[i].userId === user.userId && otps[i].status === 'PENDING') {
      otpRecord = otps[i];
      break;
    }
  }
  if (!otpRecord) throw new Error('No active OTP found or OTP has expired. Please request a new OTP.');
  if (new Date(otpRecord.expiresAt).getTime() <= Date.now()) {
    updateRowByKey_(SHEET_NAMES.PASSWORD_RESET_OTPS, 'otpId', otpRecord.otpId, { status: 'EXPIRED', otpCode: '******' });
    throw new Error('OTP has expired. Please request a new OTP.');
  }

  var candidateOtpHash = hashPassword_(otp, otpRecord.otpSalt);
  if (!constantTimeEquals_(candidateOtpHash, otpRecord.otpHash)) {
    var attempts = Number(otpRecord.attempts || 0) + 1;
    var patch = { attempts: attempts };
    if (attempts >= 5) {
      patch.status = 'REVOKED';
      patch.otpCode = '******';
    }
    updateRowByKey_(SHEET_NAMES.PASSWORD_RESET_OTPS, 'otpId', otpRecord.otpId, patch);
    throw new Error(attempts >= 5
      ? 'Too many incorrect OTP attempts. OTP has been revoked.'
      : 'Invalid 6-digit OTP. ' + (5 - attempts) + ' attempt(s) remaining.');
  }

  var now = new Date().toISOString();
  var newSalt = Utilities.getUuid();
  updateRowByKey_(SHEET_NAMES.USERS, 'userId', user.userId, {
    passwordSalt: newSalt,
    passwordHash: hashPassword_(newPassword, newSalt),
    failedAttempts: 0,
    lockedUntil: ''
  });
  updateRowByKey_(SHEET_NAMES.PASSWORD_RESET_OTPS, 'otpId', otpRecord.otpId, {
    status: 'USED',
    usedAt: now,
    otpCode: '******'
  });

  appendNotification_(user.employeeId, 'SECURITY', 'Password Reset Completed', 'Your password was reset via Admin-verified OTP (' + otpRecord.otpId + ').');
  logAudit_({ userId: user.userId, fullName: user.email, role: user.role }, 'PASSWORD_RESET_OTP', 'AUTH', user.employeeId, 'Password reset via OTP ' + otpRecord.otpId);
  return { ok: true, message: 'Password updated successfully. You can now sign in with your new password.' };
}

function handleGetPasswordResetOtps_(authUser) {
  expireStaleOtps_();
  var rows = readSheetAsObjects_(SHEET_NAMES.PASSWORD_RESET_OTPS).filter(function (o) {
    return authUser.role === 'SUPER_ADMIN' || o.userRole === 'EMPLOYEE';
  }).map(function (o) {
    return {
      otpId: o.otpId,
      userId: o.userId,
      employeeId: o.employeeId,
      employeeName: o.employeeName,
      userEmail: o.userEmail,
      userRole: o.userRole,
      otpCode: o.otpCode,
      status: o.status,
      attempts: Number(o.attempts || 0),
      dispatchedTo: o.dispatchedTo,
      emailSent: String(o.emailSent) === 'true',
      expiresAt: o.expiresAt,
      createdAt: o.createdAt,
      usedAt: o.usedAt
    };
  });
  return { ok: true, otps: rows.reverse().slice(0, 50) };
}

function handleAdminIssuePasswordResetOtp_(authUser, payload) {
  var identifier = String(payload.identifier || payload.employeeId || '').trim();
  var targetUser = findUserByIdentifier_(identifier);
  if (!targetUser) throw new Error('User account not found.');
  if (targetUser.status !== 'ACTIVE') throw new Error('Account is inactive.');
  if (authUser.role === 'HR_ADMIN' && targetUser.role !== 'EMPLOYEE') {
    throw new Error('FORBIDDEN: Only Super Admin can issue OTPs for Admin accounts.');
  }
  var res = createAndDispatchOtp_(targetUser, authUser);
  return { ok: true, otp: res.record };
}

function handleRevokePasswordResetOtp_(authUser, payload) {
  var rec = readSheetAsObjects_(SHEET_NAMES.PASSWORD_RESET_OTPS).filter(function (o) {
    return o.otpId === payload.otpId;
  })[0];
  if (!rec) throw new Error('OTP record not found.');
  if (authUser.role === 'HR_ADMIN' && rec.userRole !== 'EMPLOYEE') {
    throw new Error('FORBIDDEN: Only Super Admin can revoke Admin OTPs.');
  }
  updateRowByKey_(SHEET_NAMES.PASSWORD_RESET_OTPS, 'otpId', payload.otpId, {
    status: 'REVOKED',
    otpCode: '******'
  });
  logAudit_(authUser, 'REVOKE_OTP', 'AUTH', rec.employeeId, 'Revoked OTP ' + rec.otpId);
  return { ok: true };
}

/* ==================== EMPLOYEE, ATTENDANCE, GPS, LEAVE, PAYROLL, PERFORMANCE, TASKS ==================== */

function seedDefaultOrgMasterIfEmpty_() {
  var departments = readSheetAsObjects_(SHEET_NAMES.DEPARTMENTS);
  if (departments.length === 0) {
    var now = new Date().toISOString();
    [
      ['DEPT-EXEC', 'Executive & Administration', 'EXEC'],
      ['DEPT-HR', 'Human Resources', 'HR'],
      ['DEPT-OPS', 'Operations & Field Services', 'OPS'],
      ['DEPT-ENG', 'Engineering & Projects', 'ENG'],
      ['DEPT-FIN', 'Finance & Accounts', 'FIN'],
      ['DEPT-SALES', 'Sales & Business Development', 'SALES']
    ].forEach(function (d) {
      appendRowObj_(SHEET_NAMES.DEPARTMENTS, { departmentId: d[0], name: d[1], code: d[2], headEmployeeId: '', createdAt: now });
    });
  }
  var designations = readSheetAsObjects_(SHEET_NAMES.DESIGNATIONS);
  if (designations.length === 0) {
    ensureSheetColumns_(SHEET_NAMES.DESIGNATIONS, ['status']);
    [
      ['DES-MD', 'Managing Director', 'Executive & Administration', 'L1'],
      ['DES-ED', 'Executive Director', 'Executive & Administration', 'L1'],
      ['DES-HRM', 'HR Manager', 'Human Resources', 'L2'],
      ['DES-HRE', 'HR Executive', 'Human Resources', 'L3'],
      ['DES-OPM', 'Operations Manager', 'Operations & Field Services', 'L2'],
      ['DES-PE', 'Project Engineer', 'Engineering & Projects', 'L3'],
      ['DES-SE', 'Site Engineer', 'Operations & Field Services', 'L3'],
      ['DES-FE', 'Field Executive', 'Operations & Field Services', 'L4'],
      ['DES-ACC', 'Accounts Executive', 'Finance & Accounts', 'L3'],
      ['DES-TECH', 'Technician', 'Operations & Field Services', 'L4']
    ].forEach(function (r) {
      appendRowObj_(SHEET_NAMES.DESIGNATIONS, { designationId: r[0], title: r[1], department: r[2], level: r[3], status: 'ACTIVE' });
    });
  }
}

function handleGetEmployees_(authUser) {
  seedDefaultOrgMasterIfEmpty_();
  var all = readSheetAsObjects_(SHEET_NAMES.EMPLOYEES).map(function (e) {
    e.isFieldEmployee = String(e.isFieldEmployee) === 'true';
    e.onboardingChecklist = e.onboardingChecklistJson ? JSON.parse(e.onboardingChecklistJson) : {};
    return e;
  });
  var departments = readSheetAsObjects_(SHEET_NAMES.DEPARTMENTS);
  var designations = readSheetAsObjects_(SHEET_NAMES.DESIGNATIONS);
  var docs = readSheetAsObjects_(SHEET_NAMES.DOCUMENTS);

  if (authUser.role === 'EMPLOYEE') {
    all = all.filter(function (e) { return e.employeeId === authUser.employeeId; });
    docs = docs.filter(function (d) { return d.employeeId === authUser.employeeId; });
  }
  return { ok: true, employees: all, departments: departments, designations: designations, documents: docs };
}

function handleCreateEmployee_(authUser, payload) {
  var employees = readSheetAsObjects_(SHEET_NAMES.EMPLOYEES);
  var users = readSheetAsObjects_(SHEET_NAMES.USERS);
  var email = String(payload.officialEmail || '').trim().toLowerCase();
  if (!email || users.some(function (u) { return String(u.email).toLowerCase() === email; })) {
    throw new Error('A user with this official email already exists.');
  }
  var cleanMobile = String(payload.mobile || '').trim();
  if (normalizePhoneDigits_(cleanMobile).length >= 7 && employees.some(function (e) { return isMobileMatch_(e.mobile, cleanMobile); })) {
    throw new Error('Another employee is already registered with this mobile number.');
  }
  var nextNum = employees.length + 1;
  var employeeId = COMPANY_CONFIG.COMPANY_CODE + '-' + ('0000' + nextNum).slice(-4);
  while (employees.some(function (e) { return e.employeeId === employeeId; })) {
    nextNum++;
    employeeId = COMPANY_CONFIG.COMPANY_CODE + '-' + ('0000' + nextNum).slice(-4);
  }
  var now = new Date().toISOString();
  var photoUrl = payload.profilePhotoUrl ? saveBase64ToDrive_('DRIVE_DOCS_FOLDER_ID', employeeId + '_photo.jpg', payload.profilePhotoUrl) : '';
  var reqRole = String(payload.role || 'EMPLOYEE').toUpperCase();
  var assignedRole = authUser.role === 'SUPER_ADMIN'
    ? (reqRole === 'SUPER_ADMIN' || reqRole === 'HR_ADMIN' ? reqRole : 'EMPLOYEE')
    : (reqRole === 'HR_ADMIN' ? 'HR_ADMIN' : 'EMPLOYEE');

  var empObj = {
    employeeId: employeeId,
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
    role: assignedRole,
    bankName: payload.bankName || '',
    bankAccountNumber: payload.bankAccountNumber || '',
    ifscCode: payload.ifscCode || '',
    panNumber: payload.panNumber || '',
    aadhaarNumber: payload.aadhaarNumber || '',
    status: 'ACTIVE',
    onboardingChecklistJson: JSON.stringify(payload.onboardingChecklist || {
      profileCompleted: true, photoUploaded: Boolean(photoUrl), kycVerified: false,
      bankDetailsAdded: Boolean(payload.bankAccountNumber), salaryConfigured: false, credentialsIssued: true
    }),
    createdAt: now,
    updatedAt: now
  };
  appendRowObj_(SHEET_NAMES.EMPLOYEES, empObj);

  // Create user login
  var salt = Utilities.getUuid();
  var userId = 'USR-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  appendRowObj_(SHEET_NAMES.USERS, {
    userId: userId,
    employeeId: employeeId,
    email: String(payload.officialEmail).toLowerCase(),
    passwordHash: hashPassword_(payload.initialPassword || 'Ideal@2026', salt),
    passwordSalt: salt,
    role: empObj.role,
    status: 'ACTIVE',
    failedAttempts: 0,
    lockedUntil: '',
    lastLoginAt: '',
    createdAt: now
  });

  // Initialize annual leave balances
  var leaveTypes = readSheetAsObjects_(SHEET_NAMES.LEAVE_TYPES);
  var year = new Date().getFullYear();
  leaveTypes.forEach(function (lt) {
    appendRowObj_(SHEET_NAMES.LEAVE_BALANCES, {
      balanceId: 'BAL-' + employeeId + '-' + lt.code + '-' + year,
      employeeId: employeeId,
      leaveTypeId: lt.leaveTypeId,
      leaveTypeName: lt.name,
      year: year,
      allocated: Number(lt.annualQuota || 0),
      used: 0,
      remaining: Number(lt.annualQuota || 0)
    });
  });

  appendNotification_(employeeId, 'SYSTEM', 'Welcome to IDEAL HRMS', 'Your profile (' + employeeId + ') has been onboarded.');
  logAudit_(authUser, 'CREATE_EMPLOYEE', 'EMPLOYEES', employeeId, payload.fullName);
  return { ok: true, employeeId: employeeId };
}

function handleUpdateEmployee_(authUser, payload) {
  var targetId = payload.employeeId;
  if (authUser.role === 'EMPLOYEE' && targetId !== authUser.employeeId) {
    throw new Error('FORBIDDEN: Cannot update another employee profile.');
  }
  var allEmployees = readSheetAsObjects_(SHEET_NAMES.EMPLOYEES);
  var existingEmp = allEmployees.filter(function (e) { return e.employeeId === targetId; })[0];
  if (!existingEmp) throw new Error('Employee not found.');

  if (authUser.role !== 'EMPLOYEE' && payload.officialEmail) {
    var nextEmail = String(payload.officialEmail).trim().toLowerCase();
    var allUsers = readSheetAsObjects_(SHEET_NAMES.USERS);
    if (allUsers.some(function (u) { return u.employeeId !== targetId && String(u.email).toLowerCase() === nextEmail; })) {
      throw new Error('Another user account already uses this official email.');
    }
  }
  if (payload.hasOwnProperty('mobile')) {
    var nextMobile = String(payload.mobile || '').trim();
    if (normalizePhoneDigits_(nextMobile).length >= 7 && allEmployees.some(function (e) { return e.employeeId !== targetId && isMobileMatch_(e.mobile, nextMobile); })) {
      throw new Error('Another employee account already uses this mobile number.');
    }
  }

  var patch = {};
  var allowedSelfFields = ['mobile', 'personalEmail', 'emergencyContact', 'currentAddress', 'profilePhotoUrl'];
  var keys = authUser.role === 'EMPLOYEE' ? allowedSelfFields : Object.keys(payload);
  keys.forEach(function (k) {
    if (k === 'employeeId' || k === 'createdAt' || k === 'initialPassword') return;
    if (k === 'role') {
      if (authUser.role === 'SUPER_ADMIN') {
        patch.role = payload.role;
      } else if (authUser.role === 'HR_ADMIN' && existingEmp.role !== 'SUPER_ADMIN' && payload.role !== 'SUPER_ADMIN') {
        patch.role = payload.role;
      }
    } else if (k === 'officialEmail') {
      patch.officialEmail = String(payload.officialEmail).trim().toLowerCase();
    } else if (k === 'onboardingChecklist') {
      patch.onboardingChecklistJson = JSON.stringify(payload.onboardingChecklist);
    } else if (k === 'profilePhotoUrl' && payload.profilePhotoUrl && payload.profilePhotoUrl.indexOf('data:') === 0) {
      patch.profilePhotoUrl = saveBase64ToDrive_('DRIVE_DOCS_FOLDER_ID', targetId + '_photo.jpg', payload.profilePhotoUrl);
    } else if (payload.hasOwnProperty(k)) {
      patch[k] = payload[k];
    }
  });
  patch.updatedAt = new Date().toISOString();
  updateRowByKey_(SHEET_NAMES.EMPLOYEES, 'employeeId', targetId, patch);

  if (authUser.role !== 'EMPLOYEE') {
    var userPatch = {};
    if (patch.officialEmail) userPatch.email = patch.officialEmail;
    if (patch.role) userPatch.role = patch.role;
    if (patch.status) userPatch.status = patch.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE';
    if (Object.keys(userPatch).length > 0) {
      updateRowByKey_(SHEET_NAMES.USERS, 'employeeId', targetId, userPatch);
    }
  }
  logAudit_(authUser, 'UPDATE_EMPLOYEE', 'EMPLOYEES', targetId, 'Profile updated');
  return { ok: true };
}

function handleToggleEmployeeStatus_(authUser, payload) {
  updateRowByKey_(SHEET_NAMES.EMPLOYEES, 'employeeId', payload.employeeId, { status: payload.status, updatedAt: new Date().toISOString() });
  updateRowByKey_(SHEET_NAMES.USERS, 'employeeId', payload.employeeId, { status: payload.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE' });
  logAudit_(authUser, 'TOGGLE_STATUS', 'EMPLOYEES', payload.employeeId, payload.status);
  return { ok: true };
}

function handleUploadDocument_(authUser, payload) {
  if (authUser.role === 'EMPLOYEE' && payload.employeeId !== authUser.employeeId) {
    throw new Error('FORBIDDEN');
  }
  var url = saveBase64ToDrive_('DRIVE_DOCS_FOLDER_ID', payload.employeeId + '_' + payload.fileName, payload.fileDataUrl);
  var docId = 'DOC-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  appendRowObj_(SHEET_NAMES.DOCUMENTS, {
    documentId: docId,
    employeeId: payload.employeeId,
    documentType: payload.documentType,
    fileName: payload.fileName,
    fileUrl: url,
    mimeType: payload.mimeType || 'application/octet-stream',
    verificationStatus: 'PENDING',
    verifiedBy: '',
    uploadedAt: new Date().toISOString()
  });
  logAudit_(authUser, 'UPLOAD_DOCUMENT', 'DOCUMENTS', docId, payload.documentType);
  return { ok: true, documentId: docId, fileUrl: url };
}

function buildMapsUrl_(lat, lng, placeId) {
  var numLat = Number(lat);
  var numLng = Number(lng);
  if (!isFinite(numLat) || !isFinite(numLng) || (numLat === 0 && numLng === 0)) return '';
  var base = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(numLat + ',' + numLng);
  return placeId ? base + '&query_place_id=' + encodeURIComponent(placeId) : base;
}

function haversineMeters_(lat1, lng1, lat2, lng2) {
  var toRad = function (deg) { return (deg * Math.PI) / 180; };
  var R = 6371000;
  var dLat = toRad(lat2 - lat1);
  var dLng = toRad(lng2 - lng1);
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function ensureLocationTrackingColumns_() {
  ensureSheetColumns_(SHEET_NAMES.ATTENDANCE_LOCATION_HISTORY, [
    'attendanceType', 'speedMps', 'headingDeg', 'distanceFromPrevMeters', 'mapsUrl'
  ]);
  ensureSheetColumns_(SHEET_NAMES.LIVE_LOCATION, [
    'attendanceType', 'speedMps', 'headingDeg', 'locationPermissionStatus', 'mapsUrl', 'shiftCheckedInAt'
  ]);
}

function reverseGeocodeLatLng_(lat, lng) {
  var numLat = Number(lat);
  var numLng = Number(lng);
  if (!numLat || !numLng || isNaN(numLat) || isNaN(numLng)) {
    return { address: '', placeId: '' };
  }
  var apiKey = PropertiesService.getScriptProperties().getProperty('GOOGLE_MAPS_API_KEY') || '';
  if (!apiKey) return { address: '', placeId: '' };
  try {
    var url = 'https://maps.googleapis.com/maps/api/geocode/json?latlng=' + encodeURIComponent(numLat + ',' + numLng) + '&language=en&region=in&key=' + encodeURIComponent(apiKey);
    var res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: { 'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio' }
    });
    if (res.getResponseCode() === 429) {
      return { address: '', placeId: '', quotaExceeded: true };
    }
    var data = JSON.parse(res.getContentText() || '{}');
    if (data.status === 'OVER_QUERY_LIMIT' || data.status === 'OVER_DAILY_LIMIT') {
      return { address: '', placeId: '', quotaExceeded: true };
    }
    if (data.status === 'OK' && data.results && data.results.length > 0) {
      return { address: data.results[0].formatted_address || '', placeId: data.results[0].place_id || '' };
    }
  } catch (err) {}
  return { address: '', placeId: '' };
}

function handleCheckIn_(authUser, payload) {
  ensureLocationTrackingColumns_();
  var dateStr = (payload.deviceTimestamp || new Date().toISOString()).slice(0, 10);
  var all = readSheetAsObjects_(SHEET_NAMES.ATTENDANCE);
  var existing = all.filter(function (a) { return a.employeeId === authUser.employeeId && a.date === dateStr; })[0];
  if (existing && existing.checkInTime) {
    throw new Error('Duplicate check-in prevented for ' + dateStr);
  }
  var attType = payload.attendanceType || (authUser.isFieldEmployee ? 'FIELD' : 'OFFICE');
  var latNum = (payload.latitude != null && payload.latitude !== '') ? Number(payload.latitude) : NaN;
  var lngNum = (payload.longitude != null && payload.longitude !== '') ? Number(payload.longitude) : NaN;
  var hasCoords = isFinite(latNum) && isFinite(lngNum) && !(latNum === 0 && lngNum === 0);
  if ((attType === 'FIELD' || authUser.isFieldEmployee) && !hasCoords) {
    throw new Error('Mandatory GPS location is required for field attendance Check-In. Keep device Location ON.');
  }

  var nowIso = payload.isOfflineSync ? payload.deviceTimestamp : new Date().toISOString();
  var selfieUrl = payload.selfieDataUrl
    ? saveBase64ToDrive_('DRIVE_SELFIES_FOLDER_ID', authUser.employeeId + '_' + dateStr + '_IN.jpg', payload.selfieDataUrl)
    : '';
  var attendanceId = 'ATT-' + authUser.employeeId + '-' + dateStr;
  var settings = getSettingsMap_();
  var shiftStart = settings.shiftStartTime || '09:30';
  var grace = Number(settings.lateGraceMinutes || 15);
  var checkInDate = new Date(nowIso);
  var parts = shiftStart.split(':');
  var cutoff = new Date(checkInDate);
  cutoff.setHours(Number(parts[0]), Number(parts[1]) + grace, 0, 0);
  var status = checkInDate.getTime() > cutoff.getTime() ? 'LATE' : 'PRESENT';

  var resolvedAddress = payload.address || '';
  var resolvedPlaceId = payload.placeId || '';
  if (!resolvedAddress && hasCoords) {
    var geoIn = reverseGeocodeLatLng_(latNum, lngNum);
    resolvedAddress = geoIn.address;
    resolvedPlaceId = geoIn.placeId;
  }

  var record = {
    attendanceId: attendanceId,
    employeeId: authUser.employeeId,
    employeeName: authUser.fullName,
    department: authUser.department,
    date: dateStr,
    checkInTime: nowIso,
    checkInLat: hasCoords ? latNum : '',
    checkInLng: hasCoords ? lngNum : '',
    checkInAccuracy: payload.accuracy || '',
    checkInAddress: resolvedAddress,
    checkInPlaceId: resolvedPlaceId,
    checkInPhotoRef: selfieUrl,
    checkOutTime: '',
    checkOutLat: '',
    checkOutLng: '',
    checkOutAccuracy: '',
    checkOutAddress: '',
    checkOutPlaceId: '',
    checkOutPhotoRef: '',
    attendanceType: attType,
    workingHours: 0,
    overtimeHours: 0,
    status: status,
    verificationStatus: payload.isOfflineSync ? 'DEVICE_CAPTURED_UNVERIFIED' : 'VERIFIED',
    correctionRequested: false,
    correctionReason: '',
    correctionStatus: 'NONE',
    notes: payload.notes || '',
    eventId: payload.eventId || ''
  };
  appendRowObj_(SHEET_NAMES.ATTENDANCE, record);

  if (hasCoords) {
    var mapsUrlIn = buildMapsUrl_(latNum, lngNum, resolvedPlaceId);
    appendRowObj_(SHEET_NAMES.ATTENDANCE_LOCATION_HISTORY, {
      historyId: 'LOC-' + Utilities.getUuid().slice(0, 8).toUpperCase(),
      employeeId: authUser.employeeId,
      employeeName: authUser.fullName,
      department: authUser.department,
      date: dateStr,
      timestamp: nowIso,
      latitude: latNum,
      longitude: lngNum,
      accuracy: payload.accuracy || 0,
      address: resolvedAddress,
      placeId: resolvedPlaceId,
      attendanceType: attType,
      speedMps: '',
      headingDeg: '',
      distanceFromPrevMeters: 0,
      mapsUrl: mapsUrlIn,
      source: payload.isOfflineSync ? 'OFFLINE_DEVICE' : 'CHECK_IN',
      verificationStatus: record.verificationStatus
    });

    var empIn = readSheetAsObjects_(SHEET_NAMES.EMPLOYEES).filter(function (e) { return e.employeeId === authUser.employeeId; })[0] || {};
    var liveRowsIn = readSheetAsObjects_(SHEET_NAMES.LIVE_LOCATION);
    var liveExistsIn = liveRowsIn.some(function (r) { return r.employeeId === authUser.employeeId; });
    var liveObjIn = {
      employeeId: authUser.employeeId,
      employeeName: authUser.fullName,
      department: authUser.department,
      reportingManagerName: empIn.reportingManagerName || '',
      latitude: latNum,
      longitude: lngNum,
      accuracy: payload.accuracy || 0,
      address: resolvedAddress,
      placeId: resolvedPlaceId,
      attendanceType: attType,
      speedMps: '',
      headingDeg: '',
      locationPermissionStatus: 'ACTIVE',
      mapsUrl: mapsUrlIn,
      shiftCheckedInAt: nowIso,
      isSharingActive: attType === 'FIELD' || Boolean(authUser.isFieldEmployee),
      lastUpdatedAt: nowIso
    };
    if (liveExistsIn) {
      updateRowByKey_(SHEET_NAMES.LIVE_LOCATION, 'employeeId', authUser.employeeId, liveObjIn);
    } else {
      appendRowObj_(SHEET_NAMES.LIVE_LOCATION, liveObjIn);
    }
  }
  appendNotification_(authUser.employeeId, 'ATTENDANCE', 'Check-In Recorded', 'Checked in on ' + dateStr + ' (' + status + ')' + (resolvedAddress ? ' at ' + resolvedAddress : '') + '.');
  logAudit_(authUser, 'CHECK_IN', 'ATTENDANCE', attendanceId, status + (resolvedAddress ? ' at ' + resolvedAddress : ''));
  return { ok: true, record: record };
}

function handleCheckOut_(authUser, payload) {
  ensureLocationTrackingColumns_();
  var refIso = payload.deviceTimestamp || new Date().toISOString();
  var dateStr = refIso.slice(0, 10);
  var all = readSheetAsObjects_(SHEET_NAMES.ATTENDANCE);
  var existing = all.filter(function (a) { return a.employeeId === authUser.employeeId && a.date === dateStr; })[0];
  if (!existing || !existing.checkInTime) {
    var refMs = new Date(refIso).getTime();
    var openShifts = all.filter(function (a) {
      if (a.employeeId !== authUser.employeeId || !a.checkInTime || a.checkOutTime) return false;
      var inMs = new Date(a.checkInTime).getTime();
      return !isNaN(refMs) && !isNaN(inMs) && (refMs - inMs) >= 0 && (refMs - inMs) <= 86400000;
    });
    if (openShifts.length > 0) {
      existing = openShifts[openShifts.length - 1];
      dateStr = existing.date || dateStr;
    }
  }
  if (!existing || !existing.checkInTime) {
    throw new Error('Cannot check out without an active check-in for ' + dateStr);
  }
  if (existing.checkOutTime) {
    throw new Error('Check-out already recorded for ' + dateStr);
  }
  var latNum = (payload.latitude != null && payload.latitude !== '') ? Number(payload.latitude) : NaN;
  var lngNum = (payload.longitude != null && payload.longitude !== '') ? Number(payload.longitude) : NaN;
  var hasCoords = isFinite(latNum) && isFinite(lngNum) && !(latNum === 0 && lngNum === 0);
  if ((existing.attendanceType === 'FIELD' || authUser.isFieldEmployee) && !hasCoords) {
    throw new Error('Mandatory GPS location is required for field attendance Check-Out. Keep device Location ON.');
  }

  var nowIso = payload.isOfflineSync ? payload.deviceTimestamp : new Date().toISOString();
  var selfieUrl = payload.selfieDataUrl
    ? saveBase64ToDrive_('DRIVE_SELFIES_FOLDER_ID', authUser.employeeId + '_' + dateStr + '_OUT.jpg', payload.selfieDataUrl)
    : '';
  var settings = getSettingsMap_();
  var otThreshold = Number(settings.overtimeAfterHours || 9);
  if (!isFinite(otThreshold) || otThreshold <= 0) otThreshold = 9;
  var computedOut = computeDutyAndOvertimeEs5_(existing.checkInTime, nowIso, otThreshold);
  var hours = computedOut.workingHours;
  var halfThreshold = Number(settings.halfDayThresholdHours || 4.5);
  var finalStatus = existing.status;
  if (hours < halfThreshold) finalStatus = 'HALF_DAY';
  var overtime = computedOut.overtimeHours;

  var resolvedAddress = payload.address || '';
  var resolvedPlaceId = payload.placeId || '';
  if (!resolvedAddress && hasCoords) {
    var geoOut = reverseGeocodeLatLng_(latNum, lngNum);
    resolvedAddress = geoOut.address;
    resolvedPlaceId = geoOut.placeId;
  }

  updateRowByKey_(SHEET_NAMES.ATTENDANCE, 'attendanceId', existing.attendanceId, {
    checkOutTime: nowIso,
    checkOutLat: hasCoords ? latNum : '',
    checkOutLng: hasCoords ? lngNum : '',
    checkOutAccuracy: payload.accuracy || '',
    checkOutAddress: resolvedAddress,
    checkOutPlaceId: resolvedPlaceId,
    checkOutPhotoRef: selfieUrl,
    workingHours: hours,
    overtimeHours: overtime,
    status: finalStatus
  });

  if (hasCoords) {
    var prevHist = readSheetAsObjects_(SHEET_NAMES.ATTENDANCE_LOCATION_HISTORY).filter(function (h) {
      return h.employeeId === authUser.employeeId && h.date === dateStr && Number(h.latitude) && Number(h.longitude);
    });
    var prevPt = prevHist.length > 0 ? prevHist[prevHist.length - 1] : null;
    var distOut = prevPt ? haversineMeters_(Number(prevPt.latitude), Number(prevPt.longitude), latNum, lngNum) : 0;
    var mapsUrlOut = buildMapsUrl_(latNum, lngNum, resolvedPlaceId);

    appendRowObj_(SHEET_NAMES.ATTENDANCE_LOCATION_HISTORY, {
      historyId: 'LOC-' + Utilities.getUuid().slice(0, 8).toUpperCase(),
      employeeId: authUser.employeeId,
      employeeName: authUser.fullName,
      department: authUser.department,
      date: dateStr,
      timestamp: nowIso,
      latitude: latNum,
      longitude: lngNum,
      accuracy: payload.accuracy || 0,
      address: resolvedAddress,
      placeId: resolvedPlaceId,
      attendanceType: existing.attendanceType || 'OFFICE',
      speedMps: '',
      headingDeg: '',
      distanceFromPrevMeters: distOut,
      mapsUrl: mapsUrlOut,
      source: payload.isOfflineSync ? 'OFFLINE_DEVICE' : 'CHECK_OUT',
      verificationStatus: payload.isOfflineSync ? 'DEVICE_CAPTURED_UNVERIFIED' : 'VERIFIED'
    });
    updateRowByKey_(SHEET_NAMES.LIVE_LOCATION, 'employeeId', authUser.employeeId, {
      latitude: latNum,
      longitude: lngNum,
      accuracy: payload.accuracy || 0,
      address: resolvedAddress,
      placeId: resolvedPlaceId,
      mapsUrl: mapsUrlOut,
      isSharingActive: false,
      locationPermissionStatus: 'CHECKED_OUT',
      lastUpdatedAt: nowIso
    });
  } else {
    updateRowByKey_(SHEET_NAMES.LIVE_LOCATION, 'employeeId', authUser.employeeId, {
      isSharingActive: false,
      locationPermissionStatus: 'CHECKED_OUT',
      lastUpdatedAt: nowIso
    });
  }
  appendNotification_(authUser.employeeId, 'ATTENDANCE', 'Check-Out Recorded', 'Worked ' + hours + ' hrs on ' + dateStr + (resolvedAddress ? ' from ' + resolvedAddress : '') + '.');
  logAudit_(authUser, 'CHECK_OUT', 'ATTENDANCE', existing.attendanceId, 'Hours: ' + hours + (resolvedAddress ? ' from ' + resolvedAddress : ''));
  return { ok: true, workingHours: hours, status: finalStatus };
}

function handleGetAttendance_(authUser, payload) {
  var rows = readSheetAsObjects_(SHEET_NAMES.ATTENDANCE);
  if (authUser.role === 'EMPLOYEE') {
    rows = rows.filter(function (r) { return r.employeeId === authUser.employeeId; });
  }
  if (payload && payload.month) {
    rows = rows.filter(function (r) { return String(r.date).indexOf(payload.month) === 0; });
  }
  return { ok: true, records: rows.reverse() };
}

function computeDutyAndOvertimeEs5_(checkInIso, checkOutIso, thresholdHours) {
  var otThresh = Number(thresholdHours || 9);
  if (!isFinite(otThresh) || otThresh <= 0) otThresh = 9;
  var inMs = new Date(checkInIso).getTime();
  var outMs = new Date(checkOutIso).getTime();
  if (isNaN(inMs) || isNaN(outMs)) return { workingHours: 0, overtimeHours: 0 };
  if (outMs < inMs && (outMs + 86400000 - inMs) <= 86400000) {
    outMs += 86400000;
  }
  var hrs = Math.round(Math.max(0, (outMs - inMs) / 3600000) * 100) / 100;
  var ot = hrs > otThresh ? Math.round((hrs - otThresh) * 100) / 100 : 0;
  return { workingHours: hrs, overtimeHours: ot };
}

function toAttIsoTime_(dateStr, val) {
  var raw = String(val || '').trim();
  if (!raw) return '';
  if (raw.indexOf('T') !== -1) return raw;
  if (/^\d{2}:\d{2}$/.test(raw)) return dateStr + 'T' + raw + ':00.000Z';
  if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) return dateStr + 'T' + raw + '.000Z';
  return raw;
}

function handleRequestCorrection_(authUser, payload) {
  ensureSheetColumns_(SHEET_NAMES.ATTENDANCE, [
    'regularizationType', 'requestedCheckInTime', 'requestedCheckOutTime',
    'requestedStatus', 'requestedAttendanceType', 'regularizedBy', 'regularizedAt'
  ]);
  var isAdminActor = authUser.role === 'SUPER_ADMIN' || authUser.role === 'HR_ADMIN';
  var targetEmpId = (isAdminActor && payload.employeeId) ? String(payload.employeeId) : authUser.employeeId;
  if (!isAdminActor && targetEmpId !== authUser.employeeId) throw new Error('FORBIDDEN');

  var emp = readSheetAsObjects_(SHEET_NAMES.EMPLOYEES).filter(function (e) { return e.employeeId === targetEmpId; })[0];
  if (!emp) throw new Error('Employee not found.');

  var all = readSheetAsObjects_(SHEET_NAMES.ATTENDANCE);
  var dateStr = String(payload.date || '').slice(0, 10);
  var att = payload.attendanceId
    ? all.filter(function (a) { return a.attendanceId === payload.attendanceId; })[0]
    : (dateStr ? all.filter(function (a) { return a.employeeId === targetEmpId && a.date === dateStr; })[0] : null);

  if (!att && !dateStr) throw new Error('Attendance date is required.');
  var effDate = att ? att.date : dateStr;
  var reqInIso = toAttIsoTime_(effDate, payload.requestedCheckInTime || payload.checkInTime);
  var reqOutIso = toAttIsoTime_(effDate, payload.requestedCheckOutTime || payload.checkOutTime);
  var reason = String(payload.reason || payload.correctionReason || '').trim();
  if (!reason) throw new Error('Regularization reason is required.');

  var applyNow = isAdminActor && payload.applyImmediately !== false;
  var now = new Date().toISOString();

  if (!att) {
    var attId = 'ATT-' + targetEmpId + '-' + effDate;
    var record = {
      attendanceId: attId,
      employeeId: targetEmpId,
      employeeName: emp.fullName,
      department: emp.department,
      date: effDate,
      checkInTime: applyNow ? reqInIso : '',
      checkInLat: '', checkInLng: '', checkInAccuracy: '', checkInAddress: '', checkInPlaceId: '', checkInPhotoRef: '',
      checkOutTime: applyNow ? reqOutIso : '',
      checkOutLat: '', checkOutLng: '', checkOutAccuracy: '', checkOutAddress: '', checkOutPlaceId: '', checkOutPhotoRef: '',
      attendanceType: payload.requestedAttendanceType || payload.attendanceType || (String(emp.isFieldEmployee) === 'true' ? 'FIELD' : 'OFFICE'),
      workingHours: 0,
      overtimeHours: 0,
      status: applyNow ? (payload.requestedStatus || payload.status || 'PRESENT') : 'ABSENT',
      verificationStatus: applyNow ? 'VERIFIED' : 'DEVICE_CAPTURED_UNVERIFIED',
      correctionRequested: true,
      correctionReason: reason,
      correctionStatus: applyNow ? 'APPROVED' : 'PENDING',
      regularizationType: payload.regularizationType || (applyNow ? 'ADMIN_ADJUSTMENT' : 'FULL_DAY_REGULARIZATION'),
      requestedCheckInTime: reqInIso,
      requestedCheckOutTime: reqOutIso,
      requestedStatus: payload.requestedStatus || payload.status || 'PRESENT',
      requestedAttendanceType: payload.requestedAttendanceType || payload.attendanceType || 'OFFICE',
      regularizedBy: applyNow ? authUser.fullName : '',
      regularizedAt: applyNow ? now : '',
      notes: payload.notes || '',
      eventId: ''
    };
    var otThresholdReq = Number(getSettingsMap_().overtimeAfterHours || 9);
    if (!isFinite(otThresholdReq) || otThresholdReq <= 0) otThresholdReq = 9;
    if (applyNow && record.checkInTime && record.checkOutTime) {
      var cReq1 = computeDutyAndOvertimeEs5_(record.checkInTime, record.checkOutTime, otThresholdReq);
      record.workingHours = cReq1.workingHours;
      record.overtimeHours = cReq1.overtimeHours;
    }
    if (applyNow && payload.workingHours !== undefined && payload.workingHours !== '') {
      record.workingHours = Number(payload.workingHours);
      record.overtimeHours = record.workingHours > otThresholdReq ? Math.round((record.workingHours - otThresholdReq) * 100) / 100 : 0;
    }
    if (applyNow && payload.overtimeHours !== undefined && payload.overtimeHours !== '') record.overtimeHours = Number(payload.overtimeHours);
    appendRowObj_(SHEET_NAMES.ATTENDANCE, record);
    att = record;
  } else {
    var patch = {
      correctionRequested: true,
      correctionReason: reason,
      correctionStatus: applyNow ? 'APPROVED' : 'PENDING',
      regularizationType: payload.regularizationType || att.regularizationType || 'TIMING_CORRECTION'
    };
    if (reqInIso) patch.requestedCheckInTime = reqInIso;
    if (reqOutIso) patch.requestedCheckOutTime = reqOutIso;
    if (payload.requestedStatus || payload.status) patch.requestedStatus = payload.requestedStatus || payload.status;
    if (payload.requestedAttendanceType || payload.attendanceType) patch.requestedAttendanceType = payload.requestedAttendanceType || payload.attendanceType;
    if (payload.notes !== undefined) patch.notes = payload.notes;
    if (applyNow) {
      var otThresholdReq2 = Number(getSettingsMap_().overtimeAfterHours || 9);
      if (!isFinite(otThresholdReq2) || otThresholdReq2 <= 0) otThresholdReq2 = 9;
      if (reqInIso) patch.checkInTime = reqInIso;
      if (reqOutIso) patch.checkOutTime = reqOutIso;
      if (payload.requestedAttendanceType || payload.attendanceType) patch.attendanceType = payload.requestedAttendanceType || payload.attendanceType;
      patch.status = payload.requestedStatus || payload.status || (att.status === 'ABSENT' ? 'PRESENT' : att.status);
      var effIn = patch.checkInTime || att.checkInTime;
      var effOut = patch.checkOutTime || att.checkOutTime;
      if (effIn && effOut) {
        var cReq2 = computeDutyAndOvertimeEs5_(effIn, effOut, otThresholdReq2);
        patch.workingHours = cReq2.workingHours;
        patch.overtimeHours = cReq2.overtimeHours;
      }
      if (payload.workingHours !== undefined && payload.workingHours !== '') {
        patch.workingHours = Number(payload.workingHours);
        patch.overtimeHours = patch.workingHours > otThresholdReq2 ? Math.round((patch.workingHours - otThresholdReq2) * 100) / 100 : 0;
      }
      if (payload.overtimeHours !== undefined && payload.overtimeHours !== '') patch.overtimeHours = Number(payload.overtimeHours);
      patch.verificationStatus = 'VERIFIED';
      patch.regularizedBy = authUser.fullName;
      patch.regularizedAt = now;
    }
    updateRowByKey_(SHEET_NAMES.ATTENDANCE, 'attendanceId', att.attendanceId, patch);
  }

  if (applyNow) {
    appendNotification_(targetEmpId, 'ATTENDANCE', 'Attendance Regularized', 'Your attendance for ' + effDate + ' was regularized by ' + authUser.fullName + '.');
    logAudit_(authUser, 'REGULARIZE_ATTENDANCE_ADMIN', 'ATTENDANCE', att.attendanceId, reason);
  } else {
    appendNotification_('ALL', 'ATTENDANCE', 'Attendance Regularization Request', emp.fullName + ' requested regularization for ' + effDate + ': ' + reason);
    logAudit_(authUser, 'REQUEST_REGULARIZATION', 'ATTENDANCE', att.attendanceId, reason);
  }
  return { ok: true, attendanceId: att.attendanceId };
}

function handleApproveCorrection_(authUser, payload) {
  ensureSheetColumns_(SHEET_NAMES.ATTENDANCE, [
    'regularizationType', 'requestedCheckInTime', 'requestedCheckOutTime',
    'requestedStatus', 'requestedAttendanceType', 'regularizedBy', 'regularizedAt'
  ]);
  var att = readSheetAsObjects_(SHEET_NAMES.ATTENDANCE).filter(function (a) { return a.attendanceId === payload.attendanceId; })[0];
  if (!att) throw new Error('Attendance record not found.');
  var patch = { correctionStatus: payload.decision };
  if (payload.decision === 'APPROVED') {
    var nextIn = toAttIsoTime_(att.date, payload.checkInTime || att.requestedCheckInTime);
    var nextOut = toAttIsoTime_(att.date, payload.checkOutTime || att.requestedCheckOutTime);
    if (nextIn) patch.checkInTime = nextIn;
    if (nextOut) patch.checkOutTime = nextOut;
    if (payload.attendanceType || att.requestedAttendanceType) patch.attendanceType = payload.attendanceType || att.requestedAttendanceType;
    patch.status = payload.status || att.requestedStatus || (att.status === 'ABSENT' ? 'PRESENT' : att.status);
    var effIn = patch.checkInTime || att.checkInTime;
    var effOut = patch.checkOutTime || att.checkOutTime;
    var otThresholdApp = Number(getSettingsMap_().overtimeAfterHours || 9);
    if (!isFinite(otThresholdApp) || otThresholdApp <= 0) otThresholdApp = 9;
    if (payload.workingHours !== undefined && payload.workingHours !== '') {
      patch.workingHours = Number(payload.workingHours);
    } else if (effIn && effOut) {
      patch.workingHours = computeDutyAndOvertimeEs5_(effIn, effOut, otThresholdApp).workingHours;
    }
    if (payload.overtimeHours !== undefined && payload.overtimeHours !== '') {
      patch.overtimeHours = Number(payload.overtimeHours);
    } else {
      var w = patch.workingHours !== undefined ? patch.workingHours : Number(att.workingHours || 0);
      patch.overtimeHours = w > otThresholdApp ? Math.round((w - otThresholdApp) * 100) / 100 : 0;
    }
    if (payload.notes !== undefined) patch.notes = payload.notes;
    patch.verificationStatus = 'VERIFIED';
    patch.regularizedBy = authUser.fullName;
    patch.regularizedAt = new Date().toISOString();
  }
  updateRowByKey_(SHEET_NAMES.ATTENDANCE, 'attendanceId', payload.attendanceId, patch);
  appendNotification_(att.employeeId, 'ATTENDANCE', 'Attendance Regularization ' + payload.decision, 'Regularization for ' + att.date + ' was ' + payload.decision.toLowerCase() + '.');
  logAudit_(authUser, 'REVIEW_CORRECTION', 'ATTENDANCE', payload.attendanceId, payload.decision);
  return { ok: true };
}

function handleAdminSaveAttendance_(authUser, payload) {
  ensureSheetColumns_(SHEET_NAMES.ATTENDANCE, [
    'regularizationType', 'requestedCheckInTime', 'requestedCheckOutTime',
    'requestedStatus', 'requestedAttendanceType', 'regularizedBy', 'regularizedAt'
  ]);
  var dateStr = String(payload.date || '').slice(0, 10);
  var all = readSheetAsObjects_(SHEET_NAMES.ATTENDANCE);
  var att = payload.attendanceId
    ? all.filter(function (a) { return a.attendanceId === payload.attendanceId; })[0]
    : all.filter(function (a) { return a.employeeId === payload.employeeId && a.date === dateStr; })[0];
  var emp = readSheetAsObjects_(SHEET_NAMES.EMPLOYEES).filter(function (e) { return e.employeeId === (att ? att.employeeId : payload.employeeId); })[0];
  if (!att && (!emp || !dateStr)) throw new Error('Employee and date are required.');

  var effDate = att ? att.date : dateStr;
  var nextIn = payload.checkInTime !== undefined ? toAttIsoTime_(effDate, payload.checkInTime) : (att ? att.checkInTime : '');
  var nextOut = payload.checkOutTime !== undefined ? toAttIsoTime_(effDate, payload.checkOutTime) : (att ? att.checkOutTime : '');
  var otThresholdAdm = Number(getSettingsMap_().overtimeAfterHours || 9);
  if (!isFinite(otThresholdAdm) || otThresholdAdm <= 0) otThresholdAdm = 9;
  var hrs = (payload.workingHours !== undefined && payload.workingHours !== '') ? Number(payload.workingHours) : (att ? Number(att.workingHours || 0) : 0);
  if (payload.recalculateHours !== false && nextIn && nextOut && (payload.workingHours === undefined || payload.workingHours === '')) {
    hrs = computeDutyAndOvertimeEs5_(nextIn, nextOut, otThresholdAdm).workingHours;
  }
  var ot = (payload.overtimeHours !== undefined && payload.overtimeHours !== '')
    ? Number(payload.overtimeHours)
    : (hrs > otThresholdAdm ? Math.round((hrs - otThresholdAdm) * 100) / 100 : 0);

  if (!att && emp) {
    var attId = 'ATT-' + emp.employeeId + '-' + effDate;
    appendRowObj_(SHEET_NAMES.ATTENDANCE, {
      attendanceId: attId,
      employeeId: emp.employeeId,
      employeeName: emp.fullName,
      department: emp.department,
      date: effDate,
      checkInTime: nextIn, checkInLat: '', checkInLng: '', checkInAccuracy: '',
      checkInAddress: payload.checkInAddress || '', checkInPlaceId: '', checkInPhotoRef: '',
      checkOutTime: nextOut, checkOutLat: '', checkOutLng: '', checkOutAccuracy: '',
      checkOutAddress: payload.checkOutAddress || '', checkOutPlaceId: '', checkOutPhotoRef: '',
      attendanceType: payload.attendanceType || 'OFFICE',
      workingHours: hrs, overtimeHours: ot,
      status: payload.status || 'PRESENT',
      verificationStatus: payload.verificationStatus || 'VERIFIED',
      correctionRequested: true,
      correctionReason: payload.correctionReason || payload.notes || 'Admin regularization',
      correctionStatus: payload.correctionStatus || 'APPROVED',
      regularizationType: payload.regularizationType || 'ADMIN_ADJUSTMENT',
      regularizedBy: authUser.fullName,
      regularizedAt: new Date().toISOString(),
      notes: payload.notes || '', eventId: ''
    });
    logAudit_(authUser, 'ADMIN_EDIT_ATTENDANCE', 'ATTENDANCE', attId, (payload.status || 'PRESENT') + ' (' + hrs + 'h)');
    return { ok: true, attendanceId: attId };
  }

  var patch = {
    checkInTime: nextIn,
    checkOutTime: nextOut,
    workingHours: hrs,
    overtimeHours: ot,
    regularizedBy: authUser.fullName,
    regularizedAt: new Date().toISOString()
  };
  if (payload.checkInAddress !== undefined) patch.checkInAddress = payload.checkInAddress;
  if (payload.checkOutAddress !== undefined) patch.checkOutAddress = payload.checkOutAddress;
  if (payload.attendanceType) patch.attendanceType = payload.attendanceType;
  if (payload.status) patch.status = payload.status;
  if (payload.verificationStatus) patch.verificationStatus = payload.verificationStatus;
  if (payload.correctionStatus) patch.correctionStatus = payload.correctionStatus;
  if (payload.correctionReason !== undefined) patch.correctionReason = payload.correctionReason;
  if (payload.notes !== undefined) patch.notes = payload.notes;
  updateRowByKey_(SHEET_NAMES.ATTENDANCE, 'attendanceId', att.attendanceId, patch);
  logAudit_(authUser, 'ADMIN_EDIT_ATTENDANCE', 'ATTENDANCE', att.attendanceId, (patch.status || att.status) + ' (' + hrs + 'h)');
  return { ok: true, attendanceId: att.attendanceId };
}

function handleUpdateLiveLocation_(authUser, payload) {
  ensureLocationTrackingColumns_();
  var nowIso = payload.deviceTimestamp || new Date().toISOString();
  var dateStr = nowIso.slice(0, 10);
  var emp = readSheetAsObjects_(SHEET_NAMES.EMPLOYEES).filter(function (e) { return e.employeeId === authUser.employeeId; })[0] || {};
  var liveRows = readSheetAsObjects_(SHEET_NAMES.LIVE_LOCATION);
  var existing = liveRows.filter(function (r) { return r.employeeId === authUser.employeeId; })[0] || null;
  var todayAtt = readSheetAsObjects_(SHEET_NAMES.ATTENDANCE).filter(function (a) {
    return a.employeeId === authUser.employeeId && a.date === dateStr;
  })[0] || null;

  var lat = Number(payload.latitude || 0);
  var lng = Number(payload.longitude || 0);
  var hasCoords = isFinite(lat) && isFinite(lng) && !(lat === 0 && lng === 0);
  var permStatus = String(payload.locationPermissionStatus || (payload.isSharingActive ? 'ACTIVE' : 'CHECKED_OUT'));
  var attType = payload.attendanceType || (todayAtt && todayAtt.attendanceType) || (authUser.isFieldEmployee ? 'FIELD' : 'OFFICE');

  var resolvedAddress = String(payload.address || '').trim();
  var resolvedPlaceId = String(payload.placeId || '').trim();
  if (!resolvedAddress && hasCoords) {
    if (existing && existing.address && Number(existing.latitude) && Number(existing.longitude) &&
        haversineMeters_(Number(existing.latitude), Number(existing.longitude), lat, lng) < 40) {
      resolvedAddress = existing.address;
      resolvedPlaceId = existing.placeId || '';
    } else {
      var geoLive = reverseGeocodeLatLng_(lat, lng);
      resolvedAddress = geoLive.address;
      resolvedPlaceId = geoLive.placeId;
    }
  }

  var mapsUrl = hasCoords ? buildMapsUrl_(lat, lng, resolvedPlaceId) : (existing ? (existing.mapsUrl || '') : '');
  var speedMps = (payload.speedMps != null && isFinite(Number(payload.speedMps))) ? Number(payload.speedMps) : '';
  var headingDeg = (payload.headingDeg != null && isFinite(Number(payload.headingDeg))) ? Number(payload.headingDeg) : '';

  var prevStatus = existing ? existing.locationPermissionStatus : '';
  if ((permStatus === 'PERMISSION_DENIED' || permStatus === 'GPS_UNAVAILABLE') && prevStatus !== permStatus) {
    var admins = readSheetAsObjects_(SHEET_NAMES.USERS).filter(function (u) {
      return u.status === 'ACTIVE' && (u.role === 'SUPER_ADMIN' || u.role === 'HR_ADMIN');
    });
    admins.forEach(function (adm) {
      appendNotification_(
        adm.employeeId,
        'ATTENDANCE',
        'Field GPS Alert: ' + authUser.fullName,
        authUser.fullName + ' (' + authUser.employeeId + ') has location disabled (' + permStatus + ') while checked in on field duty.'
      );
    });
    logAudit_(authUser, 'GPS_PERMISSION_ALERT', 'LOCATION', authUser.employeeId, 'Location status changed to ' + permStatus);
  }

  var data = {
    employeeId: authUser.employeeId,
    employeeName: authUser.fullName,
    department: authUser.department,
    reportingManagerName: emp.reportingManagerName || '',
    latitude: hasCoords ? lat : (existing ? (existing.latitude || 0) : 0),
    longitude: hasCoords ? lng : (existing ? (existing.longitude || 0) : 0),
    accuracy: hasCoords ? (payload.accuracy || 0) : (existing ? (existing.accuracy || 0) : 0),
    address: resolvedAddress || (existing ? (existing.address || '') : ''),
    placeId: resolvedPlaceId || (existing ? (existing.placeId || '') : ''),
    attendanceType: attType,
    speedMps: speedMps,
    headingDeg: headingDeg,
    locationPermissionStatus: permStatus,
    mapsUrl: mapsUrl,
    shiftCheckedInAt: (todayAtt && todayAtt.checkInTime) || (existing ? (existing.shiftCheckedInAt || '') : ''),
    isSharingActive: Boolean(payload.isSharingActive) && permStatus === 'ACTIVE',
    lastUpdatedAt: nowIso
  };

  if (existing) {
    updateRowByKey_(SHEET_NAMES.LIVE_LOCATION, 'employeeId', authUser.employeeId, data);
  } else {
    appendRowObj_(SHEET_NAMES.LIVE_LOCATION, data);
  }

  if (payload.isSharingActive && hasCoords && payload.recordTrail !== false) {
    var prevHist = readSheetAsObjects_(SHEET_NAMES.ATTENDANCE_LOCATION_HISTORY).filter(function (h) {
      return h.employeeId === authUser.employeeId && h.date === dateStr && Number(h.latitude) && Number(h.longitude);
    });
    var prevPt = prevHist.length > 0 ? prevHist[prevHist.length - 1] : null;
    var dist = prevPt ? haversineMeters_(Number(prevPt.latitude), Number(prevPt.longitude), lat, lng) : 0;

    appendRowObj_(SHEET_NAMES.ATTENDANCE_LOCATION_HISTORY, {
      historyId: 'LOC-' + Utilities.getUuid().slice(0, 8).toUpperCase(),
      employeeId: authUser.employeeId,
      employeeName: authUser.fullName,
      department: authUser.department,
      date: dateStr,
      timestamp: nowIso,
      latitude: lat,
      longitude: lng,
      accuracy: payload.accuracy || 0,
      address: resolvedAddress,
      placeId: resolvedPlaceId,
      attendanceType: attType,
      speedMps: speedMps,
      headingDeg: headingDeg,
      distanceFromPrevMeters: dist,
      mapsUrl: mapsUrl,
      source: payload.isOfflineSync ? 'OFFLINE_DEVICE' : 'LIVE_TRACK',
      verificationStatus: payload.isOfflineSync ? 'DEVICE_CAPTURED_UNVERIFIED' : 'VERIFIED'
    });
  }
  return { ok: true };
}

function handleGetLiveLocations_(authUser) {
  if (authUser.role !== 'SUPER_ADMIN' && authUser.role !== 'HR_ADMIN') {
    throw new Error('FORBIDDEN: Live location tracking is restricted to Administrators only.');
  }
  var rows = readSheetAsObjects_(SHEET_NAMES.LIVE_LOCATION);
  var employees = readSheetAsObjects_(SHEET_NAMES.EMPLOYEES);
  var todayStr = new Date().toISOString().slice(0, 10);
  var todayHist = readSheetAsObjects_(SHEET_NAMES.ATTENDANCE_LOCATION_HISTORY).filter(function (h) {
    return h.date === todayStr && Number(h.latitude) && Number(h.longitude);
  });
  var staleMs = Number(getSettingsMap_().locationStaleMinutes || 5) * 60000;
  var now = Date.now();
  rows = rows.map(function (r) {
    var age = now - new Date(r.lastUpdatedAt).getTime();
    var emp = employees.filter(function (e) { return e.employeeId === r.employeeId; })[0] || {};
    var pts = todayHist.filter(function (h) { return h.employeeId === r.employeeId; });
    var distMeters = 0;
    for (var i = 1; i < pts.length; i++) {
      distMeters += haversineMeters_(Number(pts[i - 1].latitude), Number(pts[i - 1].longitude), Number(pts[i].latitude), Number(pts[i].longitude));
    }
    r.isSharingActive = String(r.isSharingActive) === 'true';
    r.isFieldEmployee = String(emp.isFieldEmployee) === 'true';
    r.distanceTodayMeters = distMeters;
    r.isStale = !r.isSharingActive || age > staleMs;
    return r;
  });
  return { ok: true, locations: rows };
}

function handleGetLocationHistory_(authUser, payload) {
  if (authUser.role !== 'SUPER_ADMIN' && authUser.role !== 'HR_ADMIN') {
    throw new Error('FORBIDDEN: Location trail history is restricted to Administrators only.');
  }
  var rows = readSheetAsObjects_(SHEET_NAMES.ATTENDANCE_LOCATION_HISTORY);
  if (payload && payload.employeeId) {
    rows = rows.filter(function (r) { return r.employeeId === payload.employeeId; });
  }
  if (payload && payload.date) {
    rows = rows.filter(function (r) { return r.date === payload.date; });
  }
  return { ok: true, history: rows };
}

function ensureTravelSheet_() {
  var ss = getSpreadsheet_();
  var sheetName = SHEET_NAMES.TRAVEL_CONVEYANCE || 'Travel_Conveyance';
  var headers = [
    'claimId', 'employeeId', 'employeeName', 'department', 'designation', 'travelDate',
    'vehicleType', 'ratePerKm',
    'fromAddress', 'fromLat', 'fromLng', 'fromAccuracy', 'fromPlaceId', 'fromMapsUrl', 'startedAt',
    'toAddress', 'toLat', 'toLng', 'toAccuracy', 'toPlaceId', 'toMapsUrl', 'endedAt',
    'waypointsJson', 'gpsTrackedDistanceKm', 'googleRouteDistanceKm', 'distanceKm', 'distanceSource',
    'routeDurationText', 'routePolyline', 'claimAmount', 'purpose', 'remarks', 'status',
    'submittedAt', 'reviewedBy', 'reviewerRole', 'reviewedAt', 'rejectionReason', 'paidAt', 'updatedAt'
  ];
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#0B1B36')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else {
    ensureSheetColumns_(sheetName, headers);
  }
}

function getConveyanceRates_() {
  var map = getSettingsMap_();
  var bikeRaw = (map.conveyanceBikeRatePerKm !== undefined && map.conveyanceBikeRatePerKm !== '') ? Number(map.conveyanceBikeRatePerKm) : 4.5;
  var carRaw = (map.conveyanceCarRatePerKm !== undefined && map.conveyanceCarRatePerKm !== '') ? Number(map.conveyanceCarRatePerKm) : 14;
  return {
    bike: isFinite(bikeRaw) && bikeRaw >= 0 ? Math.round(bikeRaw * 100) / 100 : 4.5,
    car: isFinite(carRaw) && carRaw >= 0 ? Math.round(carRaw * 100) / 100 : 14
  };
}

function normalizeVehicleType_(raw) {
  return String(raw || '').toUpperCase() === 'CAR' ? 'CAR' : 'BIKE';
}

function formatRouteDuration_(durationStr) {
  var secs = Number(String(durationStr || '').replace(/s$/i, ''));
  if (!isFinite(secs) || secs <= 0) return '';
  var totalMins = Math.max(1, Math.round(secs / 60));
  if (totalMins < 60) return totalMins + ' min';
  var hrs = Math.floor(totalMins / 60);
  var mins = totalMins % 60;
  return mins > 0 ? (hrs + ' hr ' + mins + ' min') : (hrs + ' hr');
}

function computeGpsTrailKm_(points) {
  var meters = 0;
  for (var i = 1; i < points.length; i++) {
    var a = points[i - 1];
    var b = points[i];
    if (isFinite(Number(a.latitude)) && isFinite(Number(a.longitude)) && isFinite(Number(b.latitude)) && isFinite(Number(b.longitude))) {
      meters += haversineMeters_(Number(a.latitude), Number(a.longitude), Number(b.latitude), Number(b.longitude));
    }
  }
  return Math.round((meters / 1000) * 100) / 100;
}

function geocodeAddressText_(addressText) {
  var query = String(addressText || '').trim();
  if (!query) return null;
  var apiKey = PropertiesService.getScriptProperties().getProperty('GOOGLE_MAPS_API_KEY') || '';
  if (!apiKey) return null;
  try {
    var url = 'https://maps.googleapis.com/maps/api/geocode/json?address=' + encodeURIComponent(query) + '&language=en&region=in&key=' + encodeURIComponent(apiKey);
    var res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: { 'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio' }
    });
    if (res.getResponseCode() === 429) {
      return { lat: 0, lng: 0, address: '', placeId: '', quotaExceeded: true };
    }
    var data = JSON.parse(res.getContentText() || '{}');
    if (data.status === 'OVER_QUERY_LIMIT' || data.status === 'OVER_DAILY_LIMIT') {
      return { lat: 0, lng: 0, address: '', placeId: '', quotaExceeded: true };
    }
    if (data.status === 'OK' && data.results && data.results.length > 0) {
      var top = data.results[0];
      var loc = top.geometry && top.geometry.location;
      if (loc && isFinite(Number(loc.lat)) && isFinite(Number(loc.lng))) {
        return {
          lat: Number(loc.lat),
          lng: Number(loc.lng),
          address: String(top.formatted_address || query),
          placeId: String(top.place_id || '')
        };
      }
    }
  } catch (e) {}
  return null;
}

function computeGoogleTravelRoute_(fromLat, fromLng, toLat, toLng, vehicleType) {
  if (!isFinite(fromLat) || !isFinite(fromLng) || !isFinite(toLat) || !isFinite(toLng) || (fromLat === toLat && fromLng === toLng)) {
    return { googleRouteDistanceKm: 0, routeDurationText: '', routePolyline: '' };
  }
  var apiKey = PropertiesService.getScriptProperties().getProperty('GOOGLE_MAPS_API_KEY') || '';
  if (!apiKey) {
    return { googleRouteDistanceKm: 0, routeDurationText: '', routePolyline: '' };
  }
  try {
    var res = UrlFetchApp.fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
        'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio'
      },
      payload: JSON.stringify({
        origin: { location: { latLng: { latitude: fromLat, longitude: fromLng } } },
        destination: { location: { latLng: { latitude: toLat, longitude: toLng } } },
        travelMode: vehicleType === 'BIKE' ? 'TWO_WHEELER' : 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        computeAlternativeRoutes: false,
        languageCode: 'en',
        units: 'METRIC'
      })
    });
    if (res.getResponseCode() === 429) {
      return { googleRouteDistanceKm: 0, routeDurationText: '', routePolyline: '', quotaExceeded: true };
    }
    var data = JSON.parse(res.getContentText() || '{}');
    if (data.error && data.error.status === 'RESOURCE_EXHAUSTED') {
      return { googleRouteDistanceKm: 0, routeDurationText: '', routePolyline: '', quotaExceeded: true };
    }
    if (data.routes && data.routes.length > 0) {
      var r = data.routes[0];
      var meters = Number(r.distanceMeters || 0);
      return {
        googleRouteDistanceKm: Math.round((meters / 1000) * 100) / 100,
        routeDurationText: formatRouteDuration_(r.duration),
        routePolyline: (r.polyline && r.polyline.encodedPolyline) ? String(r.polyline.encodedPolyline) : ''
      };
    }
  } catch (e) {}
  return { googleRouteDistanceKm: 0, routeDurationText: '', routePolyline: '' };
}

function hydrateTravelClaimRow_(r) {
  var waypoints = [];
  try {
    waypoints = r.waypointsJson ? JSON.parse(r.waypointsJson) : [];
  } catch (e) { waypoints = []; }
  return {
    claimId: r.claimId,
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    department: r.department,
    designation: r.designation,
    travelDate: r.travelDate,
    vehicleType: normalizeVehicleType_(r.vehicleType),
    ratePerKm: Number(r.ratePerKm || 0),
    fromAddress: r.fromAddress || '',
    fromLat: Number(r.fromLat || 0),
    fromLng: Number(r.fromLng || 0),
    fromAccuracy: Number(r.fromAccuracy || 0),
    fromPlaceId: r.fromPlaceId || '',
    fromMapsUrl: r.fromMapsUrl || '',
    startedAt: r.startedAt || '',
    toAddress: r.toAddress || '',
    toLat: r.toLat !== '' && r.toLat != null ? Number(r.toLat) : null,
    toLng: r.toLng !== '' && r.toLng != null ? Number(r.toLng) : null,
    toAccuracy: r.toAccuracy !== '' && r.toAccuracy != null ? Number(r.toAccuracy) : null,
    toPlaceId: r.toPlaceId || '',
    toMapsUrl: r.toMapsUrl || '',
    endedAt: r.endedAt || '',
    waypoints: Array.isArray(waypoints) ? waypoints : [],
    gpsTrackedDistanceKm: Number(r.gpsTrackedDistanceKm || 0),
    googleRouteDistanceKm: Number(r.googleRouteDistanceKm || 0),
    distanceKm: Number(r.distanceKm || 0),
    distanceSource: r.distanceSource || 'LIVE_GPS_TRAIL',
    routeDurationText: r.routeDurationText || '',
    routePolyline: r.routePolyline || '',
    claimAmount: Number(r.claimAmount || 0),
    purpose: r.purpose || '',
    remarks: r.remarks || '',
    status: r.status || 'IN_PROGRESS',
    submittedAt: r.submittedAt || '',
    reviewedBy: r.reviewedBy || '',
    reviewerRole: r.reviewerRole || '',
    reviewedAt: r.reviewedAt || '',
    rejectionReason: r.rejectionReason || '',
    paidAt: r.paidAt || '',
    updatedAt: r.updatedAt || ''
  };
}

function handleGetTravelClaims_(authUser, payload) {
  ensureTravelSheet_();
  var rates = getConveyanceRates_();
  var rows = readSheetAsObjects_(SHEET_NAMES.TRAVEL_CONVEYANCE).map(hydrateTravelClaimRow_);
  if (authUser.role === 'EMPLOYEE') {
    rows = rows.filter(function (c) { return c.employeeId === authUser.employeeId; });
  } else if (payload && payload.employeeId) {
    rows = rows.filter(function (c) { return c.employeeId === payload.employeeId; });
  }
  if (payload && payload.status && payload.status !== 'ALL') {
    rows = rows.filter(function (c) { return c.status === payload.status; });
  }
  if (payload && payload.month) {
    rows = rows.filter(function (c) { return String(c.travelDate || '').indexOf(String(payload.month)) === 0; });
  }
  rows.sort(function (a, b) { return String(b.startedAt || '').localeCompare(String(a.startedAt || '')); });
  return { ok: true, claims: rows, rates: rates };
}

function handleComputeTravelRoutePreview_(payload) {
  var rates = getConveyanceRates_();
  var vt = normalizeVehicleType_(payload && payload.vehicleType);
  var ratePerKm = vt === 'CAR' ? rates.car : rates.bike;
  var fromLat = Number(payload && payload.fromLat);
  var fromLng = Number(payload && payload.fromLng);
  if (!isFinite(fromLat) || !isFinite(fromLng) || (fromLat === 0 && fromLng === 0)) {
    throw new Error('Valid Location A GPS coordinates are required.');
  }
  var toLat = Number(payload && payload.toLat);
  var toLng = Number(payload && payload.toLng);
  var toAddress = String((payload && payload.toAddress) || '').trim();
  var toPlaceId = String((payload && payload.toPlaceId) || '').trim();
  var quotaExceeded = false;

  if (!isFinite(toLat) || !isFinite(toLng) || (toLat === 0 && toLng === 0)) {
    if (!toAddress) throw new Error('Provide Location B GPS coordinates or destination address.');
    var geoDest = geocodeAddressText_(toAddress);
    if (!geoDest) throw new Error('Unable to locate destination address on Google Maps.');
    if (geoDest.quotaExceeded) quotaExceeded = true;
    if (!geoDest.lat || !geoDest.lng) throw new Error('Destination geocoding failed.');
    toLat = geoDest.lat;
    toLng = geoDest.lng;
    toAddress = geoDest.address;
    toPlaceId = geoDest.placeId;
  } else if (!toAddress) {
    var revDest = reverseGeocodeLatLng_(toLat, toLng);
    if (revDest.quotaExceeded) quotaExceeded = true;
    toAddress = revDest.address;
    toPlaceId = revDest.placeId;
  }

  var routeInfo = computeGoogleTravelRoute_(fromLat, fromLng, toLat, toLng, vt);
  if (routeInfo.quotaExceeded) quotaExceeded = true;
  var straightKm = Math.round((haversineMeters_(fromLat, fromLng, toLat, toLng) / 1000) * 100) / 100;
  var distanceKm = routeInfo.googleRouteDistanceKm > 0 ? routeInfo.googleRouteDistanceKm : straightKm;
  var estimatedAmount = Math.round(distanceKm * ratePerKm * 100) / 100;

  return {
    ok: true,
    quotaExceeded: quotaExceeded,
    preview: {
      vehicleType: vt,
      ratePerKm: ratePerKm,
      fromLat: fromLat,
      fromLng: fromLng,
      toLat: toLat,
      toLng: toLng,
      toAddress: toAddress,
      toPlaceId: toPlaceId,
      googleRouteDistanceKm: routeInfo.googleRouteDistanceKm,
      straightLineDistanceKm: straightKm,
      distanceKm: distanceKm,
      distanceSource: routeInfo.googleRouteDistanceKm > 0 ? 'GOOGLE_ROUTES_API' : 'LIVE_GPS_TRAIL',
      routeDurationText: routeInfo.routeDurationText,
      routePolyline: routeInfo.routePolyline,
      estimatedAmount: estimatedAmount
    }
  };
}

function handleStartTravelTrip_(authUser, payload) {
  ensureTravelSheet_();
  var lat = Number(payload && payload.latitude);
  var lng = Number(payload && payload.longitude);
  if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) {
    throw new Error('100% live GPS Location A coordinates are required to start a travel trip.');
  }
  var existingOpen = readSheetAsObjects_(SHEET_NAMES.TRAVEL_CONVEYANCE).filter(function (c) {
    return c.employeeId === authUser.employeeId && c.status === 'IN_PROGRESS';
  })[0];
  if (existingOpen) {
    throw new Error('You already have an active trip (' + existingOpen.claimId + '). End or cancel it before starting a new trip.');
  }

  var rates = getConveyanceRates_();
  var vt = normalizeVehicleType_(payload && payload.vehicleType);
  var ratePerKm = vt === 'CAR' ? rates.car : rates.bike;
  var nowIso = String((payload && payload.deviceTimestamp) || new Date().toISOString());
  var dateStr = nowIso.slice(0, 10);
  var accuracy = Math.round(Number((payload && payload.accuracy) || 0));

  var fromAddress = String((payload && payload.address) || '').trim();
  var fromPlaceId = String((payload && payload.placeId) || '').trim();
  var quotaExceeded = false;
  if (!fromAddress) {
    var geo = reverseGeocodeLatLng_(lat, lng);
    if (geo.quotaExceeded) quotaExceeded = true;
    fromAddress = geo.address;
    fromPlaceId = geo.placeId;
  }

  var claimId = 'TRV-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  var wp = [{
    timestamp: nowIso,
    latitude: lat,
    longitude: lng,
    accuracy: accuracy,
    address: fromAddress,
    placeId: fromPlaceId,
    speedMps: (payload && payload.speedMps != null && isFinite(Number(payload.speedMps))) ? Number(payload.speedMps) : null,
    distanceFromPrevMeters: 0
  }];

  var rowObj = {
    claimId: claimId,
    employeeId: authUser.employeeId,
    employeeName: authUser.fullName,
    department: authUser.department,
    designation: authUser.designation,
    travelDate: dateStr,
    vehicleType: vt,
    ratePerKm: ratePerKm,
    fromAddress: fromAddress || ('GPS (' + lat.toFixed(5) + ', ' + lng.toFixed(5) + ')'),
    fromLat: lat,
    fromLng: lng,
    fromAccuracy: accuracy,
    fromPlaceId: fromPlaceId,
    fromMapsUrl: buildMapsUrl_(lat, lng, fromPlaceId),
    startedAt: nowIso,
    toAddress: '',
    toLat: '',
    toLng: '',
    toAccuracy: '',
    toPlaceId: '',
    toMapsUrl: '',
    endedAt: '',
    waypointsJson: JSON.stringify(wp),
    gpsTrackedDistanceKm: 0,
    googleRouteDistanceKm: 0,
    distanceKm: 0,
    distanceSource: 'LIVE_GPS_TRAIL',
    routeDurationText: '',
    routePolyline: '',
    claimAmount: 0,
    purpose: String((payload && payload.purpose) || '').trim(),
    remarks: '',
    status: 'IN_PROGRESS',
    submittedAt: '',
    reviewedBy: '',
    reviewerRole: '',
    reviewedAt: '',
    rejectionReason: '',
    paidAt: '',
    updatedAt: nowIso
  };

  appendRowObj_(SHEET_NAMES.TRAVEL_CONVEYANCE, rowObj);
  handleUpdateLiveLocation_(authUser, {
    latitude: lat,
    longitude: lng,
    accuracy: accuracy,
    address: rowObj.fromAddress,
    placeId: fromPlaceId,
    attendanceType: 'FIELD',
    locationPermissionStatus: 'ACTIVE',
    isSharingActive: true,
    deviceTimestamp: nowIso
  });
  logAudit_(authUser, 'START_TRAVEL_TRIP', 'TRAVEL', claimId, vt + ' @ INR ' + ratePerKm + '/km from ' + rowObj.fromAddress);
  return { ok: true, claim: hydrateTravelClaimRow_(rowObj), rates: rates, quotaExceeded: quotaExceeded };
}

function handleAddTravelWaypoint_(authUser, payload) {
  ensureTravelSheet_();
  var raw = readSheetAsObjects_(SHEET_NAMES.TRAVEL_CONVEYANCE).filter(function (c) {
    return c.claimId === (payload && payload.claimId);
  })[0];
  if (!raw) throw new Error('Travel trip not found.');
  if (authUser.role === 'EMPLOYEE' && raw.employeeId !== authUser.employeeId) {
    throw new Error('FORBIDDEN: Cannot update another employee travel trip.');
  }
  if (raw.status !== 'IN_PROGRESS') {
    throw new Error('Cannot record live waypoints after claim submission.');
  }

  var lat = Number(payload && payload.latitude);
  var lng = Number(payload && payload.longitude);
  if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) {
    throw new Error('Valid GPS waypoint coordinates required.');
  }

  var nowIso = String((payload && payload.deviceTimestamp) || new Date().toISOString());
  var accuracy = Math.round(Number((payload && payload.accuracy) || 0));
  var claim = hydrateTravelClaimRow_(raw);
  var waypoints = claim.waypoints || [];
  var prev = waypoints.length > 0 ? waypoints[waypoints.length - 1] : null;
  var stepMeters = prev ? haversineMeters_(Number(prev.latitude), Number(prev.longitude), lat, lng) : 0;
  var elapsedMs = prev ? (Date.now() - new Date(prev.timestamp).getTime()) : 999999;

  var address = String((payload && payload.address) || '').trim();
  var placeId = String((payload && payload.placeId) || '').trim();
  if (!address && (!prev || stepMeters >= 40)) {
    var geo = reverseGeocodeLatLng_(lat, lng);
    address = geo.address;
    placeId = geo.placeId;
  } else if (!address && prev && prev.address) {
    address = prev.address;
    placeId = prev.placeId || '';
  }

  if ((payload && payload.force) || !prev || stepMeters >= 15 || elapsedMs >= 20000) {
    waypoints.push({
      timestamp: nowIso,
      latitude: lat,
      longitude: lng,
      accuracy: accuracy,
      address: address,
      placeId: placeId,
      speedMps: (payload && payload.speedMps != null && isFinite(Number(payload.speedMps))) ? Number(payload.speedMps) : null,
      distanceFromPrevMeters: stepMeters
    });
  }

  var rates = getConveyanceRates_();
  var vt = normalizeVehicleType_(claim.vehicleType);
  var ratePerKm = vt === 'CAR' ? rates.car : rates.bike;
  var gpsKm = computeGpsTrailKm_(waypoints);
  var claimAmount = Math.round(gpsKm * ratePerKm * 100) / 100;

  updateRowByKey_(SHEET_NAMES.TRAVEL_CONVEYANCE, 'claimId', claim.claimId, {
    waypointsJson: JSON.stringify(waypoints),
    gpsTrackedDistanceKm: gpsKm,
    distanceKm: gpsKm,
    distanceSource: 'LIVE_GPS_TRAIL',
    ratePerKm: ratePerKm,
    claimAmount: claimAmount,
    updatedAt: nowIso
  });

  handleUpdateLiveLocation_(authUser, {
    latitude: lat,
    longitude: lng,
    accuracy: accuracy,
    address: address,
    placeId: placeId,
    attendanceType: 'FIELD',
    speedMps: payload && payload.speedMps,
    headingDeg: payload && payload.headingDeg,
    locationPermissionStatus: 'ACTIVE',
    isSharingActive: true,
    deviceTimestamp: nowIso
  });

  claim.waypoints = waypoints;
  claim.gpsTrackedDistanceKm = gpsKm;
  claim.distanceKm = gpsKm;
  claim.distanceSource = 'LIVE_GPS_TRAIL';
  claim.ratePerKm = ratePerKm;
  claim.claimAmount = claimAmount;
  claim.updatedAt = nowIso;
  return { ok: true, claim: claim };
}

function handleCompleteTravelTrip_(authUser, payload) {
  ensureTravelSheet_();
  var raw = readSheetAsObjects_(SHEET_NAMES.TRAVEL_CONVEYANCE).filter(function (c) {
    return c.claimId === (payload && payload.claimId);
  })[0];
  if (!raw) throw new Error('Travel trip not found.');
  if (authUser.role === 'EMPLOYEE' && raw.employeeId !== authUser.employeeId) {
    throw new Error('FORBIDDEN: Cannot end another employee travel trip.');
  }
  if (raw.status !== 'IN_PROGRESS') {
    throw new Error('This travel trip has already been submitted or finalized.');
  }

  var lat = Number(payload && payload.latitude);
  var lng = Number(payload && payload.longitude);
  if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) {
    throw new Error('100% live GPS Location B coordinates are required to end the trip.');
  }

  var rates = getConveyanceRates_();
  var vt = (payload && payload.vehicleType) ? normalizeVehicleType_(payload.vehicleType) : normalizeVehicleType_(raw.vehicleType);
  var ratePerKm = vt === 'CAR' ? rates.car : rates.bike;
  var nowIso = String((payload && payload.deviceTimestamp) || new Date().toISOString());
  var accuracy = Math.round(Number((payload && payload.accuracy) || 0));

  var toAddress = String((payload && payload.address) || '').trim();
  var toPlaceId = String((payload && payload.placeId) || '').trim();
  var quotaExceeded = false;
  if (!toAddress) {
    var geo = reverseGeocodeLatLng_(lat, lng);
    if (geo.quotaExceeded) quotaExceeded = true;
    toAddress = geo.address;
    toPlaceId = geo.placeId;
  }

  var claim = hydrateTravelClaimRow_(raw);
  var waypoints = claim.waypoints || [];
  var prev = waypoints.length > 0 ? waypoints[waypoints.length - 1] : null;
  var stepMeters = prev ? haversineMeters_(Number(prev.latitude), Number(prev.longitude), lat, lng) : 0;
  if (!prev || stepMeters > 0) {
    waypoints.push({
      timestamp: nowIso,
      latitude: lat,
      longitude: lng,
      accuracy: accuracy,
      address: toAddress || ('GPS (' + lat.toFixed(5) + ', ' + lng.toFixed(5) + ')'),
      placeId: toPlaceId,
      speedMps: null,
      distanceFromPrevMeters: stepMeters
    });
  }

  var gpsKm = computeGpsTrailKm_(waypoints);
  var routeInfo = computeGoogleTravelRoute_(Number(claim.fromLat), Number(claim.fromLng), lat, lng, vt);
  if (routeInfo.quotaExceeded) quotaExceeded = true;

  var distanceKm = gpsKm;
  var distanceSource = 'LIVE_GPS_TRAIL';
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

  var purpose = (payload && payload.purpose !== undefined) ? String(payload.purpose || '').trim() : claim.purpose;
  var remarks = (payload && payload.remarks !== undefined) ? String(payload.remarks || '').trim() : claim.remarks;
  var resolvedToAddr = toAddress || ('GPS (' + lat.toFixed(5) + ', ' + lng.toFixed(5) + ')');
  var toMapsUrl = buildMapsUrl_(lat, lng, toPlaceId);
  var claimAmount = Math.round(distanceKm * ratePerKm * 100) / 100;

  var patch = {
    vehicleType: vt,
    ratePerKm: ratePerKm,
    toAddress: resolvedToAddr,
    toLat: lat,
    toLng: lng,
    toAccuracy: accuracy,
    toPlaceId: toPlaceId,
    toMapsUrl: toMapsUrl,
    endedAt: nowIso,
    waypointsJson: JSON.stringify(waypoints),
    gpsTrackedDistanceKm: gpsKm,
    googleRouteDistanceKm: routeInfo.googleRouteDistanceKm,
    distanceKm: distanceKm,
    distanceSource: distanceSource,
    routeDurationText: routeInfo.routeDurationText,
    routePolyline: routeInfo.routePolyline,
    claimAmount: claimAmount,
    purpose: purpose,
    remarks: remarks,
    updatedAt: nowIso
  };

  if (payload && payload.submitNow) {
    if (!purpose) throw new Error('Travel purpose is required to submit the conveyance claim.');
    patch.status = 'SUBMITTED';
    patch.submittedAt = nowIso;
    var admins = readSheetAsObjects_(SHEET_NAMES.USERS).filter(function (u) {
      return u.status === 'ACTIVE' && (u.role === 'SUPER_ADMIN' || u.role === 'HR_ADMIN');
    });
    admins.forEach(function (adm) {
      appendNotification_(
        adm.employeeId,
        'TRAVEL',
        'Travel Claim Submitted (' + claim.claimId + ')',
        authUser.fullName + ' claimed INR ' + claimAmount + ' (' + distanceKm + ' km · ' + vt + ' @ INR ' + ratePerKm + '/km) from ' + claim.fromAddress + ' to ' + resolvedToAddr + '.'
      );
    });
  }

  updateRowByKey_(SHEET_NAMES.TRAVEL_CONVEYANCE, 'claimId', claim.claimId, patch);
  handleUpdateLiveLocation_(authUser, {
    latitude: lat,
    longitude: lng,
    accuracy: accuracy,
    address: resolvedToAddr,
    placeId: toPlaceId,
    attendanceType: 'FIELD',
    locationPermissionStatus: 'ACTIVE',
    isSharingActive: true,
    deviceTimestamp: nowIso
  });
  logAudit_(authUser, (payload && payload.submitNow) ? 'SUBMIT_TRAVEL_CLAIM' : 'COMPLETE_TRAVEL_TRIP', 'TRAVEL', claim.claimId, vt + ' ' + distanceKm + ' km @ INR ' + ratePerKm + '/km = INR ' + claimAmount);

  var updatedRow = readSheetAsObjects_(SHEET_NAMES.TRAVEL_CONVEYANCE).filter(function (c) { return c.claimId === claim.claimId; })[0];
  return { ok: true, claim: hydrateTravelClaimRow_(updatedRow), quotaExceeded: quotaExceeded };
}

function handleSubmitTravelClaim_(authUser, payload) {
  ensureTravelSheet_();
  var raw = readSheetAsObjects_(SHEET_NAMES.TRAVEL_CONVEYANCE).filter(function (c) {
    return c.claimId === (payload && payload.claimId);
  })[0];
  if (!raw) throw new Error('Travel trip not found.');
  if (authUser.role === 'EMPLOYEE' && raw.employeeId !== authUser.employeeId) {
    throw new Error('FORBIDDEN: Cannot submit another employee claim.');
  }
  if (raw.status !== 'IN_PROGRESS') {
    throw new Error('Only completed active trips can be submitted.');
  }
  if (raw.toLat === '' || raw.toLat == null || !raw.endedAt) {
    throw new Error('Capture Location B (End Trip) before submitting your claim.');
  }
  var purpose = String((payload && payload.purpose !== undefined ? payload.purpose : raw.purpose) || '').trim();
  if (!purpose) throw new Error('Purpose of travel is required.');

  var rates = getConveyanceRates_();
  var vt = (payload && payload.vehicleType) ? normalizeVehicleType_(payload.vehicleType) : normalizeVehicleType_(raw.vehicleType);
  var ratePerKm = vt === 'CAR' ? rates.car : rates.bike;
  var distanceKm = Number(raw.distanceKm || 0);
  var googleDist = Number(raw.googleRouteDistanceKm || 0);
  var routeDurationText = raw.routeDurationText || '';
  var routePolyline = raw.routePolyline || '';

  if (vt !== normalizeVehicleType_(raw.vehicleType)) {
    var routeInfo = computeGoogleTravelRoute_(Number(raw.fromLat), Number(raw.fromLng), Number(raw.toLat), Number(raw.toLng), vt);
    if (routeInfo.googleRouteDistanceKm > 0) {
      googleDist = routeInfo.googleRouteDistanceKm;
      routeDurationText = routeInfo.routeDurationText;
      routePolyline = routeInfo.routePolyline;
      if (raw.distanceSource === 'GOOGLE_ROUTES_API' || Number(raw.gpsTrackedDistanceKm || 0) < 0.05) {
        distanceKm = googleDist;
      }
    }
  }

  var nowIso = new Date().toISOString();
  var claimAmount = Math.round(distanceKm * ratePerKm * 100) / 100;
  var patch = {
    vehicleType: vt,
    ratePerKm: ratePerKm,
    googleRouteDistanceKm: googleDist,
    distanceKm: distanceKm,
    routeDurationText: routeDurationText,
    routePolyline: routePolyline,
    claimAmount: claimAmount,
    purpose: purpose,
    remarks: String((payload && payload.remarks !== undefined ? payload.remarks : raw.remarks) || '').trim(),
    status: 'SUBMITTED',
    submittedAt: nowIso,
    updatedAt: nowIso
  };
  updateRowByKey_(SHEET_NAMES.TRAVEL_CONVEYANCE, 'claimId', raw.claimId, patch);

  var admins = readSheetAsObjects_(SHEET_NAMES.USERS).filter(function (u) {
    return u.status === 'ACTIVE' && (u.role === 'SUPER_ADMIN' || u.role === 'HR_ADMIN');
  });
  admins.forEach(function (adm) {
    appendNotification_(
      adm.employeeId,
      'TRAVEL',
      'Travel Claim Submitted (' + raw.claimId + ')',
      raw.employeeName + ' claimed INR ' + claimAmount + ' (' + distanceKm + ' km · ' + vt + ' @ INR ' + ratePerKm + '/km) from ' + raw.fromAddress + ' to ' + raw.toAddress + '.'
    );
  });
  logAudit_(authUser, 'SUBMIT_TRAVEL_CLAIM', 'TRAVEL', raw.claimId, 'Submitted INR ' + claimAmount + ' (' + distanceKm + ' km · ' + vt + ')');

  var updatedRow = readSheetAsObjects_(SHEET_NAMES.TRAVEL_CONVEYANCE).filter(function (c) { return c.claimId === raw.claimId; })[0];
  return { ok: true, claim: hydrateTravelClaimRow_(updatedRow) };
}

function handleCancelTravelTrip_(authUser, payload) {
  ensureTravelSheet_();
  var raw = readSheetAsObjects_(SHEET_NAMES.TRAVEL_CONVEYANCE).filter(function (c) {
    return c.claimId === (payload && payload.claimId);
  })[0];
  if (!raw) throw new Error('Travel trip not found.');
  if (authUser.role === 'EMPLOYEE' && raw.employeeId !== authUser.employeeId) {
    throw new Error('FORBIDDEN: Cannot cancel another employee trip.');
  }
  if (raw.status !== 'IN_PROGRESS') {
    throw new Error('Only unsubmitted in-progress trips can be cancelled.');
  }
  deleteRowByKey_(SHEET_NAMES.TRAVEL_CONVEYANCE, 'claimId', raw.claimId);
  logAudit_(authUser, 'CANCEL_TRAVEL_TRIP', 'TRAVEL', raw.claimId, 'Cancelled unsubmitted trip');
  return { ok: true };
}

function handleReviewTravelClaim_(authUser, payload) {
  ensureTravelSheet_();
  var raw = readSheetAsObjects_(SHEET_NAMES.TRAVEL_CONVEYANCE).filter(function (c) {
    return c.claimId === (payload && payload.claimId);
  })[0];
  if (!raw) throw new Error('Travel claim not found.');
  if (raw.status === 'IN_PROGRESS') {
    throw new Error('Cannot review a trip that has not been submitted yet.');
  }
  var decision = String((payload && payload.decision) || '').toUpperCase();
  if (decision !== 'APPROVED' && decision !== 'REJECTED' && decision !== 'PAID') {
    throw new Error('Decision must be APPROVED, REJECTED, or PAID.');
  }
  var nowIso = new Date().toISOString();
  var patch = {
    status: decision,
    reviewedBy: authUser.fullName,
    reviewerRole: authUser.role,
    reviewedAt: nowIso,
    rejectionReason: decision === 'REJECTED' ? String((payload && payload.rejectionReason) || 'Declined after route audit').trim() : '',
    updatedAt: nowIso
  };
  if (decision === 'PAID') {
    patch.paidAt = nowIso;
  }
  updateRowByKey_(SHEET_NAMES.TRAVEL_CONVEYANCE, 'claimId', raw.claimId, patch);
  appendNotification_(
    raw.employeeId,
    'TRAVEL',
    'Travel Claim ' + decision + ' (' + raw.claimId + ')',
    'Your conveyance claim of INR ' + raw.claimAmount + ' (' + raw.distanceKm + ' km · ' + raw.vehicleType + ') was marked ' + decision + ' by ' + authUser.fullName + '.'
  );
  logAudit_(authUser, 'TRAVEL_CLAIM_' + decision, 'TRAVEL', raw.claimId, raw.employeeId + ' · INR ' + raw.claimAmount);
  var updatedRow = readSheetAsObjects_(SHEET_NAMES.TRAVEL_CONVEYANCE).filter(function (c) { return c.claimId === raw.claimId; })[0];
  return { ok: true, claim: hydrateTravelClaimRow_(updatedRow) };
}

function ensureFoodSheet_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET_NAMES.FOOD_ALLOWANCES);
  var headers = [
    'claimId', 'employeeId', 'employeeName', 'department', 'designation', 'date',
    'mealType', 'amount', 'checkInTime', 'checkOutTime', 'claimedAt', 'notes', 'status',
    'reviewedBy', 'reviewerRole', 'reviewedAt', 'rejectionReason', 'paidAt', 'updatedAt'
  ];
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAMES.FOOD_ALLOWANCES);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setBackground('#0B1B36').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getFoodAllowancePolicy_() {
  var map = getSettingsMap_();
  var enabled = String(map.foodAllowanceEnabled) !== 'false';
  var b = (map.foodBreakfastAmount !== undefined && map.foodBreakfastAmount !== '') ? Number(map.foodBreakfastAmount) : 70;
  var l = (map.foodLunchAmount !== undefined && map.foodLunchAmount !== '') ? Number(map.foodLunchAmount) : 90;
  var d = (map.foodDinnerAmount !== undefined && map.foodDinnerAmount !== '') ? Number(map.foodDinnerAmount) : 90;
  return {
    enabled: enabled,
    breakfast: (isFinite(b) && b >= 0) ? Math.round(b * 100) / 100 : 70,
    lunch: (isFinite(l) && l >= 0) ? Math.round(l * 100) / 100 : 90,
    dinner: (isFinite(d) && d >= 0) ? Math.round(d * 100) / 100 : 90
  };
}

function evaluateFoodWorkingHoursEligibility_(employeeId, nowDate) {
  var nowObj = nowDate || new Date();
  var nowMs = nowObj.getTime();
  var todayStr = nowObj.toISOString().slice(0, 10);
  var allAtt = readSheetAsObjects_(SHEET_NAMES.ATTENDANCE);
  var att = allAtt.filter(function (a) { return a.employeeId === employeeId && a.date === todayStr; })[0] || null;
  if (!att || !att.checkInTime) {
    var openShifts = allAtt.filter(function (a) {
      if (a.employeeId !== employeeId || !a.checkInTime || a.checkOutTime) return false;
      var sMs = new Date(a.checkInTime).getTime();
      return isFinite(sMs) && nowMs >= sMs && (nowMs - sMs <= 24 * 3600000);
    }).sort(function (a, b) {
      return String(b.checkInTime).localeCompare(String(a.checkInTime));
    });
    if (openShifts.length > 0) att = openShifts[0];
  }

  if (!att || !att.checkInTime) {
    return {
      eligible: false,
      reason: 'Food allowance is applicable during active working hours only. Complete Attendance Check-In first.',
      date: todayStr,
      attendanceId: att ? (att.attendanceId || '') : '',
      checkInTime: '',
      checkOutTime: '',
      attendanceStatus: att ? (att.status || 'NOT_CHECKED_IN') : 'NOT_CHECKED_IN'
    };
  }

  var stUpper = String(att.status || '').toUpperCase();
  if (stUpper === 'ABSENT' || stUpper === 'ON_LEAVE' || stUpper === 'WEEKLY_OFF' || stUpper === 'HOLIDAY') {
    return {
      eligible: false,
      reason: 'Attendance status is ' + stUpper + '. Food allowance applies during active working hours only.',
      date: att.date || todayStr,
      attendanceId: att.attendanceId || '',
      checkInTime: att.checkInTime || '',
      checkOutTime: att.checkOutTime || '',
      attendanceStatus: stUpper
    };
  }

  var inMs = new Date(att.checkInTime).getTime();
  if (!isFinite(inMs) || nowMs < inMs) {
    return {
      eligible: false,
      reason: 'Current server time is outside your recorded working hours.',
      date: att.date || todayStr,
      attendanceId: att.attendanceId || '',
      checkInTime: att.checkInTime || '',
      checkOutTime: att.checkOutTime || '',
      attendanceStatus: stUpper || 'PRESENT'
    };
  }

  if (att.checkOutTime) {
    var outMs = new Date(att.checkOutTime).getTime();
    if (isFinite(outMs)) {
      if (outMs < inMs && (outMs + 86400000 - inMs <= 86400000)) {
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
          attendanceStatus: stUpper || 'PRESENT'
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
      attendanceStatus: stUpper || 'PRESENT'
    };
  }

  return {
    eligible: true,
    reason: 'Active working hours verified (Checked In). Eligible to claim meals during duty.',
    date: att.date || todayStr,
    attendanceId: att.attendanceId || '',
    checkInTime: att.checkInTime || '',
    checkOutTime: att.checkOutTime || '',
    attendanceStatus: stUpper || 'PRESENT'
  };
}

function hydrateFoodAllowanceRow_(r) {
  return {
    claimId: r.claimId,
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    department: r.department,
    designation: r.designation,
    date: r.date,
    mealType: String(r.mealType || 'LUNCH').toUpperCase(),
    amount: Number(r.amount || 0),
    checkInTime: r.checkInTime || '',
    checkOutTime: r.checkOutTime || '',
    claimedAt: r.claimedAt || '',
    notes: r.notes || '',
    status: r.status || 'SUBMITTED',
    reviewedBy: r.reviewedBy || '',
    reviewerRole: r.reviewerRole || '',
    reviewedAt: r.reviewedAt || '',
    rejectionReason: r.rejectionReason || '',
    paidAt: r.paidAt || '',
    updatedAt: r.updatedAt || ''
  };
}

function handleGetFoodAllowances_(authUser, payload) {
  ensureFoodSheet_();
  var policy = getFoodAllowancePolicy_();
  var todayShift = evaluateFoodWorkingHoursEligibility_(authUser.employeeId, new Date());
  var rows = readSheetAsObjects_(SHEET_NAMES.FOOD_ALLOWANCES).map(hydrateFoodAllowanceRow_);
  if (authUser.role === 'EMPLOYEE') {
    rows = rows.filter(function (c) { return c.employeeId === authUser.employeeId; });
  } else if (payload && payload.employeeId) {
    rows = rows.filter(function (c) { return c.employeeId === payload.employeeId; });
  }
  if (payload && payload.status && payload.status !== 'ALL') {
    rows = rows.filter(function (c) { return c.status === payload.status; });
  }
  if (payload && payload.mealType && payload.mealType !== 'ALL') {
    rows = rows.filter(function (c) { return c.mealType === payload.mealType; });
  }
  if (payload && payload.month) {
    rows = rows.filter(function (c) { return String(c.date || '').indexOf(String(payload.month)) === 0; });
  }
  rows.sort(function (a, b) { return String(b.claimedAt || '').localeCompare(String(a.claimedAt || '')); });
  return { ok: true, claims: rows, policy: policy, todayShift: todayShift };
}

function handleClaimFoodAllowance_(authUser, payload) {
  ensureFoodSheet_();
  var policy = getFoodAllowancePolicy_();
  if (!policy.enabled) {
    throw new Error('Food allowance claims are currently disabled by Super Admin.');
  }
  var mealType = String((payload && payload.mealType) || '').toUpperCase();
  if (mealType !== 'BREAKFAST' && mealType !== 'LUNCH' && mealType !== 'DINNER') {
    throw new Error('Invalid meal type. Choose BREAKFAST, LUNCH, or DINNER.');
  }
  var nowObj = new Date();
  var nowIso = nowObj.toISOString();
  var eligibility = evaluateFoodWorkingHoursEligibility_(authUser.employeeId, nowObj);
  if (!eligibility.eligible) {
    throw new Error(eligibility.reason);
  }

  var existing = readSheetAsObjects_(SHEET_NAMES.FOOD_ALLOWANCES).filter(function (c) {
    return c.employeeId === authUser.employeeId &&
      c.date === eligibility.date &&
      String(c.mealType || '').toUpperCase() === mealType &&
      c.status !== 'REJECTED';
  })[0];
  if (existing) {
    throw new Error(mealType + ' allowance has already been claimed for working date ' + eligibility.date + ' (' + existing.claimId + ').');
  }

  var amount = mealType === 'BREAKFAST' ? policy.breakfast : (mealType === 'LUNCH' ? policy.lunch : policy.dinner);
  var claimId = 'FOOD-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  var rowObj = {
    claimId: claimId,
    employeeId: authUser.employeeId,
    employeeName: authUser.fullName,
    department: authUser.department,
    designation: authUser.designation,
    date: eligibility.date,
    mealType: mealType,
    amount: amount,
    checkInTime: eligibility.checkInTime,
    checkOutTime: eligibility.checkOutTime,
    claimedAt: nowIso,
    notes: String((payload && payload.notes) || '').trim(),
    status: 'SUBMITTED',
    reviewedBy: '',
    reviewerRole: '',
    reviewedAt: '',
    rejectionReason: '',
    paidAt: '',
    updatedAt: nowIso
  };
  appendRowObj_(SHEET_NAMES.FOOD_ALLOWANCES, rowObj);

  var admins = readSheetAsObjects_(SHEET_NAMES.USERS).filter(function (u) {
    return u.status === 'ACTIVE' && (u.role === 'SUPER_ADMIN' || u.role === 'HR_ADMIN');
  });
  admins.forEach(function (adm) {
    appendNotification_(
      adm.employeeId,
      'FOOD',
      'Food Allowance Claim (' + claimId + ')',
      authUser.fullName + ' claimed INR ' + amount + ' for ' + mealType + ' during working hours (' + eligibility.date + ').'
    );
  });
  logAudit_(authUser, 'CLAIM_FOOD_ALLOWANCE', 'FOOD', claimId, mealType + ' INR ' + amount + ' · Working date ' + eligibility.date);
  return { ok: true, claim: hydrateFoodAllowanceRow_(rowObj), policy: policy, todayShift: eligibility };
}

function handleReviewFoodAllowance_(authUser, payload) {
  ensureFoodSheet_();
  var raw = readSheetAsObjects_(SHEET_NAMES.FOOD_ALLOWANCES).filter(function (c) {
    return c.claimId === (payload && payload.claimId);
  })[0];
  if (!raw) throw new Error('Food allowance claim not found.');
  var decision = String((payload && payload.decision) || '').toUpperCase();
  if (decision !== 'APPROVED' && decision !== 'REJECTED' && decision !== 'PAID') {
    throw new Error('Decision must be APPROVED, REJECTED, or PAID.');
  }
  if (raw.status === 'REJECTED' && decision !== 'REJECTED') {
    throw new Error('Rejected food allowance claims cannot be approved or paid.');
  }
  if (raw.status === 'PAID' && decision === 'REJECTED') {
    throw new Error('Paid food allowance claims cannot be rejected.');
  }
  var nowIso = new Date().toISOString();
  var patch = {
    status: decision,
    reviewedBy: authUser.fullName,
    reviewerRole: authUser.role,
    reviewedAt: nowIso,
    rejectionReason: decision === 'REJECTED' ? String((payload && payload.rejectionReason) || 'Declined after working-hours audit').trim() : '',
    updatedAt: nowIso
  };
  if (decision === 'PAID') {
    patch.paidAt = nowIso;
  }
  updateRowByKey_(SHEET_NAMES.FOOD_ALLOWANCES, 'claimId', raw.claimId, patch);
  appendNotification_(
    raw.employeeId,
    'FOOD',
    'Food Allowance ' + decision + ' (' + raw.claimId + ')',
    'Your ' + raw.mealType + ' allowance claim of INR ' + raw.amount + ' (' + raw.date + ') was marked ' + decision + ' by ' + authUser.fullName + '.'
  );
  logAudit_(authUser, 'FOOD_ALLOWANCE_' + decision, 'FOOD', raw.claimId, raw.employeeId + ' · ' + raw.mealType + ' INR ' + raw.amount);
  var updatedRow = readSheetAsObjects_(SHEET_NAMES.FOOD_ALLOWANCES).filter(function (c) { return c.claimId === raw.claimId; })[0];
  return { ok: true, claim: hydrateFoodAllowanceRow_(updatedRow) };
}

function handleSyncOfflineQueue_(authUser, payload) {
  var items = (payload.items || []).slice().sort(function (a, b) {
    return String(a.deviceTimestamp || '').localeCompare(String(b.deviceTimestamp || ''));
  });
  var results = [];
  items.forEach(function (item) {
    try {
      appendRowObj_(SHEET_NAMES.SYNC_QUEUE, {
        eventId: item.eventId,
        employeeId: authUser.employeeId,
        type: item.type,
        deviceTimestamp: item.deviceTimestamp,
        serverReceivedAt: new Date().toISOString(),
        verificationStatus: 'DEVICE_CAPTURED_UNVERIFIED',
        payloadJson: JSON.stringify(item.payload || {})
      });
      var p = Object.assign({}, item.payload, {
        deviceTimestamp: item.deviceTimestamp,
        isOfflineSync: true,
        eventId: item.eventId
      });
      if (item.type === 'CHECK_IN') handleCheckIn_(authUser, p);
      if (item.type === 'CHECK_OUT') handleCheckOut_(authUser, p);
      if (item.type === 'LOCATION_PING') handleUpdateLiveLocation_(authUser, p);
      results.push({ eventId: item.eventId, status: 'SYNCED' });
    } catch (e) {
      results.push({ eventId: item.eventId, status: 'FAILED', error: e.message });
    }
  });
  return { ok: true, results: results };
}

function handleGetLeaveData_(authUser) {
  var types = readSheetAsObjects_(SHEET_NAMES.LEAVE_TYPES);
  var apps = readSheetAsObjects_(SHEET_NAMES.LEAVE_APPLICATIONS);
  var balances = readSheetAsObjects_(SHEET_NAMES.LEAVE_BALANCES);
  var holidays = readSheetAsObjects_(SHEET_NAMES.HOLIDAYS);
  if (authUser.role === 'EMPLOYEE') {
    apps = apps.filter(function (a) { return a.employeeId === authUser.employeeId; });
    balances = balances.filter(function (b) { return b.employeeId === authUser.employeeId; });
  }
  return { ok: true, leaveTypes: types, applications: apps.reverse(), balances: balances, holidays: holidays };
}

function handleApplyLeave_(authUser, payload) {
  var leaveId = 'LV-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  var now = new Date().toISOString();
  var docUrl = payload.documentDataUrl
    ? saveBase64ToDrive_('DRIVE_DOCS_FOLDER_ID', leaveId + '_' + (payload.documentName || 'support.pdf'), payload.documentDataUrl)
    : '';
  var s = new Date(payload.startDate);
  var e = new Date(payload.endDate);
  var days = payload.isHalfDay ? 0.5 : Math.max(1, Math.round((e - s) / 86400000) + 1);
  var lt = readSheetAsObjects_(SHEET_NAMES.LEAVE_TYPES).filter(function (t) { return t.leaveTypeId === payload.leaveTypeId; })[0] || {};

  var record = {
    leaveId: leaveId,
    employeeId: authUser.employeeId,
    employeeName: authUser.fullName,
    department: authUser.department,
    leaveTypeId: payload.leaveTypeId,
    leaveTypeName: lt.name || payload.leaveTypeName || 'Leave',
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
    updatedAt: now
  };
  appendRowObj_(SHEET_NAMES.LEAVE_APPLICATIONS, record);
  appendNotification_('ALL', 'LEAVE', 'Leave Application Submitted', authUser.fullName + ' requested ' + days + ' day(s) of ' + record.leaveTypeName + '.');
  logAudit_(authUser, 'APPLY_LEAVE', 'LEAVES', leaveId, days + ' days');
  return { ok: true, leaveId: leaveId };
}

function handleReviewLeave_(authUser, payload) {
  var apps = readSheetAsObjects_(SHEET_NAMES.LEAVE_APPLICATIONS);
  var app = apps.filter(function (a) { return a.leaveId === payload.leaveId; })[0];
  if (!app) throw new Error('Leave application not found.');

  updateRowByKey_(SHEET_NAMES.LEAVE_APPLICATIONS, 'leaveId', payload.leaveId, {
    status: payload.decision,
    reviewedBy: authUser.fullName,
    reviewerRole: authUser.role,
    rejectionReason: payload.rejectionReason || '',
    updatedAt: new Date().toISOString()
  });

  if (payload.decision === 'APPROVED') {
    var balances = readSheetAsObjects_(SHEET_NAMES.LEAVE_BALANCES);
    var bal = balances.filter(function (b) { return b.employeeId === app.employeeId && b.leaveTypeId === app.leaveTypeId; })[0];
    if (bal) {
      var used = Number(bal.used || 0) + Number(app.totalDays || 0);
      var remaining = Math.max(0, Number(bal.allocated || 0) - used);
      updateRowByKey_(SHEET_NAMES.LEAVE_BALANCES, 'balanceId', bal.balanceId, { used: used, remaining: remaining });
    }
  }
  appendNotification_(app.employeeId, 'LEAVE', 'Leave ' + payload.decision, 'Your leave request (' + app.leaveId + ') was ' + payload.decision.toLowerCase() + '.');
  logAudit_(authUser, 'REVIEW_LEAVE', 'LEAVES', payload.leaveId, payload.decision);
  return { ok: true };
}

function handleCancelLeave_(authUser, payload) {
  var apps = readSheetAsObjects_(SHEET_NAMES.LEAVE_APPLICATIONS);
  var app = apps.filter(function (a) { return a.leaveId === payload.leaveId; })[0];
  if (!app) throw new Error('Leave application not found.');
  if (authUser.role === 'EMPLOYEE' && app.employeeId !== authUser.employeeId) throw new Error('FORBIDDEN');
  if (app.status === 'APPROVED') {
    var balances = readSheetAsObjects_(SHEET_NAMES.LEAVE_BALANCES);
    var bal = balances.filter(function (b) { return b.employeeId === app.employeeId && b.leaveTypeId === app.leaveTypeId; })[0];
    if (bal) {
      var used = Math.max(0, Number(bal.used || 0) - Number(app.totalDays || 0));
      var remaining = Math.max(0, Number(bal.allocated || 0) - used);
      updateRowByKey_(SHEET_NAMES.LEAVE_BALANCES, 'balanceId', bal.balanceId, { used: used, remaining: remaining });
    }
  }
  updateRowByKey_(SHEET_NAMES.LEAVE_APPLICATIONS, 'leaveId', payload.leaveId, {
    status: 'CANCELLED',
    updatedAt: new Date().toISOString()
  });
  logAudit_(authUser, 'CANCEL_LEAVE', 'LEAVES', payload.leaveId, 'Cancelled');
  return { ok: true };
}

function handleUpdateLeaveApplication_(authUser, payload) {
  var apps = readSheetAsObjects_(SHEET_NAMES.LEAVE_APPLICATIONS);
  var app = apps.filter(function (a) { return a.leaveId === payload.leaveId; })[0];
  if (!app) throw new Error('Leave application not found.');

  var balances = readSheetAsObjects_(SHEET_NAMES.LEAVE_BALANCES);
  if (app.status === 'APPROVED') {
    var oldBal = balances.filter(function (b) { return b.employeeId === app.employeeId && b.leaveTypeId === app.leaveTypeId; })[0];
    if (oldBal) {
      var revertedUsed = Math.max(0, Number(oldBal.used || 0) - Number(app.totalDays || 0));
      updateRowByKey_(SHEET_NAMES.LEAVE_BALANCES, 'balanceId', oldBal.balanceId, {
        used: revertedUsed,
        remaining: Math.max(0, Number(oldBal.allocated || 0) - revertedUsed)
      });
    }
  }

  var nextTypeId = payload.leaveTypeId || app.leaveTypeId;
  var lt = readSheetAsObjects_(SHEET_NAMES.LEAVE_TYPES).filter(function (t) { return t.leaveTypeId === nextTypeId; })[0];
  var nextStart = payload.startDate || app.startDate;
  var nextEnd = payload.endDate || app.endDate;
  var nextHalf = payload.isHalfDay !== undefined ? Boolean(payload.isHalfDay) : String(app.isHalfDay) === 'true';
  var nextDays = (payload.totalDays !== undefined && payload.totalDays !== '')
    ? Number(payload.totalDays)
    : (nextHalf ? 0.5 : Math.max(1, Math.round((new Date(nextEnd) - new Date(nextStart)) / 86400000) + 1));
  var nextStatus = payload.status || app.status;

  updateRowByKey_(SHEET_NAMES.LEAVE_APPLICATIONS, 'leaveId', payload.leaveId, {
    leaveTypeId: nextTypeId,
    leaveTypeName: lt ? lt.name : app.leaveTypeName,
    startDate: nextStart,
    endDate: nextEnd,
    isHalfDay: nextHalf,
    halfDaySession: payload.halfDaySession !== undefined ? payload.halfDaySession : app.halfDaySession,
    totalDays: nextDays,
    reason: payload.reason !== undefined ? payload.reason : app.reason,
    status: nextStatus,
    rejectionReason: payload.rejectionReason !== undefined ? payload.rejectionReason : app.rejectionReason,
    reviewedBy: authUser.fullName,
    reviewerRole: authUser.role,
    updatedAt: new Date().toISOString()
  });

  if (nextStatus === 'APPROVED') {
    var refreshedBalances = readSheetAsObjects_(SHEET_NAMES.LEAVE_BALANCES);
    var newBal = refreshedBalances.filter(function (b) { return b.employeeId === app.employeeId && b.leaveTypeId === nextTypeId; })[0];
    if (newBal) {
      var nextUsed = Number(newBal.used || 0) + nextDays;
      updateRowByKey_(SHEET_NAMES.LEAVE_BALANCES, 'balanceId', newBal.balanceId, {
        used: nextUsed,
        remaining: Math.max(0, Number(newBal.allocated || 0) - nextUsed)
      });
    }
  }
  logAudit_(authUser, 'UPDATE_LEAVE', 'LEAVES', payload.leaveId, nextStatus + ' (' + nextDays + 'd)');
  return { ok: true };
}

function handleUpdateLeaveBalance_(authUser, payload) {
  var bal = readSheetAsObjects_(SHEET_NAMES.LEAVE_BALANCES).filter(function (b) { return b.balanceId === payload.balanceId; })[0];
  if (!bal) throw new Error('Leave balance record not found.');
  var allocated = Math.max(0, Number(payload.allocated !== undefined ? payload.allocated : bal.allocated));
  var used = Math.max(0, Number(payload.used !== undefined ? payload.used : bal.used));
  var remaining = Math.max(0, allocated - used);
  updateRowByKey_(SHEET_NAMES.LEAVE_BALANCES, 'balanceId', payload.balanceId, { allocated: allocated, used: used, remaining: remaining });
  logAudit_(authUser, 'UPDATE_LEAVE_BALANCE', 'LEAVES', payload.balanceId, 'Allocated ' + allocated + ', Used ' + used);
  return { ok: true };
}

function handleSaveLeaveType_(authUser, payload) {
  var existing = payload.leaveTypeId
    ? readSheetAsObjects_(SHEET_NAMES.LEAVE_TYPES).filter(function (t) { return t.leaveTypeId === payload.leaveTypeId; })[0]
    : null;
  if (existing) {
    updateRowByKey_(SHEET_NAMES.LEAVE_TYPES, 'leaveTypeId', existing.leaveTypeId, {
      name: payload.name || existing.name,
      code: String(payload.code || existing.code).toUpperCase(),
      annualQuota: Number(payload.annualQuota !== undefined ? payload.annualQuota : existing.annualQuota),
      isPaid: payload.isPaid !== undefined ? Boolean(payload.isPaid) : String(existing.isPaid) === 'true',
      requiresDocument: payload.requiresDocument !== undefined ? Boolean(payload.requiresDocument) : String(existing.requiresDocument) === 'true'
    });
    logAudit_(authUser, 'UPDATE_LEAVE_TYPE', 'LEAVES', existing.leaveTypeId, payload.name || existing.name);
    return { ok: true };
  }
  var id = 'LT-' + String(payload.code || Utilities.getUuid().slice(0, 4)).toUpperCase();
  appendRowObj_(SHEET_NAMES.LEAVE_TYPES, {
    leaveTypeId: id,
    name: payload.name,
    code: String(payload.code || 'LV').toUpperCase(),
    annualQuota: Number(payload.annualQuota || 0),
    isPaid: payload.isPaid !== false,
    requiresDocument: Boolean(payload.requiresDocument)
  });
  logAudit_(authUser, 'CREATE_LEAVE_TYPE', 'LEAVES', id, payload.name);
  return { ok: true };
}

function handleGetPayrollData_(authUser, payload) {
  var structures = readSheetAsObjects_(SHEET_NAMES.SALARY_STRUCTURE);
  var payrolls = readSheetAsObjects_(SHEET_NAMES.PAYROLL);
  if (authUser.role === 'EMPLOYEE') {
    structures = structures.filter(function (s) { return s.employeeId === authUser.employeeId; });
    payrolls = payrolls.filter(function (p) { return p.employeeId === authUser.employeeId && p.status !== 'DRAFT'; });
  } else if (payload && payload.month) {
    payrolls = payrolls.filter(function (p) { return p.month === payload.month; });
  }
  return { ok: true, structures: structures, payrolls: payrolls.reverse() };
}

function handleSaveSalaryStructure_(authUser, payload) {
  var all = readSheetAsObjects_(SHEET_NAMES.SALARY_STRUCTURE);
  var existing = all.filter(function (s) { return s.employeeId === payload.employeeId; })[0];
  var now = new Date().toISOString();
  var data = Object.assign({}, payload, {
    structureId: existing ? existing.structureId : 'SAL-' + payload.employeeId,
    updatedAt: now
  });
  if (existing) {
    updateRowByKey_(SHEET_NAMES.SALARY_STRUCTURE, 'structureId', existing.structureId, data);
  } else {
    appendRowObj_(SHEET_NAMES.SALARY_STRUCTURE, data);
  }
  logAudit_(authUser, 'SAVE_SALARY_STRUCTURE', 'PAYROLL', payload.employeeId, 'Updated salary configuration');
  return { ok: true };
}

function handleGeneratePayroll_(authUser, payload) {
  var month = payload.month; // YYYY-MM
  var employees = readSheetAsObjects_(SHEET_NAMES.EMPLOYEES).filter(function (e) { return e.status === 'ACTIVE'; });
  var structures = readSheetAsObjects_(SHEET_NAMES.SALARY_STRUCTURE);
  var attendance = readSheetAsObjects_(SHEET_NAMES.ATTENDANCE).filter(function (a) { return String(a.date).indexOf(month) === 0; });
  var leaves = readSheetAsObjects_(SHEET_NAMES.LEAVE_APPLICATIONS).filter(function (l) {
    return l.status === 'APPROVED' && String(l.startDate).indexOf(month) === 0;
  });
  var existingPayrolls = readSheetAsObjects_(SHEET_NAMES.PAYROLL);
  var leaveTypes = readSheetAsObjects_(SHEET_NAMES.LEAVE_TYPES);
  var workingDaysInMonth = 26;
  var settingsMap = getSettingsMap_();
  var otEnabledPay = String(settingsMap.overtimeEnabled) !== 'false';
  var otThresholdPay = Number(settingsMap.overtimeAfterHours || 9);
  if (!isFinite(otThresholdPay) || otThresholdPay <= 0) otThresholdPay = 9;
  var otRateModePay = settingsMap.overtimeRateMode === 'FIXED_HOURLY_RATE' ? 'FIXED_HOURLY_RATE' : 'BASIC_PERCENT_PER_HOUR';
  var otPercentPay = (settingsMap.overtimeBasicPercentPerHour !== undefined && settingsMap.overtimeBasicPercentPerHour !== '')
    ? Number(settingsMap.overtimeBasicPercentPerHour)
    : 1.5;
  if (!isFinite(otPercentPay) || otPercentPay < 0) otPercentPay = 1.5;
  var generated = [];

  employees.forEach(function (emp) {
    var struct = structures.filter(function (s) { return s.employeeId === emp.employeeId; })[0];
    if (!struct) return;
    var already = existingPayrolls.filter(function (p) { return p.employeeId === emp.employeeId && p.month === month; })[0];
    if (already && already.status === 'PAID') return;

    var empAtt = attendance.filter(function (a) { return a.employeeId === emp.employeeId; });
    var presentDays = 0;
    var overtimeHours = 0;
    empAtt.forEach(function (a) {
      presentDays += a.status === 'HALF_DAY' ? 0.5 : 1;
      var recHrs = Number(a.workingHours || 0);
      var derivedOt = recHrs > otThresholdPay ? Math.round((recHrs - otThresholdPay) * 100) / 100 : 0;
      var recOt = (a.overtimeHours !== undefined && a.overtimeHours !== '' && Number(a.overtimeHours) > 0)
        ? Number(a.overtimeHours)
        : derivedOt;
      overtimeHours += recOt;
    });
    overtimeHours = Math.round(overtimeHours * 100) / 100;

    var paidLeaves = 0;
    var unpaidLeaves = 0;
    leaves.filter(function (l) { return l.employeeId === emp.employeeId; }).forEach(function (l) {
      var lt = leaveTypes.filter(function (t) { return t.leaveTypeId === l.leaveTypeId; })[0];
      if (lt && String(lt.isPaid) === 'false') unpaidLeaves += Number(l.totalDays || 0);
      else paidLeaves += Number(l.totalDays || 0);
    });

    var basic = Number(struct.basicSalary || 0);
    var hra = Number(struct.hra || 0);
    var allowances = Number(struct.conveyanceAllowance || 0) + Number(struct.specialAllowance || 0);
    var monthlyGrossBase = basic + hra + allowances;
    var unpaidDeduction = Math.round((monthlyGrossBase / workingDaysInMonth) * unpaidLeaves);
    var hourlyOtRate = !otEnabledPay
      ? 0
      : (otRateModePay === 'FIXED_HOURLY_RATE'
          ? Number(struct.overtimeHourlyRate || 0)
          : Math.round(basic * (otPercentPay / 100) * 100) / 100);
    var overtimePay = otEnabledPay ? Math.round(overtimeHours * hourlyOtRate * 100) / 100 : 0;
    var incentives = Number((payload.incentivesByEmployee && payload.incentivesByEmployee[emp.employeeId]) || 0);
    var grossEarnings = Math.round((monthlyGrossBase + overtimePay + incentives) * 100) / 100;

    var pfWage = Math.min(basic, Number(struct.pfWageCap || 15000));
    var pf = String(struct.pfApplicable) === 'true' ? Math.round(pfWage * (Number(struct.pfEmployeePercent || 12) / 100)) : 0;
    var esi = (String(struct.esiApplicable) === 'true' && grossEarnings <= 21000)
      ? Math.round(grossEarnings * (Number(struct.esiEmployeePercent || 0.75) / 100)) : 0;
    var pt = String(struct.ptApplicable) === 'true' ? Number(struct.ptMonthlyAmount || 200) : 0;
    var tds = Number(struct.tdsMonthlyAmount || 0);
    var otherDed = Number(struct.otherFixedDeduction || 0);
    var totalDeductions = Math.round((unpaidDeduction + pf + esi + pt + tds + otherDed) * 100) / 100;
    var netPayable = Math.round(Math.max(0, grossEarnings - totalDeductions) * 100) / 100;

    var rec = {
      payrollId: already ? already.payrollId : 'PAY-' + month.replace('-', '') + '-' + emp.employeeId,
      month: month,
      employeeId: emp.employeeId,
      employeeName: emp.fullName,
      department: emp.department,
      designation: emp.designation,
      workingDaysInMonth: workingDaysInMonth,
      presentDays: presentDays,
      paidLeaveDays: paidLeaves,
      unpaidLeaveDays: unpaidLeaves,
      overtimeHours: overtimeHours,
      overtimeHourlyRateApplied: hourlyOtRate,
      overtimeBasicPercentApplied: otRateModePay === 'BASIC_PERCENT_PER_HOUR' ? otPercentPay : 0,
      basicEarned: basic,
      hraEarned: hra,
      allowancesEarned: allowances,
      overtimePay: overtimePay,
      incentives: incentives,
      grossEarnings: grossEarnings,
      unpaidDeduction: unpaidDeduction,
      pfDeduction: pf,
      esiDeduction: esi,
      professionalTax: pt,
      tdsDeduction: tds,
      otherDeductions: otherDed,
      totalDeductions: totalDeductions,
      netPayable: netPayable,
      status: 'DRAFT',
      approvedBy: '',
      generatedAt: new Date().toISOString(),
      paidAt: ''
    };
    if (already) updateRowByKey_(SHEET_NAMES.PAYROLL, 'payrollId', already.payrollId, rec);
    else appendRowObj_(SHEET_NAMES.PAYROLL, rec);
    generated.push(rec);
  });

  var otNote = otEnabledPay
    ? (otRateModePay === 'FIXED_HOURLY_RATE' ? 'Fixed rate' : otPercentPay + '% Basic/hr') + ' after ' + otThresholdPay + 'h'
    : 'OT disabled';
  logAudit_(authUser, 'GENERATE_PAYROLL', 'PAYROLL', month, 'Generated ' + generated.length + ' payroll(s) · ' + otNote);
  return { ok: true, count: generated.length };
}

function handleUpdatePayrollStatus_(authUser, payload) {
  var patch = { status: payload.status };
  if (payload.status === 'APPROVED') patch.approvedBy = authUser.fullName;
  if (payload.status === 'PAID') patch.paidAt = new Date().toISOString();
  updateRowByKey_(SHEET_NAMES.PAYROLL, 'payrollId', payload.payrollId, patch);
  var rec = readSheetAsObjects_(SHEET_NAMES.PAYROLL).filter(function (p) { return p.payrollId === payload.payrollId; })[0];
  if (rec && (payload.status === 'APPROVED' || payload.status === 'PAID')) {
    appendNotification_(rec.employeeId, 'PAYROLL', 'Payslip Available (' + rec.month + ')', 'Your salary statement for ' + rec.month + ' is ' + payload.status.toLowerCase() + '.');
  }
  logAudit_(authUser, 'PAYROLL_STATUS', 'PAYROLL', payload.payrollId, payload.status);
  return { ok: true };
}

function handleUpdatePayrollRecord_(authUser, payload) {
  var rec = readSheetAsObjects_(SHEET_NAMES.PAYROLL).filter(function (p) { return p.payrollId === payload.payrollId; })[0];
  if (!rec) throw new Error('Payroll record not found.');
  var numKeys = [
    'workingDaysInMonth', 'presentDays', 'paidLeaveDays', 'unpaidLeaveDays', 'overtimeHours',
    'basicEarned', 'hraEarned', 'allowancesEarned', 'overtimePay', 'incentives',
    'unpaidDeduction', 'pfDeduction', 'esiDeduction', 'professionalTax', 'tdsDeduction', 'otherDeductions'
  ];
  var patch = {};
  numKeys.forEach(function (k) {
    patch[k] = (payload[k] !== undefined && payload[k] !== '') ? Number(payload[k]) : Number(rec[k] || 0);
  });
  patch.grossEarnings = Math.round((patch.basicEarned + patch.hraEarned + patch.allowancesEarned + patch.overtimePay + patch.incentives) * 100) / 100;
  patch.totalDeductions = Math.round((patch.unpaidDeduction + patch.pfDeduction + patch.esiDeduction + patch.professionalTax + patch.tdsDeduction + patch.otherDeductions) * 100) / 100;
  patch.netPayable = Math.round(Math.max(0, patch.grossEarnings - patch.totalDeductions) * 100) / 100;
  if (payload.status) {
    patch.status = payload.status;
    if (payload.status === 'APPROVED' && !rec.approvedBy) patch.approvedBy = authUser.fullName;
    if (payload.status === 'PAID' && !rec.paidAt) patch.paidAt = new Date().toISOString();
  }
  updateRowByKey_(SHEET_NAMES.PAYROLL, 'payrollId', payload.payrollId, patch);
  logAudit_(authUser, 'UPDATE_PAYROLL', 'PAYROLL', payload.payrollId, 'Net ' + patch.netPayable);
  return { ok: true };
}

function handleGetPerformanceData_(authUser) {
  var reviews = readSheetAsObjects_(SHEET_NAMES.PERFORMANCE_REVIEWS).map(function (r) {
    r.criteria = r.criteriaJson ? JSON.parse(r.criteriaJson) : {};
    return r;
  });
  var kpis = readSheetAsObjects_(SHEET_NAMES.PERFORMANCE_KPIS);
  if (authUser.role === 'EMPLOYEE') {
    reviews = reviews.filter(function (r) { return r.employeeId === authUser.employeeId; });
    kpis = kpis.filter(function (k) { return k.employeeId === authUser.employeeId; });
  }
  return { ok: true, reviews: reviews.reverse(), kpis: kpis };
}

function handleSavePerformanceReview_(authUser, payload) {
  if (authUser.role === 'EMPLOYEE' && payload.employeeId !== authUser.employeeId) throw new Error('FORBIDDEN');
  var reviewId = payload.reviewId || 'REV-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  var now = new Date().toISOString();
  var existing = readSheetAsObjects_(SHEET_NAMES.PERFORMANCE_REVIEWS).filter(function (r) { return r.reviewId === reviewId; })[0];
  var rec = {
    reviewId: reviewId,
    employeeId: payload.employeeId,
    employeeName: payload.employeeName,
    department: payload.department,
    cycleType: payload.cycleType || 'MONTHLY',
    periodLabel: payload.periodLabel,
    reviewerId: authUser.role === 'EMPLOYEE' ? (existing ? existing.reviewerId : '') : authUser.employeeId,
    reviewerName: authUser.role === 'EMPLOYEE' ? (existing ? existing.reviewerName : '') : authUser.fullName,
    criteriaJson: JSON.stringify(payload.criteria || {}),
    selfAssessmentScore: payload.selfAssessmentScore || 0,
    selfAssessmentNotes: payload.selfAssessmentNotes || '',
    managerRating: authUser.role === 'EMPLOYEE' ? (existing ? existing.managerRating : 0) : (payload.managerRating || 0),
    managerFeedback: authUser.role === 'EMPLOYEE' ? (existing ? existing.managerFeedback : '') : (payload.managerFeedback || ''),
    hrComments: authUser.role === 'EMPLOYEE' ? (existing ? existing.hrComments : '') : (payload.hrComments || ''),
    strengths: payload.strengths || '',
    improvementAreas: payload.improvementAreas || '',
    status: payload.status || 'MANAGER_REVIEW',
    updatedAt: now
  };
  if (existing) updateRowByKey_(SHEET_NAMES.PERFORMANCE_REVIEWS, 'reviewId', reviewId, rec);
  else appendRowObj_(SHEET_NAMES.PERFORMANCE_REVIEWS, rec);
  appendNotification_(payload.employeeId, 'PERFORMANCE', 'Performance Review Updated', 'Review for ' + payload.periodLabel + ' updated.');
  return { ok: true, reviewId: reviewId };
}

function handleSaveKPI_(authUser, payload) {
  var kpiId = payload.kpiId || 'KPI-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  var existing = readSheetAsObjects_(SHEET_NAMES.PERFORMANCE_KPIS).some(function (k) { return k.kpiId === kpiId; });
  var rec = Object.assign({}, payload, { kpiId: kpiId });
  if (existing) updateRowByKey_(SHEET_NAMES.PERFORMANCE_KPIS, 'kpiId', kpiId, rec);
  else appendRowObj_(SHEET_NAMES.PERFORMANCE_KPIS, rec);
  logAudit_(authUser, 'SAVE_KPI', 'PERFORMANCE', kpiId, payload.title);
  return { ok: true };
}

function handleDeleteKPI_(authUser, payload) {
  deleteRowByKey_(SHEET_NAMES.PERFORMANCE_KPIS, 'kpiId', payload.kpiId);
  logAudit_(authUser, 'DELETE_KPI', 'PERFORMANCE', payload.kpiId, 'Deleted KPI');
  return { ok: true };
}

function handleGetTasks_(authUser) {
  var tasks = readSheetAsObjects_(SHEET_NAMES.TASKS);
  if (authUser.role === 'EMPLOYEE') {
    tasks = tasks.filter(function (t) { return t.assignedToId === authUser.employeeId; });
  }
  return { ok: true, tasks: tasks.reverse() };
}

function handleSaveTask_(authUser, payload) {
  var taskId = payload.taskId || 'TSK-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  var now = new Date().toISOString();
  var existing = readSheetAsObjects_(SHEET_NAMES.TASKS).filter(function (t) { return t.taskId === taskId; })[0];
  if (authUser.role === 'EMPLOYEE' && existing && existing.assignedToId !== authUser.employeeId) throw new Error('FORBIDDEN');
  if (authUser.role === 'EMPLOYEE' && !existing) throw new Error('FORBIDDEN');

  if (existing && payload.assignedToId && payload.assignedToId !== existing.assignedToId) {
    var emp = readSheetAsObjects_(SHEET_NAMES.EMPLOYEES).filter(function (e) { return e.employeeId === payload.assignedToId; })[0];
    if (emp) {
      payload.assignedToName = emp.fullName;
      payload.department = emp.department;
    }
  }

  var rec = existing ? Object.assign({}, existing, payload, { updatedAt: now }) : Object.assign({}, payload, {
    taskId: taskId,
    assignedById: authUser.employeeId,
    assignedByName: authUser.fullName,
    createdAt: now,
    updatedAt: now
  });
  if (existing) updateRowByKey_(SHEET_NAMES.TASKS, 'taskId', taskId, rec);
  else {
    appendRowObj_(SHEET_NAMES.TASKS, rec);
    appendNotification_(rec.assignedToId, 'TASK', 'New Task Assigned', rec.title + ' (Due: ' + rec.deadline + ')');
  }
  return { ok: true, taskId: taskId };
}

function handleDeleteTask_(authUser, payload) {
  deleteRowByKey_(SHEET_NAMES.TASKS, 'taskId', payload.taskId);
  logAudit_(authUser, 'DELETE_TASK', 'TASKS', payload.taskId, 'Deleted task');
  return { ok: true };
}

function handleGetNotifications_(authUser) {
  var rows = readSheetAsObjects_(SHEET_NAMES.NOTIFICATIONS).filter(function (n) {
    return n.recipientEmployeeId === 'ALL' || n.recipientEmployeeId === authUser.employeeId;
  });
  return { ok: true, notifications: rows.reverse().slice(0, 100) };
}

function getSettingsMap_() {
  var rows = readSheetAsObjects_(SHEET_NAMES.APP_SETTINGS);
  var map = {};
  rows.forEach(function (r) { map[r.settingKey] = r.settingValue; });
  return map;
}

function handleGetSettings_() {
  var map = getSettingsMap_();
  var pct = (map.overtimeBasicPercentPerHour !== undefined && map.overtimeBasicPercentPerHour !== '')
    ? Number(map.overtimeBasicPercentPerHour)
    : 1.5;
  if (!isFinite(pct) || pct < 0) pct = 1.5;
  var bikeRate = (map.conveyanceBikeRatePerKm !== undefined && map.conveyanceBikeRatePerKm !== '')
    ? Number(map.conveyanceBikeRatePerKm)
    : 4.5;
  if (!isFinite(bikeRate) || bikeRate < 0) bikeRate = 4.5;
  var carRate = (map.conveyanceCarRatePerKm !== undefined && map.conveyanceCarRatePerKm !== '')
    ? Number(map.conveyanceCarRatePerKm)
    : 14;
  if (!isFinite(carRate) || carRate < 0) carRate = 14;
  var bFood = (map.foodBreakfastAmount !== undefined && map.foodBreakfastAmount !== '') ? Number(map.foodBreakfastAmount) : 70;
  if (!isFinite(bFood) || bFood < 0) bFood = 70;
  var lFood = (map.foodLunchAmount !== undefined && map.foodLunchAmount !== '') ? Number(map.foodLunchAmount) : 90;
  if (!isFinite(lFood) || lFood < 0) lFood = 90;
  var dFood = (map.foodDinnerAmount !== undefined && map.foodDinnerAmount !== '') ? Number(map.foodDinnerAmount) : 90;
  if (!isFinite(dFood) || dFood < 0) dFood = 90;
  return {
    ok: true,
    settings: {
      companyName: map.companyName || COMPANY_CONFIG.COMPANY_NAME,
      companyCode: map.companyCode || COMPANY_CONFIG.COMPANY_CODE,
      shiftStartTime: map.shiftStartTime || '09:30',
      shiftEndTime: map.shiftEndTime || '18:30',
      lateGraceMinutes: Number(map.lateGraceMinutes || 15),
      halfDayThresholdHours: Number(map.halfDayThresholdHours || 4.5),
      overtimeEnabled: String(map.overtimeEnabled) !== 'false',
      overtimeAfterHours: Number(map.overtimeAfterHours || 9),
      overtimeRateMode: map.overtimeRateMode === 'FIXED_HOURLY_RATE' ? 'FIXED_HOURLY_RATE' : 'BASIC_PERCENT_PER_HOUR',
      overtimeBasicPercentPerHour: pct,
      conveyanceBikeRatePerKm: Math.round(bikeRate * 100) / 100,
      conveyanceCarRatePerKm: Math.round(carRate * 100) / 100,
      foodAllowanceEnabled: String(map.foodAllowanceEnabled) !== 'false',
      foodBreakfastAmount: Math.round(bFood * 100) / 100,
      foodLunchAmount: Math.round(lFood * 100) / 100,
      foodDinnerAmount: Math.round(dFood * 100) / 100,
      requireCheckoutSelfie: String(map.requireCheckoutSelfie) !== 'false',
      locationStaleMinutes: Number(map.locationStaleMinutes || 5),
      weeklyOffDay: map.weeklyOffDay || 'Sunday',
      adminRecoveryEmail: map.adminRecoveryEmail || '',
      otpWebhookUrl: map.otpWebhookUrl || ''
    }
  };
}

function handleSaveSettings_(authUser, payload) {
  var now = new Date().toISOString();
  Object.keys(payload).forEach(function (k) {
    var updated = updateRowByKey_(SHEET_NAMES.APP_SETTINGS, 'settingKey', k, { settingValue: String(payload[k]), updatedAt: now });
    if (!updated) appendRowObj_(SHEET_NAMES.APP_SETTINGS, { settingKey: k, settingValue: String(payload[k]), updatedAt: now });
  });
  var afterHrs = Number(payload.overtimeAfterHours || 9);
  var pctVal = (payload.overtimeBasicPercentPerHour !== undefined && payload.overtimeBasicPercentPerHour !== '') ? Number(payload.overtimeBasicPercentPerHour) : 1.5;
  var bikeVal = (payload.conveyanceBikeRatePerKm !== undefined && payload.conveyanceBikeRatePerKm !== '') ? Number(payload.conveyanceBikeRatePerKm) : 4.5;
  var carVal = (payload.conveyanceCarRatePerKm !== undefined && payload.conveyanceCarRatePerKm !== '') ? Number(payload.conveyanceCarRatePerKm) : 14;
  var bFoodVal = (payload.foodBreakfastAmount !== undefined && payload.foodBreakfastAmount !== '') ? Number(payload.foodBreakfastAmount) : 70;
  var lFoodVal = (payload.foodLunchAmount !== undefined && payload.foodLunchAmount !== '') ? Number(payload.foodLunchAmount) : 90;
  var dFoodVal = (payload.foodDinnerAmount !== undefined && payload.foodDinnerAmount !== '') ? Number(payload.foodDinnerAmount) : 90;
  var otDesc = (payload.overtimeEnabled === false || String(payload.overtimeEnabled) === 'false')
    ? 'OT auto-pay disabled'
    : 'OT enabled: >' + afterHrs + 'h duty, ' + (payload.overtimeRateMode === 'FIXED_HOURLY_RATE' ? 'Fixed Hourly Rate' : pctVal + '% of Basic/hr');
  logAudit_(authUser, 'SAVE_SETTINGS', 'SETTINGS', 'APP_SETTINGS', 'Updated system settings · ' + otDesc + ' · Conveyance Bike INR ' + bikeVal + '/km, Car INR ' + carVal + '/km · Food B ' + bFoodVal + '/L ' + lFoodVal + '/D ' + dFoodVal);
  return { ok: true };
}

function handleGetOvertimeAudit_(authUser, payload) {
  var month = String((payload && payload.month) || new Date().toISOString().slice(0, 7));
  var sRes = handleGetSettings_().settings;
  var otPolicy = {
    enabled: sRes.overtimeEnabled,
    afterHours: sRes.overtimeAfterHours,
    rateMode: sRes.overtimeRateMode,
    basicPercentPerHour: sRes.overtimeBasicPercentPerHour
  };
  var structures = readSheetAsObjects_(SHEET_NAMES.SALARY_STRUCTURE);
  var records = readSheetAsObjects_(SHEET_NAMES.ATTENDANCE)
    .filter(function (a) { return String(a.date).indexOf(month) === 0; })
    .map(function (a) {
      var wHrs = Number(a.workingHours || 0);
      var derivedOt = wHrs > otPolicy.afterHours ? Math.round((wHrs - otPolicy.afterHours) * 100) / 100 : 0;
      var otHrs = (a.overtimeHours !== undefined && a.overtimeHours !== '' && Number(a.overtimeHours) > 0)
        ? Number(a.overtimeHours)
        : derivedOt;
      var struct = structures.filter(function (s) { return s.employeeId === a.employeeId; })[0];
      var basicSalary = struct ? Number(struct.basicSalary || 0) : 0;
      var hourlyRate = !otPolicy.enabled
        ? 0
        : (otPolicy.rateMode === 'FIXED_HOURLY_RATE'
            ? Number((struct && struct.overtimeHourlyRate) || 0)
            : Math.round(basicSalary * (otPolicy.basicPercentPerHour / 100) * 100) / 100);
      var estimatedOtPay = otPolicy.enabled ? Math.round(otHrs * hourlyRate * 100) / 100 : 0;
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
        basicSalary: basicSalary,
        hourlyOtRate: hourlyRate,
        estimatedOtPay: estimatedOtPay,
        rateMode: otPolicy.rateMode,
        basicPercentApplied: otPolicy.rateMode === 'BASIC_PERCENT_PER_HOUR' ? otPolicy.basicPercentPerHour : 0,
        status: a.status,
        verificationStatus: a.verificationStatus,
        correctionStatus: a.correctionStatus || 'NONE',
        regularizedBy: a.regularizedBy || ''
      };
    })
    .filter(function (r) { return r.overtimeHours > 0; })
    .reverse();

  var auditEvents = readSheetAsObjects_(SHEET_NAMES.AUDIT_LOGS)
    .filter(function (log) {
      var det = String(log.details || '');
      return log.module === 'PAYROLL' ||
        log.action === 'SAVE_SETTINGS' ||
        log.action === 'CHECK_OUT' ||
        log.action === 'ADMIN_EDIT_ATTENDANCE' ||
        log.action === 'REVIEW_CORRECTION' ||
        log.action === 'REGULARIZE_ATTENDANCE_ADMIN' ||
        /overtime|\bot\b/i.test(det);
    })
    .reverse()
    .slice(0, 100);

  return {
    ok: true,
    month: month,
    policy: otPolicy,
    records: records,
    auditEvents: auditEvents
  };
}

function handleSaveDepartment_(authUser, payload) {
  var name = String(payload.name || '').trim();
  var code = String(payload.code || '').trim().toUpperCase();
  if (!name || !code) throw new Error('Department name and code are required.');
  var existingDepts = readSheetAsObjects_(SHEET_NAMES.DEPARTMENTS);
  var existing = payload.departmentId
    ? existingDepts.filter(function (d) { return d.departmentId === payload.departmentId; })[0]
    : null;
  if (existing) {
    var oldName = existing.name;
    updateRowByKey_(SHEET_NAMES.DEPARTMENTS, 'departmentId', existing.departmentId, {
      name: name,
      code: code,
      headEmployeeId: payload.headEmployeeId !== undefined ? payload.headEmployeeId : existing.headEmployeeId
    });
    if (oldName !== name) {
      readSheetAsObjects_(SHEET_NAMES.EMPLOYEES).forEach(function (emp) {
        if (emp.department === oldName) updateRowByKey_(SHEET_NAMES.EMPLOYEES, 'employeeId', emp.employeeId, { department: name });
      });
      readSheetAsObjects_(SHEET_NAMES.DESIGNATIONS).forEach(function (des) {
        if (des.department === oldName) updateRowByKey_(SHEET_NAMES.DESIGNATIONS, 'designationId', des.designationId, { department: name });
      });
    }
    logAudit_(authUser, 'UPDATE_DEPARTMENT', 'SETTINGS', existing.departmentId, name);
    return { ok: true };
  }
  if (existingDepts.some(function (d) { return String(d.name).toLowerCase() === name.toLowerCase(); })) {
    throw new Error('Department "' + name + '" already exists.');
  }
  var id = 'DEPT-' + Utilities.getUuid().slice(0, 6).toUpperCase();
  appendRowObj_(SHEET_NAMES.DEPARTMENTS, {
    departmentId: id,
    name: name,
    code: code,
    headEmployeeId: payload.headEmployeeId || '',
    createdAt: new Date().toISOString()
  });
  logAudit_(authUser, 'CREATE_DEPARTMENT', 'SETTINGS', id, name);
  return { ok: true };
}

function handleDeleteDepartment_(authUser, payload) {
  deleteRowByKey_(SHEET_NAMES.DEPARTMENTS, 'departmentId', payload.departmentId);
  logAudit_(authUser, 'DELETE_DEPARTMENT', 'SETTINGS', payload.departmentId, 'Deleted department');
  return { ok: true };
}

function handleSaveDesignation_(authUser, payload) {
  ensureSheetColumns_(SHEET_NAMES.DESIGNATIONS, ['status']);
  var title = String(payload.title || '').trim();
  var department = String(payload.department || '').trim() || 'Executive & Administration';
  var level = String(payload.level || 'L3').trim();
  if (!title) throw new Error('Role / Designation title is required.');

  var allDes = readSheetAsObjects_(SHEET_NAMES.DESIGNATIONS);
  var existing = payload.designationId
    ? allDes.filter(function (d) { return d.designationId === payload.designationId; })[0]
    : null;
  if (existing) {
    var oldTitle = existing.title;
    updateRowByKey_(SHEET_NAMES.DESIGNATIONS, 'designationId', existing.designationId, {
      title: title,
      department: department,
      level: level,
      status: payload.status || existing.status || 'ACTIVE'
    });
    if (oldTitle !== title) {
      readSheetAsObjects_(SHEET_NAMES.EMPLOYEES).forEach(function (emp) {
        if (emp.designation === oldTitle) updateRowByKey_(SHEET_NAMES.EMPLOYEES, 'employeeId', emp.employeeId, { designation: title });
      });
    }
    logAudit_(authUser, 'UPDATE_DESIGNATION', 'SETTINGS', existing.designationId, title);
    return { ok: true };
  }
  if (allDes.some(function (d) { return String(d.title).toLowerCase() === title.toLowerCase(); })) {
    throw new Error('Role / Designation "' + title + '" already exists.');
  }
  var id = 'DES-' + Utilities.getUuid().slice(0, 6).toUpperCase();
  appendRowObj_(SHEET_NAMES.DESIGNATIONS, {
    designationId: id,
    title: title,
    department: department,
    level: level,
    status: payload.status || 'ACTIVE'
  });
  logAudit_(authUser, 'CREATE_DESIGNATION', 'SETTINGS', id, title);
  return { ok: true };
}

function handleDeleteDesignation_(authUser, payload) {
  deleteRowByKey_(SHEET_NAMES.DESIGNATIONS, 'designationId', payload.designationId);
  logAudit_(authUser, 'DELETE_DESIGNATION', 'SETTINGS', payload.designationId, 'Deleted designation');
  return { ok: true };
}

function handleSaveHoliday_(authUser, payload) {
  if (payload.holidayId) {
    updateRowByKey_(SHEET_NAMES.HOLIDAYS, 'holidayId', payload.holidayId, {
      date: payload.date,
      name: payload.name,
      type: payload.type || 'COMPANY'
    });
    logAudit_(authUser, 'UPDATE_HOLIDAY', 'LEAVES', payload.holidayId, payload.name);
    return { ok: true };
  }
  var id = 'HOL-' + Utilities.getUuid().slice(0, 6).toUpperCase();
  appendRowObj_(SHEET_NAMES.HOLIDAYS, { holidayId: id, date: payload.date, name: payload.name, type: payload.type || 'COMPANY' });
  logAudit_(authUser, 'CREATE_HOLIDAY', 'LEAVES', id, payload.name);
  return { ok: true };
}

function handleDeleteHoliday_(authUser, payload) {
  deleteRowByKey_(SHEET_NAMES.HOLIDAYS, 'holidayId', payload.holidayId);
  logAudit_(authUser, 'DELETE_HOLIDAY', 'LEAVES', payload.holidayId, 'Deleted holiday');
  return { ok: true };
}

function handleGetDashboardAnalytics_(authUser, payload) {
  var employees = readSheetAsObjects_(SHEET_NAMES.EMPLOYEES);
  var attendance = readSheetAsObjects_(SHEET_NAMES.ATTENDANCE);
  var leaves = readSheetAsObjects_(SHEET_NAMES.LEAVE_APPLICATIONS);
  var payroll = readSheetAsObjects_(SHEET_NAMES.PAYROLL);
  var reviews = readSheetAsObjects_(SHEET_NAMES.PERFORMANCE_REVIEWS);
  var tasks = readSheetAsObjects_(SHEET_NAMES.TASKS);
  var liveLoc = readSheetAsObjects_(SHEET_NAMES.LIVE_LOCATION);

  if (authUser.role === 'EMPLOYEE') {
    employees = employees.filter(function (e) { return e.employeeId === authUser.employeeId; });
    attendance = attendance.filter(function (a) { return a.employeeId === authUser.employeeId; });
    leaves = leaves.filter(function (l) { return l.employeeId === authUser.employeeId; });
    payroll = payroll.filter(function (p) { return p.employeeId === authUser.employeeId; });
    reviews = reviews.filter(function (r) { return r.employeeId === authUser.employeeId; });
    tasks = tasks.filter(function (t) { return t.assignedToId === authUser.employeeId; });
  }

  var deptFilter = payload && payload.department ? payload.department : '';
  if (deptFilter) {
    employees = employees.filter(function (e) { return e.department === deptFilter; });
    attendance = attendance.filter(function (a) { return a.department === deptFilter; });
    leaves = leaves.filter(function (l) { return l.department === deptFilter; });
    tasks = tasks.filter(function (t) { return t.department === deptFilter; });
  }

  var today = (payload && payload.date) ? payload.date : new Date().toISOString().slice(0, 10);
  var activeEmps = employees.filter(function (e) { return e.status === 'ACTIVE'; });
  var todayAtt = attendance.filter(function (a) { return a.date === today; });
  var presentToday = todayAtt.length;
  var lateToday = todayAtt.filter(function (a) { return a.status === 'LATE'; }).length;
  var onLeaveToday = leaves.filter(function (l) {
    return l.status === 'APPROVED' && l.startDate <= today && l.endDate >= today;
  }).length;
  var absentToday = Math.max(0, activeEmps.length - presentToday - onLeaveToday);
  var fieldEmps = activeEmps.filter(function (e) { return String(e.isFieldEmployee) === 'true'; }).length;
  var staleMs = Number(getSettingsMap_().locationStaleMinutes || 5) * 60000;
  var sharingLive = authUser.role === 'EMPLOYEE' ? 0 : liveLoc.filter(function (l) {
    return String(l.isSharingActive) === 'true' && (Date.now() - new Date(l.lastUpdatedAt).getTime()) <= staleMs;
  }).length;
  var pendingLeaves = leaves.filter(function (l) { return l.status === 'PENDING'; }).length;
  var pendingCorrections = attendance.filter(function (a) { return a.correctionStatus === 'PENDING'; }).length;

  var deptCounts = {};
  activeEmps.forEach(function (e) { deptCounts[e.department] = (deptCounts[e.department] || 0) + 1; });

  return {
    ok: true,
    analytics: {
      kpis: {
        totalEmployees: employees.length,
        activeEmployees: activeEmps.length,
        presentToday: presentToday,
        absentToday: absentToday,
        onLeaveToday: onLeaveToday,
        lateArrivalsToday: lateToday,
        fieldEmployees: fieldEmps,
        sharingLocationLive: sharingLive,
        pendingLeaveRequests: pendingLeaves,
        pendingApprovals: pendingLeaves + pendingCorrections
      },
      departmentDistribution: Object.keys(deptCounts).map(function (d) { return { department: d, count: deptCounts[d] }; }),
      monthlyAttendanceTrends: buildMonthlyTrends_(attendance),
      leaveStatsByType: buildLeaveTypeStats_(leaves),
      punctualityBreakdown: {
        onTime: attendance.filter(function (a) { return a.status === 'PRESENT'; }).length,
        late: attendance.filter(function (a) { return a.status === 'LATE'; }).length,
        earlyDeparture: attendance.filter(function (a) { return a.status === 'HALF_DAY' || a.status === 'EARLY_DEPARTURE'; }).length
      },
      workingHoursTrend: buildWorkingHoursTrend_(attendance),
      performanceRatings: reviews.slice(0, 12).map(function (r) { return { label: r.employeeName + ' (' + r.periodLabel + ')', avgRating: Number(r.managerRating || r.selfAssessmentScore || 0) }; }),
      payrollExpenditure: buildPayrollTrend_(payroll),
      departmentProductivity: buildDeptProductivity_(tasks),
      taskStats: buildTaskStats_(tasks)
    }
  };
}

function buildMonthlyTrends_(attendance) {
  var map = {};
  attendance.forEach(function (a) {
    var m = String(a.date).slice(0, 7);
    if (!map[m]) map[m] = { label: m, present: 0, absent: 0, late: 0, onLeave: 0 };
    if (a.status === 'LATE') map[m].late++;
    else map[m].present++;
  });
  return Object.keys(map).sort().map(function (k) { return map[k]; });
}

function buildLeaveTypeStats_(leaves) {
  var map = {};
  leaves.forEach(function (l) { map[l.leaveTypeName] = (map[l.leaveTypeName] || 0) + Number(l.totalDays || 0); });
  return Object.keys(map).map(function (k) { return { type: k, count: map[k] }; });
}

function buildWorkingHoursTrend_(attendance) {
  var map = {};
  attendance.forEach(function (a) {
    var d = String(a.date);
    if (!map[d]) map[d] = { label: d, totalHours: 0, overtimeHours: 0, count: 0 };
    map[d].totalHours += Number(a.workingHours || 0);
    map[d].overtimeHours += Number(a.overtimeHours || 0);
    map[d].count++;
  });
  return Object.keys(map).sort().slice(-14).map(function (k) {
    return {
      label: k,
      avgHours: map[k].count ? Math.round((map[k].totalHours / map[k].count) * 100) / 100 : 0,
      overtimeHours: Math.round(map[k].overtimeHours * 100) / 100
    };
  });
}

function buildPayrollTrend_(payroll) {
  var map = {};
  payroll.forEach(function (p) {
    if (!map[p.month]) map[p.month] = { month: p.month, gross: 0, net: 0 };
    map[p.month].gross += Number(p.grossEarnings || 0);
    map[p.month].net += Number(p.netPayable || 0);
  });
  return Object.keys(map).sort().map(function (k) { return map[k]; });
}

function buildDeptProductivity_(tasks) {
  var map = {};
  tasks.forEach(function (t) {
    var d = t.department || 'General';
    if (!map[d]) map[d] = { total: 0, sum: 0 };
    map[d].total++;
    map[d].sum += Number(t.progressPercent || 0);
  });
  return Object.keys(map).map(function (d) {
    return { department: d, completionRate: map[d].total ? Math.round(map[d].sum / map[d].total) : 0 };
  });
}

function buildTaskStats_(tasks) {
  var map = {};
  tasks.forEach(function (t) { map[t.status] = (map[t.status] || 0) + 1; });
  return Object.keys(map).map(function (k) { return { status: k, count: map[k] }; });
}
