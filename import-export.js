// ─── IMPORT / EXPORT  (SheetJS / xlsx.js)  ───────────────────────────────────
// Mirrors the original format: one sheet per hotel per month.
// Rows = rooms, columns = dates, cells = "SOURCE - ROOM GUEST/NAME"
// Each workbook covers the current month PLUS 2 future months (≥ 3 months total).
//
// SheetJS is loaded lazily from CDN on first use.
// ─────────────────────────────────────────────────────────────────────────────

const SHEETJS_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

// ── CDN loader ────────────────────────────────────────────────────────────────
function loadSheetJS() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) { resolve(window.XLSX); return; }
    const s = document.createElement('script');
    s.src = SHEETJS_CDN;
    s.onload  = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error('Failed to load SheetJS'));
    document.head.appendChild(s);
  });
}

// ── Source code map ───────────────────────────────────────────────────────────
const SRC_CODE = { T:'T', W:'W', B:'B', AG:'Ag', EX:'Ex' };

// ── Date helpers ──────────────────────────────────────────────────────────────
function startOfMonth(y, m) { return new Date(y, m, 1); }
function endOfMonth(y, m)   { return new Date(y, m + 1, 0); }
function daysInMonth(y, m)  { return new Date(y, m + 1, 0).getDate(); }
function addMonths(date, n) { return new Date(date.getFullYear(), date.getMonth() + n, 1); }

/** Returns array of { year, month (0-based) } for 3 months starting from today's month */
function getExportMonths() {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), 1);
  // Start 1 month back so recent data is included, giving 3 future + 1 past = 4 total; but
  // spec says "3 months minimum" so we'll do currentMonth-1 → currentMonth+2 (4 months).
  const months = [];
  for (let i = -1; i <= 2; i++) {
    const d = addMonths(base, i);
    months.push({ year: d.getFullYear(), month: d.getMonth() });
  }
  return months;
}

// Sheet name mirrors the original: "Jan 2026" / "Jan 2026-Pool"
function sheetName(hotelKey, year, month) {
  const label = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  return hotelKey === 'pool' ? `${label}-Pool` : label;
}

// ── EXPORT ────────────────────────────────────────────────────────────────────
async function exportToExcel() {
  toast('Preparing export…');
  const XLSX = await loadSheetJS().catch(() => null);
  if (!XLSX) { toast('Could not load Excel library — check your connection'); return; }

  const wb = XLSX.utils.book_new();
  const months = getExportMonths();
  const hotels = ['square', 'pool'];

  for (const { year, month } of months) {
    for (const hotelKey of hotels) {
      const hotel   = DB.hotels[hotelKey];
      if (!hotel) continue;
      const rooms   = sortRoomKeys(Object.keys(hotel.rooms));
      const days    = daysInMonth(year, month);
      const ws      = buildSheetForMonth(XLSX, hotelKey, hotel, rooms, year, month, days);
      const name    = sheetName(hotelKey, year, month);
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31)); // Excel limit: 31 chars
    }
  }

  // Summary sheet
  const summaryWs = buildSummarySheet(XLSX, months);
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

  const filename = `HotelPMS_${new Date().toISOString().slice(0,10)}.xlsx`;
  XLSX.writeFile(wb, filename);
  toast(`✅ Exported ${filename}`);
}

function buildSheetForMonth(XLSX, hotelKey, hotel, rooms, year, month, days) {
  // Header row: [Room, Type, Jan 1, Jan 2, ... Jan N, Total Nights, Total Income]
  const monthStart = startOfMonth(year, month);
  const monthEnd   = endOfMonth(year, month);

  // Build AOA (array of arrays)
  const aoa = [];

  // ── Row 0: title row ──────────────────────────────────────────────────────
  const monthLabel = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  aoa.push([`${hotel.name} — ${monthLabel}`]);

  // ── Row 1: column headers ─────────────────────────────────────────────────
  const headerRow = ['Room', 'Type'];
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month, d);
    // Mirror original: short weekday + date number
    headerRow.push(date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }));
  }
  headerRow.push('Nights', 'Est. Income (₱)', 'Key Deposit', 'Notes');
  aoa.push(headerRow);

  // ── Data rows: one per room ────────────────────────────────────────────────
  for (const roomNum of rooms) {
    const roomDef  = hotel.rooms[roomNum];
    const row      = [roomNum, roomDef.label];
    let totalNights = 0;
    let totalIncome = 0;

    for (let d = 1; d <= days; d++) {
      const date    = new Date(year, month, d);
      const booking = DB.bookings.find(b =>
        b.hotel === hotelKey &&
        b.room  === roomNum  &&
        isInRange(date, b.checkin, b.checkout)
      );

      if (booking) {
        // Mirror original cell style: "SOURCE - ROOM GUEST/NAME"
        const src  = SRC_CODE[booking.source] || booking.source;
        const name = booking.guest.toUpperCase();
        let cell = `${src} - ${roomNum} ${name}`;
        // Add extras note inline if any
        if (booking.extraHead > 0) cell += ` +${booking.extraHead}H`;
        if (booking.extraBed  > 0) cell += ` +${booking.extraBed}B`;
        row.push(cell);
        totalNights++;
        // Income for this night
        const baseRate = (DB.prices[roomDef.type] || {})[booking.source] || 0;
        const addon    = (booking.extraHead || 0) * (DB.addons.extraHead || 0)
                       + (booking.extraBed  || 0) * (DB.addons.extraBed  || 0);
        totalIncome += baseRate + addon;
      } else if (roomDef.status === 'maintenance') {
        row.push('MAINT');
      } else {
        row.push('');
      }
    }

    // Find all bookings for this room in this month for deposit & notes
    const monthBookings = DB.bookings.filter(b => {
      if (b.hotel !== hotelKey || b.room !== roomNum) return false;
      const ci = parseDate(b.checkin), co = parseDate(b.checkout);
      return ci <= monthEnd && co >= monthStart;
    });
    const depositAll = monthBookings.every(b => hasKeyDeposit(b.id));
    const depositStr = monthBookings.length === 0 ? '' : depositAll ? 'Yes' : 'No';
    const noteStr    = monthBookings.map(b => b.notes).filter(Boolean).join('; ');

    row.push(totalNights, totalIncome, depositStr, noteStr);
    aoa.push(row);
  }

  // ── Footer: totals row ────────────────────────────────────────────────────
  const footerRow = ['TOTALS', ''];
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month, d);
    const occCount = rooms.filter(r =>
      DB.bookings.some(b => b.hotel === hotelKey && b.room === r && isInRange(date, b.checkin, b.checkout))
    ).length;
    footerRow.push(occCount > 0 ? `${occCount} occ` : '');
  }
  footerRow.push('', ''); // Nights, Income placeholders
  aoa.push(footerRow);

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // ── Column widths ─────────────────────────────────────────────────────────
  ws['!cols'] = [
    { wch: 7  },  // Room
    { wch: 18 },  // Type
    ...Array(days).fill({ wch: 22 }),  // Date columns
    { wch: 9  },  // Nights
    { wch: 16 },  // Income
    { wch: 12 },  // Deposit
    { wch: 25 },  // Notes
  ];

  // ── Styling via cell meta (limited in SheetJS community edition) ──────────
  // We encode basic styles using the 's' property where supported
  styleSheet(XLSX, ws, aoa, days);

  return ws;
}

function styleSheet(XLSX, ws, aoa, days) {
  // SheetJS CE supports basic style objects when using the 'xlsx' write mode
  const HEADER_STYLE = {
    font: { bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '1A7A4A' } },
    alignment: { horizontal: 'center', wrapText: true },
    border: { bottom: { style: 'thin', color: { rgb: 'AAAAAA' } } }
  };
  const TITLE_STYLE = {
    font: { bold: true, sz: 13, color: { rgb: '1A7A4A' } }
  };
  const OCC_STYLE = {
    fill: { fgColor: { rgb: 'D1FAE5' } },
    font: { sz: 9, color: { rgb: '145C38' } },
    alignment: { wrapText: true, vertical: 'center' }
  };
  const MAINT_STYLE = {
    fill: { fgColor: { rgb: 'FFFBEB' } },
    font: { sz: 9, color: { rgb: '92400E' }, italic: true }
  };
  const ALT_ROW = {
    fill: { fgColor: { rgb: 'F4F9F6' } }
  };

  const totalCols = 2 + days + 4; // Room+Type + dates + Nights+Income+Deposit+Notes

  for (const addr in ws) {
    if (addr[0] === '!') continue;
    const cell = ws[addr];
    const ref  = XLSX.utils.decode_cell(addr);
    const r    = ref.r, c = ref.c;

    if (r === 0) { cell.s = TITLE_STYLE; continue; }
    if (r === 1) { cell.s = HEADER_STYLE; continue; }

    // Last row (totals)
    if (r === aoa.length - 1) {
      cell.s = { font: { bold: true }, fill: { fgColor: { rgb: 'E8F5EE' } } };
      continue;
    }

    // Room + Type columns
    if (c === 0 || c === 1) {
      cell.s = { font: { bold: c === 0 }, fill: { fgColor: { rgb: r % 2 === 0 ? 'FFFFFF' : 'F4F9F6' } } };
      continue;
    }

    // Date columns
    if (c >= 2 && c < 2 + days) {
      const val = cell.v;
      if (typeof val === 'string' && val && val !== 'MAINT') {
        cell.s = OCC_STYLE;
      } else if (val === 'MAINT') {
        cell.s = MAINT_STYLE;
      } else {
        cell.s = r % 2 === 0 ? {} : ALT_ROW;
      }
      continue;
    }

    // Nights / Income / Deposit / Notes columns
    if (c >= 2 + days) {
      cell.s = { font: { bold: c === 2 + days + 1 }, fill: { fgColor: { rgb: 'F0F9F5' } } };
    }
  }

  // Freeze header rows and first two columns
  ws['!freeze'] = { xSplit: 2, ySplit: 2, topLeftCell: 'C3', activePane: 'bottomRight', state: 'frozen' };
}

// ── Summary sheet ─────────────────────────────────────────────────────────────
function buildSummarySheet(XLSX, months) {
  const aoa = [];
  aoa.push(['Hotel PMS — Export Summary', '', `Generated: ${new Date().toLocaleDateString('en-PH', { dateStyle: 'long' })}`]);
  aoa.push([]);

  const hotels = [
    { key: 'square', label: 'Square Hotel' },
    { key: 'pool',   label: 'Pool Hotel'   },
  ];

  for (const { key, label } of hotels) {
    aoa.push([label]);
    aoa.push(['Month', 'Occupied Nights', 'Total Rooms', 'Occupancy %', 'Estimated Income (₱)', 'Bookings']);

    for (const { year, month } of months) {
      const mLabel   = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const mStart   = startOfMonth(year, month);
      const mEnd     = endOfMonth(year, month);
      const rooms    = Object.keys(DB.hotels[key]?.rooms || {});
      const days     = daysInMonth(year, month);
      const totalSlots = rooms.length * days;

      let occNights = 0;
      for (const r of rooms) {
        for (let d = 1; d <= days; d++) {
          const date = new Date(year, month, d);
          if (DB.bookings.some(b => b.hotel === key && b.room === r && isInRange(date, b.checkin, b.checkout))) {
            occNights++;
          }
        }
      }

      const income = incomeForRange(key, mStart, mEnd);
      const bookingsInMonth = DB.bookings.filter(b => {
        if (b.hotel !== key) return false;
        const ci = parseDate(b.checkin), co = parseDate(b.checkout);
        return ci <= mEnd && co >= mStart;
      }).length;

      const pct = totalSlots > 0 ? (occNights / totalSlots * 100).toFixed(1) + '%' : '0%';
      aoa.push([mLabel, occNights, rooms.length, pct, income, bookingsInMonth]);
    }
    aoa.push([]); // spacer
  }

  // Rate table
  aoa.push(['Room Rates (₱ per night)']);
  aoa.push(['Type', 'Trip.com', 'Walk-in', 'Booking.com', 'Agoda', 'Expedia']);
  const types = [['standard', 'Standard Room'], ['family2', 'Family Room (2 pax)'], ['family3', 'Family Room (3 pax)']];
  for (const [key, name] of types) {
    const p = DB.prices[key] || {};
    aoa.push([name, p.T||0, p.W||0, p.B||0, p.AG||0, p.EX||0]);
  }
  aoa.push([]);
  aoa.push(['Add-on Rates (₱ per night)']);
  aoa.push(['Extra Head', DB.addons.extraHead || 0]);
  aoa.push(['Extra Bed',  DB.addons.extraBed  || 0]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 12 }];
  return ws;
}

// ── IMPORT ────────────────────────────────────────────────────────────────────
async function importFromExcel(file) {
  toast('Reading file…');
  const XLSX = await loadSheetJS().catch(() => null);
  if (!XLSX) { toast('Could not load Excel library — check your connection'); return; }

  const arrayBuf = await file.arrayBuffer();
  let wb;
  try {
    wb = XLSX.read(arrayBuf, { type: 'array', cellDates: true });
  } catch(e) {
    toast('❌ Could not read file — make sure it is a valid .xlsx');
    return;
  }

  let imported = 0, skipped = 0, errors = [];

  for (const sheetName of wb.SheetNames) {
    if (sheetName === 'Summary') continue;

    // Detect hotel from sheet name: names ending in "-Pool" → pool, else square
    const hotelKey = sheetName.toLowerCase().includes('pool') ? 'pool' : 'square';

    // Parse month/year from sheet name: "Jan 2026" or "Jan 2026-Pool"
    const namePart = sheetName.replace(/-Pool$/i, '').trim();
    const parsedDate = new Date(namePart + ' 1');
    if (isNaN(parsedDate)) { errors.push(`Unrecognised sheet: ${sheetName}`); continue; }
    const year  = parsedDate.getFullYear();
    const month = parsedDate.getMonth();
    const days  = daysInMonth(year, month);

    const ws  = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (aoa.length < 3) continue; // too short to have data

    // Find header row (row index 1 in our export, but be flexible)
    let headerRow = -1;
    for (let r = 0; r < Math.min(5, aoa.length); r++) {
      if (String(aoa[r][0]).toLowerCase().includes('room')) { headerRow = r; break; }
    }
    if (headerRow === -1) { errors.push(`No header found in ${sheetName}`); continue; }

    // Build date→col map from header
    const header = aoa[headerRow];
    const dateColMap = {}; // col index → day number
    for (let c = 2; c < header.length; c++) {
      const h = String(header[c]);
      // Extract day number from strings like "Mon 1", "Tue 2", or just "1"
      const match = h.match(/(\d+)/);
      if (match) dateColMap[c] = parseInt(match[1]);
    }

    // Process data rows (skip header, skip totals/footer)
    for (let r = headerRow + 1; r < aoa.length; r++) {
      const row = aoa[r];
      const roomNum = String(row[0]).trim();
      if (!roomNum || roomNum.toUpperCase() === 'TOTALS') continue;
      if (!DB.hotels[hotelKey]?.rooms[roomNum]) continue; // room not in system

      // Scan each date column
      for (const [colStr, day] of Object.entries(dateColMap)) {
        const col = parseInt(colStr);
        const cellVal = String(row[col] || '').trim();
        if (!cellVal || cellVal === 'MAINT') continue;

        // Parse cell: "SOURCE - ROOM GUESTNAME" or "AG - 101 GUEST NAME"
        // Flexible parser: try to extract source code and guest name
        const { source, guest, extraHead, extraBed } = parseCellValue(cellVal);
        if (!guest) continue;

        // Find if this booking already exists (by guest + room + overlap)
        const cellDate   = new Date(year, month, day);
        const existing   = DB.bookings.find(b =>
          b.hotel === hotelKey &&
          b.room  === roomNum  &&
          b.guest.toUpperCase() === guest.toUpperCase() &&
          isInRange(cellDate, b.checkin, b.checkout)
        );
        if (existing) { skipped++; continue; }

        // Find contiguous run of same guest in same room to determine check-in/out
        let runStart = day, runEnd = day;
        // Look backwards
        for (let d2 = day - 1; d2 >= 1; d2--) {
          const c2 = Object.entries(dateColMap).find(([,v]) => v === d2)?.[0];
          if (!c2) break;
          const v2 = String(row[parseInt(c2)] || '').trim();
          if (v2 && parseCellValue(v2).guest?.toUpperCase() === guest.toUpperCase()) runStart = d2;
          else break;
        }
        // Look forwards
        for (let d2 = day + 1; d2 <= days; d2++) {
          const c2 = Object.entries(dateColMap).find(([,v]) => v === d2)?.[0];
          if (!c2) break;
          const v2 = String(row[parseInt(c2)] || '').trim();
          if (v2 && parseCellValue(v2).guest?.toUpperCase() === guest.toUpperCase()) runEnd = d2;
          else break;
        }

        // Only create booking on the first day of the run
        if (runStart !== day) continue;

        const checkin  = fmtDate(new Date(year, month, runStart));
        const checkout = fmtDate(new Date(year, month, runEnd));

        // Check we don't already have this booking (different approach)
        const dup = DB.bookings.find(b =>
          b.hotel    === hotelKey &&
          b.room     === roomNum  &&
          b.checkin  === checkin  &&
          b.checkout === checkout &&
          b.guest.toUpperCase() === guest.toUpperCase()
        );
        if (dup) { skipped++; continue; }

        DB.bookings.push({
          id:        genId(),
          hotel:     hotelKey,
          room:      roomNum,
          guest:     toTitleCase(guest),
          source:    source,
          checkin,
          checkout,
          notes:     '',
          extraHead: extraHead || 0,
          extraBed:  extraBed  || 0,
        });
        imported++;
      }
    }
  }

  saveState();
  renderAll();

  let msg = `✅ Import done — ${imported} booking${imported !== 1 ? 's' : ''} added`;
  if (skipped) msg += `, ${skipped} duplicate${skipped !== 1 ? 's' : ''} skipped`;
  if (errors.length) msg += `. Warnings: ${errors.join('; ')}`;
  toast(msg);
  closeModal('importExportModal');
}

// Parse a cell value like "T - 101 YAMAGUCHI HIROAKI +1H" into components
function parseCellValue(raw) {
  let source = 'W', guest = '', extraHead = 0, extraBed = 0;

  // Strip extra head/bed tags first
  let str = raw;
  const headMatch = str.match(/\+(\d+)H/i);
  const bedMatch  = str.match(/\+(\d+)B/i);
  if (headMatch) { extraHead = parseInt(headMatch[1]); str = str.replace(headMatch[0], '').trim(); }
  if (bedMatch)  { extraBed  = parseInt(bedMatch[1]);  str = str.replace(bedMatch[0],  '').trim(); }

  // Source code at start before " - "
  const srcMap = { 'T':'T', 'W':'W', 'B':'B', 'AG':'AG', 'AGB':'AG', 'EX':'EX', 'EXB':'EX', 'Ag':'AG', 'Ex':'EX' };
  const srcMatch = str.match(/^([A-Za-z]+)\s*-\s*/);
  if (srcMatch) {
    const code = srcMatch[1].trim();
    source = srcMap[code] || srcMap[code.toUpperCase()] || 'W';
    str = str.slice(srcMatch[0].length).trim();
  }

  // Remove room number prefix if present (e.g. "101 GUEST NAME")
  str = str.replace(/^\d+\s+/, '').trim();

  guest = str.replace(/\s+/g, ' ').trim();
  return { source, guest, extraHead, extraBed };
}

function toTitleCase(s) {
  return s.toLowerCase().replace(/(?:^|\s|\/)\S/g, c => c.toUpperCase());
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function openImportExport() {
  document.getElementById('importExportModal').style.display = 'flex';
}

function triggerImportFile() {
  document.getElementById('importFileInput').click();
}

function handleImportFile(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  importFromExcel(file);
}
