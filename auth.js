// ─── AUTH — Login, Roles & Account Management ────────────────────────────────
//
// Accounts are stored in localStorage so they persist across sessions and can
// be managed at runtime by any admin without editing code.
//
// ROLES:
//   admin  → full access: dashboard, rooms, bookings, prices, analytics,
//             import/export, account management
//   user   → dashboard + bookings only (add/edit bookings, mark deposits,
//             apply discounts) — no prices, rooms, analytics, or admin tools
// ─────────────────────────────────────────────────────────────────────────────

// ── Default accounts (used only if localStorage has no accounts yet) ──────────
const DEFAULT_ACCOUNTS = {
  admin: { password: 'admin123', role: 'admin', label: 'Administrator', active: true,  createdAt: new Date().toISOString() },
  staff: { password: 'staff123', role: 'user',  label: 'Front Desk',    active: true,  createdAt: new Date().toISOString() },
};

// ── Load / save accounts from localStorage ────────────────────────────────────
function loadAccounts() {
  try {
    const s = localStorage.getItem('hotel_pms_accounts');
    if (s) return JSON.parse(s);
  } catch(e) {}
  return JSON.parse(JSON.stringify(DEFAULT_ACCOUNTS));
}

function saveAccounts() {
  try { localStorage.setItem('hotel_pms_accounts', JSON.stringify(ACCOUNTS)); } catch(e) {}
}

// Live accounts object — mutated at runtime
let ACCOUNTS = loadAccounts();

// ── Pages each role can access ────────────────────────────────────────────────
const ROLE_PAGES = {
  admin: ['dashboard', 'rooms', 'bookings', 'prices', 'analytics', 'accounts'],
  user:  ['dashboard', 'bookings'],
};

// ── Session ───────────────────────────────────────────────────────────────────
let currentUser = null; // { username, role, label }

function loadSession() {
  try {
    const s = sessionStorage.getItem('hotel_pms_session');
    if (s) currentUser = JSON.parse(s);
  } catch(e) {}
}

function saveSession() {
  try { sessionStorage.setItem('hotel_pms_session', JSON.stringify(currentUser)); } catch(e) {}
}

function clearSession() {
  currentUser = null;
  try { sessionStorage.removeItem('hotel_pms_session'); } catch(e) {}
}

// ── Checks ────────────────────────────────────────────────────────────────────
function isAdmin()        { return currentUser?.role === 'admin'; }
function canAccess(page)  { return ROLE_PAGES[currentUser?.role]?.includes(page) ?? false; }
function requireAdmin(fn) { return isAdmin() ? fn() : toast('🚫 Admin access only'); }

// ── Login ─────────────────────────────────────────────────────────────────────
function tryLogin() {
  const username = document.getElementById('loginUsername').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  const errEl    = document.getElementById('loginError');

  const account = ACCOUNTS[username];

  if (!account || account.password !== password) {
    errEl.textContent = 'Incorrect username or password.';
    errEl.style.display = 'block';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginPassword').focus();
    return;
  }
  if (!account.active) {
    errEl.textContent = 'This account has been deactivated. Contact your administrator.';
    errEl.style.display = 'block';
    return;
  }

  currentUser = { username, role: account.role, label: account.label };
  saveSession();
  showApp();
}

function logout() {
  clearSession();
  showLogin();
}

// ── Show / hide screens ───────────────────────────────────────────────────────
function showLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appShell').style.display    = 'none';
  document.getElementById('loginUsername').value = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginError').style.display = 'none';
  setTimeout(() => document.getElementById('loginUsername').focus(), 50);
}

function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appShell').style.display    = 'flex';
  applyRoleUI();
  renderAll();
}

// ── Apply role restrictions to UI ─────────────────────────────────────────────
function applyRoleUI() {
  document.getElementById('sessionUser').textContent = currentUser.label;
  document.getElementById('sessionRole').textContent = currentUser.role === 'admin' ? '🛡 Admin' : '👤 Staff';

  const navMap = {
    'nav-rooms':     ['admin'],
    'nav-prices':    ['admin'],
    'nav-analytics': ['admin'],
    'nav-accounts':  ['admin'],
  };
  for (const [id, roles] of Object.entries(navMap)) {
    const el = document.getElementById(id);
    if (el) el.style.display = roles.includes(currentUser.role) ? '' : 'none';
  }

  const ieBtn = document.querySelector('.ie-btn');
  if (ieBtn) ieBtn.style.display = isAdmin() ? '' : 'none';
}

// ── Guard navigation ──────────────────────────────────────────────────────────
function guardedShowPage(page, el) {
  if (!canAccess(page)) {
    toast('🚫 You don\'t have access to that page');
    return;
  }
  showPage(page, el);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ACCOUNT MANAGEMENT  (admin only)
// ═══════════════════════════════════════════════════════════════════════════════

let editingAccount = null; // username being edited, or null for new

function renderAccountsPage() {
  const accounts = Object.entries(ACCOUNTS);
  const totalAdmins = accounts.filter(([,a]) => a.role === 'admin' && a.active).length;

  let html = `
    <div class="acct-header">
      <div>
        <div class="acct-summary">${accounts.length} account${accounts.length !== 1 ? 's' : ''} · ${totalAdmins} admin${totalAdmins !== 1 ? 's' : ''}</div>
        <div class="acct-hint">Accounts are stored in this browser. Each computer needs its own setup.</div>
      </div>
      <button class="btn btn-primary" onclick="openAccountModal(null)">+ Add account</button>
    </div>
    <div class="acct-list">`;

  for (const [username, acct] of accounts) {
    const isCurrentUser = username === currentUser.username;
    const isSoleAdmin   = acct.role === 'admin' && totalAdmins === 1;
    const roleClass     = acct.role === 'admin' ? 'role-admin' : 'role-user';
    const roleLabel     = acct.role === 'admin' ? '🛡 Admin' : '👤 Staff';
    const statusClass   = acct.active ? 'status-active' : 'status-inactive';
    const statusLabel   = acct.active ? 'Active' : 'Inactive';
    const created       = acct.createdAt
      ? new Date(acct.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
      : '—';

    html += `
      <div class="acct-card ${acct.role === 'admin' ? 'role-admin-card' : 'role-user-card'} ${!acct.active ? 'acct-inactive' : ''}">
        <div class="acct-avatar ${roleClass}">${acct.label.charAt(0).toUpperCase()}</div>
        <div class="acct-info">
          <div class="acct-name">
            ${acct.label}
            ${isCurrentUser ? '<span class="acct-you-badge">You</span>' : ''}
          </div>
          <div class="acct-meta">
            <span class="acct-username">@${username}</span>
            <span class="acct-role-badge ${roleClass}">${roleLabel}</span>
            <span class="acct-status ${statusClass}">${statusLabel}</span>
          </div>
          <div class="acct-created">${created}</div>
        </div>
        <div class="acct-actions">
          <button class="acct-btn" onclick="openAccountModal('${username}')" title="Edit">✎ Edit</button>
          ${!isCurrentUser && !isSoleAdmin
            ? `<button class="acct-btn acct-btn-danger"
                       onclick="confirmDeleteAccount('${username}')"
                       title="Delete">✕ Delete</button>`
            : `<button class="acct-btn acct-btn-disabled" disabled
                       title="${isCurrentUser ? 'Cannot delete your own account' : 'Cannot delete the only admin'}">✕ Delete</button>`}
        </div>
      </div>`;
  }

  html += `</div>`;
  document.getElementById('accountsList').innerHTML = html;
}

// ── Account modal (add / edit) ────────────────────────────────────────────────
function openAccountModal(username) {
  editingAccount = username;
  const isEdit   = username !== null;
  const acct     = isEdit ? ACCOUNTS[username] : null;

  document.getElementById('acctModalTitle').textContent = isEdit ? 'Edit Account' : 'Add Account';

  const adminSel = (!acct || acct.role === 'admin') ? 'selected' : '';
  const userSel  = (acct && acct.role === 'user')   ? 'selected' : '';
  const activeChk = (!acct || acct.active) ? 'checked' : '';
  const totalAdmins = Object.values(ACCOUNTS).filter(a => a.role === 'admin' && a.active).length;
  const isSoleAdmin = isEdit && acct?.role === 'admin' && totalAdmins === 1;

  document.getElementById('acctModalBody').innerHTML = `
    <div class="form-group" style="margin-bottom:12px">
      <label class="form-label">Display name</label>
      <input class="form-input" id="am-label" type="text"
             placeholder="e.g. Front Desk, Night Shift, Manager"
             value="${acct ? acct.label : ''}">
    </div>
    <div class="form-group" style="margin-bottom:12px">
      <label class="form-label">Username</label>
      <input class="form-input" id="am-username" type="text"
             placeholder="e.g. frontdesk1"
             value="${username || ''}"
             ${isEdit ? 'readonly style="background:var(--surface2);color:var(--text3)"' : ''}>
      ${isEdit ? '<div style="font-size:11px;color:var(--text3);margin-top:3px">Username cannot be changed after creation.</div>' : ''}
    </div>
    <div class="form-group" style="margin-bottom:12px">
      <label class="form-label">Role</label>
      <select class="form-select" id="am-role" ${isSoleAdmin ? 'disabled' : ''}>
        <option value="admin" ${adminSel}>🛡 Admin — full access</option>
        <option value="user"  ${userSel}>👤 Staff — dashboard &amp; bookings only</option>
      </select>
      ${isSoleAdmin ? '<div style="font-size:11px;color:var(--amber-text);margin-top:3px">⚠ Cannot change — this is the only active admin.</div>' : ''}
    </div>
    <div class="form-group" style="margin-bottom:12px">
      <label class="form-label">${isEdit ? 'New password' : 'Password'}</label>
      <div style="position:relative">
        <input class="form-input" id="am-password" type="password"
               placeholder="${isEdit ? 'Leave blank to keep current password' : 'Set a password'}"
               style="padding-right:40px">
        <button type="button" onclick="togglePwVisibility('am-password', this)"
                style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:14px;color:var(--text3)">👁</button>
      </div>
    </div>
    <div class="form-group" style="margin-bottom:4px">
      <label class="form-label">Confirm password</label>
      <input class="form-input" id="am-confirm" type="password"
             placeholder="${isEdit ? 'Leave blank to keep current password' : 'Repeat password'}">
    </div>
    ${isEdit && username !== currentUser.username ? `
    <div class="form-group" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
      <label class="deposit-check-label" style="font-size:13px">
        <input type="checkbox" id="am-active" ${activeChk}
               ${isSoleAdmin ? 'disabled' : ''}>
        <span>Account is active (can log in)</span>
      </label>
      ${isSoleAdmin ? '<div style="font-size:11px;color:var(--amber-text);margin-top:3px">⚠ Cannot deactivate the only active admin.</div>' : ''}
    </div>` : ''}
    <p id="am-error" style="font-size:12px;color:var(--red);background:var(--red-bg);border:1px solid #fecaca;border-radius:var(--radius-sm);padding:8px 10px;margin-top:10px;display:none"></p>
  `;

  document.getElementById('acctModal').style.display = 'flex';
  document.getElementById('am-label').focus();
}

function togglePwVisibility(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (inp.type === 'password') { inp.type = 'text';     btn.textContent = '🙈'; }
  else                         { inp.type = 'password'; btn.textContent = '👁'; }
}

function saveAccount() {
  const label    = document.getElementById('am-label').value.trim();
  const username = document.getElementById('am-username').value.trim().toLowerCase().replace(/\s+/g, '');
  const role     = document.getElementById('am-role')?.value || (editingAccount ? ACCOUNTS[editingAccount].role : 'user');
  const password = document.getElementById('am-password').value;
  const confirm  = document.getElementById('am-confirm').value;
  const activeEl = document.getElementById('am-active');
  const active   = activeEl ? activeEl.checked : true;
  const errEl    = document.getElementById('am-error');

  const showError = (msg) => { errEl.textContent = msg; errEl.style.display = 'block'; };
  errEl.style.display = 'none';

  // Validation
  if (!label)    { showError('Display name is required.'); return; }
  if (!username) { showError('Username is required.'); return; }
  if (!/^[a-z0-9_]+$/.test(username)) {
    showError('Username can only contain lowercase letters, numbers, and underscores.');
    return;
  }

  const isEdit = editingAccount !== null;

  if (!isEdit && ACCOUNTS[username]) {
    showError(`Username "@${username}" is already taken.`);
    return;
  }

  // Password required for new accounts, optional for edits
  if (!isEdit && !password) { showError('Password is required for new accounts.'); return; }
  if (password && password.length < 4) { showError('Password must be at least 4 characters.'); return; }
  if (password && password !== confirm) { showError('Passwords do not match.'); return; }

  if (isEdit) {
    const acct = ACCOUNTS[editingAccount];
    acct.label  = label;
    acct.role   = role;
    acct.active = active;
    if (password) acct.password = password;
    // If editing own account, update session label
    if (editingAccount === currentUser.username) {
      currentUser.label = label;
      currentUser.role  = role;
      saveSession();
      applyRoleUI();
    }
    toast(`✅ Account @${editingAccount} updated`);
  } else {
    ACCOUNTS[username] = {
      password,
      role,
      label,
      active: true,
      createdAt: new Date().toISOString(),
    };
    toast(`✅ Account @${username} created`);
  }

  saveAccounts();
  closeModal('acctModal');
  renderAccountsPage();
}

function confirmDeleteAccount(username) {
  const acct = ACCOUNTS[username];
  if (!acct) return;
  if (username === currentUser.username) {
    toast('🚫 You cannot delete your own account'); return;
  }
  const totalAdmins = Object.values(ACCOUNTS).filter(a => a.role === 'admin' && a.active).length;
  if (acct.role === 'admin' && totalAdmins <= 1) {
    toast('🚫 Cannot delete the only active admin account'); return;
  }
  if (!confirm(`Delete account "@${username}" (${acct.label})?\n\nThis cannot be undone.`)) return;
  delete ACCOUNTS[username];
  saveAccounts();
  renderAccountsPage();
  toast(`Account @${username} deleted`);
}

// ── Boot ──────────────────────────────────────────────────────────────────────
function bootAuth() {
  loadSession();
  if (currentUser) {
    // Refresh label/role from live accounts in case it changed
    const liveAccount = ACCOUNTS[currentUser.username];
    if (liveAccount && liveAccount.active) {
      currentUser.label = liveAccount.label;
      currentUser.role  = liveAccount.role;
      saveSession();
      showApp();
    } else {
      // Account was deactivated or deleted — force logout
      clearSession();
      showLogin();
    }
  } else {
    showLogin();
  }
}

// ── Enter key on login form ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  ['loginPassword', 'loginUsername'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
  });
});
