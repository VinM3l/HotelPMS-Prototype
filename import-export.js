// ─── IMPORT / EXPORT ─────────────────────────────────────────────────────────
// EXPORT : ExcelJS  — full cell colour/style support
// IMPORT : SheetJS  — lightweight, great for reading
// ─────────────────────────────────────────────────────────────────────────────

const EXCELJS_CDN = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
const SHEETJS_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

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

// ─── COLOUR PALETTE — matches dashboard card colours ─────────────────────────
const C = {
  headerBg:       '1A7A4A', headerFg:    'FFFFFF',
  titleFg:        '1A7A4A', titleBg:     'E8F5EE',
  // Occupied — dark green, white text
  occBg:          '1A7A4A', occFg:       'FFFFFF', occBorder:  '0D3D22',
  // Paid today — medium blue, white text
  occFullBg:      '60A5FA', occFullFg:   'FFFFFF', occFullBorder: '2563EB',
  // Partial payment — medium blue (same, lighter distinction in notes)
  occPartBg:      '60A5FA', occPartFg:   'FFFFFF', occPartBorder: '2563EB',
  // Multi-guest: same dark green base
  multiBg:        '1A7A4A', multiFg:     'FFFFFF', multiBorder: '0D3D22',
  multiFullBg:    '60A5FA', multiFullFg: 'FFFFFF', multiFullBorder: '2563EB',
  multiPartBg:    '60A5FA', multiPartFg: 'FFFFFF', multiPartBorder: '2563EB',
  // Extended stays — amber + white / deeper green + white
  extBg:          'D97706', extFg:       'FFFFFF', extBorder:  '92400E',
  ext2Bg:         '15803D', ext2Fg:      'FFFFFF', ext2Border: '14532D',
  // Checkout — dark blue, white text
  checkoutBg:     '1D4ED8', checkoutFg:  'FFFFFF', checkoutBorder: '1E3A8A',
  // Invalid checkout — red, white text
  invalidBg:      'DC2626', invalidFg:   'FFFFFF', invalidBorder:  '7F1D1D',
  // Maintenance — dark grey, white text
  maintBg:        '374151', maintFg:     'FFFFFF',
  // Vacant — white
  vacantBg:       'FFFFFF', vacantFg:    '9CA3AF',
  altBg:          'F9FAFB',
  totalsBg:       'EDF7F0', notesBg:     'F0F9F5',
};

// ─── STYLE HELPERS ────────────────────────────────────────────────────────────
const hexFill = h => ({ type:'pattern', pattern:'solid', fgColor:{ argb:'FF'+h } });
const hexFont = (h, o={}) => ({ color:{argb:'FF'+h}, name:'Arial', size:o.size||9, bold:o.bold||false, italic:o.italic||false });
const side    = h => ({ style:'thin', color:{ argb:'FF'+h } });
const border  = h => { const s=side(h); return { top:s, bottom:s, left:s, right:s }; };

function applyHeader(cell) {
  cell.fill      = hexFill(C.headerBg);
  cell.font      = hexFont(C.headerFg, { bold:true, size:10 });
  cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
  cell.border    = border('AAAAAA');
}

function applyCell(cell, type, isAlt) {
  const vBg = isAlt ? C.altBg : C.vacantBg;
  const map = {
    occupied:          { bg:C.occBg,       fg:C.occFg,       bd:C.occBorder,       bold:false },
    'occ-full':        { bg:C.occFullBg,   fg:C.occFullFg,   bd:C.occFullBorder,   bold:true  },
    'occ-partial':     { bg:C.occPartBg,   fg:C.occPartFg,   bd:C.occPartBorder,   bold:false },
    multi:             { bg:C.multiBg,     fg:C.multiFg,     bd:C.multiBorder,     bold:false },
    'multi-full':      { bg:C.multiFullBg, fg:C.multiFullFg, bd:C.multiFullBorder, bold:true  },
    'multi-part':      { bg:C.multiPartBg, fg:C.multiPartFg, bd:C.multiPartBorder, bold:false },
    ext:               { bg:C.extBg,       fg:C.extFg,       bd:C.extBorder,       bold:true  },
    ext2:              { bg:C.ext2Bg,      fg:C.ext2Fg,      bd:C.ext2Border,      bold:true  },
    checkout:          { bg:C.checkoutBg,  fg:C.checkoutFg,  bd:C.checkoutBorder,  bold:true  },
    'invalid-checkout':{ bg:C.invalidBg,   fg:C.invalidFg,   bd:C.invalidBorder,   bold:true  },
    maint:             { bg:C.maintBg,     fg:C.maintFg,     bd:'1C2128',          bold:false, italic:true },
  };
  const s = map[type];
  if (s) {
    cell.fill   = hexFill(s.bg);
    cell.font   = hexFont(s.fg, { bold:s.bold, italic:s.italic||false, size:type==='multi'||type==='multi-full'||type==='multi-part'?8:9 });
    cell.border = border(s.bd);
  } else {
    cell.fill   = hexFill(vBg);
    cell.font   = hexFont(C.vacantFg, { size:9 });
    cell.border = border('E5E7EB');
  }
  cell.alignment = { vertical:'middle', wrapText:true, indent:1 };
}

// ─── DATE HELPERS ─────────────────────────────────────────────────────────────
function daysInMonth(y,m)  { return new Date(y, m+1, 0).getDate(); }
function startOfMonth(y,m) { return new Date(y, m, 1); }
function endOfMonth(y,m)   { return new Date(y, m+1, 0); }

function getExportMonths() {
  const now = new Date();
  const months = [];
  for (let i = -1; i <= 2; i++) {
    const d = new Date(now.getFullYear(), now.getMonth()+i, 1);
    months.push({ year:d.getFullYear(), month:d.getMonth() });
  }
  return months;
}

const SRC = { T:'T', W:'W', B:'B', AG:'Ag', EX:'Ex' };
const SRCLABEL = { T:'Trip.com', W:'Walk-in', B:'Booking.com', AG:'Agoda', EX:'Expedia' };

// ─── CELL TYPE ────────────────────────────────────────────────────────────────
function getCellPaymentType(booking) {
  // Returns: 'unpaid' | 'partial' | 'full'
  if (!booking) return 'unpaid';
  const paid = (booking.payments||[]).reduce((s,p)=>s+(parseFloat(p.amount)||0),0);
  if (paid <= 0) return 'unpaid';
  const roomDef = DB.hotels[booking.hotel]?.rooms[booking.room];
  if (!roomDef) return 'partial';
  const br = (DB.prices[roomDef.type]||{})[booking.source]||0;
  const ar = (booking.extraHead||0)*(DB.addons.extraHead||0)+(booking.extraBed||0)*(DB.addons.extraBed||0)+(booking.breakfast||0)*(DB.addons.breakfast||0);
  const n  = Math.max(1, Math.round((parseDate(booking.checkout)-parseDate(booking.checkin))/864e5));
  const due = applyDiscount((br+ar)*n, booking);
  if (paid >= due) return 'full';
  return 'partial';
}

// ─── BUILD ONE SHEET ──────────────────────────────────────────────────────────
function buildSheet(wb, hotelKey, hotel, rooms, year, month) {
  const days      = daysInMonth(year, month);
  const mStart    = startOfMonth(year, month);
  const mEnd      = endOfMonth(year, month);
  const monthLabel = mStart.toLocaleDateString('en-US',{month:'long',year:'numeric'});
  const suffix    = hotelKey==='pool'?'-Pool':'';
  const sheetLabel = mStart.toLocaleDateString('en-US',{month:'short',year:'numeric'})+suffix;

  const ws = wb.addWorksheet(sheetLabel.slice(0,31), {
    views:[{ state:'frozen', xSplit:2, ySplit:2 }]
  });

  // Column widths
  ws.getColumn(1).width = 8;
  ws.getColumn(2).width = 18;
  for (let d=1;d<=days;d++) ws.getColumn(d+2).width = 23;
  ws.getColumn(days+3).width = 9;
  ws.getColumn(days+4).width = 16;
  ws.getColumn(days+5).width = 12;
  ws.getColumn(days+6).width = 32;

  // Title row
  const titleRow = ws.getRow(1); titleRow.height = 22;
  const tc = titleRow.getCell(1);
  tc.value = `${hotel.name} — ${monthLabel}`;
  tc.font  = hexFont(C.titleFg,{bold:true,size:13});
  tc.fill  = hexFill(C.titleBg);
  tc.alignment = {horizontal:'left',vertical:'middle'};
  ws.mergeCells(1,1,1,days+6);

  // Header row
  const hRow = ws.getRow(2); hRow.height = 18;
  ['Room','Type'].forEach((h,i)=>{ const c=hRow.getCell(i+1); c.value=h; applyHeader(c); });
  for (let d=1;d<=days;d++) {
    const dt  = new Date(year,month,d);
    const c   = hRow.getCell(d+2);
    c.value   = dt.toLocaleDateString('en-US',{weekday:'short',day:'numeric'});
    applyHeader(c);
  }
  ['Nights','Est. Income (₱)','Key Deposit','Notes'].forEach((h,i)=>{
    const c=hRow.getCell(days+3+i); c.value=h; applyHeader(c);
  });

  // Sort rooms
  const sortedRooms = [...rooms].sort((a,b)=>{
    const an=/^\d+$/.test(a),bn=/^\d+$/.test(b);
    if(an&&bn) return parseInt(a)-parseInt(b);
    if(an) return -1; if(bn) return 1;
    return a.localeCompare(b);
  });

  sortedRooms.forEach((roomNum,ri)=>{
    const roomDef = hotel.rooms[roomNum];
    const isAlt   = ri%2===1;
    const row     = ws.getRow(ri+3); row.height=30;

    // Room cell
    const rc=row.getCell(1);
    rc.value=roomNum; rc.fill=hexFill(isAlt?C.altBg:C.vacantBg);
    rc.font=hexFont('374151',{bold:true,size:10}); rc.border=border('D1D5DB');
    rc.alignment={horizontal:'center',vertical:'middle'};

    // Type cell
    const tc2=row.getCell(2);
    tc2.value=roomDef.label; tc2.fill=hexFill(isAlt?C.altBg:C.vacantBg);
    tc2.font=hexFont('6B7280',{size:9}); tc2.border=border('D1D5DB');
    tc2.alignment={vertical:'middle'};

    let totalNights=0, totalIncome=0;

    for (let d=1;d<=days;d++) {
      const date = new Date(year,month,d);
      const cell = row.getCell(d+2);

      if (roomDef.status==='maintenance') {
        cell.value='MAINT'; applyCell(cell,'maint',isAlt); continue;
      }

      // Determine what's happening in this cell.
      // Rule: a booking "occupies" a room from checkin up to but NOT including checkout.
      //       Checkout day = special display (show departing guest) but don't double-count.
      const ds = fmtDate(date);
      const isCheckoutDay = b => b.checkout === ds;
      const isCheckinDay  = b => b.checkin  === ds;

      // Active = genuinely in the room tonight (exclusive of checkout)
      const activeBookings = DB.bookings.filter(b=>
        b.hotel===hotelKey && b.room===roomNum &&
        isInRange(date, b.checkin, b.checkout)   // exclusive: checkin <= date < checkout
      );

      // Departing today but NOT also arriving (avoid double-counting turnovers)
      const departingOnly = DB.bookings.filter(b=>
        b.hotel===hotelKey && b.room===roomNum &&
        isCheckoutDay(b) && !activeBookings.find(a=>a.id===b.id)
      );

      // What to show: active guests first, then departing if no one is active
      const displayBookings = activeBookings.length ? activeBookings : departingOnly;

      if (!displayBookings.length) {
        cell.value=''; applyCell(cell,'vacant',isAlt); continue;
      }

      const isMulti = displayBookings.length > 1;
      let cellType  = 'occupied';
      let lines     = [];

      displayBookings.forEach((booking, bi) => {
        const src  = SRC[booking.source]||booking.source;
        let txt    = `${src} - ${roomNum} ${booking.guest.toUpperCase()}`;
        if (booking.extraHead>0) txt += ` +${booking.extraHead}H`;
        if (booking.extraBed>0)  txt += ` +${booking.extraBed}B`;
        if (isCheckoutDay(booking) && !isCheckinDay(booking)) txt += ' [OUT]';

        // Checkout / invalid-checkout status (primary booking only)
        if (bi===0) {
          if (booking.invalidCheckout)      cellType = 'invalid-checkout';
          else if (booking.checkedOut)      cellType = 'checkout';
          else if (isCheckoutDay(booking))  cellType = 'checkout'; // scheduled checkout
        }

        // Extension detection (overrides 'occupied', not checkout/invalid)
        const exts = booking.extensions||[];
        if (exts.length > 0 && cellType === 'occupied') {
          const origCo = parseDate(exts[0].originalCheckout || booking.checkin); // fallback safe
          const d0 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
          if (d0 >= origCo) {
            for (let ei=0; ei<exts.length; ei++) {
              const prevEnd = ei===0 ? origCo : parseDate(exts[ei-1].checkout);
              const thisEnd = parseDate(exts[ei].checkout);
              if (d0 >= prevEnd && d0 < thisEnd) {
                txt += ei%2===0 ? ' [EXT]' : ' [EXT2]';
                if (bi===0) cellType = ei%2===0 ? 'ext' : 'ext2';
                break;
              }
            }
          }
        }

        // Payment colour — only when actually occupied (not checkout/invalid/ext)
        if (bi===0 && cellType==='occupied') {
          const pmtType = getCellPaymentType(booking);
          if      (pmtType==='full')    cellType = isMulti ? 'multi-full'  : 'occ-full';
          else if (pmtType==='partial') cellType = isMulti ? 'multi-part'  : 'occ-partial';
          else if (isMulti)             cellType = 'multi';
        }

        lines.push(txt);

        // Only count nights + income on active (non-checkout-day) cells to avoid double-counting
        if (bi===0 && !isCheckoutDay(booking)) {
          totalNights++;
          const br = (DB.prices[roomDef.type]||{})[booking.source]||0;
          const ar = (booking.extraHead||0)*(DB.addons.extraHead||0)
                   + (booking.extraBed||0)*(DB.addons.extraBed||0)
                   + (booking.breakfast||0)*(DB.addons.breakfast||0);
          const fullNights = Math.max(1, Math.round((parseDate(booking.checkout)-parseDate(booking.checkin))/864e5));
          const fullNet    = applyDiscount((br+ar)*fullNights, booking);
          totalIncome     += fullNights > 0 ? fullNet/fullNights : 0;
        }
      });

      cell.value=lines.join('\n');
      applyCell(cell,cellType,isAlt);
    }

    // Summary columns
    const monthBookings=DB.bookings.filter(b=>{
      if(b.hotel!==hotelKey||b.room!==roomNum) return false;
      return parseDate(b.checkin)<=mEnd&&parseDate(b.checkout)>=mStart;
    });
    const depositAll=monthBookings.length>0&&monthBookings.every(b=>DB.keyDeposits[b.id]);

    // Payment summary for notes
    const pmtSummary=monthBookings.map(b=>{
      const paid=(b.payments||[]).reduce((s,p)=>s+(parseFloat(p.amount)||0),0);
      if(paid<=0) return null;
      const due=bookingTotalDue(b);
      return `${b.guest.split(' ')[0]}: ${paid>0?(paid>=due?'PAID':'PART ₱'+Math.round(paid).toLocaleString()):''}`;
    }).filter(Boolean).join('; ');

    const noteStr=[monthBookings.map(b=>b.notes).filter(Boolean).join('; '),pmtSummary].filter(Boolean).join(' | ');

    const statStyle={ fill:hexFill(C.notesBg), font:hexFont('374151',{size:10}), border:border('D1D5DB'), alignment:{vertical:'middle'} };

    const nc=row.getCell(days+3); nc.value=totalNights;
    Object.assign(nc,{fill:statStyle.fill,font:statStyle.font,border:statStyle.border,alignment:statStyle.alignment});

    const ic=row.getCell(days+4); ic.value=totalIncome; ic.numFmt='₱#,##0';
    ic.fill=statStyle.fill; ic.font=hexFont('145C38',{bold:true,size:10}); ic.border=statStyle.border; ic.alignment=statStyle.alignment;

    const dc=row.getCell(days+5); dc.value=monthBookings.length===0?'':depositAll?'Yes':'No';
    Object.assign(dc,{fill:statStyle.fill,font:statStyle.font,border:statStyle.border,alignment:statStyle.alignment});

    const notec=row.getCell(days+6); notec.value=noteStr;
    notec.fill=statStyle.fill; notec.font=statStyle.font; notec.border=statStyle.border;
    notec.alignment={vertical:'middle',wrapText:true};
  });

  // Footer totals row
  const footerRow=ws.getRow(sortedRooms.length+3); footerRow.height=16;
  const f0=footerRow.getCell(1); f0.value='TOTALS';
  f0.fill=hexFill(C.totalsBg); f0.font=hexFont('145C38',{bold:true,size:10}); f0.border=border('7DC4A0');
  footerRow.getCell(2).fill=hexFill(C.totalsBg);
  for(let d=1;d<=days;d++){
    const date=new Date(year,month,d);
    // Count rooms that are genuinely occupied (exclusive of checkout day)
    const cnt=sortedRooms.filter(r=>
      DB.bookings.some(b=>b.hotel===hotelKey&&b.room===r&&isInRange(date,b.checkin,b.checkout))
    ).length;
    const fc=footerRow.getCell(d+2);
    fc.value=cnt>0?`${cnt} occ`:'';
    fc.fill=hexFill(C.totalsBg); fc.font=hexFont('145C38',{size:9,bold:cnt>0});
    fc.alignment={horizontal:'center',vertical:'middle'}; fc.border=border('7DC4A0');
  }
}

// ─── SUMMARY SHEET ────────────────────────────────────────────────────────────
function buildSummarySheet(wb, months) {
  const ws=wb.addWorksheet('Summary');
  [28,16,14,14,22,12].forEach((w,i)=>ws.getColumn(i+1).width=w);

  let rowIdx=1;
  const addTitle=(text)=>{ const row=ws.getRow(rowIdx++); row.height=20;
    const c=row.getCell(1); c.value=text; c.font=hexFont(C.titleFg,{bold:true,size:13}); c.fill=hexFill(C.titleBg); };
  const addHdr=(cols)=>{ const row=ws.getRow(rowIdx++); row.height=16;
    cols.forEach((h,i)=>{ const c=row.getCell(i+1); c.value=h; applyHeader(c); }); };
  const addData=(cols,isAlt)=>{ const row=ws.getRow(rowIdx++); row.height=16;
    cols.forEach((v,i)=>{ const c=row.getCell(i+1); c.value=v;
      c.fill=hexFill(isAlt?C.altBg:C.vacantBg); c.font=hexFont('374151',{size:10}); c.border=border('E5E7EB');
      if(typeof v==='number'&&i===4){ c.numFmt='₱#,##0'; c.font=hexFont('145C38',{bold:true,size:10}); }
    }); };

  addTitle('Hotel PMS — Export Summary'); rowIdx++;

  for(const {key,label} of [{key:'square',label:'Square Hotel'},{key:'pool',label:'Pool Hotel'}]){
    const hRow=ws.getRow(rowIdx++); hRow.height=18;
    const hc=hRow.getCell(1); hc.value=label; hc.font=hexFont('1A7A4A',{bold:true,size:12});
    addHdr(['Month','Occ. Nights','Rooms','Occupancy %','Est. Income (₱)','Bookings']);
    months.forEach(({year,month},mi)=>{
      const mLabel=new Date(year,month,1).toLocaleDateString('en-US',{month:'long',year:'numeric'});
      const mS=startOfMonth(year,month), mE=endOfMonth(year,month);
      const rms=Object.keys(DB.hotels[key]?.rooms||{});
      const days2=daysInMonth(year,month);
      let occ=0;
      rms.forEach(r=>{ for(let d=1;d<=days2;d++){
        const dt=new Date(year,month,d);
        // Exclusive of checkout day to avoid double-counting turnovers
        if(DB.bookings.some(b=>b.hotel===key&&b.room===r&&isInRange(dt,b.checkin,b.checkout))) occ++;
      }});
      const income=DB.bookings.filter(b=>b.hotel===key).reduce((s,b)=>{
        const ci=parseDate(b.checkin),co=parseDate(b.checkout);
        const st=ci<mS?mS:ci, en=co>mE?mE:co;
        if(st>en) return s;
        const n=Math.max(1,Math.round((en-st)/864e5));
        const rd=DB.hotels[key]?.rooms[b.room];
        if(!rd) return s;
        const br=(DB.prices[rd.type]||{})[b.source]||0;
        const ar=(b.extraHead||0)*(DB.addons.extraHead||0)+(b.extraBed||0)*(DB.addons.extraBed||0)+(b.breakfast||0)*(DB.addons.breakfast||0);
        return s+applyDiscount((br+ar)*n,b);
      },0);
      const bkCnt=DB.bookings.filter(b=>{ if(b.hotel!==key) return false;
        return parseDate(b.checkin)<=mE&&parseDate(b.checkout)>=mS; }).length;
      const pct=rms.length*days2>0?((occ/(rms.length*days2))*100).toFixed(1)+'%':'0%';
      addData([mLabel,occ,rms.length,pct,income,bkCnt],mi%2===1);
    });
    rowIdx++;
  }

  addTitle('Room Rates (₱/night)');
  addHdr(['Type','Trip.com','Walk-in','Booking.com','Agoda','Expedia']);
  [['standard','Standard Room'],['family2','Family (2 pax)'],['family3','Family (3 pax)']].forEach(([k,n],i)=>{
    const p=DB.prices[k]||{};
    addData([n,p.T||0,p.W||0,p.B||0,p.AG||0,p.EX||0],i%2===1);
  });
  rowIdx++;
  addTitle('Add-on Rates (₱/night)');
  addData(['Extra Head', DB.addons.extraHead||0],false);
  addData(['Extra Bed',  DB.addons.extraBed||0],true);
  addData(['Breakfast',  DB.addons.breakfast||0],false);
}

// ─── EXPORT ENTRY POINT ───────────────────────────────────────────────────────
async function exportToExcel() {
  toast('Preparing export…');
  const ExcelJS=await loadExcelJS().catch(()=>null);
  if(!ExcelJS){ toast('Could not load ExcelJS — check your internet connection'); return; }

  const wb=new ExcelJS.Workbook();
  wb.creator='Hotel PMS'; wb.created=new Date(); wb.modified=new Date();

  const months=getExportMonths();
  for(const {year,month} of months){
    for(const hotelKey of ['square','pool']){
      const hotel=DB.hotels[hotelKey]; if(!hotel) continue;
      buildSheet(wb,hotelKey,hotel,Object.keys(hotel.rooms),year,month);
    }
  }
  buildSummarySheet(wb,months);

  const buffer=await wb.xlsx.writeBuffer();
  const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=`HotelPMS_${new Date().toISOString().slice(0,10)}.xlsx`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  toast('✅ Excel exported with full colours!');
}

// ─── IMPORT (SheetJS) ─────────────────────────────────────────────────────────
async function importFromExcel(file) {
  toast('Reading file…');
  const XLSX=await loadSheetJS().catch(()=>null);
  if(!XLSX){ toast('Could not load import library — check your connection'); return; }

  const arrayBuf=await file.arrayBuffer();
  let wb2;
  try { wb2=XLSX.read(arrayBuf,{type:'array',cellDates:true}); }
  catch(e){ toast('❌ Could not read file — make sure it is a valid .xlsx'); return; }

  let imported=0,skipped=0,errors=[];

  for(const sheetName of wb2.SheetNames){
    if(['Summary','HOW TO IMPORT'].includes(sheetName)) continue;
    const hotelKey=sheetName.toLowerCase().includes('pool')?'pool':'square';
    const namePart=sheetName.replace(/-Pool$/i,'').trim();
    const parsedDate=new Date(namePart+' 1');
    if(isNaN(parsedDate)){ errors.push(`Unrecognised sheet: ${sheetName}`); continue; }

    const year=parsedDate.getFullYear(), month=parsedDate.getMonth();
    const days2=daysInMonth(year,month);
    const ws=wb2.Sheets[sheetName];
    const aoa=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
    if(aoa.length<3) continue;

    let headerRow=-1;
    for(let r=0;r<Math.min(5,aoa.length);r++){
      if(String(aoa[r][0]).toLowerCase().includes('room')){ headerRow=r; break; }
    }
    if(headerRow===-1){ errors.push(`No header in ${sheetName}`); continue; }

    const header=aoa[headerRow];
    const dateColMap={};
    for(let c=2;c<header.length;c++){
      const match=String(header[c]).match(/(\d+)/);
      if(match) dateColMap[c]=parseInt(match[1]);
    }

    for(let r=headerRow+1;r<aoa.length;r++){
      const row=aoa[r];
      const roomNum=String(row[0]).trim();
      if(!roomNum||roomNum.toUpperCase()==='TOTALS') continue;
      if(!DB.hotels[hotelKey]?.rooms[roomNum]) continue;

      for(const [colStr,day] of Object.entries(dateColMap)){
        const col=parseInt(colStr);
        const rawVal=String(row[col]||'').trim();
        // Take first line (in case of multi-guest cell)
        const cellVal=rawVal.split('\n')[0]
          .replace(/\s*\[EXT2?\]\s*/gi,'')
          .replace(/\s*\[OUT\]\s*/gi,'')
          .replace(/\s*\[PAID\]\s*/gi,'')
          .replace(/\s*\[PART\]\s*/gi,'')
          .replace(/\s*\[2G\]\s*/gi,'')
          .trim();
        if(!cellVal||cellVal==='MAINT') continue;

        const {source,guest,extraHead,extraBed}=parseCellValue(cellVal);
        if(!guest) continue;

        const cellDate=new Date(year,month,day);
        const existing=DB.bookings.find(b=>
          b.hotel===hotelKey&&b.room===roomNum&&
          b.guest.toUpperCase()===guest.toUpperCase()&&
          isInRangeInclusive(cellDate,b.checkin,b.checkout)
        );
        if(existing){ skipped++; continue; }

        let runStart=day,runEnd=day;
        for(let d2=day-1;d2>=1;d2--){
          const c2=Object.entries(dateColMap).find(([,v])=>v===d2)?.[0];
          if(!c2) break;
          const v2=String(row[parseInt(c2)]||'').split('\n')[0].replace(/\s*\[EXT2?\]|\[OUT\]|\[PAID\]|\[PART\]|\[2G\]/gi,'').trim();
          if(v2&&parseCellValue(v2).guest?.toUpperCase()===guest.toUpperCase()) runStart=d2; else break;
        }
        for(let d2=day+1;d2<=days2;d2++){
          const c2=Object.entries(dateColMap).find(([,v])=>v===d2)?.[0];
          if(!c2) break;
          const v2=String(row[parseInt(c2)]||'').split('\n')[0].replace(/\s*\[EXT2?\]|\[OUT\]|\[PAID\]|\[PART\]|\[2G\]/gi,'').trim();
          if(v2&&parseCellValue(v2).guest?.toUpperCase()===guest.toUpperCase()) runEnd=d2; else break;
        }
        if(runStart!==day){ skipped++; continue; }

        const checkin=fmtDate(new Date(year,month,runStart));
        const checkout=fmtDate(new Date(year,month,runEnd));
        const dup=DB.bookings.find(b=>
          b.hotel===hotelKey&&b.room===roomNum&&
          b.checkin===checkin&&b.checkout===checkout&&
          b.guest.toUpperCase()===guest.toUpperCase()
        );
        if(dup){ skipped++; continue; }

        DB.bookings.push({
          id:genId(),hotel:hotelKey,room:roomNum,
          guest:toTitleCase(guest),source,checkin,checkout,
          notes:'',extraHead:extraHead||0,extraBed:extraBed||0,
          extensions:[],payments:[],
        });
        imported++;
      }
    }
  }

  saveState(); renderAll();
  let msg=`✅ Import done — ${imported} booking${imported!==1?'s':''} added`;
  if(skipped) msg+=`, ${skipped} duplicate${skipped!==1?'s':''} skipped`;
  if(errors.length) msg+=`. Warnings: ${errors.join('; ')}`;
  toast(msg);
  closeModal('importExportModal');
}

// ─── CELL PARSER ─────────────────────────────────────────────────────────────
function parseCellValue(raw) {
  let source='W',guest='',extraHead=0,extraBed=0;
  let str=raw.replace(/\s*\[EXT2?\]|\[OUT\]|\[PAID\]|\[PART\]|\[2G\]/gi,'').trim();
  const hm=str.match(/\+(\d+)H/i); const bm=str.match(/\+(\d+)B/i);
  if(hm){ extraHead=parseInt(hm[1]); str=str.replace(hm[0],'').trim(); }
  if(bm){ extraBed =parseInt(bm[1]); str=str.replace(bm[0],'').trim(); }
  const srcMap={T:'T',W:'W',B:'B',AG:'AG',AGB:'AG',EX:'EX',EXB:'EX',Ag:'AG',Ex:'EX'};
  const sm=str.match(/^([A-Za-z]+)\s*-\s*/);
  if(sm){ source=srcMap[sm[1]]||srcMap[sm[1].toUpperCase()]||'W'; str=str.slice(sm[0].length).trim(); }
  str=str.replace(/^\d+\s+/,'').trim();
  guest=str.replace(/\s+/g,' ').trim();
  return {source,guest,extraHead,extraBed};
}

function toTitleCase(s) {
  return s.toLowerCase().replace(/(?:^|\s|\/)\S/g,c=>c.toUpperCase());
}

// ─── UI ───────────────────────────────────────────────────────────────────────
function openImportExport()  { document.getElementById('importExportModal').style.display='flex'; }
function triggerImportFile() { document.getElementById('importFileInput').click(); }
function handleImportFile(input) {
  const file=input.files[0]; if(!file) return;
  input.value=''; importFromExcel(file);
}
