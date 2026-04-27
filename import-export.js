// ─── IMPORT / EXPORT ─────────────────────────────────────────────────────────
// EXPORT: uses ExcelJS (supports full cell colouring/styling)
// IMPORT: uses SheetJS  (lightweight, great for reading)
// Both load from CDN on first use.
// ─────────────────────────────────────────────────────────────────────────────

const EXCELJS_CDN  = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
const SHEETJS_CDN  = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

function loadScript(url, windowKey) {
  return new Promise((resolve, reject) => {
    if (window[windowKey]) { resolve(window[windowKey]); return; }
    const s = document.createElement('script');
    s.src = url;
    s.onload  = () => resolve(window[windowKey]);
    s.onerror = () => reject(new Error(`Failed to load ${url}`));
    document.head.appendChild(s);
  });
}
const loadExcelJS = () => loadScript(EXCELJS_CDN, 'ExcelJS');
const loadSheetJS = () => loadScript(SHEETJS_CDN, 'XLSX');

// ─── COLOUR PALETTE (matches dashboard CSS exactly) ──────────────────────────
const COLOURS = {
  // Header
  headerBg:    '1A7A4A',
  headerFg:    'FFFFFF',
  titleFg:     '1A7A4A',
  // Occupied: darker pastel green
  occBg:       'C6EDD5',
  occFg:       '145C38',
  occBorder:   '7DC4A0',
  // Extended #1: yellow
  extBg:       'FEF9C3',
  extFg:       '713F12',
  extBorder:   'FDE047',
  // Extended #2 alt: deeper green
  ext2Bg:      'DCFCE7',
  ext2Fg:      '14532D',
  ext2Border:  '86EFAC',
  // Maintenance: light grey
  maintBg:     'F3F4F6',
  maintFg:     '4B5563',
  // Vacant: white
  vacantBg:    'FFFFFF',
  vacantFg:    '9CA3AF',
  // Alternating row tint
  altBg:       'F9FAFB',
  // Summary / totals
  totalsBg:    'EDF7F0',
  notesBg:     'F0F9F5',
};

// ─── DATE / PERIOD HELPERS ────────────────────────────────────────────────────
function startOfMonth(y, m) { return new Date(y, m, 1); }
function endOfMonth(y, m)   { return new Date(y, m + 1, 0); }
function daysInMonth(y, m)  { return new Date(y, m + 1, 0).getDate(); }

function getExportMonths() {
  const now  = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), 1);
  const months = [];
  for (let i = -1; i <= 2; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() });
  }
  return months;
}

function excelSheetName(hotelKey, year, month) {
  const label = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  return hotelKey === 'pool' ? `${label}-Pool` : label;
}

const SRC_CODE = { T:'T', W:'W', B:'B', AG:'Ag', EX:'Ex' };

// ─── CELL TYPE DETECTION ──────────────────────────────────────────────────────
function getCellType(cellText) {
  if (!cellText)                     return 'vacant';
  if (cellText === 'MAINT')          return 'maint';
  if (cellText.includes('[EXT2]'))   return 'ext2';
  if (cellText.includes('[EXT]'))    return 'ext';
  return 'occupied';
}

// ─── EXCELJS STYLE HELPERS ────────────────────────────────────────────────────
function hexFill(hex) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex } };
}
function hexFont(hex, opts = {}) {
  return { color: { argb: 'FF' + hex }, name: 'Arial', size: opts.size || 9,
           bold: opts.bold || false, italic: opts.italic || false };
}
function thinBorder(hex) {
  const s = { style: 'thin', color: { argb: 'FF' + hex } };
  return { top: s, bottom: s, left: s, right: s };
}

function applyHeaderStyle(cell) {
  cell.fill      = hexFill(COLOURS.headerBg);
  cell.font      = hexFont(COLOURS.headerFg, { bold: true, size: 10 });
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.border    = thinBorder('AAAAAA');
}

function applyTitleStyle(cell) {
  cell.font      = hexFont(COLOURS.titleFg, { bold: true, size: 13 });
  cell.fill      = hexFill('E8F5EE');
  cell.alignment = { horizontal: 'left', vertical: 'middle' };
}

function applyCellStyle(cell, type, isAltRow) {
  const rowBg = isAltRow ? COLOURS.altBg : COLOURS.vacantBg;
  switch (type) {
    case 'occupied':
      cell.fill   = hexFill(COLOURS.occBg);
      cell.font   = hexFont(COLOURS.occFg, { size: 9 });
      cell.border = thinBorder(COLOURS.occBorder);
      break;
    case 'ext':
      cell.fill   = hexFill(COLOURS.extBg);
      cell.font   = hexFont(COLOURS.extFg, { bold: true, size: 9 });
      cell.border = thinBorder(COLOURS.extBorder);
      break;
    case 'ext2':
      cell.fill   = hexFill(COLOURS.ext2Bg);
      cell.font   = hexFont(COLOURS.ext2Fg, { bold: true, size: 9 });
      cell.border = thinBorder(COLOURS.ext2Border);
      break;
    case 'maint':
      cell.fill   = hexFill(COLOURS.maintBg);
      cell.font   = hexFont(COLOURS.maintFg, { italic: true, size: 9 });
      cell.border = thinBorder('D1D5DB');
      break;
    default: // vacant
      cell.fill   = hexFill(rowBg);
      cell.font   = hexFont(COLOURS.vacantFg, { size: 9 });
      cell.border = thinBorder('E5E7EB');
  }
  cell.alignment = { vertical: 'middle', wrapText: true, indent: 1 };
}

// ─── BUILD ONE SHEET ──────────────────────────────────────────────────────────
function buildSheet(wb, hotelKey, hotel, rooms, year, month) {
  const days      = daysInMonth(year, month);
  const mStart    = startOfMonth(year, month);
  const mEnd      = endOfMonth(year, month);
  const monthLabel = mStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const sheetName  = excelSheetName(hotelKey, year, month);

  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 2 }]
  });

  // ── Column widths ──
  ws.getColumn(1).width = 8;   // Room
  ws.getColumn(2).width = 18;  // Type (hidden in compact view)
  for (let d = 1; d <= days; d++) ws.getColumn(d + 2).width = 23;
  ws.getColumn(days + 3).width = 9;   // Nights
  ws.getColumn(days + 4).width = 16;  // Income
  ws.getColumn(days + 5).width = 12;  // Deposit
  ws.getColumn(days + 6).width = 28;  // Notes

  // ── Row 1: Title ──
  const titleRow = ws.getRow(1);
  titleRow.height = 22;
  const titleCell = titleRow.getCell(1);
  titleCell.value = `${hotel.name} — ${monthLabel}`;
  applyTitleStyle(titleCell);
  ws.mergeCells(1, 1, 1, days + 6);

  // ── Row 2: Headers ──
  const hdrRow = ws.getRow(2);
  hdrRow.height = 18;
  const headers = ['Room', 'Type'];
  for (let d = 1; d <= days; d++) {
    const dt = new Date(year, month, d);
    headers.push(dt.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }));
  }
  headers.push('Nights', 'Est. Income (₱)', 'Key Deposit', 'Notes');
  headers.forEach((h, i) => {
    const c = hdrRow.getCell(i + 1);
    c.value = h;
    applyHeaderStyle(c);
  });

  // ── Data rows ──
  const sortedRooms = [...rooms].sort((a, b) => {
    const an = /^\d+$/.test(a), bn = /^\d+$/.test(b);
    if (an && bn) return parseInt(a) - parseInt(b);
    if (an) return -1; if (bn) return 1;
    return a.localeCompare(b);
  });

  sortedRooms.forEach((roomNum, ri) => {
    const roomDef   = hotel.rooms[roomNum];
    const rowIdx    = ri + 3;
    const isAlt     = ri % 2 === 1;
    const row       = ws.getRow(rowIdx);
    row.height      = 30;

    // Room number cell
    const roomCell  = row.getCell(1);
    roomCell.value  = roomNum;
    roomCell.fill   = hexFill(isAlt ? COLOURS.altBg : COLOURS.vacantBg);
    roomCell.font   = hexFont('374151', { bold: true, size: 10 });
    roomCell.alignment = { horizontal: 'center', vertical: 'middle' };
    roomCell.border = thinBorder('D1D5DB');

    // Type cell
    const typeCell  = row.getCell(2);
    typeCell.value  = roomDef.label;
    typeCell.fill   = hexFill(isAlt ? COLOURS.altBg : COLOURS.vacantBg);
    typeCell.font   = hexFont('6B7280', { size: 9 });
    typeCell.alignment = { vertical: 'middle' };
    typeCell.border = thinBorder('D1D5DB');

    let totalNights = 0, totalIncome = 0;

    for (let d = 1; d <= days; d++) {
      const date    = new Date(year, month, d);
      const booking = DB.bookings.find(b =>
        b.hotel === hotelKey && b.room === roomNum && isInRange(date, b.checkin, b.checkout)
      );

      const col  = d + 2;
      const cell = row.getCell(col);

      if (booking) {
        const src  = SRC_CODE[booking.source] || booking.source;
        const name = booking.guest.toUpperCase();
        let txt    = `${src} - ${roomNum} ${name}`;
        if (booking.extraHead > 0) txt += ` +${booking.extraHead}H`;
        if (booking.extraBed  > 0) txt += ` +${booking.extraBed}B`;

        // Detect extension period
        const exts = booking.extensions || [];
        if (exts.length > 0) {
          const origCo = parseDate(exts[0].originalCheckout || booking.checkout);
          const d0 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
          if (d0 > origCo) {
            for (let ei = 0; ei < exts.length; ei++) {
              const prevEnd = ei === 0 ? origCo : parseDate(exts[ei-1].checkout);
              const thisEnd = parseDate(exts[ei].checkout);
              if (d0 > prevEnd && d0 <= thisEnd) {
                txt += ei % 2 === 0 ? ' [EXT]' : ' [EXT2]';
                break;
              }
            }
          }
        }

        cell.value = txt;
        applyCellStyle(cell, getCellType(txt), isAlt);
        totalNights++;

        const baseRate = (DB.prices[roomDef.type] || {})[booking.source] || 0;
        const addon    = (booking.extraHead||0)*(DB.addons.extraHead||0)
                       + (booking.extraBed||0)*(DB.addons.extraBed||0);
        totalIncome += baseRate + addon;

      } else if (roomDef.status === 'maintenance') {
        cell.value = 'MAINT';
        applyCellStyle(cell, 'maint', isAlt);
      } else {
        cell.value = '';
        applyCellStyle(cell, 'vacant', isAlt);
      }
    }

    // Totals columns
    const monthBookings = DB.bookings.filter(b => {
      if (b.hotel !== hotelKey || b.room !== roomNum) return false;
      const ci = parseDate(b.checkin), co = parseDate(b.checkout);
      return ci <= mEnd && co >= mStart;
    });
    const depositAll = monthBookings.length > 0 && monthBookings.every(b => hasKeyDeposit(b.id));
    const noteStr    = monthBookings.map(b => b.notes).filter(Boolean).join('; ');

    const statStyle = { fill: hexFill(COLOURS.notesBg), font: hexFont('374151', { size: 10 }), border: thinBorder('D1D5DB') };

    const nc = row.getCell(days + 3);
    nc.value = totalNights;
    Object.assign(nc, statStyle);

    const ic = row.getCell(days + 4);
    ic.value     = totalIncome;
    ic.numFmt    = '₱#,##0';
    ic.fill      = statStyle.fill;
    ic.font      = hexFont('145C38', { bold: true, size: 10 });
    ic.border    = statStyle.border;

    const dc = row.getCell(days + 5);
    dc.value = monthBookings.length === 0 ? '' : depositAll ? 'Yes' : 'No';
    Object.assign(dc, statStyle);

    const notec = row.getCell(days + 6);
    notec.value = noteStr;
    Object.assign(notec, statStyle);
    notec.alignment = { vertical: 'middle', wrapText: true };
  });

  // ── Footer: occupancy count per day ──
  const footerRow = ws.getRow(sortedRooms.length + 3);
  footerRow.height = 16;
  const fc0 = footerRow.getCell(1);
  fc0.value  = 'TOTALS';
  fc0.fill   = hexFill(COLOURS.totalsBg);
  fc0.font   = hexFont('145C38', { bold: true, size: 10 });
  fc0.border = thinBorder('7DC4A0');
  footerRow.getCell(2).fill = hexFill(COLOURS.totalsBg);

  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month, d);
    const cnt  = sortedRooms.filter(r =>
      DB.bookings.some(b => b.hotel === hotelKey && b.room === r && isInRange(date, b.checkin, b.checkout))
    ).length;
    const fc = footerRow.getCell(d + 2);
    fc.value  = cnt > 0 ? `${cnt} occ` : '';
    fc.fill   = hexFill(COLOURS.totalsBg);
    fc.font   = hexFont('145C38', { size: 9, bold: cnt > 0 });
    fc.alignment = { horizontal: 'center', vertical: 'middle' };
    fc.border = thinBorder('7DC4A0');
  }
}

// ─── BUILD SUMMARY SHEET ──────────────────────────────────────────────────────
function buildSummarySheet(wb, months) {
  const ws = wb.addWorksheet('Summary');
  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 14;
  ws.getColumn(4).width = 14;
  ws.getColumn(5).width = 22;
  ws.getColumn(6).width = 12;

  let rowIdx = 1;

  const addTitle = (text) => {
    const row = ws.getRow(rowIdx++);
    const c   = row.getCell(1);
    c.value   = text;
    c.font    = hexFont(COLOURS.titleFg, { bold: true, size: 13 });
    c.fill    = hexFill('E8F5EE');
    row.height = 20;
  };

  const addHeader = (cols) => {
    const row = ws.getRow(rowIdx++);
    cols.forEach((h, i) => {
      const c = row.getCell(i + 1);
      c.value = h;
      applyHeaderStyle(c);
    });
    row.height = 16;
  };

  const addDataRow = (cols, isAlt) => {
    const row = ws.getRow(rowIdx++);
    cols.forEach((v, i) => {
      const c = row.getCell(i + 1);
      c.value  = v;
      c.fill   = hexFill(isAlt ? COLOURS.altBg : COLOURS.vacantBg);
      c.font   = hexFont('374151', { size: 10 });
      c.border = thinBorder('E5E7EB');
      if (typeof v === 'number' && i === 4) {
        c.numFmt = '₱#,##0';
        c.font   = hexFont('145C38', { bold: true, size: 10 });
      }
    });
    row.height = 16;
  };

  addTitle('Hotel PMS — Export Summary');
  rowIdx++; // spacer

  const hotels = [{ key:'square', label:'Square Hotel' }, { key:'pool', label:'Pool Hotel' }];
  for (const { key, label } of hotels) {
    const hRow = ws.getRow(rowIdx++);
    const hc   = hRow.getCell(1);
    hc.value   = label;
    hc.font    = hexFont('1A7A4A', { bold: true, size: 12 });
    hRow.height = 18;

    addHeader(['Month', 'Occupied Nights', 'Total Rooms', 'Occupancy %', 'Est. Income (₱)', 'Bookings']);
    months.forEach(({ year, month }, mi) => {
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
      const bkCount = DB.bookings.filter(b => {
        if (b.hotel !== key) return false;
        const ci = parseDate(b.checkin), co = parseDate(b.checkout);
        return ci <= mEnd && co >= mStart;
      }).length;
      const pct = totalSlots > 0 ? (occNights / totalSlots * 100).toFixed(1) + '%' : '0%';
      addDataRow([mLabel, occNights, rooms.length, pct, income, bkCount], mi % 2 === 1);
    });
    rowIdx++; // spacer
  }

  // Rate table
  addTitle('Room Rates (₱ per night)');
  addHeader(['Type', 'Trip.com', 'Walk-in', 'Booking.com', 'Agoda', 'Expedia']);
  const types = [['standard','Standard Room'],['family2','Family (2 pax)'],['family3','Family (3 pax)']];
  types.forEach(([key, name], i) => {
    const p = DB.prices[key] || {};
    addDataRow([name, p.T||0, p.W||0, p.B||0, p.AG||0, p.EX||0], i % 2 === 1);
  });
  rowIdx++;
  addTitle('Add-on Rates (₱ per night)');
  addDataRow(['Extra Head (per person)', DB.addons.extraHead||0], false);
  addDataRow(['Extra Bed (per bed)', DB.addons.extraBed||0], true);
}

// ─── EXPORT ENTRY POINT ───────────────────────────────────────────────────────
async function exportToExcel() {
  toast('Preparing export…');
  const ExcelJS = await loadExcelJS().catch(() => null);
  if (!ExcelJS) { toast('Could not load ExcelJS — check your connection'); return; }

  const wb     = new ExcelJS.Workbook();
  wb.creator   = 'Hotel PMS';
  wb.created   = new Date();
  wb.modified  = new Date();

  const months = getExportMonths();
  const hotels = ['square', 'pool'];

  for (const { year, month } of months) {
    for (const hotelKey of hotels) {
      const hotel = DB.hotels[hotelKey];
      if (!hotel) continue;
      const rooms = Object.keys(hotel.rooms);
      buildSheet(wb, hotelKey, hotel, rooms, year, month);
    }
  }

  buildSummarySheet(wb, months);

  // Write to buffer and trigger download
  const buffer   = await wb.xlsx.writeBuffer();
  const blob     = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement('a');
  a.href         = url;
  a.download     = `HotelPMS_${new Date().toISOString().slice(0,10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  toast('✅ Excel exported with colours!');
}

// ─── IMPORT (SheetJS — unchanged) ────────────────────────────────────────────
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
    if (sheetName === 'Summary' || sheetName === 'HOW TO IMPORT') continue;

    const hotelKey   = sheetName.toLowerCase().includes('pool') ? 'pool' : 'square';
    const namePart   = sheetName.replace(/-Pool$/i, '').trim();
    const parsedDate = new Date(namePart + ' 1');
    if (isNaN(parsedDate)) { errors.push(`Unrecognised sheet: ${sheetName}`); continue; }

    const year  = parsedDate.getFullYear();
    const month = parsedDate.getMonth();
    const days  = daysInMonth(year, month);
    const ws    = wb.Sheets[sheetName];
    const aoa   = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (aoa.length < 3) continue;

    let headerRow = -1;
    for (let r = 0; r < Math.min(5, aoa.length); r++) {
      if (String(aoa[r][0]).toLowerCase().includes('room')) { headerRow = r; break; }
    }
    if (headerRow === -1) { errors.push(`No header in ${sheetName}`); continue; }

    const header     = aoa[headerRow];
    const dateColMap = {};
    for (let c = 2; c < header.length; c++) {
      const match = String(header[c]).match(/(\d+)/);
      if (match) dateColMap[c] = parseInt(match[1]);
    }

    for (let r = headerRow + 1; r < aoa.length; r++) {
      const row     = aoa[r];
      const roomNum = String(row[0]).trim();
      if (!roomNum || roomNum.toUpperCase() === 'TOTALS') continue;
      if (!DB.hotels[hotelKey]?.rooms[roomNum]) continue;

      for (const [colStr, day] of Object.entries(dateColMap)) {
        const col     = parseInt(colStr);
        const cellVal = String(row[col] || '').trim().replace(/\s*\[EXT2?\]\s*/gi, '').trim();
        if (!cellVal || cellVal === 'MAINT') continue;

        const { source, guest, extraHead, extraBed } = parseCellValue(cellVal);
        if (!guest) continue;

        const cellDate = new Date(year, month, day);
        const existing = DB.bookings.find(b =>
          b.hotel === hotelKey && b.room === roomNum &&
          b.guest.toUpperCase() === guest.toUpperCase() &&
          isInRange(cellDate, b.checkin, b.checkout)
        );
        if (existing) { skipped++; continue; }

        let runStart = day, runEnd = day;
        for (let d2 = day - 1; d2 >= 1; d2--) {
          const c2 = Object.entries(dateColMap).find(([,v]) => v === d2)?.[0];
          if (!c2) break;
          const v2 = String(row[parseInt(c2)] || '').trim().replace(/\s*\[EXT2?\]\s*/gi,'').trim();
          if (v2 && parseCellValue(v2).guest?.toUpperCase() === guest.toUpperCase()) runStart = d2;
          else break;
        }
        for (let d2 = day + 1; d2 <= days; d2++) {
          const c2 = Object.entries(dateColMap).find(([,v]) => v === d2)?.[0];
          if (!c2) break;
          const v2 = String(row[parseInt(c2)] || '').trim().replace(/\s*\[EXT2?\]\s*/gi,'').trim();
          if (v2 && parseCellValue(v2).guest?.toUpperCase() === guest.toUpperCase()) runEnd = d2;
          else break;
        }
        if (runStart !== day) continue;

        const checkin  = fmtDate(new Date(year, month, runStart));
        const checkout = fmtDate(new Date(year, month, runEnd));
        const dup = DB.bookings.find(b =>
          b.hotel === hotelKey && b.room === roomNum &&
          b.checkin === checkin && b.checkout === checkout &&
          b.guest.toUpperCase() === guest.toUpperCase()
        );
        if (dup) { skipped++; continue; }

        DB.bookings.push({
          id: genId(), hotel: hotelKey, room: roomNum,
          guest: toTitleCase(guest), source, checkin, checkout,
          notes: '', extraHead: extraHead||0, extraBed: extraBed||0,
          extensions: [],
        });
        imported++;
      }
    }
  }

  saveState();
  renderAll();

  let msg = `✅ Import done — ${imported} booking${imported!==1?'s':''} added`;
  if (skipped) msg += `, ${skipped} duplicate${skipped!==1?'s':''} skipped`;
  if (errors.length) msg += `. Warnings: ${errors.join('; ')}`;
  toast(msg);
  closeModal('importExportModal');
}

// ─── CELL PARSER ─────────────────────────────────────────────────────────────
function parseCellValue(raw) {
  let source = 'W', guest = '', extraHead = 0, extraBed = 0;
  let str    = raw.replace(/\s*\[EXT2?\]\s*/gi, '').trim();

  const headMatch = str.match(/\+(\d+)H/i);
  const bedMatch  = str.match(/\+(\d+)B/i);
  if (headMatch) { extraHead = parseInt(headMatch[1]); str = str.replace(headMatch[0],'').trim(); }
  if (bedMatch)  { extraBed  = parseInt(bedMatch[1]);  str = str.replace(bedMatch[0],'').trim(); }

  const srcMap   = { T:'T', W:'W', B:'B', AG:'AG', AGB:'AG', EX:'EX', EXB:'EX', Ag:'AG', Ex:'EX' };
  const srcMatch = str.match(/^([A-Za-z]+)\s*-\s*/);
  if (srcMatch) {
    const code = srcMatch[1].trim();
    source = srcMap[code] || srcMap[code.toUpperCase()] || 'W';
    str    = str.slice(srcMatch[0].length).trim();
  }
  str   = str.replace(/^\d+\s+/, '').trim();
  guest = str.replace(/\s+/g, ' ').trim();
  return { source, guest, extraHead, extraBed };
}

function toTitleCase(s) {
  return s.toLowerCase().replace(/(?:^|\s|\/)\S/g, c => c.toUpperCase());
}

// ─── UI HELPERS ───────────────────────────────────────────────────────────────
function openImportExport()  { document.getElementById('importExportModal').style.display = 'flex'; }
function triggerImportFile() { document.getElementById('importFileInput').click(); }
function handleImportFile(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  importFromExcel(file);
}
