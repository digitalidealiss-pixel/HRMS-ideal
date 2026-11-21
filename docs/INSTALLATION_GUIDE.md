# IDEAL HRMS — Installation & Deployment Guide

**Organization:** IDEAL INDUSTRIAL SYNERGY SOLUTIONS PRIVATE LIMITED

## 1. Google Sheets & Google Drive Setup (Apps Script Backend)
1. Open [script.google.com](https://script.google.com) while signed into your company Google Workspace / Google account.
2. Click **New Project** and name it `IDEAL_HRMS_API`.
3. Create 4 script files matching `/google-apps-script/`:
   - `Config.gs`
   - `DatabaseInit.gs`
   - `SecurityAuth.gs`
   - `Code.gs`
4. Select `initializeDatabase` in the top function dropdown and click **Run**.
5. Authorize Google Sheets & Google Drive permissions when prompted.
6. Verify that:
   - A new Google Spreadsheet (`IDEAL_HRMS_MASTER_DATABASE`) with all **23 tabs** is created (check Execution Log or Script Properties `SPREADSHEET_ID`).
   - A Google Drive folder `IDEAL_HRMS_FILES` with subfolders `Employee_Documents`, `Attendance_Selfies`, and `Payslips_Archive` is created.
7. Click **Deploy > New Deployment**:
   - Type: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone** (Authentication & RBAC are enforced inside `Code.gs` via HMAC session tokens).
8. Copy the generated **Web App URL** (`https://script.google.com/macros/s/.../exec`).

## 2. Hostinger Shared Hosting Frontend Upload
1. Open **Hostinger hPanel > Websites > File Manager > public_html**.
2. Upload the entire contents of `/hostinger-deploy/public_html/` (or the Vite production `dist/` build if hosting the full React SPA).
3. Edit `/config/app-config.js` (or configure inside **Login > Backend Endpoint** / **Settings**) and paste your deployed Google Apps Script Web App URL.
4. Enable **SSL / Force HTTPS** in Hostinger hPanel (mandatory for mobile browser Camera `getUserMedia` and GPS `geolocation` permissions).

## 3. Initial Super Admin & Employee Setup
1. Open your domain in Chrome or Safari (`https://hrms.yourdomain.com`).
2. Because the database starts clean with zero dummy accounts, the **Initial Super Admin Setup** screen appears automatically.
3. Enter the Managing Director / Super Admin details and password (min 8 characters) to create `IISS-0001`.
4. Navigate to **Employees > Onboard Employee** to add HR Admins and Employees.
