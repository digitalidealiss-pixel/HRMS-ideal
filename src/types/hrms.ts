export type UserRole = 'SUPER_ADMIN' | 'HR_ADMIN' | 'EMPLOYEE';

export type EmploymentStatus = 'ACTIVE' | 'INACTIVE' | 'ON_NOTICE' | 'TERMINATED';

export type AttendanceStatus =
  | 'PRESENT'
  | 'ABSENT'
  | 'LATE'
  | 'HALF_DAY'
  | 'EARLY_DEPARTURE'
  | 'WEEKLY_OFF'
  | 'HOLIDAY'
  | 'ON_LEAVE';

export type SyncVerificationStatus = 'VERIFIED' | 'PENDING_SYNC' | 'DEVICE_CAPTURED_UNVERIFIED' | 'FAILED';

export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export type PayrollStatus = 'DRAFT' | 'APPROVED' | 'PAID';

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED' | 'OVERDUE';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface AuthUser {
  userId: string;
  employeeId: string;
  fullName: string;
  email: string;
  role: UserRole;
  department: string;
  designation: string;
  profilePhotoUrl?: string;
  isFieldEmployee: boolean;
}

export interface EmployeeOnboardingChecklist {
  profileCompleted: boolean;
  photoUploaded: boolean;
  kycVerified: boolean;
  bankDetailsAdded: boolean;
  salaryConfigured: boolean;
  credentialsIssued: boolean;
}

export interface EmployeeRecord {
  employeeId: string;
  fullName: string;
  profilePhotoUrl: string;
  fatherName: string;
  dob: string;
  gender: string;
  mobile: string;
  personalEmail: string;
  officialEmail: string;
  emergencyContact: string;
  currentAddress: string;
  permanentAddress: string;
  dateOfJoining: string;
  department: string;
  designation: string;
  reportingManagerId: string;
  reportingManagerName: string;
  employmentType: 'FULL_TIME' | 'CONTRACT' | 'INTERN' | 'FIELD_OPERATIONS';
  workLocation: string;
  isFieldEmployee: boolean;
  role: UserRole;
  bankName: string;
  bankAccountNumber: string;
  ifscCode: string;
  panNumber: string;
  aadhaarNumber: string;
  status: EmploymentStatus;
  onboardingChecklist: EmployeeOnboardingChecklist;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeDocument {
  documentId: string;
  employeeId: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  verifiedBy?: string;
  uploadedAt: string;
}

export interface DepartmentRecord {
  departmentId: string;
  name: string;
  code: string;
  headEmployeeId: string;
  createdAt: string;
}

export interface DesignationRecord {
  designationId: string;
  title: string;
  department: string;
  level: string;
  status?: 'ACTIVE' | 'INACTIVE';
}

export type RegularizationType =
  | 'MISSED_PUNCH_IN'
  | 'MISSED_PUNCH_OUT'
  | 'FULL_DAY_REGULARIZATION'
  | 'TIMING_CORRECTION'
  | 'ON_DUTY_FIELD'
  | 'ADMIN_ADJUSTMENT';

export interface AttendanceRecord {
  attendanceId: string;
  employeeId: string;
  employeeName: string;
  department: string;
  date: string;
  checkInTime: string;
  checkInLat: number | null;
  checkInLng: number | null;
  checkInAccuracy: number | null;
  checkInAddress?: string;
  checkInPlaceId?: string;
  checkInPhotoRef: string;
  checkOutTime: string;
  checkOutLat: number | null;
  checkOutLng: number | null;
  checkOutAccuracy: number | null;
  checkOutAddress?: string;
  checkOutPlaceId?: string;
  checkOutPhotoRef: string;
  attendanceType: 'OFFICE' | 'FIELD' | 'REMOTE';
  workingHours: number;
  overtimeHours: number;
  status: AttendanceStatus;
  verificationStatus: SyncVerificationStatus;
  correctionRequested?: boolean;
  correctionReason?: string;
  correctionStatus?: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  regularizationType?: RegularizationType;
  requestedCheckInTime?: string;
  requestedCheckOutTime?: string;
  requestedStatus?: AttendanceStatus;
  requestedAttendanceType?: 'OFFICE' | 'FIELD' | 'REMOTE';
  regularizedBy?: string;
  regularizedAt?: string;
  notes?: string;
  eventId?: string;
}

export interface LocationHistoryPoint {
  historyId: string;
  employeeId: string;
  employeeName: string;
  department: string;
  date: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  address?: string;
  placeId?: string;
  attendanceType?: 'OFFICE' | 'FIELD' | 'REMOTE';
  speedMps?: number | null;
  headingDeg?: number | null;
  distanceFromPrevMeters?: number;
  mapsUrl?: string;
  source: 'CHECK_IN' | 'CHECK_OUT' | 'LIVE_TRACK' | 'OFFLINE_DEVICE';
  verificationStatus: SyncVerificationStatus;
}

export interface LiveLocationRecord {
  employeeId: string;
  employeeName: string;
  department: string;
  reportingManagerName: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  address?: string;
  placeId?: string;
  attendanceType?: 'OFFICE' | 'FIELD' | 'REMOTE';
  speedMps?: number | null;
  headingDeg?: number | null;
  locationPermissionStatus?: 'ACTIVE' | 'PERMISSION_DENIED' | 'GPS_UNAVAILABLE' | 'CHECKED_OUT';
  mapsUrl?: string;
  shiftCheckedInAt?: string;
  isFieldEmployee?: boolean;
  distanceTodayMeters?: number;
  isSharingActive: boolean;
  lastUpdatedAt: string;
  isStale?: boolean;
}

export interface LeaveTypeConfig {
  leaveTypeId: string;
  name: string;
  code: string;
  annualQuota: number;
  isPaid: boolean;
  requiresDocument: boolean;
}

export interface LeaveBalanceRecord {
  balanceId: string;
  employeeId: string;
  leaveTypeId: string;
  leaveTypeName: string;
  year: number;
  allocated: number;
  used: number;
  remaining: number;
}

export interface LeaveApplication {
  leaveId: string;
  employeeId: string;
  employeeName: string;
  department: string;
  leaveTypeId: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  halfDaySession?: 'FIRST_HALF' | 'SECOND_HALF';
  totalDays: number;
  reason: string;
  documentUrl?: string;
  status: LeaveStatus;
  reviewedBy?: string;
  reviewerRole?: string;
  rejectionReason?: string;
  appliedAt: string;
  updatedAt: string;
}

export interface HolidayRecord {
  holidayId: string;
  date: string;
  name: string;
  type: 'NATIONAL' | 'REGIONAL' | 'COMPANY';
  description?: string;
  isOptional?: boolean;
}

export interface SalaryStructure {
  structureId: string;
  employeeId: string;
  basicSalary: number;
  hra: number;
  conveyanceAllowance: number;
  specialAllowance: number;
  overtimeHourlyRate: number;
  pfApplicable: boolean;
  pfEmployeePercent: number;
  pfEmployerPercent: number;
  pfWageCap: number;
  esiApplicable: boolean;
  esiEmployeePercent: number;
  esiEmployerPercent: number;
  ptApplicable: boolean;
  ptMonthlyAmount: number;
  tdsMonthlyAmount: number;
  otherFixedDeduction: number;
  updatedAt: string;
}

export interface PayrollRecord {
  payrollId: string;
  month: string; // YYYY-MM
  employeeId: string;
  employeeName: string;
  department: string;
  designation: string;
  workingDaysInMonth: number;
  presentDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  overtimeHours: number;
  overtimeHourlyRateApplied?: number;
  overtimeBasicPercentApplied?: number;
  basicEarned: number;
  hraEarned: number;
  allowancesEarned: number;
  overtimePay: number;
  incentives: number;
  grossEarnings: number;
  unpaidDeduction: number;
  pfDeduction: number;
  esiDeduction: number;
  professionalTax: number;
  tdsDeduction: number;
  otherDeductions: number;
  totalDeductions: number;
  netPayable: number;
  status: PayrollStatus;
  approvedBy?: string;
  generatedAt: string;
  paidAt?: string;
}

export interface PerformanceKPI {
  kpiId: string;
  employeeId: string;
  title: string;
  targetValue: string;
  achievedValue: string;
  weightPercent: number;
  period: string;
}

export interface PerformanceReview {
  reviewId: string;
  employeeId: string;
  employeeName: string;
  department: string;
  cycleType: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  periodLabel: string;
  reviewerId: string;
  reviewerName: string;
  criteria: {
    attendancePunctuality: number;
    workQuality: number;
    productivity: number;
    communication: number;
    teamwork: number;
    discipline: number;
    targetAchievement: number;
    initiative: number;
  };
  selfAssessmentScore: number;
  selfAssessmentNotes: string;
  managerRating: number;
  managerFeedback: string;
  hrComments: string;
  strengths: string;
  improvementAreas: string;
  status: 'SELF_PENDING' | 'MANAGER_REVIEW' | 'COMPLETED';
  updatedAt: string;
}

export interface TaskRecord {
  taskId: string;
  title: string;
  description: string;
  assignedToId: string;
  assignedToName: string;
  department: string;
  assignedById: string;
  assignedByName: string;
  priority: TaskPriority;
  deadline: string;
  targetMetric: string;
  progressPercent: number;
  status: TaskStatus;
  completionEvidence: string;
  managerComments: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationRecord {
  notificationId: string;
  recipientEmployeeId: string; // 'ALL' or specific employeeId
  category:
    | 'ATTENDANCE'
    | 'LEAVE'
    | 'PAYROLL'
    | 'PERFORMANCE'
    | 'TASK'
    | 'TRAVEL'
    | 'FOOD'
    | 'ANNOUNCEMENT'
    | 'SECURITY'
    | 'SYSTEM';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface PasswordResetOtpRecord {
  otpId: string;
  userId: string;
  employeeId: string;
  employeeName: string;
  userEmail: string;
  userRole: UserRole;
  otpCode: string; // '******' once used/expired/revoked
  status: 'PENDING' | 'USED' | 'EXPIRED' | 'REVOKED';
  attempts: number;
  dispatchedTo: string;
  emailSent: boolean;
  expiresAt: string;
  createdAt: string;
  usedAt?: string;
}

export interface AuditLogRecord {
  logId: string;
  timestamp: string;
  actorUserId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  module: string;
  targetId: string;
  details: string;
}

export interface AppSettings {
  companyName: string;
  companyCode: string;
  shiftStartTime: string; // e.g. "09:30"
  shiftEndTime: string;   // e.g. "18:30"
  lateGraceMinutes: number;
  halfDayThresholdHours: number;
  overtimeEnabled?: boolean;
  overtimeAfterHours?: number; // Default 9 hours duty; additional hours counted as overtime
  overtimeRateMode?: 'BASIC_PERCENT_PER_HOUR' | 'FIXED_HOURLY_RATE';
  overtimeBasicPercentPerHour?: number; // Default 1.5 (% of Basic Salary per overtime hour)
  conveyanceBikeRatePerKm?: number; // Default 4.5 INR/km
  conveyanceCarRatePerKm?: number; // Default 14 INR/km
  foodAllowanceEnabled?: boolean;
  foodBreakfastAmount?: number; // Default 70 INR
  foodLunchAmount?: number; // Default 90 INR
  foodDinnerAmount?: number; // Default 90 INR
  requireCheckoutSelfie: boolean;
  locationStaleMinutes: number;
  weeklyOffDay: string; // e.g. "Sunday"
  adminRecoveryEmail?: string;
  otpWebhookUrl?: string;
  gasWebAppUrl?: string;
  holidays2027Seeded?: boolean;
}

export type FoodMealType = 'BREAKFAST' | 'LUNCH' | 'DINNER';

export type FoodAllowanceStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PAID';

export interface FoodAllowanceRecord {
  claimId: string;
  employeeId: string;
  employeeName: string;
  department: string;
  designation: string;
  date: string;
  mealType: FoodMealType;
  amount: number;
  checkInTime: string;
  checkOutTime: string;
  claimedAt: string;
  notes?: string;
  status: FoodAllowanceStatus;
  reviewedBy?: string;
  reviewerRole?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  paidAt?: string;
  updatedAt: string;
}

export interface FoodAllowancePolicy {
  enabled: boolean;
  breakfast: number;
  lunch: number;
  dinner: number;
}

export interface FoodDutyEligibility {
  eligible: boolean;
  reason: string;
  date: string;
  attendanceId: string;
  checkInTime: string;
  checkOutTime: string;
  attendanceStatus: string;
}

export type TravelVehicleType = 'BIKE' | 'CAR';

export type TravelClaimStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PAID';

export type TravelDistanceSource = 'LIVE_GPS_TRAIL' | 'GOOGLE_ROUTES_API';

export interface TravelWaypoint {
  timestamp: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  address?: string;
  placeId?: string;
  speedMps?: number | null;
  distanceFromPrevMeters?: number;
}

export interface TravelClaimRecord {
  claimId: string;
  employeeId: string;
  employeeName: string;
  department: string;
  designation: string;
  travelDate: string;
  vehicleType: TravelVehicleType;
  ratePerKm: number;
  fromAddress: string;
  fromLat: number;
  fromLng: number;
  fromAccuracy: number;
  fromPlaceId?: string;
  fromMapsUrl?: string;
  startedAt: string;
  toAddress?: string;
  toLat?: number | null;
  toLng?: number | null;
  toAccuracy?: number | null;
  toPlaceId?: string;
  toMapsUrl?: string;
  endedAt?: string;
  waypoints: TravelWaypoint[];
  gpsTrackedDistanceKm: number;
  googleRouteDistanceKm: number;
  distanceKm: number;
  distanceSource: TravelDistanceSource;
  routeDurationText?: string;
  routePolyline?: string;
  claimAmount: number;
  purpose: string;
  remarks?: string;
  status: TravelClaimStatus;
  submittedAt?: string;
  reviewedBy?: string;
  reviewerRole?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  paidAt?: string;
  updatedAt: string;
}

export interface OfflineSyncItem {
  eventId: string;
  type: 'CHECK_IN' | 'CHECK_OUT' | 'LOCATION_PING';
  employeeId: string;
  deviceTimestamp: string;
  payload: Record<string, unknown>;
  status: 'PENDING_SYNC' | 'SYNCED' | 'FAILED';
  retryCount: number;
  lastError?: string;
}

export interface DashboardAnalytics {
  kpis: {
    totalEmployees: number;
    activeEmployees: number;
    presentToday: number;
    absentToday: number;
    onLeaveToday: number;
    lateArrivalsToday: number;
    fieldEmployees: number;
    sharingLocationLive: number;
    pendingLeaveRequests: number;
    pendingApprovals: number;
  };
  monthlyAttendanceTrends: {label: string; present: number; absent: number; late: number; onLeave: number}[];
  departmentDistribution: {department: string; count: number}[];
  leaveStatsByType: {type: string; count: number}[];
  punctualityBreakdown: {onTime: number; late: number; earlyDeparture: number};
  workingHoursTrend: {label: string; avgHours: number; overtimeHours: number}[];
  performanceRatings: {label: string; avgRating: number}[];
  payrollExpenditure: {month: string; gross: number; net: number}[];
  departmentProductivity: {department: string; completionRate: number}[];
  taskStats: {status: string; count: number}[];
}
