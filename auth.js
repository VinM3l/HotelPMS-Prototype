// ─── AUTH — Login & Role Access Control ──────────────────────────────────────
//
// ROLES:
//   admin  → full access to everything
//   user   → dashboard + bookings only (read + add/edit bookings, mark deposits)
//            no prices, no room management, no analytics, no import/export
//
// TO CHANGE PASSWORDS: edit the ACCOUNTS object below.
// Passwords are stored as plain strings — fine for an internal local tool.
// ─────────────────────────────────────────────────────────────────────────────

const ACCOUNTS = {
  admin: { password: 'admin123', role: 'admin', label: 'Administrator' },
  staff: { password: 'staff123', role: 'user',  label: 'Front Desk'    },
};

// Pages each role can access
const ROLE_PAGES = {
  admin: ['dashboard', 'rooms', 'bookings', 'prices', 'analytics', 'monthview'],
  user:  ['dashboard', 'bookings', 'monthview'],
};

// ─── Session ──────────────────────────────────────────────────────────────────
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

// ─── Checks ───────────────────────────────────────────────────────────────────
function isAdmin()           { return currentUser?.role === 'admin'; }
function canAccess(page)     { return ROLE_PAGES[currentUser?.role]?.includes(page) ?? false; }
function requireAdmin(fn)    { return isAdmin() ? fn() : toast('🚫 Admin access only'); }

// ─── Login ────────────────────────────────────────────────────────────────────
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

  currentUser = { username, role: account.role, label: account.label };
  saveSession();
  showApp();
}

function logout() {
  clearSession();
  showLogin();
}

// ─── Show/Hide screens ────────────────────────────────────────────────────────
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

// ─── Apply role restrictions to the UI ────────────────────────────────────────
function applyRoleUI() {
  // Update user badge in sidebar
  document.getElementById('sessionUser').textContent  = currentUser.label;
  document.getElementById('sessionRole').textContent  = currentUser.role === 'admin' ? '🛡 Admin' : '👤 Staff';

  // Show/hide nav items based on role
  const navMap = {
    'nav-rooms':     ['admin'],
    'nav-prices':    ['admin'],
    'nav-analytics': ['admin'],
  };
  for (const [id, roles] of Object.entries(navMap)) {
    const el = document.getElementById(id);
    if (el) el.style.display = roles.includes(currentUser.role) ? '' : 'none';
  }

  // Show/hide topbar buttons
  const ieBtn  = document.querySelector('.ie-btn');
  if (ieBtn)  ieBtn.style.display  = isAdmin() ? '' : 'none';

  // Show/hide admin-only page elements
  // (Room management + Add Room button are hidden for user role at render time)
}

// ─── Guard page navigation ────────────────────────────────────────────────────
// Wraps showPage so non-admins can't navigate to restricted pages
const _originalShowPage = typeof showPage === 'function' ? showPage : null;

function guardedShowPage(page, el) {
  if (!canAccess(page)) {
    toast('🚫 You don\'t have access to that page');
    return;
  }
  showPage(page, el);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
function bootAuth() {
  loadSession();
  if (currentUser) {
    showApp();
  } else {
    showLogin();
  }
}

// Allow Enter key on login form
document.addEventListener('DOMContentLoaded', () => {
  const pw = document.getElementById('loginPassword');
  if (pw) pw.addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
  const un = document.getElementById('loginUsername');
  if (un) un.addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
});
