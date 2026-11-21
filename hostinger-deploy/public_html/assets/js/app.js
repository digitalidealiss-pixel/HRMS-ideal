(function () {
  const user = window.IdealApi.getUser();
  if (!window.IdealApi.getToken() || !user) {
    window.location.replace('/login.html');
    return;
  }

  function esc(val) {
    return String(val == null ? '' : val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try { await window.IdealApi.call('logout'); } catch {}
      window.IdealApi.clearSession();
      window.location.replace('/login.html');
    });
  }

  window.addEventListener('online', () => {
    window.IdealApi.syncOfflineQueue();
  });

  // Admin Console Initialization
  const kpiRow = document.getElementById('kpiRow');
  if (kpiRow) {
    document.getElementById('userLabel').textContent = `${user.fullName} (${user.employeeId}) · ${user.role}`;

    const sidebar = document.getElementById('adminSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    const toggleBtn = document.getElementById('mobileMenuToggle');
    const closeBtn = document.getElementById('closeSidebarBtn');
    const pageTitle = document.getElementById('pageTitle');
    const tableMount = document.getElementById('tableMount');

    function closeMobileSidebar() {
      if (sidebar) sidebar.classList.remove('open');
      if (backdrop) backdrop.classList.remove('show');
    }

    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.add('open');
        if (backdrop) backdrop.classList.add('show');
      });
    }
    if (closeBtn) closeBtn.addEventListener('click', closeMobileSidebar);
    if (backdrop) backdrop.addEventListener('click', closeMobileSidebar);

    async function renderSection(section) {
      if (!tableMount) return;
      tableMount.innerHTML = '<div class="small text-muted">Loading records...</div>';
      try {
        if (section === 'attendance') {
          pageTitle.textContent = 'Attendance, Regularization & GPS Logs';
          const [attRes, empRes] = await Promise.all([
            window.IdealApi.call('getAttendance', {}),
            window.IdealApi.call('getEmployees', {})
          ]);
          const recs = attRes.records || [];
          const emps = empRes.employees || [];
          const today = new Date().toISOString().slice(0, 10);

          tableMount.innerHTML =
            `<div class="mb-4 p-3 rounded border bg-light">
              <div class="fw-semibold small mb-2">Admin Direct Attendance Regularization / Edit</div>
              <form id="adminRegForm" class="row g-2 small">
                <div class="col-12 col-md-3">
                  <select id="adminRegEmp" class="form-select form-select-sm" required>
                    ${emps.map((e) => `<option value="${esc(e.employeeId)}">${esc(e.employeeId)} — ${esc(e.fullName)}</option>`).join('')}
                  </select>
                </div>
                <div class="col-6 col-md-2"><input id="adminRegDate" type="date" value="${today}" required class="form-control form-control-sm" /></div>
                <div class="col-6 col-md-2"><input id="adminRegIn" type="time" value="09:30" class="form-control form-control-sm" /></div>
                <div class="col-6 col-md-2"><input id="adminRegOut" type="time" value="18:30" class="form-control form-control-sm" /></div>
                <div class="col-6 col-md-2">
                  <select id="adminRegStatus" class="form-select form-select-sm">
                    <option value="PRESENT">PRESENT</option>
                    <option value="LATE">LATE</option>
                    <option value="HALF_DAY">HALF_DAY</option>
                    <option value="ON_LEAVE">ON_LEAVE</option>
                    <option value="ABSENT">ABSENT</option>
                  </select>
                </div>
                <div class="col-12 col-md-1"><button type="submit" class="btn btn-navy btn-sm w-100">Save</button></div>
              </form>
              <div class="small text-success mt-1">Duty beyond 9 hours is automatically calculated as Overtime (supports overnight shifts).</div>
              <div id="adminRegMsg" class="small mt-2 d-none"></div>
            </div>` +
            `<h3 class="h6 fw-semibold mb-3">Attendance Logs (${recs.length})</h3>` +
            `<div class="table-responsive"><table class="table table-sm small mb-0"><thead><tr><th>Employee</th><th>Date</th><th>In / Out</th><th>Hours</th><th>Status &amp; Reg</th><th>Actions</th></tr></thead><tbody>` +
            (recs.slice(0, 40).map((r) => `<tr>
              <td>${esc(r.employeeName)}<div class="text-muted font-monospace">${esc(r.employeeId)}</div></td>
              <td class="tabular-nums">${esc(r.date)}</td>
              <td>${esc((r.checkInTime || '').slice(11, 16) || '—')} – ${esc((r.checkOutTime || '').slice(11, 16) || '—')}${r.checkInAddress ? '<div class="text-muted">' + esc(r.checkInAddress) + '</div>' : ''}</td>
              <td class="tabular-nums">${esc(r.workingHours)}h${Number(r.overtimeHours) > 0 ? ' <span class="text-success fw-semibold">(+' + esc(r.overtimeHours) + 'h OT)</span>' : ''}</td>
              <td><div>${esc(r.status)}</div>${r.correctionStatus && r.correctionStatus !== 'NONE' ? `<div class="text-muted">Reg: ${esc(r.correctionStatus)}${r.correctionReason ? ' · ' + esc(r.correctionReason) : ''}</div>` : ''}</td>
              <td>${r.correctionStatus === 'PENDING'
                ? `<button class="btn btn-success btn-sm py-0 px-2 me-1" data-reg-approve="${esc(r.attendanceId)}">Approve</button><button class="btn btn-danger btn-sm py-0 px-2" data-reg-reject="${esc(r.attendanceId)}">Reject</button>`
                : '—'}</td>
            </tr>`).join('') || '<tr><td colspan="6" class="text-muted">No attendance records yet.</td></tr>') +
            `</tbody></table></div>`;

          const adminRegForm = document.getElementById('adminRegForm');
          if (adminRegForm) {
            adminRegForm.addEventListener('submit', async (e) => {
              e.preventDefault();
              const msgEl = document.getElementById('adminRegMsg');
              try {
                await window.IdealApi.call('adminSaveAttendance', {
                  employeeId: document.getElementById('adminRegEmp').value,
                  date: document.getElementById('adminRegDate').value,
                  checkInTime: document.getElementById('adminRegIn').value,
                  checkOutTime: document.getElementById('adminRegOut').value,
                  status: document.getElementById('adminRegStatus').value,
                  correctionStatus: 'APPROVED',
                  correctionReason: 'Admin portal regularization'
                });
                await renderSection('attendance');
              } catch (err) {
                if (msgEl) {
                  msgEl.className = 'small mt-2 text-danger';
                  msgEl.textContent = err.message;
                }
              }
            });
          }

          tableMount.querySelectorAll('[data-reg-approve]').forEach((btn) => {
            btn.addEventListener('click', async () => {
              await window.IdealApi.call('approveAttendanceCorrection', {
                attendanceId: btn.getAttribute('data-reg-approve'),
                decision: 'APPROVED'
              });
              await renderSection('attendance');
            });
          });
          tableMount.querySelectorAll('[data-reg-reject]').forEach((btn) => {
            btn.addEventListener('click', async () => {
              await window.IdealApi.call('approveAttendanceCorrection', {
                attendanceId: btn.getAttribute('data-reg-reject'),
                decision: 'REJECTED'
              });
              await renderSection('attendance');
            });
          });
        } else if (section === 'roles') {
          pageTitle.textContent = 'Roles / Designations & Departments';
          const empRes = await window.IdealApi.call('getEmployees', {});
          const depts = empRes.departments || [];
          const roles = empRes.designations || [];
          tableMount.innerHTML =
            `<div class="row g-4">
              <div class="col-12 col-lg-7">
                <h3 class="h6 fw-semibold mb-2">Roles &amp; Designations (${roles.length})</h3>
                <form id="hostRoleForm" class="row g-2 mb-3 small">
                  <div class="col-5"><input id="hostRoleTitle" type="text" required placeholder="Role Title" class="form-control form-control-sm" /></div>
                  <div class="col-4">
                    <select id="hostRoleDept" class="form-select form-select-sm">
                      ${depts.map((d) => `<option value="${esc(d.name)}">${esc(d.name)}</option>`).join('')}
                    </select>
                  </div>
                  <div class="col-3"><button type="submit" class="btn btn-navy btn-sm w-100">Add Role</button></div>
                </form>
                <div class="table-responsive"><table class="table table-sm small mb-0"><thead><tr><th>Title</th><th>Department</th><th>Level</th><th>Action</th></tr></thead><tbody>
                  ${roles.map((r) => `<tr><td>${esc(r.title)}</td><td>${esc(r.department)}</td><td class="font-monospace">${esc(r.level)}</td><td><button class="btn btn-outline-danger btn-sm py-0 px-2" data-del-role="${esc(r.designationId)}">Delete</button></td></tr>`).join('') || '<tr><td colspan="4" class="text-muted">No roles configured.</td></tr>'}
                </tbody></table></div>
              </div>
              <div class="col-12 col-lg-5">
                <h3 class="h6 fw-semibold mb-2">Departments (${depts.length})</h3>
                <form id="hostDeptForm" class="row g-2 mb-3 small">
                  <div class="col-6"><input id="hostDeptName" type="text" required placeholder="Department Name" class="form-control form-control-sm" /></div>
                  <div class="col-3"><input id="hostDeptCode" type="text" required placeholder="Code" class="form-control form-control-sm text-uppercase" /></div>
                  <div class="col-3"><button type="submit" class="btn btn-navy btn-sm w-100">Add</button></div>
                </form>
                <div class="table-responsive"><table class="table table-sm small mb-0"><thead><tr><th>Department</th><th>Code</th><th>Action</th></tr></thead><tbody>
                  ${depts.map((d) => `<tr><td>${esc(d.name)}</td><td class="font-monospace">${esc(d.code)}</td><td><button class="btn btn-outline-danger btn-sm py-0 px-2" data-del-dept="${esc(d.departmentId)}">Delete</button></td></tr>`).join('') || '<tr><td colspan="3" class="text-muted">No departments configured.</td></tr>'}
                </tbody></table></div>
              </div>
            </div>`;

          document.getElementById('hostRoleForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await window.IdealApi.call('saveDesignation', {
              title: document.getElementById('hostRoleTitle').value,
              department: document.getElementById('hostRoleDept').value,
              level: 'L3'
            });
            await renderSection('roles');
          });
          document.getElementById('hostDeptForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await window.IdealApi.call('saveDepartment', {
              name: document.getElementById('hostDeptName').value,
              code: document.getElementById('hostDeptCode').value
            });
            await renderSection('roles');
          });
          tableMount.querySelectorAll('[data-del-role]').forEach((btn) => {
            btn.addEventListener('click', async () => {
              await window.IdealApi.call('deleteDesignation', { designationId: btn.getAttribute('data-del-role') });
              await renderSection('roles');
            });
          });
          tableMount.querySelectorAll('[data-del-dept]').forEach((btn) => {
            btn.addEventListener('click', async () => {
              await window.IdealApi.call('deleteDepartment', { departmentId: btn.getAttribute('data-del-dept') });
              await renderSection('roles');
            });
          });
        } else if (section === 'leaves') {
          pageTitle.textContent = 'Leave Applications';
          const leaveRes = await window.IdealApi.call('getLeaveData', {});
          const leaves = leaveRes.applications || [];
          tableMount.innerHTML =
            `<h3 class="h6 fw-semibold mb-3">Leave Requests (${leaves.length})</h3>` +
            `<div class="table-responsive"><table class="table table-sm small mb-0"><thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th>Action</th></tr></thead><tbody>` +
            (leaves.slice(0, 30).map((l) => `<tr>
              <td>${esc(l.employeeName)} (${esc(l.employeeId)})</td>
              <td>${esc(l.leaveTypeName)}</td>
              <td class="tabular-nums">${esc(l.startDate)} to ${esc(l.endDate)}</td>
              <td class="tabular-nums">${esc(l.totalDays)}</td>
              <td>${esc(l.status)}</td>
              <td>${l.status === 'PENDING' ? `<button class="btn btn-success btn-sm py-0 px-2 me-1" data-leave-approve="${esc(l.leaveId)}">Approve</button><button class="btn btn-danger btn-sm py-0 px-2" data-leave-reject="${esc(l.leaveId)}">Reject</button>` : '—'}</td>
            </tr>`).join('') || '<tr><td colspan="6" class="text-muted">No leave requests found.</td></tr>') +
            `</tbody></table></div>`;

          tableMount.querySelectorAll('[data-leave-approve]').forEach((btn) => {
            btn.addEventListener('click', async () => {
              await window.IdealApi.call('reviewLeave', { leaveId: btn.getAttribute('data-leave-approve'), decision: 'APPROVED' });
              await renderSection('leaves');
            });
          });
          tableMount.querySelectorAll('[data-leave-reject]').forEach((btn) => {
            btn.addEventListener('click', async () => {
              await window.IdealApi.call('reviewLeave', { leaveId: btn.getAttribute('data-leave-reject'), decision: 'REJECTED', rejectionReason: 'Declined by Admin' });
              await renderSection('leaves');
            });
          });
        } else if (section === 'location') {
          pageTitle.textContent = 'Admin Live Field GPS & Travel Route Logs';
          const today = new Date().toISOString().slice(0, 10);
          const filterDateEl = document.getElementById('hostGpsDate');
          const filterEmpEl = document.getElementById('hostGpsEmp');
          const chosenDate = (filterDateEl && filterDateEl.value) || today;
          const chosenEmp = (filterEmpEl && filterEmpEl.value) || '';
          const [liveRes, histRes, empRes] = await Promise.all([
            window.IdealApi.call('getLiveLocations', {}),
            window.IdealApi.call('getLocationHistory', { date: chosenDate, employeeId: chosenEmp || undefined }),
            window.IdealApi.call('getEmployees', {})
          ]);
          const live = liveRes.locations || [];
          const hist = histRes.history || [];
          const emps = empRes.employees || [];
          const alerts = live.filter((l) => l.locationPermissionStatus === 'PERMISSION_DENIED' || l.locationPermissionStatus === 'GPS_UNAVAILABLE');

          tableMount.innerHTML =
            `<div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
              <div>
                <h3 class="h6 fw-semibold mb-0">Live Field Employee Locations (${live.length})</h3>
                <div class="small text-muted">Recorded automatically to Live_Location &amp; Attendance_Location_History Google Sheets</div>
              </div>
              <div class="d-flex gap-2">
                <select id="hostGpsEmp" class="form-select form-select-sm">
                  <option value="">All Employees</option>
                  ${emps.map((e) => `<option value="${esc(e.employeeId)}" ${chosenEmp === e.employeeId ? 'selected' : ''}>${esc(e.employeeId)} — ${esc(e.fullName)}</option>`).join('')}
                </select>
                <input id="hostGpsDate" type="date" value="${esc(chosenDate)}" class="form-control form-control-sm" />
                <button id="hostGpsRefreshBtn" type="button" class="btn btn-navy btn-sm">Refresh</button>
              </div>
            </div>` +
            (alerts.length ? `<div class="alert alert-danger small py-2 mb-3"><strong>${alerts.length} GPS Permission Alert(s):</strong> Checked-in field employee(s) currently have Location OFF / denied.</div>` : '') +
            `<div class="table-responsive mb-4"><table class="table table-sm small mb-0"><thead><tr><th>Employee</th><th>Status</th><th>Mode</th><th>Address &amp; Google Maps</th><th>Distance Today</th><th>Last Ping</th></tr></thead><tbody>` +
            (live.map((l) => {
              const isAlert = l.locationPermissionStatus === 'PERMISSION_DENIED' || l.locationPermissionStatus === 'GPS_UNAVAILABLE';
              const mapsHref = l.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.latitude)},${encodeURIComponent(l.longitude)}`;
              const distKm = ((Number(l.distanceTodayMeters || 0)) / 1000).toFixed(2);
              return `<tr>
                <td><strong>${esc(l.employeeName)}</strong><div class="text-muted font-monospace">${esc(l.employeeId)} · ${esc(l.department)}</div></td>
                <td><span class="fw-semibold ${isAlert ? 'text-danger' : l.isStale ? 'text-muted' : 'text-success'}">${isAlert ? 'GPS OFF ALERT' : l.locationPermissionStatus === 'CHECKED_OUT' ? 'Checked Out' : l.isStale ? 'Stale' : 'Live Active'}</span></td>
                <td>${esc(l.attendanceType || (l.isFieldEmployee ? 'FIELD' : 'OFFICE'))}</td>
                <td><div>${esc(l.address || 'Coordinates logged')}</div><a href="${esc(mapsHref)}" target="_blank" rel="noopener noreferrer" class="font-monospace">${Number(l.latitude).toFixed(5)}, ${Number(l.longitude).toFixed(5)} (±${esc(l.accuracy)}m)</a></td>
                <td class="tabular-nums font-monospace">${distKm} km</td>
                <td class="tabular-nums">${esc(new Date(l.lastUpdatedAt).toLocaleTimeString())}</td>
              </tr>`;
            }).join('') || '<tr><td colspan="6" class="text-muted">No live tracking updates recorded yet.</td></tr>') +
            `</tbody></table></div>` +
            `<h3 class="h6 fw-semibold mb-2">Travel Movement History (${hist.length} points on ${esc(chosenDate)})</h3>` +
            `<div class="table-responsive"><table class="table table-sm small mb-0"><thead><tr><th>Time</th><th>Employee</th><th>Location &amp; Google Maps Link</th><th>Step (m)</th><th>Mode / Source</th></tr></thead><tbody>` +
            (hist.slice().reverse().slice(0, 100).map((h) => {
              const mapsHref = h.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.latitude)},${encodeURIComponent(h.longitude)}`;
              return `<tr>
                <td class="tabular-nums font-monospace">${esc(new Date(h.timestamp).toLocaleTimeString())}</td>
                <td>${esc(h.employeeName)} <span class="text-muted font-monospace">(${esc(h.employeeId)})</span></td>
                <td><div>${esc(h.address || 'GPS Checkpoint')}</div><a href="${esc(mapsHref)}" target="_blank" rel="noopener noreferrer" class="font-monospace">${Number(h.latitude).toFixed(6)}, ${Number(h.longitude).toFixed(6)} (±${esc(h.accuracy)}m)</a></td>
                <td class="tabular-nums font-monospace">+${Math.round(Number(h.distanceFromPrevMeters || 0))}m</td>
                <td>${esc(h.attendanceType || 'FIELD')} / ${esc(h.source)}</td>
              </tr>`;
            }).join('') || '<tr><td colspan="5" class="text-muted">No GPS trail points recorded for this date.</td></tr>') +
            `</tbody></table></div>`;

          document.getElementById('hostGpsRefreshBtn').addEventListener('click', () => renderSection('location'));
          document.getElementById('hostGpsEmp').addEventListener('change', () => renderSection('location'));
          document.getElementById('hostGpsDate').addEventListener('change', () => renderSection('location'));
        } else if (section === 'travel') {
          pageTitle.textContent = 'Travel & Local Conveyance Claims';
          const trvRes = await window.IdealApi.call('getTravelClaims', {});
          const claims = trvRes.claims || [];
          const rates = trvRes.rates || { bike: 4.5, car: 14 };
          tableMount.innerHTML =
            `<div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
              <div>
                <h3 class="h6 fw-semibold mb-0">Travel &amp; Conveyance Register (${claims.length})</h3>
                <div class="small text-muted">Auto Rate Calculator: Bike ₹${esc(rates.bike)}/km · Car ₹${esc(rates.car)}/km</div>
              </div>
              <button id="hostTrvRefreshBtn" type="button" class="btn btn-navy btn-sm">Refresh</button>
            </div>` +
            `<div class="table-responsive"><table class="table table-sm small mb-0"><thead><tr><th>Claim / Date</th><th>Employee</th><th>Location A → Location B</th><th>Mode &amp; Rate</th><th>Distance</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>` +
            (claims.map((c) => {
              const dirUrl = (c.toLat != null && c.toLng != null)
                ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(c.fromLat + ',' + c.fromLng)}&destination=${encodeURIComponent(c.toLat + ',' + c.toLng)}&travelmode=${c.vehicleType === 'CAR' ? 'driving' : 'two-wheeler'}`
                : (c.fromMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.fromLat + ',' + c.fromLng)}`);
              return `<tr>
                <td><strong class="font-monospace">${esc(c.claimId)}</strong><div class="text-muted tabular-nums">${esc(c.travelDate)}</div></td>
                <td>${esc(c.employeeName)}<div class="text-muted font-monospace">${esc(c.employeeId)}</div></td>
                <td>
                  <div><strong>A:</strong> ${esc(c.fromAddress)}</div>
                  <div><strong>B:</strong> ${esc(c.toAddress || 'In Transit')}</div>
                  <a href="${esc(dirUrl)}" target="_blank" rel="noopener noreferrer" class="text-primary">Open Route in Google Maps</a>
                  ${c.purpose ? `<div class="text-muted">Purpose: ${esc(c.purpose)}</div>` : ''}
                </td>
                <td>${esc(c.vehicleType)}<div class="text-muted font-monospace">₹${esc(c.ratePerKm)}/km</div></td>
                <td class="tabular-nums font-monospace">${Number(c.distanceKm || 0).toFixed(2)} km</td>
                <td class="tabular-nums font-monospace fw-bold text-success">₹${Number(c.claimAmount || 0).toFixed(2)}</td>
                <td><strong>${esc(c.status)}</strong>${c.reviewedBy ? `<div class="text-muted">${esc(c.reviewedBy)}</div>` : ''}</td>
                <td>${c.status === 'SUBMITTED'
                  ? `<button class="btn btn-success btn-sm py-0 px-2 me-1" data-trv-act="APPROVED" data-trv-id="${esc(c.claimId)}">Approve</button><button class="btn btn-danger btn-sm py-0 px-2" data-trv-act="REJECTED" data-trv-id="${esc(c.claimId)}">Reject</button>`
                  : c.status === 'APPROVED'
                    ? `<button class="btn btn-primary btn-sm py-0 px-2" data-trv-act="PAID" data-trv-id="${esc(c.claimId)}">Mark Paid</button>`
                    : '—'}</td>
              </tr>`;
            }).join('') || '<tr><td colspan="8" class="text-muted">No travel conveyance claims found.</td></tr>') +
            `</tbody></table></div>`;

          document.getElementById('hostTrvRefreshBtn').addEventListener('click', () => renderSection('travel'));
          tableMount.querySelectorAll('[data-trv-act]').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const decision = btn.getAttribute('data-trv-act');
              await window.IdealApi.call('reviewTravelClaim', {
                claimId: btn.getAttribute('data-trv-id'),
                decision: decision,
                rejectionReason: decision === 'REJECTED' ? 'Declined by Admin' : ''
              });
              await renderSection('travel');
            });
          });
        } else if (section === 'food') {
          pageTitle.textContent = 'Employee Food Allowance (Working Hours Only)';
          const foodRes = await window.IdealApi.call('getFoodAllowances', {});
          const claims = foodRes.claims || [];
          const pol = foodRes.policy || { enabled: true, breakfast: 70, lunch: 90, dinner: 90 };
          tableMount.innerHTML =
            `<div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
              <div>
                <h3 class="h6 fw-semibold mb-0">Food Allowance Register (${claims.length})</h3>
                <div class="small text-muted">Policy Caps: Breakfast ₹${esc(pol.breakfast)} · Lunch ₹${esc(pol.lunch)} · Dinner ₹${esc(pol.dinner)} (Active Check-In Working Hours Only)</div>
              </div>
              <button id="hostFoodRefreshBtn" type="button" class="btn btn-navy btn-sm">Refresh</button>
            </div>` +
            `<div class="table-responsive"><table class="table table-sm small mb-0"><thead><tr><th>Claim / Date</th><th>Employee</th><th>Meal</th><th>Working Window</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>` +
            (claims.map((c) => `<tr>
              <td><strong class="font-monospace">${esc(c.claimId)}</strong><div class="text-muted tabular-nums">${esc(c.date)}</div></td>
              <td>${esc(c.employeeName)}<div class="text-muted font-monospace">${esc(c.employeeId)}</div></td>
              <td><strong>${esc(c.mealType)}</strong>${c.notes ? `<div class="text-muted">${esc(c.notes)}</div>` : ''}</td>
              <td class="font-monospace small tabular-nums">In: ${esc((c.checkInTime || '').slice(11, 19) || '—')}<br/>Out: ${esc(c.checkOutTime ? c.checkOutTime.slice(11, 19) : 'Active')}</td>
              <td class="tabular-nums font-monospace fw-bold text-success">₹${Number(c.amount || 0).toFixed(2)}</td>
              <td><strong>${esc(c.status)}</strong>${c.reviewedBy ? `<div class="text-muted">${esc(c.reviewedBy)}</div>` : ''}</td>
              <td>${c.status === 'SUBMITTED'
                ? `<button class="btn btn-success btn-sm py-0 px-2 me-1" data-food-act="APPROVED" data-food-id="${esc(c.claimId)}">Approve</button><button class="btn btn-danger btn-sm py-0 px-2" data-food-act="REJECTED" data-food-id="${esc(c.claimId)}">Reject</button>`
                : c.status === 'APPROVED'
                  ? `<button class="btn btn-primary btn-sm py-0 px-2" data-food-act="PAID" data-food-id="${esc(c.claimId)}">Mark Paid</button>`
                  : '—'}</td>
            </tr>`).join('') || '<tr><td colspan="7" class="text-muted">No food allowance claims submitted yet.</td></tr>') +
            `</tbody></table></div>`;

          document.getElementById('hostFoodRefreshBtn').addEventListener('click', () => renderSection('food'));
          tableMount.querySelectorAll('[data-food-act]').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const decision = btn.getAttribute('data-food-act');
              await window.IdealApi.call('reviewFoodAllowance', {
                claimId: btn.getAttribute('data-food-id'),
                decision: decision,
                rejectionReason: decision === 'REJECTED' ? 'Declined after working-hours audit' : ''
              });
              await renderSection('food');
            });
          });
        } else if (section === 'payroll') {
          pageTitle.textContent = 'Payroll Register';
          const payRes = await window.IdealApi.call('getPayrollData', {});
          const pay = payRes.payrolls || [];
          tableMount.innerHTML =
            `<h3 class="h6 fw-semibold mb-3">Payroll Records (${pay.length})</h3>` +
            `<div class="table-responsive"><table class="table table-sm small mb-0"><thead><tr><th>Employee</th><th>Month</th><th>OT Pay</th><th>Gross (INR)</th><th>Net Payable (INR)</th><th>Status</th><th>Action</th></tr></thead><tbody>` +
            (pay.slice(0, 30).map((p) => `<tr>
              <td>${esc(p.employeeName)} (${esc(p.employeeId)})</td>
              <td class="tabular-nums">${esc(p.month)}</td>
              <td class="tabular-nums text-success">${Number(p.overtimeHours || 0)}h · +${esc(p.overtimePay || 0)}</td>
              <td class="tabular-nums">${esc(p.grossEarnings)}</td>
              <td class="tabular-nums fw-semibold">${esc(p.netPayable)}</td>
              <td>${esc(p.status)}</td>
              <td>${p.status === 'DRAFT'
                ? `<button class="btn btn-navy btn-sm py-0 px-2" data-pay-status="APPROVED" data-pay-id="${esc(p.payrollId)}">Approve</button>`
                : p.status === 'APPROVED'
                  ? `<button class="btn btn-success btn-sm py-0 px-2" data-pay-status="PAID" data-pay-id="${esc(p.payrollId)}">Mark Paid</button>`
                  : '—'}</td>
            </tr>`).join('') || '<tr><td colspan="6" class="text-muted">No payroll records generated yet.</td></tr>') +
            `</tbody></table></div>`;

          tableMount.querySelectorAll('[data-pay-id]').forEach((btn) => {
            btn.addEventListener('click', async () => {
              await window.IdealApi.call('updatePayrollStatus', {
                payrollId: btn.getAttribute('data-pay-id'),
                status: btn.getAttribute('data-pay-status')
              });
              await renderSection('payroll');
            });
          });
        } else {
          pageTitle.textContent = section === 'employees' ? 'Employee Directory' : 'Executive Overview';
          const empRes = await window.IdealApi.call('getEmployees', {});
          const emps = empRes.employees || [];
          tableMount.innerHTML =
            `<h3 class="h6 fw-semibold mb-3">Employees (${emps.length})</h3>` +
            `<div class="table-responsive"><table class="table table-sm small mb-0"><thead><tr><th>ID</th><th>Name</th><th>Role / Designation</th><th>Department</th><th>Status</th></tr></thead><tbody>` +
            (emps.map((e) => `<tr><td class="tabular-nums">${esc(e.employeeId)}</td><td>${esc(e.fullName)}</td><td>${esc(e.designation)}</td><td>${esc(e.department)}</td><td>${esc(e.status)}</td></tr>`).join('') || '<tr><td colspan="5" class="text-muted">No employees onboarded yet.</td></tr>') +
            `</tbody></table></div>`;
        }
      } catch (err) {
        tableMount.innerHTML = `<div class="small text-danger">${esc(err.message)}</div>`;
      }
    }

    document.querySelectorAll('#adminNav a[data-section]').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('#adminNav a').forEach((a) => a.classList.remove('active'));
        link.classList.add('active');
        closeMobileSidebar();
        renderSection(link.getAttribute('data-section'));
      });
    });

    (async function loadAdmin() {
      const res = await window.IdealApi.call('getDashboardAnalytics', {});
      const k = res.analytics.kpis;
      const cards = [
        ['Total Employees', k.totalEmployees],
        ['Present Today', k.presentToday],
        ['Absent Today', k.absentToday],
        ['Pending Leaves', k.pendingLeaveRequests]
      ];
      kpiRow.innerHTML = cards.map(([label, val]) =>
        `<div class="col-6 col-lg-3"><div class="card-enterprise p-3"><div class="small text-muted">${esc(label)}</div><div class="h4 fw-bold tabular-nums mb-0">${esc(val)}</div></div></div>`
      ).join('');

      const ctx = document.getElementById('adminChart');
      if (ctx && window.Chart) {
        new window.Chart(ctx, {
          type: 'bar',
          data: {
            labels: res.analytics.departmentDistribution.map((d) => d.department),
            datasets: [{ label: 'Active Employees', data: res.analytics.departmentDistribution.map((d) => d.count), backgroundColor: '#0B1B36' }]
          }
        });
      }

      const otpMount = document.getElementById('otpMount');
      if (otpMount) {
        try {
          const otpRes = await window.IdealApi.call('getPasswordResetOtps', {});
          const otps = otpRes.otps || [];
          otpMount.innerHTML =
            `<h3 class="h6 fw-semibold mb-3">Password Reset OTP Dispatch Inbox (${otps.filter((o) => o.status === 'PENDING').length} active)</h3>` +
            (otps.length === 0
              ? '<div class="small text-muted">No password reset OTP requests at this time.</div>'
              : `<div class="table-responsive"><table class="table table-sm small mb-0"><thead><tr><th>Request ID</th><th>User</th><th>6-Digit Numeric OTP</th><th>Status</th><th>Expires</th></tr></thead><tbody>` +
                otps.slice(0, 10).map((o) => `<tr><td class="font-monospace">${esc(o.otpId)}</td><td>${esc(o.employeeName)} (${esc(o.employeeId)} · ${esc(o.userRole)})</td><td class="font-monospace fw-bold">${esc(o.otpCode)}</td><td>${esc(o.status)}</td><td class="font-monospace">${esc(new Date(o.expiresAt).toLocaleString())}</td></tr>`).join('') +
                `</tbody></table></div>`);
        } catch {}
      }

      await renderSection('dashboard');
    })();
  }

  // Employee Portal Initialization
  const checkInBtn = document.getElementById('checkInBtn');
  if (checkInBtn) {
    document.getElementById('empIdentity').textContent = `${user.fullName} (${user.employeeId})`;
    const gpsEl = document.getElementById('gpsDisplay');
    const statusBanner = document.getElementById('empStatusBanner');
    const fieldTrackBanner = document.getElementById('fieldTrackBanner');
    const fieldGpsModal = document.getElementById('fieldGpsModal');
    const fieldGpsModalMsg = document.getElementById('fieldGpsModalMsg');
    const retryGpsBtn = document.getElementById('retryGpsBtn');
    const attTypeSelect = document.getElementById('empAttType');
    if (attTypeSelect && user.isFieldEmployee) attTypeSelect.value = 'FIELD';

    const camVideo = document.getElementById('camPreview');
    const selfiePreviewImg = document.getElementById('selfiePreviewImg');
    const openCamBtn = document.getElementById('openCamBtn');
    const captureCamBtn = document.getElementById('captureCamBtn');
    const selfieInput = document.getElementById('selfieInput');
    const regDateInput = document.getElementById('regDate');
    if (regDateInput) regDateInput.value = new Date().toISOString().slice(0, 10);

    let latestGps = null;
    let capturedSelfieDataUrl = '';
    let activeStream = null;
    let watchId = null;
    let heartbeatTimer = null;
    let lastSentFix = null;
    let lastAlertState = '';
    let fieldTrackingActive = false;

    function haversineM(lat1, lng1, lat2, lng2) {
      const R = 6371000;
      const toRad = (d) => (d * Math.PI) / 180;
      const dLat = toRad(lat2 - lat1);
      const dLng = toRad(lng2 - lng1);
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function showBanner(type, text) {
      if (!statusBanner) return;
      statusBanner.className = `alert alert-${type} small mb-3`;
      statusBanner.textContent = text;
    }

    function setGpsBlock(blocked, msg) {
      if (!fieldGpsModal) return;
      if (blocked) {
        if (fieldGpsModalMsg) fieldGpsModalMsg.textContent = msg;
        fieldGpsModal.classList.remove('d-none');
      } else {
        fieldGpsModal.classList.add('d-none');
      }
    }

    async function sendFieldLocationAlert(status, msg) {
      setGpsBlock(true, msg);
      if (lastAlertState === status) return;
      lastAlertState = status;
      if (!navigator.onLine) return;
      try {
        await window.IdealApi.call('updateLiveLocation', {
          latitude: latestGps ? latestGps.lat : 0,
          longitude: latestGps ? latestGps.lng : 0,
          accuracy: 0,
          address: latestGps ? latestGps.address : '',
          placeId: latestGps ? latestGps.placeId : '',
          attendanceType: (attTypeSelect && attTypeSelect.value) || 'FIELD',
          locationPermissionStatus: status,
          isSharingActive: false,
          deviceTimestamp: new Date().toISOString()
        });
      } catch {}
    }

    async function processWatchFix(pos, force) {
      const lat = Number(pos.coords.latitude.toFixed(6));
      const lng = Number(pos.coords.longitude.toFixed(6));
      const accuracy = Math.round(pos.coords.accuracy || 0);
      const speedMps = pos.coords.speed != null && Number.isFinite(pos.coords.speed) ? Number(pos.coords.speed.toFixed(2)) : null;
      const headingDeg = pos.coords.heading != null && Number.isFinite(pos.coords.heading) ? Number(pos.coords.heading.toFixed(1)) : null;
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      setGpsBlock(false, '');
      lastAlertState = '';
      if (accuracy > 400 && lastSentFix && nowMs - lastSentFix.timeMs < 120000) return;

      const distMoved = lastSentFix ? haversineM(lastSentFix.lat, lastSentFix.lng, lat, lng) : 999999;
      const elapsed = lastSentFix ? nowMs - lastSentFix.timeMs : 999999;

      latestGps = { lat: lat, lng: lng, accuracy: accuracy, address: (lastSentFix && lastSentFix.address) || '', placeId: (lastSentFix && lastSentFix.placeId) || '' };
      gpsEl.textContent = `GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)} (±${accuracy}m)`;

      if (!fieldTrackingActive) return;
      if (!force && lastSentFix && distMoved < 15 && elapsed < 30000) return;

      let address = (lastSentFix && lastSentFix.address) || '';
      let placeId = (lastSentFix && lastSentFix.placeId) || '';
      const needGeo = !lastSentFix || !address || distMoved >= 40 || (nowMs - lastSentFix.geoTimeMs >= 180000);
      if (navigator.onLine && needGeo) {
        try {
          const geo = await window.IdealApi.call('reverseGeocode', { latitude: lat, longitude: lng });
          if (geo && geo.address) {
            address = geo.address;
            placeId = geo.placeId || '';
          }
        } catch {}
      }
      latestGps.address = address;
      latestGps.placeId = placeId;
      gpsEl.textContent = `${address ? address + ' · ' : ''}${lat.toFixed(5)}, ${lng.toFixed(5)} (±${accuracy}m)`;

      const payload = {
        latitude: lat,
        longitude: lng,
        accuracy: accuracy,
        address: address,
        placeId: placeId,
        attendanceType: (attTypeSelect && attTypeSelect.value) || 'FIELD',
        speedMps: speedMps,
        headingDeg: headingDeg,
        locationPermissionStatus: 'ACTIVE',
        isSharingActive: true,
        deviceTimestamp: nowIso
      };

      if (!navigator.onLine) {
        await window.IdealIndexedDb.enqueue({
          eventId: `EVT-LOC-${user.employeeId}-${nowMs}`,
          type: 'LOCATION_PING',
          employeeId: user.employeeId,
          deviceTimestamp: nowIso,
          payload: payload,
          status: 'PENDING_SYNC'
        });
      } else {
        try { await window.IdealApi.call('updateLiveLocation', payload); } catch {}
      }
      lastSentFix = { lat: lat, lng: lng, timeMs: nowMs, address: address, placeId: placeId, geoTimeMs: needGeo ? nowMs : (lastSentFix ? lastSentFix.geoTimeMs : nowMs) };
      if (fieldTrackBanner) {
        fieldTrackBanner.classList.remove('d-none');
        fieldTrackBanner.textContent = `Field Duty GPS Active · Tracking check-in to check-out · Last ping ${new Date(nowMs).toLocaleTimeString()} (±${accuracy}m)`;
      }
    }

    function acquireFreshGps() {
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Geolocation not supported on this browser.'));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const fix = {
              lat: Number(pos.coords.latitude.toFixed(6)),
              lng: Number(pos.coords.longitude.toFixed(6)),
              accuracy: Math.round(pos.coords.accuracy || 0),
              address: '',
              placeId: ''
            };
            latestGps = fix;
            gpsEl.textContent = `GPS: ${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)} (±${fix.accuracy}m)`;
            if (navigator.onLine) {
              try {
                const geo = await window.IdealApi.call('reverseGeocode', { latitude: fix.lat, longitude: fix.lng });
                if (geo && geo.address) {
                  fix.address = geo.address;
                  fix.placeId = geo.placeId || '';
                  gpsEl.textContent = `${geo.address} (${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)} ±${fix.accuracy}m)`;
                }
              } catch {}
            }
            resolve(fix);
          },
          (err) => {
            gpsEl.textContent = 'Enable Location permission in browser settings for GPS check-in.';
            reject(err);
          },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
        );
      });
    }

    function startFieldTrackingLoop() {
      if (fieldTrackingActive) return;
      fieldTrackingActive = true;
      if (fieldTrackBanner) {
        fieldTrackBanner.classList.remove('d-none');
        fieldTrackBanner.textContent = 'Field Duty GPS Active · Mandatory check-in to check-out tracking running...';
      }
      if (!navigator.geolocation) {
        sendFieldLocationAlert('GPS_UNAVAILABLE', 'Geolocation is unsupported on this browser.');
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => processWatchFix(pos, true),
        (err) => sendFieldLocationAlert(err.code === 1 ? 'PERMISSION_DENIED' : 'GPS_UNAVAILABLE', 'Location permission is disabled. Enable device Location to continue Field Duty.'),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
      );
      watchId = navigator.geolocation.watchPosition(
        (pos) => processWatchFix(pos, false),
        (err) => {
          if (err.code === 1) sendFieldLocationAlert('PERMISSION_DENIED', 'Location permission was blocked. Enable browser Location permission immediately.');
          else if (err.code === 2) sendFieldLocationAlert('GPS_UNAVAILABLE', 'GPS sensor unavailable. Turn ON device Location services.');
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
      );
      heartbeatTimer = setInterval(() => {
        if (!fieldTrackingActive) return;
        if (!lastSentFix || Date.now() - lastSentFix.timeMs >= 25000) {
          navigator.geolocation.getCurrentPosition(
            (pos) => processWatchFix(pos, false),
            () => {},
            { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
          );
        }
      }, 15000);
    }

    function stopFieldTrackingLoop() {
      fieldTrackingActive = false;
      if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      if (heartbeatTimer !== null) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      setGpsBlock(false, '');
      if (fieldTrackBanner) fieldTrackBanner.classList.add('d-none');
    }

    if (retryGpsBtn) {
      retryGpsBtn.addEventListener('click', () => {
        lastAlertState = '';
        acquireFreshGps()
          .then(() => {
            setGpsBlock(false, '');
            if (fieldTrackingActive) {
              navigator.geolocation.getCurrentPosition((pos) => processWatchFix(pos, true), () => {}, { enableHighAccuracy: true, maximumAge: 0 });
            }
          })
          .catch((err) => showBanner('danger', err.message || 'Please allow Location permission in browser settings.'));
      });
    }

    if (openCamBtn && camVideo && captureCamBtn) {
      openCamBtn.addEventListener('click', async () => {
        try {
          activeStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
          camVideo.srcObject = activeStream;
          camVideo.classList.remove('d-none');
          captureCamBtn.classList.remove('d-none');
          if (selfiePreviewImg) selfiePreviewImg.classList.add('d-none');
        } catch {
          showBanner('warning', 'Live camera unavailable. Use the photo capture file input below.');
        }
      });

      captureCamBtn.addEventListener('click', () => {
        const canvas = document.createElement('canvas');
        const maxW = 480;
        const ratio = camVideo.videoHeight ? camVideo.videoHeight / camVideo.videoWidth : 0.75;
        canvas.width = maxW;
        canvas.height = Math.round(maxW * ratio);
        canvas.getContext('2d').drawImage(camVideo, 0, 0, canvas.width, canvas.height);
        capturedSelfieDataUrl = canvas.toDataURL('image/jpeg', 0.78);
        if (activeStream) {
          activeStream.getTracks().forEach((t) => t.stop());
          activeStream = null;
        }
        camVideo.classList.add('d-none');
        captureCamBtn.classList.add('d-none');
        if (selfiePreviewImg) {
          selfiePreviewImg.src = capturedSelfieDataUrl;
          selfiePreviewImg.classList.remove('d-none');
        }
      });
    }

    acquireFreshGps().catch(() => {});

    async function readSelfieBase64() {
      if (capturedSelfieDataUrl) return capturedSelfieDataUrl;
      const file = selfieInput && selfieInput.files[0];
      if (!file) return '';
      return new Promise((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.readAsDataURL(file);
      });
    }

    async function punch(type) {
      try {
        const chosenType = (attTypeSelect && attTypeSelect.value) || (user.isFieldEmployee ? 'FIELD' : 'OFFICE');
        const isFieldMandatory = chosenType === 'FIELD' || user.isFieldEmployee;
        let fix = latestGps;
        if (!fix || isFieldMandatory) {
          try {
            fix = await acquireFreshGps();
          } catch (gpsErr) {
            if (isFieldMandatory) {
              showBanner('danger', 'Location is mandatory for Field Duty. Enable GPS/Location permission and retry.');
              return;
            }
          }
        }
        if (isFieldMandatory && (!fix || !fix.lat || !fix.lng)) {
          showBanner('danger', 'Valid GPS coordinates are mandatory for Field Duty.');
          return;
        }

        const selfie = await readSelfieBase64();
        const payload = {
          latitude: fix ? fix.lat : null,
          longitude: fix ? fix.lng : null,
          accuracy: fix ? fix.accuracy : null,
          address: fix ? fix.address : '',
          placeId: fix ? fix.placeId : '',
          selfieDataUrl: selfie,
          attendanceType: chosenType,
          deviceTimestamp: new Date().toISOString()
        };
        if (!navigator.onLine) {
          await window.IdealIndexedDb.enqueue({
            eventId: `EVT-${type}-${user.employeeId}-${Date.now()}`,
            type: type,
            employeeId: user.employeeId,
            deviceTimestamp: payload.deviceTimestamp,
            payload: payload,
            status: 'PENDING_SYNC'
          });
          showBanner('warning', 'Saved offline to IndexedDB queue (Device-Captured / Unverified until sync).');
          if (type === 'CHECK_IN' && isFieldMandatory) startFieldTrackingLoop();
          if (type === 'CHECK_OUT') stopFieldTrackingLoop();
          return;
        }
        await window.IdealApi.call(type === 'CHECK_IN' ? 'checkIn' : 'checkOut', payload);
        if (type === 'CHECK_OUT') stopFieldTrackingLoop();
        location.reload();
      } catch (err) {
        showBanner('danger', err.message || 'Attendance action failed.');
      }
    }

    checkInBtn.addEventListener('click', () => punch('CHECK_IN'));
    document.getElementById('checkOutBtn').addEventListener('click', () => punch('CHECK_OUT'));

    async function loadHistory() {
      const res = await window.IdealApi.call('getAttendance', {});
      const recs = res.records || [];
      const today = new Date().toISOString().slice(0, 10);
      const todayRec = recs.find((r) => r.employeeId === user.employeeId && r.date === today);
      if (todayRec && todayRec.checkInTime && !todayRec.checkOutTime && (user.isFieldEmployee || todayRec.attendanceType === 'FIELD')) {
        if (attTypeSelect) attTypeSelect.value = todayRec.attendanceType || 'FIELD';
        startFieldTrackingLoop();
      } else {
        stopFieldTrackingLoop();
      }

      const mapsLink = (lat, lng, pid) => lat && lng
        ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lat)},${encodeURIComponent(lng)}${pid ? '&query_place_id=' + encodeURIComponent(pid) : ''}" target="_blank" rel="noopener noreferrer" class="ms-1 text-primary">Map</a>`
        : '';
      document.getElementById('empHistoryMount').innerHTML = recs.slice(0, 15).map((r) =>
        `<div class="border-bottom py-2">
          <div class="d-flex justify-content-between"><strong>${esc(r.date)}</strong><span class="tabular-nums">${esc(r.status)} · ${esc(r.workingHours)}h${Number(r.overtimeHours) > 0 ? ' <span class="text-success fw-semibold">(+' + esc(r.overtimeHours) + 'h OT)</span>' : ''}</span></div>
          <div class="small text-muted">In: ${esc((r.checkInTime || '').slice(11, 19) || '—')} ${r.checkInAddress ? '· ' + esc(r.checkInAddress) : ''} ${mapsLink(r.checkInLat, r.checkInLng, r.checkInPlaceId)}</div>
          ${r.checkOutTime ? `<div class="small text-muted">Out: ${esc(r.checkOutTime.slice(11, 19))} ${r.checkOutAddress ? '· ' + esc(r.checkOutAddress) : ''} ${mapsLink(r.checkOutLat, r.checkOutLng, r.checkOutPlaceId)}</div>` : ''}
          ${r.correctionStatus && r.correctionStatus !== 'NONE' ? `<div class="small text-primary mt-1">Regularization: <strong>${esc(r.correctionStatus)}</strong>${r.correctionReason ? ' · ' + esc(r.correctionReason) : ''}</div>` : ''}
        </div>`
      ).join('') || 'No attendance records yet.';
    }

    const empRegForm = document.getElementById('empRegForm');
    if (empRegForm) {
      empRegForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await window.IdealApi.call('regularizeAttendance', {
            date: document.getElementById('regDate').value,
            regularizationType: document.getElementById('regType').value,
            requestedCheckInTime: document.getElementById('regInTime').value,
            requestedCheckOutTime: document.getElementById('regOutTime').value,
            requestedAttendanceType: document.getElementById('regAttType').value,
            requestedStatus: 'PRESENT',
            reason: document.getElementById('regReason').value
          });
          document.getElementById('regReason').value = '';
          showBanner('success', 'Attendance regularization request submitted for HR Admin approval.');
          await loadHistory();
        } catch (err) {
          showBanner('danger', err.message || 'Regularization request failed.');
        }
      });
    }

    // Travel & Local Conveyance (Location A -> Location B) Live Recorder
    const trvVehicle = document.getElementById('trvVehicle');
    const trvPurpose = document.getElementById('trvPurpose');
    const trvStartBtn = document.getElementById('trvStartBtn');
    const trvPingBtn = document.getElementById('trvPingBtn');
    const trvEndBtn = document.getElementById('trvEndBtn');
    const trvCancelBtn = document.getElementById('trvCancelBtn');
    const trvTripSummary = document.getElementById('trvTripSummary');
    const trvAutoCalc = document.getElementById('trvAutoCalc');
    const trvStateBadge = document.getElementById('trvStateBadge');
    const trvClaimsMount = document.getElementById('trvClaimsMount');
    const trvBikeNotice = document.getElementById('trvBikeNotice');
    const trvRateHint = document.getElementById('trvRateHint');

    let trvRates = { bike: 4.5, car: 14 };
    let activeTravelTrip = null;

    function updateTrvCalculatorDisplay() {
      if (!trvAutoCalc || !trvVehicle) return;
      const vt = trvVehicle.value === 'CAR' ? 'CAR' : 'BIKE';
      const rate = vt === 'CAR' ? trvRates.car : trvRates.bike;
      if (trvBikeNotice) trvBikeNotice.classList.toggle('d-none', vt !== 'BIKE');
      const km = activeTravelTrip ? Number(activeTravelTrip.distanceKm || 0) : 0;
      const amt = Math.round(km * rate * 100) / 100;
      trvAutoCalc.textContent = `${km.toFixed(2)} km × ₹${rate.toFixed(2)}/km (${vt}) = ₹${amt.toFixed(2)}`;
    }

    if (trvVehicle) trvVehicle.addEventListener('change', updateTrvCalculatorDisplay);

    async function loadTravelClaims() {
      if (!trvClaimsMount) return;
      try {
        const res = await window.IdealApi.call('getTravelClaims', {});
        const claims = res.claims || [];
        if (res.rates) {
          trvRates = { bike: Number(res.rates.bike || 4.5), car: Number(res.rates.car || 14) };
          if (trvRateHint) trvRateHint.textContent = `Bike ₹${trvRates.bike}/km · Car ₹${trvRates.car}/km`;
          if (trvVehicle && trvVehicle.options.length >= 2) {
            trvVehicle.options[0].textContent = `Bike / Two-Wheeler (₹${trvRates.bike}/km)`;
            trvVehicle.options[1].textContent = `Car / Four-Wheeler (₹${trvRates.car}/km)`;
          }
        }
        activeTravelTrip = claims.find((c) => c.employeeId === user.employeeId && c.status === 'IN_PROGRESS') || null;
        if (activeTravelTrip) {
          if (trvVehicle) trvVehicle.value = activeTravelTrip.vehicleType || 'BIKE';
          if (trvPurpose && activeTravelTrip.purpose && !trvPurpose.value) trvPurpose.value = activeTravelTrip.purpose;
          if (trvStateBadge) trvStateBadge.textContent = `ACTIVE · ${activeTravelTrip.claimId}`;
          if (trvTripSummary) {
            trvTripSummary.innerHTML = `<strong>From (A):</strong> ${esc(activeTravelTrip.fromAddress)}<div class="text-muted">Waypoints: ${(activeTravelTrip.waypoints || []).length}</div>`;
          }
          if (trvStartBtn) trvStartBtn.classList.add('d-none');
          if (trvPingBtn) trvPingBtn.classList.remove('d-none');
          if (trvEndBtn) trvEndBtn.classList.remove('d-none');
          if (trvCancelBtn) trvCancelBtn.classList.remove('d-none');
        } else {
          if (trvStateBadge) trvStateBadge.textContent = 'READY';
          if (trvTripSummary) trvTripSummary.textContent = 'Capture Location A (Start) to begin live Location A → B recording.';
          if (trvStartBtn) trvStartBtn.classList.remove('d-none');
          if (trvPingBtn) trvPingBtn.classList.add('d-none');
          if (trvEndBtn) trvEndBtn.classList.add('d-none');
          if (trvCancelBtn) trvCancelBtn.classList.add('d-none');
        }
        updateTrvCalculatorDisplay();

        trvClaimsMount.innerHTML = claims.slice(0, 10).map((c) => {
          const dirHref = (c.toLat != null && c.toLng != null)
            ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(c.fromLat + ',' + c.fromLng)}&destination=${encodeURIComponent(c.toLat + ',' + c.toLng)}&travelmode=${c.vehicleType === 'CAR' ? 'driving' : 'two-wheeler'}`
            : (c.fromMapsUrl || '#');
          return `<div class="border-bottom py-2">
            <div class="d-flex justify-content-between"><strong>${esc(c.claimId)} · ${esc(c.travelDate)}</strong><span class="font-monospace fw-bold text-success">₹${Number(c.claimAmount || 0).toFixed(2)} (${esc(c.status)})</span></div>
            <div class="small text-muted">A: ${esc(c.fromAddress)} → B: ${esc(c.toAddress || 'In Transit')}</div>
            <div class="small text-muted font-monospace">${Number(c.distanceKm || 0).toFixed(2)} km × ₹${esc(c.ratePerKm)}/km (${esc(c.vehicleType)}) · <a href="${esc(dirHref)}" target="_blank" rel="noopener noreferrer" class="text-primary">Google Maps Route</a></div>
          </div>`;
        }).join('') || 'No travel claims recorded yet.';
      } catch {}
    }

    if (trvStartBtn) {
      trvStartBtn.addEventListener('click', async () => {
        try {
          const fix = await acquireFreshGps();
          await window.IdealApi.call('startTravelTrip', {
            latitude: fix.lat,
            longitude: fix.lng,
            accuracy: fix.accuracy,
            address: fix.address,
            placeId: fix.placeId,
            vehicleType: trvVehicle ? trvVehicle.value : 'BIKE',
            purpose: trvPurpose ? trvPurpose.value.trim() : '',
            deviceTimestamp: new Date().toISOString()
          });
          showBanner('success', 'Trip started at Location A with 100% live GPS.');
          await loadTravelClaims();
        } catch (err) {
          showBanner('danger', err.message || 'Enable live GPS permission to start travel.');
        }
      });
    }

    if (trvPingBtn) {
      trvPingBtn.addEventListener('click', async () => {
        if (!activeTravelTrip) return;
        try {
          const fix = await acquireFreshGps();
          await window.IdealApi.call('addTravelWaypoint', {
            claimId: activeTravelTrip.claimId,
            latitude: fix.lat,
            longitude: fix.lng,
            accuracy: fix.accuracy,
            address: fix.address,
            placeId: fix.placeId,
            force: true,
            deviceTimestamp: new Date().toISOString()
          });
          showBanner('success', 'Live GPS travel checkpoint logged.');
          await loadTravelClaims();
        } catch (err) {
          showBanner('danger', err.message || 'Failed to log GPS checkpoint.');
        }
      });
    }

    if (trvEndBtn) {
      trvEndBtn.addEventListener('click', async () => {
        if (!activeTravelTrip) return;
        const pText = trvPurpose ? trvPurpose.value.trim() : '';
        if (!pText) {
          showBanner('warning', 'Enter the Trip Purpose before ending Location B & submitting your claim.');
          return;
        }
        try {
          const fix = await acquireFreshGps();
          const res = await window.IdealApi.call('completeTravelTrip', {
            claimId: activeTravelTrip.claimId,
            latitude: fix.lat,
            longitude: fix.lng,
            accuracy: fix.accuracy,
            address: fix.address,
            placeId: fix.placeId,
            vehicleType: trvVehicle ? trvVehicle.value : 'BIKE',
            purpose: pText,
            submitNow: true,
            deviceTimestamp: new Date().toISOString()
          });
          if (trvPurpose) trvPurpose.value = '';
          showBanner('success', `Claim submitted! ${Number(res.claim.distanceKm).toFixed(2)} km × ₹${res.claim.ratePerKm}/km = ₹${Number(res.claim.claimAmount).toFixed(2)}`);
          await loadTravelClaims();
        } catch (err) {
          showBanner('danger', err.message || 'Failed to complete travel trip.');
        }
      });
    }

    if (trvCancelBtn) {
      trvCancelBtn.addEventListener('click', async () => {
        if (!activeTravelTrip) return;
        try {
          await window.IdealApi.call('cancelTravelTrip', { claimId: activeTravelTrip.claimId });
          if (trvPurpose) trvPurpose.value = '';
          showBanner('info', 'Active travel trip discarded.');
          await loadTravelClaims();
        } catch (err) {
          showBanner('danger', err.message || 'Failed to discard trip.');
        }
      });
    }

    const foodPolicyHint = document.getElementById('foodPolicyHint');
    const foodDutyBadge = document.getElementById('foodDutyBadge');
    const foodDutyBanner = document.getElementById('foodDutyBanner');
    const foodNotes = document.getElementById('foodNotes');
    const foodClaimsMount = document.getElementById('foodClaimsMount');
    const foodMealBtns = document.querySelectorAll('[data-food-meal]');

    async function loadFoodAllowances() {
      if (!foodClaimsMount) return;
      try {
        const res = await window.IdealApi.call('getFoodAllowances', {});
        const pol = res.policy || { enabled: true, breakfast: 70, lunch: 90, dinner: 90 };
        const shift = res.todayShift || { eligible: false, reason: 'Check in to unlock Food Allowance.' };
        const claims = res.claims || [];
        if (foodPolicyHint) {
          foodPolicyHint.textContent = `Breakfast ₹${pol.breakfast} · Lunch ₹${pol.lunch} · Dinner ₹${pol.dinner} (Active Check-In Duty Only)`;
        }
        if (foodDutyBadge) {
          foodDutyBadge.textContent = !pol.enabled ? 'DISABLED' : (shift.eligible ? 'DUTY VERIFIED' : 'LOCKED');
          foodDutyBadge.className = `small font-monospace fw-semibold ${shift.eligible && pol.enabled ? 'text-success' : 'text-danger'}`;
        }
        if (foodDutyBanner) {
          foodDutyBanner.textContent = pol.enabled ? (shift.reason || '') : 'Food allowance policy is disabled by Super Admin.';
        }

        const todayClaims = claims.filter((c) => c.date === shift.date && c.status !== 'REJECTED');
        foodMealBtns.forEach((btn) => {
          const meal = btn.getAttribute('data-food-meal');
          const amt = meal === 'BREAKFAST' ? pol.breakfast : (meal === 'LUNCH' ? pol.lunch : pol.dinner);
          const already = todayClaims.find((c) => c.mealType === meal);
          const label = meal === 'BREAKFAST' ? 'Breakfast' : (meal === 'LUNCH' ? 'Lunch' : 'Dinner');
          btn.textContent = already ? `${label} Claimed (₹${already.amount})` : `${label} ₹${amt}`;
          btn.disabled = !pol.enabled || !shift.eligible || Boolean(already);
        });

        foodClaimsMount.innerHTML = claims.slice(0, 12).map((c) =>
          `<div class="border-bottom py-2">
            <div class="d-flex justify-content-between"><strong>${esc(c.claimId)} · ${esc(c.mealType)} (${esc(c.date)})</strong><span class="font-monospace fw-bold text-success">₹${Number(c.amount || 0).toFixed(2)} (${esc(c.status)})</span></div>
            <div class="small text-muted font-monospace">Duty In: ${esc((c.checkInTime || '').slice(11, 19) || '—')} · Claimed: ${esc((c.claimedAt || '').slice(11, 19) || '—')}${c.notes ? ' · ' + esc(c.notes) : ''}</div>
          </div>`
        ).join('') || 'No food allowance claims submitted yet.';
      } catch {}
    }

    foodMealBtns.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const mealType = btn.getAttribute('data-food-meal');
        try {
          const res = await window.IdealApi.call('claimFoodAllowance', {
            mealType: mealType,
            notes: foodNotes ? foodNotes.value.trim() : ''
          });
          if (foodNotes) foodNotes.value = '';
          showBanner('success', `${mealType} food allowance claim submitted (₹${Number(res.claim.amount).toFixed(2)}).`);
          await loadFoodAllowances();
        } catch (err) {
          showBanner('danger', err.message || 'Food allowance claim blocked.');
        }
      });
    });

    loadTravelClaims();
    loadFoodAllowances();
    loadHistory();
  }
})();
