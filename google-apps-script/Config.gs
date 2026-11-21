/**
 * IDEAL HRMS - Google Apps Script Backend Configuration
 * Company: IDEAL INDUSTRIAL SYNERGY SOLUTIONS PRIVATE LIMITED
 *
 * Setup:
 * 1. Open script.google.com and create a new project bound to or standalone with a Google Sheet.
 * 2. In Project Settings > Script Properties (or run initializeDatabase()), ensure:
 *    - SPREADSHEET_ID (auto-created if blank when running initializeDatabase)
 *    - DRIVE_ROOT_FOLDER_ID (auto-created when running initializeDriveFolders)
 *    - AUTH_HMAC_SECRET (auto-generated CSPRNG secret on first run)
 */

var COMPANY_CONFIG = {
  COMPANY_NAME: 'IDEAL INDUSTRIAL SYNERGY SOLUTIONS PRIVATE LIMITED',
  COMPANY_CODE: 'IISS',
  SESSION_TTL_HOURS: 12,
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_MINUTES: 15,
  LOCATION_STALE_MINUTES: 5,
  RATE_LIMIT_PER_MIN: 90
};

var SHEET_NAMES = {
  EMPLOYEES: 'Employees',
  USERS: 'Users',
  DEPARTMENTS: 'Departments',
  DESIGNATIONS: 'Designations',
  ATTENDANCE: 'Attendance',
  ATTENDANCE_LOCATION_HISTORY: 'Attendance_Location_History',
  LIVE_LOCATION: 'Live_Location',
  LEAVE_TYPES: 'Leave_Types',
  LEAVE_APPLICATIONS: 'Leave_Applications',
  LEAVE_BALANCES: 'Leave_Balances',
  HOLIDAYS: 'Holidays',
  SALARY_STRUCTURE: 'Salary_Structure',
  PAYROLL: 'Payroll',
  PAYSLIPS: 'Payslips',
  PERFORMANCE_REVIEWS: 'Performance_Reviews',
  PERFORMANCE_KPIS: 'Performance_KPIs',
  TASKS: 'Tasks',
  NOTIFICATIONS: 'Notifications',
  DOCUMENTS: 'Documents',
  AUDIT_LOGS: 'Audit_Logs',
  APP_SETTINGS: 'App_Settings',
  LOGIN_HISTORY: 'Login_History',
  SYNC_QUEUE: 'Sync_Queue',
  PASSWORD_RESET_OTPS: 'Password_Reset_OTPs',
  TRAVEL_CONVEYANCE: 'Travel_Conveyance',
  FOOD_ALLOWANCES: 'Food_Allowances'
};

function getSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var ssId = props.getProperty('SPREADSHEET_ID');
  if (ssId) {
    return SpreadsheetApp.openById(ssId);
  }
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    props.setProperty('SPREADSHEET_ID', active.getId());
    return active;
  }
  var created = SpreadsheetApp.create('IDEAL_HRMS_MASTER_DATABASE');
  props.setProperty('SPREADSHEET_ID', created.getId());
  return created;
}

function getHmacSecret_() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('AUTH_HMAC_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + '-' + Utilities.getUuid() + '-' + new Date().getTime();
    props.setProperty('AUTH_HMAC_SECRET', secret);
  }
  return secret;
}
