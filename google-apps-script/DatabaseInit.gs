/**
 * IDEAL HRMS - Google Sheets & Google Drive Initialization Script
 * Run initializeDatabase() and initializeDriveFolders() once from the Apps Script Editor.
 */

var SHEET_SCHEMA = {
  Employees: [
    'employeeId', 'fullName', 'profilePhotoUrl', 'fatherName', 'dob', 'gender',
    'mobile', 'personalEmail', 'officialEmail', 'emergencyContact',
    'currentAddress', 'permanentAddress', 'dateOfJoining', 'department',
    'designation', 'reportingManagerId', 'reportingManagerName',
    'employmentType', 'workLocation', 'isFieldEmployee', 'role',
    'bankName', 'bankAccountNumber', 'ifscCode', 'panNumber', 'aadhaarNumber',
    'status', 'onboardingChecklistJson', 'createdAt', 'updatedAt'
  ],
  Users: [
    'userId', 'employeeId', 'email', 'passwordHash', 'passwordSalt',
    'role', 'status', 'failedAttempts', 'lockedUntil', 'lastLoginAt', 'createdAt'
  ],
  Departments: ['departmentId', 'name', 'code', 'headEmployeeId', 'createdAt'],
  Designations: ['designationId', 'title', 'department', 'level', 'status'],
  Attendance: [
    'attendanceId', 'employeeId', 'employeeName', 'department', 'date',
    'checkInTime', 'checkInLat', 'checkInLng', 'checkInAccuracy', 'checkInAddress', 'checkInPlaceId', 'checkInPhotoRef',
    'checkOutTime', 'checkOutLat', 'checkOutLng', 'checkOutAccuracy', 'checkOutAddress', 'checkOutPlaceId', 'checkOutPhotoRef',
    'attendanceType', 'workingHours', 'overtimeHours', 'status', 'verificationStatus',
    'correctionRequested', 'correctionReason', 'correctionStatus',
    'regularizationType', 'requestedCheckInTime', 'requestedCheckOutTime', 'requestedStatus', 'requestedAttendanceType',
    'regularizedBy', 'regularizedAt',
    'notes', 'eventId'
  ],
  Attendance_Location_History: [
    'historyId', 'employeeId', 'employeeName', 'department', 'date',
    'timestamp', 'latitude', 'longitude', 'accuracy', 'address', 'placeId',
    'attendanceType', 'speedMps', 'headingDeg', 'distanceFromPrevMeters', 'mapsUrl',
    'source', 'verificationStatus'
  ],
  Live_Location: [
    'employeeId', 'employeeName', 'department', 'reportingManagerName',
    'latitude', 'longitude', 'accuracy', 'address', 'placeId',
    'attendanceType', 'speedMps', 'headingDeg', 'locationPermissionStatus', 'mapsUrl', 'shiftCheckedInAt',
    'isSharingActive', 'lastUpdatedAt'
  ],
  Leave_Types: ['leaveTypeId', 'name', 'code', 'annualQuota', 'isPaid', 'requiresDocument'],
  Leave_Applications: [
    'leaveId', 'employeeId', 'employeeName', 'department', 'leaveTypeId', 'leaveTypeName',
    'startDate', 'endDate', 'isHalfDay', 'halfDaySession', 'totalDays', 'reason',
    'documentUrl', 'status', 'reviewedBy', 'reviewerRole', 'rejectionReason', 'appliedAt', 'updatedAt'
  ],
  Leave_Balances: ['balanceId', 'employeeId', 'leaveTypeId', 'leaveTypeName', 'year', 'allocated', 'used', 'remaining'],
  Holidays: ['holidayId', 'date', 'name', 'type', 'description', 'isOptional'],
  Salary_Structure: [
    'structureId', 'employeeId', 'basicSalary', 'hra', 'conveyanceAllowance', 'specialAllowance',
    'overtimeHourlyRate', 'pfApplicable', 'pfEmployeePercent', 'pfEmployerPercent', 'pfWageCap',
    'esiApplicable', 'esiEmployeePercent', 'esiEmployerPercent', 'ptApplicable', 'ptMonthlyAmount',
    'tdsMonthlyAmount', 'otherFixedDeduction', 'updatedAt'
  ],
  Payroll: [
    'payrollId', 'month', 'employeeId', 'employeeName', 'department', 'designation',
    'workingDaysInMonth', 'presentDays', 'paidLeaveDays', 'unpaidLeaveDays', 'overtimeHours',
    'overtimeHourlyRateApplied', 'overtimeBasicPercentApplied',
    'basicEarned', 'hraEarned', 'allowancesEarned', 'overtimePay', 'incentives', 'grossEarnings',
    'unpaidDeduction', 'pfDeduction', 'esiDeduction', 'professionalTax', 'tdsDeduction',
    'otherDeductions', 'totalDeductions', 'netPayable', 'status', 'approvedBy', 'generatedAt', 'paidAt'
  ],
  Payslips: ['payslipId', 'payrollId', 'month', 'employeeId', 'generatedAt', 'pdfDriveUrl'],
  Performance_Reviews: [
    'reviewId', 'employeeId', 'employeeName', 'department', 'cycleType', 'periodLabel',
    'reviewerId', 'reviewerName', 'criteriaJson', 'selfAssessmentScore', 'selfAssessmentNotes',
    'managerRating', 'managerFeedback', 'hrComments', 'strengths', 'improvementAreas', 'status', 'updatedAt'
  ],
  Performance_KPIs: ['kpiId', 'employeeId', 'title', 'targetValue', 'achievedValue', 'weightPercent', 'period'],
  Tasks: [
    'taskId', 'title', 'description', 'assignedToId', 'assignedToName', 'department',
    'assignedById', 'assignedByName', 'priority', 'deadline', 'targetMetric',
    'progressPercent', 'status', 'completionEvidence', 'managerComments', 'createdAt', 'updatedAt'
  ],
  Notifications: ['notificationId', 'recipientEmployeeId', 'category', 'title', 'message', 'isRead', 'createdAt'],
  Documents: ['documentId', 'employeeId', 'documentType', 'fileName', 'fileUrl', 'mimeType', 'verificationStatus', 'verifiedBy', 'uploadedAt'],
  Audit_Logs: ['logId', 'timestamp', 'actorUserId', 'actorName', 'actorRole', 'action', 'module', 'targetId', 'details'],
  App_Settings: ['settingKey', 'settingValue', 'updatedAt'],
  Login_History: ['sessionId', 'userId', 'employeeId', 'role', 'tokenHash', 'expiresAt', 'loginAt', 'status', 'userAgent'],
  Sync_Queue: ['eventId', 'employeeId', 'type', 'deviceTimestamp', 'serverReceivedAt', 'verificationStatus', 'payloadJson'],
  Password_Reset_OTPs: [
    'otpId', 'userId', 'employeeId', 'employeeName', 'userEmail', 'userRole',
    'otpCode', 'otpHash', 'otpSalt', 'status', 'attempts', 'dispatchedTo',
    'emailSent', 'expiresAt', 'createdAt', 'usedAt'
  ],
  Travel_Conveyance: [
    'claimId', 'employeeId', 'employeeName', 'department', 'designation', 'travelDate',
    'vehicleType', 'ratePerKm',
    'fromAddress', 'fromLat', 'fromLng', 'fromAccuracy', 'fromPlaceId', 'fromMapsUrl', 'startedAt',
    'toAddress', 'toLat', 'toLng', 'toAccuracy', 'toPlaceId', 'toMapsUrl', 'endedAt',
    'waypointsJson', 'gpsTrackedDistanceKm', 'googleRouteDistanceKm', 'distanceKm', 'distanceSource',
    'routeDurationText', 'routePolyline', 'claimAmount', 'purpose', 'remarks', 'status',
    'submittedAt', 'reviewedBy', 'reviewerRole', 'reviewedAt', 'rejectionReason', 'paidAt', 'updatedAt'
  ],
  Food_Allowances: [
    'claimId', 'employeeId', 'employeeName', 'department', 'designation', 'date',
    'mealType', 'amount', 'checkInTime', 'checkOutTime', 'claimedAt', 'notes', 'status',
    'reviewedBy', 'reviewerRole', 'reviewedAt', 'rejectionReason', 'paidAt', 'updatedAt'
  ]
};

function initializeDatabase() {
  var ss = getSpreadsheet_();
  var sheetKeys = Object.keys(SHEET_SCHEMA);

  sheetKeys.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    var headers = SHEET_SCHEMA[name];
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length)
        .setBackground('#0B1B36')
        .setFontColor('#FFFFFF')
        .setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  });

  var deptSheet = ss.getSheetByName(SHEET_NAMES.DEPARTMENTS);
  if (deptSheet && deptSheet.getLastRow() <= 1) {
    var deptNow = new Date().toISOString();
    deptSheet.getRange(2, 1, 6, 5).setValues([
      ['DEPT-EXEC', 'Executive & Administration', 'EXEC', '', deptNow],
      ['DEPT-HR', 'Human Resources', 'HR', '', deptNow],
      ['DEPT-OPS', 'Operations & Field Services', 'OPS', '', deptNow],
      ['DEPT-ENG', 'Engineering & Projects', 'ENG', '', deptNow],
      ['DEPT-FIN', 'Finance & Accounts', 'FIN', '', deptNow],
      ['DEPT-SALES', 'Sales & Business Development', 'SALES', '', deptNow]
    ]);
  }

  var desSheet = ss.getSheetByName(SHEET_NAMES.DESIGNATIONS);
  if (desSheet && desSheet.getLastRow() <= 1) {
    desSheet.getRange(2, 1, 10, 5).setValues([
      ['DES-MD', 'Managing Director', 'Executive & Administration', 'L1', 'ACTIVE'],
      ['DES-ED', 'Executive Director', 'Executive & Administration', 'L1', 'ACTIVE'],
      ['DES-HRM', 'HR Manager', 'Human Resources', 'L2', 'ACTIVE'],
      ['DES-HRE', 'HR Executive', 'Human Resources', 'L3', 'ACTIVE'],
      ['DES-OPM', 'Operations Manager', 'Operations & Field Services', 'L2', 'ACTIVE'],
      ['DES-PE', 'Project Engineer', 'Engineering & Projects', 'L3', 'ACTIVE'],
      ['DES-SE', 'Site Engineer', 'Operations & Field Services', 'L3', 'ACTIVE'],
      ['DES-FE', 'Field Executive', 'Operations & Field Services', 'L4', 'ACTIVE'],
      ['DES-ACC', 'Accounts Executive', 'Finance & Accounts', 'L3', 'ACTIVE'],
      ['DES-TECH', 'Technician', 'Operations & Field Services', 'L4', 'ACTIVE']
    ]);
  }

  // Seed essential configuration rows only (no dummy employees)
  var leaveTypesSheet = ss.getSheetByName(SHEET_NAMES.LEAVE_TYPES);
  if (leaveTypesSheet.getLastRow() <= 1) {
    leaveTypesSheet.getRange(2, 1, 6, 6).setValues([
      ['LT-CL', 'Casual Leave', 'CL', 12, true, false],
      ['LT-SL', 'Sick Leave', 'SL', 8, true, true],
      ['LT-EL', 'Earned Leave', 'EL', 15, true, false],
      ['LT-PL', 'Privilege Leave', 'PL', 10, true, false],
      ['LT-UL', 'Unpaid Leave', 'LWP', 365, false, false],
      ['LT-CO', 'Compensatory Off', 'CO', 6, true, false]
    ]);
  }

  var settingsSheet = ss.getSheetByName(SHEET_NAMES.APP_SETTINGS);
  if (settingsSheet.getLastRow() <= 1) {
    var now = new Date().toISOString();
    settingsSheet.getRange(2, 1, 21, 3).setValues([
      ['companyName', COMPANY_CONFIG.COMPANY_NAME, now],
      ['companyCode', COMPANY_CONFIG.COMPANY_CODE, now],
      ['shiftStartTime', '09:30', now],
      ['shiftEndTime', '18:30', now],
      ['lateGraceMinutes', '15', now],
      ['halfDayThresholdHours', '4.5', now],
      ['overtimeEnabled', 'true', now],
      ['overtimeAfterHours', '9', now],
      ['overtimeRateMode', 'BASIC_PERCENT_PER_HOUR', now],
      ['overtimeBasicPercentPerHour', '1.5', now],
      ['conveyanceBikeRatePerKm', '4.5', now],
      ['conveyanceCarRatePerKm', '14', now],
      ['foodAllowanceEnabled', 'true', now],
      ['foodBreakfastAmount', '70', now],
      ['foodLunchAmount', '90', now],
      ['foodDinnerAmount', '90', now],
      ['requireCheckoutSelfie', 'true', now],
      ['locationStaleMinutes', '5', now],
      ['weeklyOffDay', 'Sunday', now],
      ['adminRecoveryEmail', '', now],
      ['holidays2027Seeded', 'true', now]
    ]);
  }

  var holidaysSheet = ss.getSheetByName(SHEET_NAMES.HOLIDAYS);
  if (holidaysSheet && holidaysSheet.getLastRow() <= 1 && typeof INDIAN_HOLIDAYS_2027 !== 'undefined' && INDIAN_HOLIDAYS_2027.length > 0) {
    var holRows = INDIAN_HOLIDAYS_2027.map(function (h) {
      return [h.holidayId, h.date, h.name, h.type, h.description || '', Boolean(h.isOptional)];
    });
    holidaysSheet.getRange(2, 1, holRows.length, 6).setValues(holRows);
  }

  // Remove default empty Sheet1 if present
  var defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1 && defaultSheet.getLastRow() === 0) {
    ss.deleteSheet(defaultSheet);
  }

  initializeDriveFolders();
  return {
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    sheetsCreated: sheetKeys.length
  };
}

function initializeDriveFolders() {
  var props = PropertiesService.getScriptProperties();
  var rootId = props.getProperty('DRIVE_ROOT_FOLDER_ID');
  var rootFolder;
  if (rootId) {
    try {
      rootFolder = DriveApp.getFolderById(rootId);
    } catch (e) {
      rootFolder = null;
    }
  }
  if (!rootFolder) {
    rootFolder = DriveApp.createFolder('IDEAL_HRMS_FILES');
    props.setProperty('DRIVE_ROOT_FOLDER_ID', rootFolder.getId());
  }

  var subFolders = [
    {prop: 'DRIVE_DOCS_FOLDER_ID', name: 'Employee_Documents'},
    {prop: 'DRIVE_SELFIES_FOLDER_ID', name: 'Attendance_Selfies'},
    {prop: 'DRIVE_PAYSLIPS_FOLDER_ID', name: 'Payslips_Archive'}
  ];

  subFolders.forEach(function (item) {
    var existingId = props.getProperty(item.prop);
    var folder = null;
    if (existingId) {
      try {
        folder = DriveApp.getFolderById(existingId);
      } catch (e) {
        folder = null;
      }
    }
    if (!folder) {
      var iter = rootFolder.getFoldersByName(item.name);
      folder = iter.hasNext() ? iter.next() : rootFolder.createFolder(item.name);
      props.setProperty(item.prop, folder.getId());
    }
  });

  return {
    rootFolderId: rootFolder.getId(),
    rootFolderUrl: rootFolder.getUrl()
  };
}

function saveBase64ToDrive_(folderPropKey, fileName, base64DataUrl) {
  if (!base64DataUrl || String(base64DataUrl).indexOf('data:') !== 0) {
    return base64DataUrl || '';
  }
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty(folderPropKey);
  if (!folderId) {
    initializeDriveFolders();
    folderId = props.getProperty(folderPropKey);
  }
  var folder = DriveApp.getFolderById(folderId);
  var parts = base64DataUrl.split(',');
  var meta = parts[0];
  var mimeMatch = meta.match(/data:([^;]+);/);
  var mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  var bytes = Utilities.base64Decode(parts[1]);
  var blob = Utilities.newBlob(bytes, mimeType, fileName);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/uc?export=view&id=' + file.getId();
}
