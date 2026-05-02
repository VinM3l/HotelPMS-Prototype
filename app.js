// ─── STATE ───────────────────────────────────────────────────────────────────
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

let currentDate       = new Date(TODAY);
let currentHotel      = 'square';
let currentPage       = 'dashboard';
let searchQ           = '';
let filterStatus      = 'all';
let activeRoom        = null;
let activeRmTab       = 'calendar';
let editingBookingId  = null;
let calYear, calMonth;
let analyticsView     = 'month';   // 'day' | 'week' | 'month' | 'year'
let analyticsOffset   = 0;         // offset from current period

// ─── PERSISTENCE ─────────────────────────────────────────────────────────────
function loadState() {
  try { const s = localStorage.getItem('hotel_pms_data'); if (s) return JSON.parse(s); } catch(e) {}
  return null;
}
function saveState() {
  try { localStorage.setItem('hotel_pms_data', JSON.stringify(DB)); } catch(e) {}
}

// ─── ROOM FACTORY ─────────────────────────────────────────────────────────────
function makeRoom(type) {
  const labels = { standard:'Standard Room', family2:'Family Room (2 pax)', family3:'Family Room (3 pax)' };
  return { type, label: labels[type], status: 'vacant' };
}
function squareFloor1() {
  const r = {};
  for (let i = 100; i <= 118; i++) { if (i === 103) continue; r[String(i)] = makeRoom('standard'); }
  return r;
}
function squareFloor2() {
  const r = {};
  for (let i = 201; i <= 222; i++) { if (i === 213) continue; r[String(i)] = makeRoom('family2'); }
  return r;
}

// ─── DEFAULT DB ───────────────────────────────────────────────────────────────
const DEFAULT_DB = {
  hotels: {
    square: {
      name: 'Square Hotel',
      rooms: {
        ...squareFloor1(), ...squareFloor2(),
        '301':makeRoom('family3'),'302':makeRoom('family3'),'303':makeRoom('family3'),
        '304':makeRoom('family3'),'305':makeRoom('family3'),'306':makeRoom('family3'),
        '307':makeRoom('family3'),'308':makeRoom('family3'),'309':makeRoom('family3'),
        'E01':makeRoom('standard'),'E02':makeRoom('standard'),'E03':makeRoom('standard'),
      }
    },
    pool: {
      name: 'Pool Hotel',
      rooms: {
        '101':makeRoom('standard'),'102':makeRoom('standard'),'103':makeRoom('standard'),
        '104':makeRoom('standard'),'105':makeRoom('standard'),'106':makeRoom('standard'),
        '201':makeRoom('family2'),'202':makeRoom('family2'),'203':makeRoom('family2'),
        '204':makeRoom('family2'),'205':makeRoom('family2'),'206':makeRoom('family2'),
      }
    }
  },
  keyDeposits: {},
  bookings: [],
  prices: {
    standard: { T:1500, W:1800, B:1600, AG:1550, EX:1650 },
    family2:  { T:2200, W:2600, B:2350, AG:2300, EX:2400 },
    family3:  { T:2800, W:3200, B:2950, AG:2900, EX:3000 },
  },
  // add-on prices per night
  addons: {
    extraHead: 350,
    extraBed:  500,
  }
};

let DB = loadState() || JSON.parse(JSON.stringify(DEFAULT_DB));

// ── One-time wipe of old sample data ─────────────────────────────────────────
// If the saved data still contains the old sample bookings (Bruce Hunter etc.),
// clear it so the app starts fresh. This runs once then never again.
try {
  const wiped = localStorage.getItem('hotel_pms_wiped_v1');
  if (!wiped) {
    const sampleGuests = ['Bruce Hunter','YAMAGUCHI HIROAKI','Nathalie Vizcayno',
      'OHASHI TAKASHI','Simon Appelgren','Rene de Boer','Mark Pontaneles',
      'Baek Kwangjin','Fernandez Jose Maria','THOMAS KOTKIN','chong su Lee',
      'Niah Jane Acusar','Zaghdoudi Bille','SHIOKAI HIDEICHI','Delfina'];
    const hasSampleData = DB.bookings.some(b => sampleGuests.includes(b.guest));
    if (hasSampleData) {
      DB = JSON.parse(JSON.stringify(DEFAULT_DB));
      saveState();
    }
    localStorage.setItem('hotel_pms_wiped_v1', '1');
  }
} catch(e) {}
if (!DB.keyDeposits) DB.keyDeposits = {};
if (!DB.addons) DB.addons = { extraHead: 350, extraBed: 500 };
// migrate old bookings missing fields
DB.bookings.forEach(b => {
  if (b.extraHead       === undefined) b.extraHead       = 0;
  if (b.extraBed        === undefined) b.extraBed        = 0;
  if (b.discountType    === undefined) b.discountType    = 'none';
  if (b.discountValue   === undefined) b.discountValue   = 0;
  if (b.discountNote    === undefined) b.discountNote    = '';
  if (b.extensions      === undefined) b.extensions      = [];
  // migrate old payment fields → payments array
  if (b.balancePaid !== undefined) delete b.balancePaid;
  if (b.balancePaidDate !== undefined) {
    // convert old single date to payments array entry
    if (b.balancePaidDate) {
      if (!b.payments) b.payments = [];
      if (!b.payments.length) b.payments.push({ amount: 0, date: b.balancePaidDate, note: 'Migrated' });
    }
    delete b.balancePaidDate;
  }
  if (b.payments === undefined) b.payments = [];
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function dateStr(d) { return d.toLocaleDateString('en-PH',{weekday:'short',month:'short',day:'numeric',year:'numeric'}); }
function shortDate(s) { return new Date(s+'T00:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric'}); }
function parseDate(s) { return new Date(s+'T00:00:00'); }
function fmtDate(d)   { return d.toISOString().slice(0,10); }
function sameDay(a,b) { return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
function isInRange(d,ci,co) {
  const ds=new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();
  return ds>=parseDate(ci).getTime()&&ds<=parseDate(co).getTime();
}
function genId() { return 'b'+Date.now()+Math.random().toString(36).slice(2,6); }
function peso(n) { return '₱'+Math.round(n).toLocaleString(); }

function srcLabel(s)  { return {T:'Trip.com',W:'Walk-in',B:'Booking.com',AG:'Agoda',EX:'Expedia'}[s]||s; }
function srcShort(s)  { return {T:'Trip',W:'Walk-in',B:'Bkg',AG:'Agoda',EX:'Expedia'}[s]||s; }
function typeLabel(t) { return {standard:'Standard Room',family2:'Family Room (2 pax)',family3:'Family Room (3 pax)'}[t]||t; }

function sortRoomKeys(keys) {
  return [...keys].sort((a,b)=>{
    const an=/^\d+$/.test(a),bn=/^\d+$/.test(b);
    if(an&&bn) return parseInt(a)-parseInt(b);
    if(an) return -1; if(bn) return 1;
    return a.localeCompare(b);
  });
}

function floors(hotel) {
  const rooms=DB.hotels[hotel].rooms, map={};
  sortRoomKeys(Object.keys(rooms)).forEach(r=>{
    let label;
    if(/^\d+$/.test(r)){
      const f=Math.floor(parseInt(r)/100)*100;
      label=f===100?'Floor 1 (100s)':f===200?'Floor 2 (200s)':f===300?'Floor 3 (300s)':`Floor (${f}s)`;
    } else { label='Extended Rooms'; }
    if(!map[label]) map[label]=[];
    map[label].push(r);
  });
  return map;
}

function getBookingOnDate(hotel,room,date) {
  return DB.bookings.find(b=>b.hotel===hotel&&b.room===room&&isInRange(date,b.checkin,b.checkout))||null;
}
function getRoomStatus(hotel,room,date) {
  const r=DB.hotels[hotel].rooms[room];
  if(!r) return 'vacant';
  if(r.status==='maintenance') return 'maintenance';
  const booking=getBookingOnDate(hotel,room,date);
  if(!booking) return 'vacant';
  // Check if today falls within an extension period
  const exts = booking.extensions || [];
  if(exts.length > 0) {
    // Find which extension window the date falls in
    // Original checkout is booking.checkout before any extensions
    const originalCheckout = exts[0]?.originalCheckout || booking.checkout;
    const origCo = parseDate(originalCheckout);
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if(d > origCo) {
      // In an extension — which number extension?
      // extIndex: 0=first ext (yellow), 1=second ext (green-alt), alternating
      let extIndex = -1;
      for(let i=0; i<exts.length; i++){
        const prevEnd = i===0 ? origCo : parseDate(exts[i-1].checkout);
        const thisEnd = parseDate(exts[i].checkout);
        if(d > prevEnd && d <= thisEnd){ extIndex=i; break; }
      }
      if(extIndex >= 0) return extIndex % 2 === 0 ? 'extended' : 'extended-alt';
    }
  }
  return 'occupied';
}

// ─── INCOME CALCULATION ───────────────────────────────────────────────────────
/**
 * Returns income for a single booking that overlaps the given date range [from, to].
 * Counts only nights that fall within the range.
 */
function bookingIncomeInRange(b, from, to) {
  const ci  = parseDate(b.checkin);
  const co  = parseDate(b.checkout);
  const start = ci < from ? from : ci;
  const end   = co > to   ? to   : co;
  if (start > end) return 0;

  const nights = Math.round((end - start) / 864e5) + 1;
  const roomDef = DB.hotels[b.hotel]?.rooms[b.room];
  if (!roomDef) return 0;
  const baseRate  = (DB.prices[roomDef.type]||{})[b.source] || 0;
  const addonRate = (b.extraHead||0) * (DB.addons.extraHead||0)
                  + (b.extraBed||0)  * (DB.addons.extraBed||0);
  const gross = (baseRate + addonRate) * nights;
  return applyDiscount(gross, b);
}

/** Apply a booking's discount to a gross amount and return net. */
function applyDiscount(gross, b) {
  if (!b || b.discountType === 'none' || !b.discountValue) return gross;
  if (b.discountType === 'percent') {
    const pct = Math.min(100, Math.max(0, parseFloat(b.discountValue)||0));
    return gross * (1 - pct / 100);
  }
  if (b.discountType === 'fixed') {
    return Math.max(0, gross - (parseFloat(b.discountValue)||0));
  }
  return gross;
}

/** Returns the discount amount in pesos for a full booking. */
function bookingDiscountAmount(b) {
  const roomDef = DB.hotels[b.hotel]?.rooms[b.room];
  if (!roomDef) return 0;
  const ci = parseDate(b.checkin), co = parseDate(b.checkout);
  const nights = Math.round((co - ci) / 864e5) + 1;
  const baseRate  = (DB.prices[roomDef.type]||{})[b.source] || 0;
  const addonRate = (b.extraHead||0) * (DB.addons.extraHead||0)
                  + (b.extraBed||0)  * (DB.addons.extraBed||0);
  const gross = (baseRate + addonRate) * nights;
  return gross - applyDiscount(gross, b);
}

// ─── PAYMENT HELPERS ──────────────────────────────────────────────────────────
/** Total amount due for a booking (after discount). */
function bookingTotalDue(b) {
  const roomDef = DB.hotels[b.hotel]?.rooms[b.room];
  if (!roomDef) return 0;
  const ci = parseDate(b.checkin), co = parseDate(b.checkout);
  const nights = Math.round((co - ci) / 864e5) + 1;
  const baseRate  = (DB.prices[roomDef.type]||{})[b.source] || 0;
  const addonRate = (b.extraHead||0)*(DB.addons.extraHead||0)
                  + (b.extraBed||0)*(DB.addons.extraBed||0);
  return applyDiscount((baseRate + addonRate) * nights, b);
}

/** Total amount paid so far across all payment entries. */
function bookingAmountPaid(b) {
  return (b.payments||[]).reduce((s,p) => s + (parseFloat(p.amount)||0), 0);
}

/**
 * Payment status for a booking:
 *   'none'    — no payments recorded
 *   'partial' — some paid, not full
 *   'full'    — paid in full or overpaid
 */
function bookingPaymentStatus(b) {
  const paid  = bookingAmountPaid(b);
  const due   = bookingTotalDue(b);
  if (paid <= 0)          return 'none';
  if (paid >= due)        return 'full';
  return 'partial';
}

/** Last payment date string or null. */
function bookingLastPaymentDate(b) {
  const pmts = b.payments||[];
  if (!pmts.length) return null;
  return pmts[pmts.length-1].date;
}

/**
 * Total income for the current hotel across a date range.
 */
function incomeForRange(hotel, from, to) {
  return DB.bookings
    .filter(b => b.hotel === hotel)
    .reduce((sum, b) => sum + bookingIncomeInRange(b, from, to), 0);
}

/**
 * Income for the current hotel per booking source in a date range.
 */
function incomeBySource(hotel, from, to) {
  const map = {};
  DB.bookings.filter(b => b.hotel === hotel).forEach(b => {
    const inc = bookingIncomeInRange(b, from, to);
    if (inc > 0) map[b.source] = (map[b.source]||0) + inc;
  });
  return map;
}

// ─── KEY DEPOSIT ──────────────────────────────────────────────────────────────
function hasKeyDeposit(id) { return DB.keyDeposits[id] === true; }
function toggleKeyDeposit(id,val) { DB.keyDeposits[id]=val; saveState(); }
function toggleDepositUI(id,val) {
  toggleKeyDeposit(id,val);
  if(activeRoom) renderRoomCalendar();
  renderDashboard();
  if(currentPage==='bookings') renderBookingsPage();
  toast(val?'🔑 Key deposit marked as paid':'Key deposit cleared');
}

function addPayment(id) {
  const b=DB.bookings.find(x=>x.id===id); if(!b) return;
  const amtEl =document.getElementById(`pmt-amt-${id}`);
  const noteEl=document.getElementById(`pmt-note-${id}`);
  const amt   =parseFloat(amtEl?.value)||0;
  if(amt<=0){ toast('Enter an amount greater than 0'); amtEl?.focus(); return; }
  const note=noteEl?.value.trim()||'Payment';
  if(!b.payments) b.payments=[];
  b.payments.push({ amount:amt, date:fmtDate(currentDate), note });
  saveState();
  renderRoomGuest();
  renderDashboard();
  if(currentPage==='bookings') renderBookingsPage();
  const status=bookingPaymentStatus(b);
  toast(status==='full'?`✅ ${peso(amt)} added — balance fully settled!`:`💰 ${peso(amt)} recorded — ${peso(Math.max(0,bookingTotalDue(b)-bookingAmountPaid(b)))} remaining`);
}

function removePayment(id, idx) {
  const b=DB.bookings.find(x=>x.id===id); if(!b||!b.payments) return;
  if(!confirm(`Remove payment of ${peso(b.payments[idx]?.amount)}?`)) return;
  b.payments.splice(idx,1);
  saveState();
  renderRoomGuest();
  renderDashboard();
  if(currentPage==='bookings') renderBookingsPage();
  toast('Payment entry removed');
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function toast(msg) {
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2200);
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
function switchHotel(h,el) {
  currentHotel=h; searchQ=''; filterStatus='all';
  const si=document.getElementById('searchInput'); if(si) si.value='';
  document.querySelectorAll('.hotel-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  renderAll();
}

function showPage(page,el) {
  currentPage=page;
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  const titles={dashboard:'Dashboard',rooms:'Room Management',bookings:'All Bookings',prices:'Room Rates',analytics:'Analytics',accounts:'Account Management'};
  document.getElementById('topbarTitle').textContent=titles[page];
  renderAll();
}

function changeDay(d) {
  currentDate=new Date(currentDate.getFullYear(),currentDate.getMonth(),currentDate.getDate()+d);
  renderAll();
}
function goToday() { currentDate=new Date(TODAY); renderAll(); }
function setSearch(v) { searchQ=v; renderDashboard(); }
function setFilter(v,el) {
  filterStatus=v;
  document.querySelectorAll('.filter-pill').forEach(p=>p.classList.remove('active'));
  el.classList.add('active');
  renderDashboard();
}

function renderAll() {
  document.getElementById('topbarDate').textContent  = dateStr(currentDate);
  document.getElementById('sidebarDate').textContent = new Date().toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'});
  if      (currentPage==='dashboard') renderDashboard();
  else if (currentPage==='rooms')     renderRoomsPage();
  else if (currentPage==='bookings')  renderBookingsPage();
  else if (currentPage==='prices')    renderPricesPage();
  else if (currentPage==='analytics') renderAnalytics();
  else if (currentPage==='accounts')  renderAccountsPage();
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function renderDashboard() {
  const h=currentHotel;
  const roomNums=Object.keys(DB.hotels[h].rooms);
  let occ=0,vac=0,maint=0,noDeposit=0;
  roomNums.forEach(r=>{
    const s=getRoomStatus(h,r,currentDate);
    const isOcc=s==='occupied'||s==='extended'||s==='extended-alt';
    if(isOcc){ occ++; } else if(s==='vacant'){ vac++; } else { maint++; }
    if(isOcc){ const b=getBookingOnDate(h,r,currentDate); if(b&&!hasKeyDeposit(b.id)) noDeposit++; }
  });
  const total=roomNums.length, pct=total>0?Math.round(occ/total*100):0;

  document.getElementById('statsRow').innerHTML=`
    <div class="stat-card"><div class="stat-label">Occupancy</div><div class="stat-val">${pct}%</div><div class="stat-sub">${occ} of ${total} rooms</div></div>
    <div class="stat-card"><div class="stat-label">Occupied</div><div class="stat-val" style="color:var(--green)">${occ}</div></div>
    <div class="stat-card"><div class="stat-label">Vacant</div><div class="stat-val" style="color:var(--blue)">${vac}</div></div>
    <div class="stat-card"><div class="stat-label">No key deposit</div><div class="stat-val" style="color:var(--red)">${noDeposit}</div><div class="stat-sub">of ${occ} occupied</div></div>
  `;

  const floorMap=floors(h);
  let html='';
  for(const [floor,rooms] of Object.entries(floorMap)){
    const filtered=rooms.filter(r=>{
      const s=getRoomStatus(h,r,currentDate);
      const isOcc=s==='occupied'||s==='extended'||s==='extended-alt';
      if(filterStatus==='no-deposit'){
        if(!isOcc) return false;
        const b=getBookingOnDate(h,r,currentDate); if(!b||hasKeyDeposit(b.id)) return false;
      } else if(filterStatus==='occupied'){
        if(!isOcc) return false;
      } else if(filterStatus!=='all'&&s!==filterStatus){ return false; }
      if(searchQ){
        const q=searchQ.toLowerCase();
        if(r.toLowerCase().includes(q)) return true;
        const b=getBookingOnDate(h,r,currentDate); if(b&&b.guest.toLowerCase().includes(q)) return true;
        return false;
      }
      return true;
    });
    if(!filtered.length) continue;
    html+=`<div class="floor-section"><div class="floor-header">${floor}</div><div class="rooms-grid">`;
    filtered.forEach(r=>{
      const status=getRoomStatus(h,r,currentDate);
      const booking=getBookingOnDate(h,r,currentDate);
      const room=DB.hotels[h].rooms[r];
      const prices=DB.prices[room.type]||{};
      const basePrice=prices.T||0;
      const isCheckout=booking&&fmtDate(currentDate)===booking.checkout;
      const isCheckin=booking&&fmtDate(currentDate)===booking.checkin;
      const depositPaid=booking?hasKeyDeposit(booking.id):false;
      const isExtended=status==='extended'||status==='extended-alt';
      const payStatus=booking?bookingPaymentStatus(booking):'none';
      const amtPaid=booking?bookingAmountPaid(booking):0;
      const amtDue=booking?bookingTotalDue(booking):0;
      const balance=amtDue-amtPaid;

      // Card colour: full=green(same), partial=blue, none=normal green/extended
      const cardClass=payStatus==='partial'?'balance-partial'
                     :payStatus==='full'?'balance-full'
                     :(isExtended?status:'');

      // Check for a second booking overlapping today (two guests same room same day)
      const allTodayBookings=DB.bookings.filter(b=>
        b.hotel===h&&b.room===r&&isInRange(currentDate,b.checkin,b.checkout)
      );
      const hasMultiGuest=allTodayBookings.length>1;

      html+=`<div class="room-card ${status} ${cardClass}" data-room="${r}" data-guest-idx="0" onclick="openRoom('${r}')">`;

      // 🔑 key dot — top right
      if((status==='occupied'||isExtended)&&booking)
        html+=`<div class="key-dot ${depositPaid?'key-paid':'key-missing'}" title="${depositPaid?'Deposit paid':'No deposit'}">🔑</div>`;

      // 👥 multi-guest icon — top left, click toggles shown guest
      if(hasMultiGuest)
        html+=`<div class="multi-guest-dot" title="Toggle guests (${allTodayBookings.length} today)"
                    onclick="event.stopPropagation();toggleGuestView('${r}')">👥</div>`;

      html+=`<div class="room-num">Room ${r}</div><div class="room-type-label">${room.label}</div>`;
      if(status==='maintenance'){
        html+=`<div class="maint-label">⚠ Maintenance</div>`;
      } else if(booking){
        const extras=[];
        if(booking.extraHead>0) extras.push(`+${booking.extraHead} head`);
        if(booking.extraBed>0)  extras.push(`+${booking.extraBed} bed`);
        // Always show booking[0] initially; toggleGuestView swaps content
        html+=`<div class="room-guest" data-field="guest">${booking.guest}</div>
          ${extras.length?`<div style="font-size:9px;color:var(--text3);margin-top:1px">${extras.join(' · ')}</div>`:''}
          <div class="room-bottom">
            <span class="src-badge src-${booking.source}" data-field="src-badge">${srcShort(booking.source)}</span>
            <div style="display:flex;gap:3px;flex-wrap:wrap;justify-content:flex-end">
              ${isCheckin&&!isCheckout?'<span class="checkin-badge">Check-in</span>':''}
              ${isCheckout?'<span class="checkout-badge">Checkout</span>':''}
              ${isExtended&&payStatus==='none'?'<span class="extended-badge">Extended</span>':''}
              ${payStatus==='full'?'<span class="paid-badge">Paid ✓</span>':''}
              ${payStatus==='partial'?`<span class="partial-badge">₱${Math.round(balance).toLocaleString()} left</span>`:''}
              ${!depositPaid?'<span class="no-deposit-badge">No deposit</span>':''}
            </div>
          </div>`;
      } else {
        html+=`<div class="vacant-label">Available</div>
          <div class="room-bottom"><span class="room-price-tag">from ${peso(basePrice)}/night</span></div>`;
      }
      html+=`</div>`;
    });
    html+=`</div></div>`;
  }
  if(!html) html=`<div class="empty"><div class="empty-icon">🔍</div>No rooms match your filter.</div>`;
  document.getElementById('roomsArea').innerHTML=html;
}

// Toggle which guest is shown on a multi-guest card (no modal open)
function toggleGuestView(roomNum) {
  const h=currentHotel;
  const card=document.querySelector(`.room-card[data-room="${roomNum}"]`);
  if(!card) return;

  const allBookings=DB.bookings.filter(b=>
    b.hotel===h&&b.room===roomNum&&isInRange(currentDate,b.checkin,b.checkout)
  );
  if(allBookings.length<2) return;

  const currentIdx=parseInt(card.dataset.guestIdx||'0');
  const nextIdx=(currentIdx+1)%allBookings.length;
  card.dataset.guestIdx=nextIdx;

  const b=allBookings[nextIdx];
  const guestEl=card.querySelector('[data-field="guest"]');
  const srcEl  =card.querySelector('[data-field="src-badge"]');
  if(guestEl) guestEl.textContent=b.guest;
  if(srcEl) {
    srcEl.className=`src-badge src-${b.source}`;
    srcEl.textContent=srcShort(b.source);
  }

  // Flash the 👥 icon to signal the swap
  const dot=card.querySelector('.multi-guest-dot');
  if(dot){ dot.style.transform='scale(1.4)'; setTimeout(()=>dot.style.transform='',200); }
}

// ─── ROOM MODAL ───────────────────────────────────────────────────────────────
function openRoom(room) {
  activeRoom=room; calYear=currentDate.getFullYear(); calMonth=currentDate.getMonth();
  const h=currentHotel, r=DB.hotels[h].rooms[room];
  document.getElementById('rmTitle').textContent=`Room ${room}`;
  document.getElementById('rmSub').textContent=`${DB.hotels[h].name} · ${r.label}`;

  // If there's a current guest today, open on the Guest tab
  const todayBooking=getBookingOnDate(h,room,currentDate);
  if(todayBooking) {
    switchRmTab('guest',null);
  } else {
    switchRmTab('calendar',null);
  }
  document.getElementById('roomModal').style.display='flex';
}

function switchRmTab(tab,el) {
  activeRmTab=tab;
  document.querySelectorAll('.modal-tab').forEach(t=>t.classList.remove('active'));
  if(el) {
    el.classList.add('active');
  } else {
    const tabMap={'guest':0,'calendar':1,'details':2};
    const tabs=document.querySelectorAll('.modal-tab');
    if(tabs[tabMap[tab]!==undefined?tabMap[tab]:1]) tabs[tabMap[tab]!==undefined?tabMap[tab]:1].classList.add('active');
  }
  document.getElementById('rmTabGuest').style.display   = tab==='guest'    ? 'block':'none';
  document.getElementById('rmTabCalendar').style.display= tab==='calendar' ? 'block':'none';
  document.getElementById('rmTabDetails').style.display = tab==='details'  ? 'block':'none';
  if(tab==='guest')    renderRoomGuest();
  else if(tab==='calendar') renderRoomCalendar();
  else renderRoomDetails();
}

function renderRoomGuest() {
  const h=currentHotel, room=activeRoom;
  // All bookings active today — could be two guests checking in/out same day
  const todayBookings=DB.bookings.filter(b=>
    b.hotel===h&&b.room===room&&isInRange(currentDate,b.checkin,b.checkout)
  );

  if(!todayBookings.length) {
    document.getElementById('rmTabGuest').innerHTML=`
      <div class="empty"><div class="empty-icon">🚪</div>No guest today.</div>`;
    return;
  }

  let html='';
  todayBookings.forEach((b,idx)=>{
    const paid        = hasKeyDeposit(b.id);
    const payStatus   = bookingPaymentStatus(b);
    const amtPaid     = bookingAmountPaid(b);
    const amtDue      = bookingTotalDue(b);
    const balance     = Math.max(0, amtDue - amtPaid);
    const isCheckin   = fmtDate(currentDate)===b.checkin;
    const isCheckout  = fmtDate(currentDate)===b.checkout;
    const nights      = Math.round((parseDate(b.checkout)-parseDate(b.checkin))/864e5)+1;
    const exts        = b.extensions||[];
    const isExtended  = exts.length>0;

    if(idx>0) html+=`<hr style="border:none;border-top:1px solid var(--border);margin:14px 0">`;

    html+=`<div class="guest-panel">
      <div class="guest-panel-head">
        <div>
          <div class="guest-panel-name">${b.guest}</div>
          <div class="guest-panel-meta">
            <span class="src-badge src-${b.source}">${srcLabel(b.source)}</span>
            ${isCheckin?'<span class="checkin-badge">Checking in today</span>':''}
            ${isCheckout?'<span class="checkout-badge">Checking out today</span>':''}
            ${isExtended?'<span class="extended-badge">Extended ×'+exts.length+'</span>':''}
          </div>
        </div>
      </div>

      <div class="guest-panel-grid">
        <div class="guest-panel-stat"><div class="guest-panel-stat-label">Check-in</div><div class="guest-panel-stat-val">${shortDate(b.checkin)}</div></div>
        <div class="guest-panel-stat"><div class="guest-panel-stat-label">Check-out</div><div class="guest-panel-stat-val">${shortDate(b.checkout)}</div></div>
        <div class="guest-panel-stat"><div class="guest-panel-stat-label">Nights</div><div class="guest-panel-stat-val">${nights}</div></div>
        <div class="guest-panel-stat"><div class="guest-panel-stat-label">Total due</div><div class="guest-panel-stat-val" style="color:var(--green-text)">${peso(amtDue)}</div></div>
      </div>

      ${b.extraHead>0||b.extraBed>0?`
      <div style="font-size:11px;color:var(--text3);margin-bottom:10px">
        ${b.extraHead>0?`+${b.extraHead} extra head · `:''}${b.extraBed>0?`+${b.extraBed} extra bed`:''}
      </div>`:''}

      ${b.discountType&&b.discountType!=='none'&&b.discountValue>0?`
      <div style="font-size:11px;background:var(--amber-bg);border:1px solid #fde68a;border-radius:var(--radius-sm);padding:6px 10px;margin-bottom:10px">
        🏷 ${b.discountType==='percent'?b.discountValue+'% off':peso(b.discountValue)+' off'}
        ${b.discountNote?` — "${b.discountNote}"`:''}
      </div>`:''}

      <!-- Payment tracker -->
      <div class="payment-tracker">
        <div class="payment-tracker-header">
          <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--text2)">💰 Payments</span>
          <div class="payment-summary ${payStatus}">
            ${payStatus==='full'?'Paid in full ✓'
             :payStatus==='partial'?`${peso(amtPaid)} paid · ${peso(balance)} remaining`
             :'No payment recorded'}
          </div>
        </div>

        ${(b.payments||[]).length>0?`
        <div class="payment-history">
          ${(b.payments||[]).map((p,pi)=>`
            <div class="payment-entry">
              <span class="payment-date">${shortDate(p.date)}</span>
              <span class="payment-note">${p.note||'Payment'}</span>
              <span class="payment-amount">${peso(p.amount)}</span>
              <button class="booking-del" onclick="removePayment('${b.id}',${pi})" title="Remove">✕</button>
            </div>`).join('')}
        </div>`:''}

        <div class="payment-add-row" id="payment-add-${b.id}">
          <input class="form-input payment-amount-input" type="number" min="0" step="50"
                 placeholder="${peso(balance||amtDue)}" id="pmt-amt-${b.id}"
                 style="flex:1;min-width:0">
          <input class="form-input" type="text" placeholder="Note (optional)"
                 id="pmt-note-${b.id}" style="flex:2;min-width:0">
          <button class="btn btn-primary" style="flex-shrink:0;font-size:12px;padding:7px 12px"
                  onclick="addPayment('${b.id}')">Add</button>
        </div>
      </div>

      <div class="guest-panel-actions" style="margin-top:10px">
        <button class="guest-action-btn ${paid?'action-active-green':'action-inactive'}"
                onclick="toggleDepositUI('${b.id}',${!paid})">
          🔑 ${paid?'Deposit paid':'Mark deposit paid'}
        </button>
        <button class="guest-action-btn action-yellow"
                onclick="closeModal('roomModal');openExtendStay('${b.id}')">
          ⟳ Extend stay
        </button>
        <button class="guest-action-btn action-edit"
                onclick="editBooking('${b.id}')">
          ✎ Edit booking
        </button>
      </div>
    </div>`;
  });

  document.getElementById('rmTabGuest').innerHTML=html;
}

function renderRoomCalendar() {
  const h=currentHotel,room=activeRoom;
  const roomBookings=DB.bookings.filter(b=>b.hotel===h&&b.room===room);
  const y=calYear,m=calMonth;
  const monthLabel=new Date(y,m,1).toLocaleDateString('en-PH',{month:'long',year:'numeric'});
  const firstDay=new Date(y,m,1).getDay();
  const daysInMonth=new Date(y,m+1,0).getDate();
  const prevDays=new Date(y,m,0).getDate();

  let cal=`<div class="cal-nav">
    <button class="cal-nav-btn" id="cal-prev">&#8592;</button>
    <span class="cal-month-label">${monthLabel}</span>
    <button class="cal-nav-btn" id="cal-next">&#8594;</button>
  </div>
  <div class="cal-grid">
    <div class="cal-dh">Su</div><div class="cal-dh">Mo</div><div class="cal-dh">Tu</div>
    <div class="cal-dh">We</div><div class="cal-dh">Th</div><div class="cal-dh">Fr</div><div class="cal-dh">Sa</div>`;

  for(let i=0;i<firstDay;i++)
    cal+=`<div class="cal-day other"><div class="cal-day-num">${prevDays-firstDay+1+i}</div></div>`;

  for(let d=1;d<=daysInMonth;d++){
    const date=new Date(y,m,d);
    const isToday=sameDay(date,TODAY);
    const booking=roomBookings.find(b=>isInRange(date,b.checkin,b.checkout));
    const isCheckin=booking&&fmtDate(date)===booking.checkin;
    const isCheckout=booking&&fmtDate(date)===booking.checkout;
    let cls='cal-day';
    if(isCheckin) cls+=' checkin-day'; else if(isCheckout) cls+=' checkout-day'; else if(booking) cls+=' has-booking';
    if(isToday) cls+=' is-today';
    cal+=`<div class="${cls}">
      <div class="cal-day-num">${d}</div>
      ${booking?`<div class="cal-booking-chip src-${booking.source}">${booking.guest.split(' ')[0]}</div>`:''}
    </div>`;
  }
  const rem=(firstDay+daysInMonth)%7;
  for(let i=1;i<=(rem?7-rem:0);i++) cal+=`<div class="cal-day other"><div class="cal-day-num">${i}</div></div>`;
  cal+=`</div>`;

  cal+=`<div class="booking-log"><div class="booking-log-title">Guest history</div>`;
  const sorted=[...roomBookings].sort((a,b)=>a.checkin.localeCompare(b.checkin));
  if(!sorted.length) cal+=`<div class="empty" style="padding:16px">No bookings yet.</div>`;
  sorted.forEach(b=>{
    const paid=hasKeyDeposit(b.id);
    const extras=[];
    if(b.extraHead>0) extras.push(`+${b.extraHead} extra head`);
    if(b.extraBed>0)  extras.push(`+${b.extraBed} extra bed`);
    const hasDiscH=b.discountType&&b.discountType!=='none'&&b.discountValue>0;
    const discAmtH=hasDiscH?bookingDiscountAmount(b):0;
    const discLabelH=hasDiscH?(b.discountType==='percent'?`${b.discountValue}% off`:peso(b.discountValue)+' off'):'';
    cal+=`<div class="booking-item">
      <span class="src-badge src-${b.source}" style="flex-shrink:0">${srcLabel(b.source)}</span>
      <div style="flex:1;min-width:0">
        <div class="booking-guest-name" style="display:flex;align-items:center;gap:6px">
          ${b.guest}
          ${hasDiscH?`<span class="disc-badge" title="${b.discountNote||'Deal applied'}">${discLabelH}</span>`:''}
        </div>
        <div class="booking-dates">
          ${shortDate(b.checkin)} – ${shortDate(b.checkout)}${extras.length?' · '+extras.join(', '):''}
          ${hasDiscH?`<span style="color:var(--red-text)"> · −${peso(discAmtH)}</span>`:''}
        </div>
        ${b.discountNote?`<div style="font-size:10px;color:var(--text3);font-style:italic">"${b.discountNote}"</div>`:''}
      </div>
      <button class="key-deposit-toggle ${paid?'deposit-paid':'deposit-missing'}"
              onclick="event.stopPropagation();toggleDepositUI('${b.id}',${!paid})">
        🔑 ${paid?'Paid':'No deposit'}
      </button>
      <span class="key-deposit-toggle ${bookingPaymentStatus(b)==='full'?'deposit-paid':bookingPaymentStatus(b)==='partial'?'balance-paid-btn':'balance-unpaid-btn'}"
            style="cursor:default">
        💰 ${bookingPaymentStatus(b)==='full'?'Settled':bookingPaymentStatus(b)==='partial'?peso(bookingAmountPaid(b))+' paid':'Unpaid'}
      </span>
      <button class="booking-del" onclick="editBooking('${b.id}')">&#9998;</button>
      <button class="booking-del" onclick="deleteBooking('${b.id}')">&#x2715;</button>
    </div>`;
  });
  cal+=`</div>`;

  document.getElementById('rmTabCalendar').innerHTML=cal;
  document.getElementById('cal-prev').onclick=()=>{ calMonth--; if(calMonth<0){calMonth=11;calYear--;} renderRoomCalendar(); };
  document.getElementById('cal-next').onclick=()=>{ calMonth++; if(calMonth>11){calMonth=0;calYear++;} renderRoomCalendar(); };
}

function renderRoomDetails() {
  const h=currentHotel,room=activeRoom,r=DB.hotels[h].rooms[room];
  const prices=DB.prices[r.type]||{};
  document.getElementById('rmTabDetails').innerHTML=`
    <div class="section-title" style="margin-bottom:10px">Room status</div>
    <div class="status-toggle" style="margin-bottom:16px;gap:6px">
      <button class="st-btn ${r.status==='vacant'?'active-vac':''}" onclick="setRoomStatus('vacant')">Vacant</button>
      <button class="st-btn ${r.status==='maintenance'?'active-maint':''}" onclick="setRoomStatus('maintenance')">Maintenance</button>
    </div>
    <div class="section-title" style="margin-bottom:10px">Rates for ${r.label} (₱/night)</div>
    <table class="price-table">
      <tr><th>Channel</th><th>Rate (₱)</th></tr>
      ${['T','W','B','AG','EX'].map(src=>`
        <tr><td>${srcLabel(src)}</td>
        <td><input class="price-input" type="number" value="${prices[src]||0}"
            onchange="updateRoomPrice('${r.type}','${src}',this.value)"></td></tr>`).join('')}
    </table>`;
}

function setRoomStatus(status) {
  DB.hotels[currentHotel].rooms[activeRoom].status=status;
  saveState(); renderRoomDetails(); renderDashboard(); toast('Room status updated');
}
function updateRoomPrice(type,src,val) {
  if(!DB.prices[type]) DB.prices[type]={};
  DB.prices[type][src]=parseFloat(val)||0;
  saveState(); toast('Rate saved');
}

// ─── BOOKING MODAL ────────────────────────────────────────────────────────────
function openAddBooking(preRoom) {
  editingBookingId=null;
  document.getElementById('bmTitle').textContent='Add Booking';
  buildBookingForm(null,preRoom);
  document.getElementById('bookingModalFooter').innerHTML=`
    <button class="btn btn-ghost" onclick="closeModal('bookingModal')">Cancel</button>
    <button class="btn btn-primary" onclick="saveBooking()">Save Booking</button>`;
  document.getElementById('bookingModal').style.display='flex';
}

function editBooking(id) {
  const b=DB.bookings.find(x=>x.id===id); if(!b) return;
  editingBookingId=id;
  closeModal('roomModal');
  document.getElementById('bmTitle').textContent='Edit Booking';
  buildBookingForm(b,null);
  const exts=b.extensions||[];
  const extCount=exts.length;
  const extLabel=extCount===0?'Extend Stay':`Extend Again (×${extCount+1})`;
  const extClass=extCount%2===0?'btn-extend-yellow':'btn-extend-green';
  document.getElementById('bookingModalFooter').innerHTML=`
    <button class="btn btn-danger" onclick="deleteBooking('${id}')">Delete</button>
    <button class="btn btn-ghost"  onclick="closeModal('bookingModal')">Cancel</button>
    <button class="btn ${extClass}" onclick="openExtendStay('${id}')">⟳ ${extLabel}</button>
    <button class="btn btn-primary" onclick="saveBooking()">Save Changes</button>`;
  document.getElementById('bookingModal').style.display='flex';
}

function openExtendStay(id) {
  const b=DB.bookings.find(x=>x.id===id); if(!b) return;
  const currentCheckout = b.checkout;
  const exts = b.extensions||[];
  const extNum = exts.length+1;

  // Insert a mini extend panel into the modal body above the footer
  const existing=document.getElementById('extendPanel');
  if(existing) existing.remove();

  const panel=document.createElement('div');
  panel.id='extendPanel';
  panel.style.cssText='border-top:1px solid var(--border);padding-top:12px;margin-top:12px';
  panel.innerHTML=`
    <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.07em;color:${extNum%2!==0?'#713f12':'#14532d'};margin-bottom:8px">
      ${extNum%2!==0?'🟡':'🟢'} Extension #${extNum}
    </div>
    <div style="font-size:12px;color:var(--text2);margin-bottom:8px">
      Current checkout: <strong>${shortDate(currentCheckout)}</strong>. Set new checkout date:
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <input class="form-input" id="extNewCheckout" type="date"
             min="${currentCheckout}" value="${currentCheckout}"
             style="flex:1">
      <button class="btn btn-primary" style="flex-shrink:0" onclick="confirmExtendStay('${id}')">Confirm</button>
      <button class="btn btn-ghost"   style="flex-shrink:0" onclick="document.getElementById('extendPanel').remove()">Cancel</button>
    </div>
    <div style="font-size:10px;color:var(--text3);margin-top:6px">
      Extended days will appear ${extNum%2!==0?'yellow':'green'} on the dashboard and calendar.
    </div>
  `;
  document.getElementById('bookingForm').appendChild(panel);
  document.getElementById('extNewCheckout').focus();
}

function confirmExtendStay(id) {
  const b=DB.bookings.find(x=>x.id===id); if(!b) return;
  const newCheckout=document.getElementById('extNewCheckout').value;
  if(!newCheckout||newCheckout<=b.checkout){
    toast('New checkout must be after current checkout'); return;
  }

  if(!b.extensions) b.extensions=[];
  const originalCheckout=b.extensions.length===0?b.checkout:b.extensions[0].originalCheckout;
  b.extensions.push({
    originalCheckout,
    previousCheckout: b.checkout,
    checkout: newCheckout,
    addedAt: new Date().toISOString(),
    addedBy: currentUser?.username||'unknown',
  });
  b.checkout=newCheckout; // advance the actual checkout
  saveState();

  const extNum=b.extensions.length;
  toast(`✅ Stay extended to ${shortDate(newCheckout)} (Extension #${extNum})`);
  closeModal('bookingModal');
  renderAll();
}

function buildBookingForm(b, preRoom) {
  const h = b ? b.hotel : currentHotel;

  // Safe field reads with fallbacks for old bookings
  const guestVal       = b ? b.guest        : '';
  const checkinVal     = b ? b.checkin       : fmtDate(new Date());
  const checkoutVal    = b ? b.checkout      : fmtDate(new Date());
  const extraHeadVal   = b ? (b.extraHead  || 0) : 0;
  const extraBedVal    = b ? (b.extraBed   || 0) : 0;
  const discType       = b ? (b.discountType  || 'none') : 'none';
  const discValue      = b ? (b.discountValue || 0)      : 0;
  const discNote       = b ? (b.discountNote  || '')     : '';
  const notesVal       = b ? (b.notes || '')  : '';
  const depositPaid    = b ? hasKeyDeposit(b.id) : false;
  const addons         = DB.addons;

  const roomOpts = sortRoomKeys(Object.keys(DB.hotels[h].rooms))
    .map(r => {
      const sel = (b && b.room === r) || (preRoom && preRoom === r) ? 'selected' : '';
      return `<option value="${r}" ${sel}>${r} – ${DB.hotels[h].rooms[r].label}</option>`;
    }).join('');

  const srcOpts = ['T','W','B','AG','EX'].map(s => {
    const sel = b && b.source === s ? 'selected' : '';
    return `<option value="${s}" ${sel}>${srcLabel(s)}</option>`;
  }).join('');

  const hotelSquareSel = (!b || b.hotel === 'square') ? 'selected' : '';
  const hotelPoolSel   = (b && b.hotel === 'pool')    ? 'selected' : '';
  const discNoneSel    = discType === 'none'    ? 'selected' : '';
  const discPctSel     = discType === 'percent' ? 'selected' : '';
  const discFixSel     = discType === 'fixed'   ? 'selected' : '';
  const depositChecked = depositPaid ? 'checked' : '';

  document.getElementById('bookingForm').innerHTML = `
    <div class="form-group full">
      <label class="form-label">Guest name</label>
      <input class="form-input" id="bf-guest" type="text" placeholder="Full name" value="${guestVal}">
    </div>
    <div class="form-group">
      <label class="form-label">Hotel</label>
      <select class="form-select" id="bf-hotel" onchange="rebuildRoomOpts()">
        <option value="square" ${hotelSquareSel}>Square Hotel</option>
        <option value="pool"   ${hotelPoolSel}>Pool Hotel</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Room</label>
      <select class="form-select" id="bf-room">${roomOpts}</select>
    </div>
    <div class="form-group">
      <label class="form-label">Check-in</label>
      <input class="form-input" id="bf-checkin" type="date" value="${checkinVal}">
    </div>
    <div class="form-group">
      <label class="form-label">Check-out</label>
      <input class="form-input" id="bf-checkout" type="date" value="${checkoutVal}">
    </div>
    <div class="form-group">
      <label class="form-label">Source</label>
      <select class="form-select" id="bf-source">${srcOpts}</select>
    </div>

    <div class="form-group full" style="border-top:1px solid var(--border);padding-top:12px;margin-top:4px">
      <label class="form-label">Add-ons</label>
      <div class="extras-row">
        <div class="extras-field">
          <label style="font-size:12px;color:var(--text2)">Extra head (${peso(addons.extraHead)}/night each)</label>
          <input class="form-input" id="bf-extraHead" type="number" min="0" max="10"
                 value="${extraHeadVal}" placeholder="0" oninput="updateDiscountPreview()">
        </div>
        <div class="extras-field">
          <label style="font-size:12px;color:var(--text2)">Extra bed (${peso(addons.extraBed)}/night each)</label>
          <input class="form-input" id="bf-extraBed" type="number" min="0" max="5"
                 value="${extraBedVal}" placeholder="0" oninput="updateDiscountPreview()">
        </div>
      </div>
    </div>

    <div class="form-group full" style="border-top:1px solid var(--border);padding-top:12px;margin-top:4px;background:var(--amber-bg);border-radius:var(--radius-sm);padding:12px;border:1px solid #fde68a">
      <label class="form-label" style="color:var(--amber-text)">🏷 Discount / Deal</label>
      <div class="discount-row" style="margin-top:8px">
        <div class="discount-type-wrap">
          <label style="font-size:11px;color:var(--text2);margin-bottom:4px">Type</label>
          <select class="form-select" id="bf-discountType" onchange="updateDiscountPreview()">
            <option value="none"    ${discNoneSel}>No discount</option>
            <option value="percent" ${discPctSel}>% off (percentage)</option>
            <option value="fixed"   ${discFixSel}>₱ off (fixed amount)</option>
          </select>
        </div>
        <div class="discount-value-wrap" id="bf-discountValueWrap">
          <label style="font-size:11px;color:var(--text2);margin-bottom:4px">Amount</label>
          <input class="form-input" id="bf-discountValue" type="number" min="0" step="1"
                 placeholder="0" value="${discValue > 0 ? discValue : ''}"
                 oninput="updateDiscountPreview()">
        </div>
      </div>
      <div style="margin-top:8px">
        <label style="font-size:11px;color:var(--text2);margin-bottom:4px;display:block">Deal / reason</label>
        <input class="form-input" id="bf-discountNote" type="text"
               placeholder="e.g. Booking.com weekend promo, Agoda flash sale…"
               value="${discNote}">
      </div>
      <div id="bf-discountPreview" class="discount-preview" style="display:none;margin-top:10px"></div>
    </div>

    <div class="form-group full">
      <label class="form-label">Key deposit</label>
      <div class="deposit-row">
        <label class="deposit-check-label">
          <input type="checkbox" id="bf-deposit" ${depositChecked}>
          <span>Key deposit received from guest</span>
        </label>
        <span class="deposit-hint">Check once guest has paid the room key deposit</span>
      </div>
    </div>

    <div class="form-group full" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:var(--radius-sm);padding:12px">
      <label class="form-label" style="color:#1d4ed8">💰 Payment status</label>
      ${b?(()=>{
        const paid=bookingAmountPaid(b), due=bookingTotalDue(b), status=bookingPaymentStatus(b);
        const pmts=(b.payments||[]);
        return `<div style="margin-top:6px;font-size:12px;color:var(--text2)">
          ${status==='full'?`<span style="color:var(--green-text);font-weight:700">✓ Paid in full — ${peso(paid)}</span>`
           :status==='partial'?`<span style="color:#1e40af;font-weight:700">${peso(paid)} paid of ${peso(due)} — ${peso(due-paid)} remaining</span>`
           :'<span style="color:var(--text3)">No payments recorded yet</span>'}
          ${pmts.length?`<div style="margin-top:6px;font-size:11px;color:var(--text3)">${pmts.map(p=>`${shortDate(p.date)}: ${peso(p.amount)}${p.note?' ('+p.note+')':''}`).join(' · ')}</div>`:''}
          <div style="margin-top:6px;font-size:11px;color:var(--text3)">Use the room's Guest tab to add or remove payments.</div>
        </div>`;
      })():`<div style="margin-top:6px;font-size:12px;color:var(--text3)">Save the booking first, then use the room's Guest tab to record payments.</div>`}
    </div>

    <div class="form-group full">
      <label class="form-label">Notes</label>
      <textarea class="form-input" id="bf-notes" rows="2" placeholder="Optional notes…">${notesVal}</textarea>
    </div>
  `;

  // Set initial state of discount value field
  updateDiscountPreview();
}

function updateDiscountPreview() {
  const typeEl  = document.getElementById('bf-discountType');
  const valEl   = document.getElementById('bf-discountValue');
  const preview = document.getElementById('bf-discountPreview');
  const wrap    = document.getElementById('bf-discountValueWrap');
  if (!typeEl || !preview) return;

  const type = typeEl.value;
  const val  = parseFloat(valEl?.value) || 0;

  // Show/hide value input
  if (wrap) wrap.style.display = type === 'none' ? 'none' : '';

  if (type === 'none' || !val) { preview.style.display = 'none'; return; }

  // Try to compute a live preview using current form values
  const hotel    = document.getElementById('bf-hotel')?.value;
  const room     = document.getElementById('bf-room')?.value;
  const checkin  = document.getElementById('bf-checkin')?.value;
  const checkout = document.getElementById('bf-checkout')?.value;
  const source   = document.getElementById('bf-source')?.value;
  const extraHead= parseInt(document.getElementById('bf-extraHead')?.value)||0;
  const extraBed = parseInt(document.getElementById('bf-extraBed')?.value)||0;

  if (!hotel || !room || !checkin || !checkout || checkin > checkout) {
    preview.style.display = 'none'; return;
  }

  const roomDef  = DB.hotels[hotel]?.rooms[room];
  if (!roomDef) { preview.style.display = 'none'; return; }

  const ci = parseDate(checkin), co = parseDate(checkout);
  const nights = Math.round((co - ci) / 864e5) + 1;
  const baseRate  = (DB.prices[roomDef.type]||{})[source] || 0;
  const addonRate = extraHead*(DB.addons.extraHead||0) + extraBed*(DB.addons.extraBed||0);
  const gross = (baseRate + addonRate) * nights;

  const fakeBooking = { discountType: type, discountValue: val };
  const net = applyDiscount(gross, fakeBooking);
  const saved = gross - net;

  preview.style.display = 'flex';
  preview.innerHTML = `
    <span class="disc-prev-row"><span>Gross total</span><span>${peso(gross)}</span></span>
    <span class="disc-prev-row disc-saved"><span>Discount (${type==='percent'?val+'%':peso(val)+' off'})</span><span>− ${peso(saved)}</span></span>
    <span class="disc-prev-row disc-net"><span>Amount due</span><span>${peso(net)}</span></span>
  `;
}

function rebuildRoomOpts() {
  const h=document.getElementById('bf-hotel').value;
  document.getElementById('bf-room').innerHTML=sortRoomKeys(Object.keys(DB.hotels[h].rooms))
    .map(r=>`<option value="${r}">${r} – ${DB.hotels[h].rooms[r].label}</option>`).join('');
}

function saveBooking() {
  const guest   =document.getElementById('bf-guest').value.trim();
  const hotel   =document.getElementById('bf-hotel').value;
  const room    =document.getElementById('bf-room').value;
  const checkin =document.getElementById('bf-checkin').value;
  const checkout=document.getElementById('bf-checkout').value;
  const source  =document.getElementById('bf-source').value;
  const notes   =document.getElementById('bf-notes').value;
  const deposit      =document.getElementById('bf-deposit').checked;
  const extraHead    =parseInt(document.getElementById('bf-extraHead').value)||0;
  const extraBed     =parseInt(document.getElementById('bf-extraBed').value)||0;
  const discountType =document.getElementById('bf-discountType').value;
  const discountValue=parseFloat(document.getElementById('bf-discountValue').value)||0;
  const discountNote =document.getElementById('bf-discountNote').value.trim();

  if(!guest)              { toast('Please enter a guest name'); return; }
  if(!checkin||!checkout) { toast('Please set check-in and check-out dates'); return; }
  if(checkin>checkout)    { toast('Check-out must be after check-in'); return; }
  if(discountType==='percent'&&discountValue>100){ toast('Percentage discount cannot exceed 100%'); return; }

  let bookingId;
  if(editingBookingId){
    const i=DB.bookings.findIndex(b=>b.id===editingBookingId);
    if(i>=0) DB.bookings[i]={...DB.bookings[i],guest,hotel,room,checkin,checkout,source,notes,extraHead,extraBed,discountType,discountValue,discountNote};
    bookingId=editingBookingId; toast('Booking updated');
  } else {
    bookingId=genId();
    DB.bookings.push({id:bookingId,guest,hotel,room,checkin,checkout,source,notes,extraHead,extraBed,discountType,discountValue,discountNote,payments:[],extensions:[]});
    toast('Booking added');
  }
  DB.keyDeposits[bookingId]=deposit;
  saveState(); closeModal('bookingModal'); renderAll();
}

function deleteBooking(id) {
  if(!confirm('Delete this booking?')) return;
  DB.bookings=DB.bookings.filter(b=>b.id!==id);
  delete DB.keyDeposits[id];
  saveState(); closeModal('bookingModal'); closeModal('roomModal'); renderAll(); toast('Booking deleted');
}
function closeBookingModal(e) { if(e.target===document.getElementById('bookingModal')) closeModal('bookingModal'); }

// ─── ROOMS PAGE (no room type selector) ─────────────────────────────────────
function renderRoomsPage() {
  const h=currentHotel,rooms=DB.hotels[h].rooms;
  let html='';
  sortRoomKeys(Object.keys(rooms)).forEach(r=>{
    const room=rooms[r],s=room.status;
    html+=`<div class="room-mgmt-card">
      <div class="room-mgmt-head">
        <span class="room-mgmt-num">Room ${r}</span>
        <button class="booking-del" style="color:var(--text3)" onclick="removeRoom('${r}')">&#x2715;</button>
      </div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:10px">${room.label}</div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:4px">Status</div>
      <div class="status-toggle">
        <button class="st-btn ${s==='vacant'?'active-vac':''}" onclick="setRoomStatusDirect('${r}','vacant')">Vacant</button>
        <button class="st-btn ${s==='maintenance'?'active-maint':''}" onclick="setRoomStatusDirect('${r}','maintenance')">Maint.</button>
      </div>
    </div>`;
  });
  document.getElementById('roomsMgmt').innerHTML=html||'<div class="empty"><div class="empty-icon">🚪</div>No rooms.</div>';
}

function setRoomStatusDirect(room,status) {
  DB.hotels[currentHotel].rooms[room].status=status;
  saveState(); renderRoomsPage(); renderDashboard(); toast('Status updated');
}
function removeRoom(room) {
  if(!confirm(`Remove room ${room}?`)) return;
  delete DB.hotels[currentHotel].rooms[room];
  saveState(); renderRoomsPage(); renderDashboard(); toast('Room removed');
}
function openAddRoom() {
  document.getElementById('addRoomForm').innerHTML=`
    <div class="form-group">
      <label class="form-label">Room number</label>
      <input class="form-input" id="ar-num" type="text" placeholder="e.g. 119 or E04">
    </div>
    <div class="form-group">
      <label class="form-label">Type</label>
      <select class="form-select" id="ar-type">
        <option value="standard">Standard Room</option>
        <option value="family2">Family Room (2 pax)</option>
        <option value="family3">Family Room (3 pax)</option>
      </select>
    </div>`;
  document.getElementById('addRoomModal').style.display='flex';
}
function saveRoom() {
  const num=document.getElementById('ar-num').value.trim().toUpperCase();
  const type=document.getElementById('ar-type').value;
  if(!num){ toast('Enter a room number'); return; }
  if(DB.hotels[currentHotel].rooms[num]){ toast('Room already exists'); return; }
  DB.hotels[currentHotel].rooms[num]={type,label:typeLabel(type),status:'vacant'};
  saveState(); closeModal('addRoomModal'); renderRoomsPage(); renderDashboard(); toast(`Room ${num} added`);
}

// ─── BOOKINGS PAGE ────────────────────────────────────────────────────────────
function renderBookingsPage() {
  const all=[...DB.bookings].filter(b=>b.hotel===currentHotel).sort((a,c)=>c.checkin.localeCompare(a.checkin));
  document.getElementById('bookingsCount').textContent=`${all.length} bookings`;
  if(!all.length){
    document.getElementById('bookingsList').innerHTML=`<div class="empty"><div class="empty-icon">📅</div>No bookings.</div>`;
    return;
  }
  let html='';
  all.forEach(b=>{
    const ci=parseDate(b.checkin),co=parseDate(b.checkout);
    const nights=Math.round((co-ci)/864e5)+1;
    const paid=hasKeyDeposit(b.id);
    const roomDef=DB.hotels[b.hotel]?.rooms[b.room];
    const baseRate=roomDef?(DB.prices[roomDef.type]||{})[b.source]||0:0;
    const addonRate=(b.extraHead||0)*DB.addons.extraHead+(b.extraBed||0)*DB.addons.extraBed;
    const gross=(baseRate+addonRate)*nights;
    const total=applyDiscount(gross,b);
    const discAmt=gross-total;
    const hasDisc=b.discountType&&b.discountType!=='none'&&b.discountValue>0;
    const extras=[];
    if(b.extraHead>0) extras.push(`+${b.extraHead} head`);
    if(b.extraBed>0)  extras.push(`+${b.extraBed} bed`);
    const discLabel=hasDisc?(b.discountType==='percent'?`${b.discountValue}% off`:peso(b.discountValue)+' off'):'';
    const payStatus=bookingPaymentStatus(b);
    const amtPaid=bookingAmountPaid(b);
    const payLabel=payStatus==='full'?'Settled ✓':payStatus==='partial'?`${peso(amtPaid)} paid`:'Unpaid';
    const payClass=payStatus==='full'?'deposit-paid':payStatus==='partial'?'balance-paid-btn':'balance-unpaid-btn';
    html+=`<div class="booking-item" onclick="editBooking('${b.id}')">
      <span class="src-badge src-${b.source}">${srcLabel(b.source)}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;display:flex;align-items:center;gap:6px">
          ${b.guest}
          ${hasDisc?`<span class="disc-badge" title="${b.discountNote||'Deal applied'}">${discLabel}</span>`:''}
        </div>
        <div style="font-size:11px;color:var(--text3)">
          Room ${b.room} · ${shortDate(b.checkin)} – ${shortDate(b.checkout)} · ${nights} night${nights!==1?'s':''}
          ${extras.length?' · '+extras.join(', '):''}
          ${hasDisc?`<span style="color:var(--red-text)"> · −${peso(discAmt)}</span>`:''}
          · <strong>${peso(total)}</strong>
        </div>
        ${b.discountNote?`<div style="font-size:10px;color:var(--text3);font-style:italic;margin-top:1px">"${b.discountNote}"</div>`:''}
      </div>
      <span class="key-deposit-toggle ${payClass}" style="cursor:default;flex-shrink:0">💰 ${payLabel}</span>
      <button class="booking-del" onclick="event.stopPropagation();deleteBooking('${b.id}')">&#x2715;</button>
    </div>`;
  });
  document.getElementById('bookingsList').innerHTML=html;
}

// ─── PRICES PAGE ──────────────────────────────────────────────────────────────
function renderPricesPage() {
  const types=[{key:'standard',name:'Standard Room'},{key:'family2',name:'Family Room (2 pax)'},{key:'family3',name:'Family Room (3 pax)'}];
  const sources=[{key:'T',name:'Trip.com'},{key:'W',name:'Walk-in'},{key:'B',name:'Booking.com'},{key:'AG',name:'Agoda'},{key:'EX',name:'Expedia'}];
  let html='';

  // Base rates per type per source
  types.forEach(t=>{
    const prices=DB.prices[t.key]||{};
    html+=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:14px">
      <div style="font-size:14px;font-weight:600;margin-bottom:12px">${t.name}</div>
      <table class="price-table" style="width:100%">
        <tr><th>Channel</th><th>Rate per night (₱)</th></tr>
        ${sources.map(s=>`<tr>
          <td><span class="src-badge src-${s.key}" style="margin-right:6px">${s.key}</span>${s.name}</td>
          <td><input class="price-input" type="number" min="0" step="50" value="${prices[s.key]||0}"
              onchange="savePrice('${t.key}','${s.key}',this.value)" style="max-width:120px"></td>
        </tr>`).join('')}
      </table>
    </div>`;
  });

  // Add-on prices
  const addons=DB.addons;
  html+=`<div class="addon-block">
    <div class="addon-block-title">Add-on Charges</div>
    <div class="addon-block-desc">Per-person / per-bed charges added on top of the base rate. Applied per night.</div>
    <div class="addon-grid">
      <div class="addon-item">
        <label class="addon-label">Extra head (₱/night per person)</label>
        <input class="addon-input" type="number" min="0" step="50" value="${addons.extraHead||0}"
               onchange="saveAddon('extraHead',this.value)">
      </div>
      <div class="addon-item">
        <label class="addon-label">Extra bed (₱/night per bed)</label>
        <input class="addon-input" type="number" min="0" step="50" value="${addons.extraBed||0}"
               onchange="saveAddon('extraBed',this.value)">
      </div>
    </div>
  </div>`;

  document.getElementById('pricesArea').innerHTML=html;
}

function savePrice(type,src,val) {
  if(!DB.prices[type]) DB.prices[type]={};
  DB.prices[type][src]=parseFloat(val)||0;
  saveState(); toast('Rate saved');
}
function saveAddon(key,val) {
  DB.addons[key]=parseFloat(val)||0;
  saveState(); toast('Add-on rate saved');
}

// ─── ANALYTICS ────────────────────────────────────────────────────────────────
function setAnalyticsView(view,el) {
  analyticsView=view; analyticsOffset=0;
  document.querySelectorAll('.atab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  renderAnalytics();
}
function analyticsShift(d) { analyticsOffset+=d; renderAnalytics(); }

/** Returns { bars:[{label,from,to}], rangeFrom, rangeTo, rangeLabel } for current view+offset */
function getAnalyticsPeriod() {
  const now=new Date(currentDate);
  let bars=[],rangeFrom,rangeTo,rangeLabel;

  if(analyticsView==='day'){
    // show 30 days around today+offset
    const base=new Date(now.getFullYear(),now.getMonth(),now.getDate()+analyticsOffset*30);
    rangeFrom=new Date(base.getFullYear(),base.getMonth(),base.getDate()-14);
    rangeTo  =new Date(base.getFullYear(),base.getMonth(),base.getDate()+15);
    for(let d=new Date(rangeFrom);d<=rangeTo;d=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1)){
      const dn=new Date(d.getFullYear(),d.getMonth(),d.getDate());
      bars.push({label:d.toLocaleDateString('en-PH',{month:'short',day:'numeric'}),from:dn,to:dn});
    }
    rangeLabel=`${rangeFrom.toLocaleDateString('en-PH',{month:'short',day:'numeric'})} – ${rangeTo.toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'})}`;

  } else if(analyticsView==='week'){
    // show 12 weeks
    const base=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    const weekStart=new Date(base); weekStart.setDate(weekStart.getDate()-weekStart.getDay()+analyticsOffset*12*7);
    for(let w=0;w<12;w++){
      const ws=new Date(weekStart.getFullYear(),weekStart.getMonth(),weekStart.getDate()+w*7);
      const we=new Date(ws.getFullYear(),ws.getMonth(),ws.getDate()+6);
      bars.push({label:`${ws.toLocaleDateString('en-PH',{month:'short',day:'numeric'})}`,from:ws,to:we});
    }
    rangeFrom=bars[0].from; rangeTo=bars[bars.length-1].to;
    rangeLabel=`${rangeFrom.toLocaleDateString('en-PH',{month:'short',day:'numeric'})} – ${rangeTo.toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'})}`;

  } else if(analyticsView==='month'){
    // show 12 months of the current year + offset
    const yr=now.getFullYear()+analyticsOffset;
    for(let m=0;m<12;m++){
      const from=new Date(yr,m,1);
      const to  =new Date(yr,m+1,0);
      bars.push({label:from.toLocaleDateString('en-PH',{month:'short'}),from,to});
    }
    rangeFrom=bars[0].from; rangeTo=bars[11].to;
    rangeLabel=`${yr}`;

  } else { // year
    const baseYr=now.getFullYear()+analyticsOffset*5;
    for(let y=baseYr-4;y<=baseYr;y++){
      bars.push({label:String(y),from:new Date(y,0,1),to:new Date(y,11,31)});
    }
    rangeFrom=bars[0].from; rangeTo=bars[bars.length-1].to;
    rangeLabel=`${bars[0].label} – ${bars[bars.length-1].label}`;
  }
  return {bars,rangeFrom,rangeTo,rangeLabel};
}

function renderAnalytics() {
  const h=currentHotel;
  const {bars,rangeFrom,rangeTo,rangeLabel}=getAnalyticsPeriod();

  document.getElementById('analyticsRangeLabel').textContent=rangeLabel;

  // Compute income per bar
  const values=bars.map(bar=>incomeForRange(h,bar.from,bar.to));
  const maxVal=Math.max(...values,1);
  const totalIncome=incomeForRange(h,rangeFrom,rangeTo);
  const totalBookings=DB.bookings.filter(b=>{
    if(b.hotel!==h) return false;
    const ci=parseDate(b.checkin),co=parseDate(b.checkout);
    return ci<=rangeTo&&co>=rangeFrom;
  }).length;

  // Count occupied nights in range for avg rate
  let totalNights=0;
  DB.bookings.filter(b=>b.hotel===h).forEach(b=>{
    const ci=parseDate(b.checkin),co=parseDate(b.checkout);
    const s=ci<rangeFrom?rangeFrom:ci, e=co>rangeTo?rangeTo:co;
    if(s<=e) totalNights+=Math.round((e-s)/864e5)+1;
  });

  document.getElementById('analyticsSummary').innerHTML=`
    <div class="stat-card"><div class="stat-label">Total income</div><div class="stat-val" style="font-size:20px;color:var(--green)">${peso(totalIncome)}</div><div class="stat-sub">${rangeLabel}</div></div>
    <div class="stat-card"><div class="stat-label">Bookings</div><div class="stat-val">${totalBookings}</div><div class="stat-sub">in period</div></div>
    <div class="stat-card"><div class="stat-label">Nights sold</div><div class="stat-val">${totalNights}</div></div>
    <div class="stat-card"><div class="stat-label">Avg/night</div><div class="stat-val" style="font-size:18px">${totalNights>0?peso(totalIncome/totalNights):'—'}</div></div>
  `;

  document.getElementById('chartTitle').textContent=`Income — ${rangeLabel}`;

  // Bar chart
  const chartH=140;
  let barsHtml=values.map((v,i)=>{
    const fillH=maxVal>0?Math.max(2,Math.round((v/maxVal)*chartH)):2;
    return `<div class="bar-col" style="height:${chartH+24}px">
      <div style="flex:1;display:flex;align-items:flex-end;width:100%">
        <div class="bar-fill" style="height:${fillH}px;background:${v>0?'var(--blue)':'var(--border)'}">
          <div class="bar-tooltip">${peso(v)}</div>
        </div>
      </div>
      <div class="bar-label">${bars[i].label}</div>
    </div>`;
  }).join('');

  // Y-axis
  const steps=4;
  let yHtml='';
  for(let i=steps;i>=0;i--) yHtml+=`<span>${i>0?peso(maxVal*(i/steps)).replace('₱',''):''}</span>`;

  document.getElementById('chartWrap').innerHTML=`
    <div class="chart-inner">
      <div class="chart-y-labels">${yHtml}</div>
      <div class="bar-chart" style="height:${chartH+24}px">${barsHtml}</div>
    </div>`;

  // Source breakdown
  const bySource=incomeBySource(h,rangeFrom,rangeTo);
  const srcList=['T','W','B','AG','EX'];
  let srcHtml='<div class="source-list">';
  srcList.forEach(s=>{
    const v=bySource[s]||0;
    const pct=totalIncome>0?Math.round(v/totalIncome*100):0;
    srcHtml+=`<div class="source-item">
      <div class="source-item-label"><span class="src-badge src-${s}" style="margin-right:4px">${s}</span>${srcLabel(s)}</div>
      <div class="source-item-val">${v>0?peso(v):'—'}</div>
      <div class="source-item-sub">${v>0?pct+'% of total':''}</div>
    </div>`;
  });
  srcHtml+='</div>';
  document.getElementById('sourceBreakdown').innerHTML=srcHtml;
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function closeModal(id) { document.getElementById(id).style.display='none'; }
document.addEventListener('keydown',e=>{
  if(e.key==='Escape') ['roomModal','bookingModal','addRoomModal'].forEach(closeModal);
});

// ─── CHANGE PASSWORD (admin only) ────────────────────────────────────────────
function openChangePw() {
  requireAdmin(() => {
    document.getElementById('cpNewPw').value = '';
    document.getElementById('cpConfirm').value = '';
    document.getElementById('cpError').style.display = 'none';
    document.getElementById('changePwModal').style.display = 'flex';
  });
}

function saveNewPassword() {
  const account = document.getElementById('cpAccount').value;
  const newPw   = document.getElementById('cpNewPw').value;
  const confirm = document.getElementById('cpConfirm').value;
  const errEl   = document.getElementById('cpError');
  if (newPw.length < 4) { errEl.textContent = 'Password must be at least 4 characters.'; errEl.style.display = 'block'; return; }
  if (newPw !== confirm) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; return; }
  ACCOUNTS[account].password = newPw;
  closeModal('changePwModal');
  toast('Password updated for ' + account);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
// renderAll() is called by bootAuth() after login — not called here directly.
