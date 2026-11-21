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

var INDIAN_HOLIDAYS_2027 = [
  { holidayId: 'IND2027-01', date: '2027-01-01', name: "New Year's Day", type: 'REGIONAL', isOptional: true, description: 'DoPT Restricted / Optional Holiday across India' },
  { holidayId: 'IND2027-02', date: '2027-01-14', name: 'Lohri / Bhogi', type: 'REGIONAL', isOptional: true, description: 'Harvest eve festival observed in North India (Lohri) & South India (Bhogi)' },
  { holidayId: 'IND2027-03', date: '2027-01-15', name: 'Makar Sankranti / Pongal', type: 'REGIONAL', isOptional: false, description: 'Major harvest festival · Magh Bihu, Uttarayan & Thai Pongal' },
  { holidayId: 'IND2027-04', date: '2027-01-26', name: 'Republic Day', type: 'NATIONAL', isOptional: false, description: 'National Gazetted Holiday · Republic Day of India' },
  { holidayId: 'IND2027-05', date: '2027-02-11', name: 'Vasant Panchami / Saraswati Puja', type: 'REGIONAL', isOptional: true, description: 'DoPT Restricted Holiday · Spring festival & Saraswati Puja' },
  { holidayId: 'IND2027-06', date: '2027-02-19', name: 'Chhatrapati Shivaji Maharaj Jayanti', type: 'REGIONAL', isOptional: true, description: 'State Public Holiday (Maharashtra) · Birth anniversary of Chhatrapati Shivaji Maharaj' },
  { holidayId: 'IND2027-07', date: '2027-03-06', name: 'Maha Shivaratri', type: 'REGIONAL', isOptional: false, description: 'Major Pan-India Festival & DoPT Restricted Holiday' },
  { holidayId: 'IND2027-08', date: '2027-03-10', name: 'Id-ul-Fitr (Eid al-Fitr)', type: 'NATIONAL', isOptional: false, description: 'Central Gazetted Holiday (subject to sighting of the moon)' },
  { holidayId: 'IND2027-09', date: '2027-03-22', name: 'Holi (Dhulandi / Panchang)', type: 'REGIONAL', isOptional: true, description: 'Rangwali Holi per Drik Panchang (Holika Dahan: 21 Mar 2027)' },
  { holidayId: 'IND2027-10', date: '2027-03-23', name: 'Holi (Central Govt Gazetted)', type: 'NATIONAL', isOptional: false, description: 'Central Government Gazetted Holiday per DoPT 2027 Order' },
  { holidayId: 'IND2027-11', date: '2027-03-26', name: 'Good Friday', type: 'NATIONAL', isOptional: false, description: 'Central Gazetted Holiday' },
  { holidayId: 'IND2027-12', date: '2027-04-07', name: 'Ugadi / Gudi Padwa', type: 'REGIONAL', isOptional: true, description: 'Chaitra Sukhladi / Lunar New Year across Maharashtra, Karnataka, AP & Telangana' },
  { holidayId: 'IND2027-13', date: '2027-04-14', name: 'Dr. B.R. Ambedkar Jayanti / Baisakhi', type: 'REGIONAL', isOptional: false, description: 'Birth anniversary of Dr. B.R. Ambedkar, Vaisakhi & Vishu' },
  { holidayId: 'IND2027-14', date: '2027-04-15', name: 'Ram Navami', type: 'NATIONAL', isOptional: false, description: 'Central Gazetted Holiday · Sri Rama Navami' },
  { holidayId: 'IND2027-15', date: '2027-04-19', name: 'Mahavir Jayanti', type: 'NATIONAL', isOptional: false, description: 'Central Gazetted Holiday · Birth anniversary of Lord Mahavira' },
  { holidayId: 'IND2027-16', date: '2027-05-01', name: 'Maharashtra Day / May Day', type: 'REGIONAL', isOptional: true, description: 'International Labour Day & State Formation Day (Maharashtra / Gujarat)' },
  { holidayId: 'IND2027-17', date: '2027-05-17', name: 'Id-ul-Zuha (Bakrid)', type: 'NATIONAL', isOptional: false, description: 'Central Gazetted Holiday (subject to sighting of the moon)' },
  { holidayId: 'IND2027-18', date: '2027-05-20', name: 'Buddha Purnima', type: 'NATIONAL', isOptional: false, description: 'Central Gazetted Holiday · Vesak' },
  { holidayId: 'IND2027-19', date: '2027-06-16', name: 'Muharram', type: 'NATIONAL', isOptional: false, description: 'Central Gazetted Holiday (subject to sighting of the moon)' },
  { holidayId: 'IND2027-20', date: '2027-08-15', name: 'Independence Day & Milad-un-Nabi', type: 'NATIONAL', isOptional: false, description: 'National Gazetted Holiday · Independence Day (coincides with Id-e-Milad)' },
  { holidayId: 'IND2027-21', date: '2027-08-17', name: 'Raksha Bandhan', type: 'REGIONAL', isOptional: true, description: 'DoPT Restricted Holiday · Raksha Bandhan' },
  { holidayId: 'IND2027-22', date: '2027-08-25', name: 'Janmashtami (Vaishnava)', type: 'NATIONAL', isOptional: false, description: 'Central Gazetted Holiday · Sri Krishna Janmashtami' },
  { holidayId: 'IND2027-23', date: '2027-09-04', name: 'Ganesh Chaturthi', type: 'REGIONAL', isOptional: false, description: 'Major Regional & DoPT Restricted Holiday · Vinayaka Chaturthi' },
  { holidayId: 'IND2027-24', date: '2027-09-12', name: 'Onam (Thiruvonam)', type: 'REGIONAL', isOptional: true, description: 'Kerala Harvest Festival · DoPT Restricted Holiday' },
  { holidayId: 'IND2027-25', date: '2027-10-02', name: 'Mahatma Gandhi Jayanti', type: 'NATIONAL', isOptional: false, description: 'National Gazetted Holiday · Birth anniversary of Mahatma Gandhi' },
  { holidayId: 'IND2027-26', date: '2027-10-07', name: 'Maha Ashtami (Durga Puja)', type: 'REGIONAL', isOptional: true, description: 'Durga Puja Ashtami · DoPT Restricted Holiday' },
  { holidayId: 'IND2027-27', date: '2027-10-09', name: 'Dussehra (Vijaya Dashami)', type: 'NATIONAL', isOptional: false, description: 'Central Gazetted Holiday · Vijaya Dashami' },
  { holidayId: 'IND2027-28', date: '2027-10-29', name: 'Diwali (Deepavali)', type: 'NATIONAL', isOptional: false, description: 'Central Gazetted Holiday · Festival of Lights' },
  { holidayId: 'IND2027-29', date: '2027-10-31', name: 'Bhai Duj', type: 'REGIONAL', isOptional: true, description: 'DoPT Restricted Holiday · Bhai Dooj' },
  { holidayId: 'IND2027-30', date: '2027-11-04', name: 'Chhath Puja (Pratihar Shashthi)', type: 'REGIONAL', isOptional: true, description: 'DoPT Restricted Holiday · Surya Shashthi' },
  { holidayId: 'IND2027-31', date: '2027-11-14', name: 'Guru Nanak Jayanti', type: 'NATIONAL', isOptional: false, description: 'Central Gazetted Holiday · Guru Nanak Gurpurab' },
  { holidayId: 'IND2027-32', date: '2027-12-25', name: 'Christmas Day', type: 'NATIONAL', isOptional: false, description: 'Central Gazetted Holiday · Christmas' }
];
