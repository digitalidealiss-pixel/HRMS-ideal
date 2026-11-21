# IDEAL HRMS — Production Testing Checklist

1. **Database & Drive Initialization**
   - [ ] Verify all 23 Google Sheets tabs exist with frozen header rows.
   - [ ] Verify Drive folders (`Employee_Documents`, `Attendance_Selfies`, `Payslips_Archive`) exist.
2. **Authentication & Security**
   - [ ] Verify Initial Super Admin setup creates `IISS-0001` with salted password hash.
   - [ ] Verify failed login lockout triggers after 5 invalid attempts.
   - [ ] Verify `EMPLOYEE` login cannot access Admin routes (`getAuditLogs`, `createEmployee`, `generatePayroll`).
3. **Employee Onboarding**
   - [ ] Onboard an employee with compressed photo, bank details, PAN/Aadhaar, and onboarding checklist.
   - [ ] Upload and verify a KYC document.
4. **Mobile Attendance (Camera + GPS)**
   - [ ] Test Check-In on mobile browser over HTTPS: confirm selfie capture, GPS lat/lng + accuracy, and `ATT-...` creation.
   - [ ] Verify duplicate check-in on the same date is blocked.
   - [ ] Test Check-Out: verify working hours and overtime calculation.
5. **Offline PWA & Sync**
   - [ ] Enable Airplane Mode / Offline in DevTools, perform Check-In, verify record enters IndexedDB (`PENDING_SYNC`).
   - [ ] Restore connectivity and verify automatic sync marks server record `DEVICE_CAPTURED_UNVERIFIED`.
6. **Live GPS Tracking**
   - [ ] Toggle Start/Stop Location Sharing; verify Leaflet map marker & daily movement polyline.
   - [ ] Verify locations older than 5 minutes are marked **Stale / Inactive**.
7. **Leave, Indian Payroll, Performance, Tasks & Reports**
   - [ ] Apply leave, approve as HR Admin, and confirm leave balance decrements dynamically.
   - [ ] Configure PF/ESI/PT/TDS structure, run monthly payroll, approve, and download PDF Payslip.
   - [ ] Export CSV and PDF reports from the Reports Center.
