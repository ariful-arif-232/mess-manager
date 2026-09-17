/* Mess workbook export (.xlsx).
 *
 * Modelled on the mess's own Google Sheet, which has two tabs:
 *
 *   Bazar         — Date | Chal | Murgi | Mach | Tel | Dim | Mosla |
 *                   Kacha Bazar | Others | Taka, each cell carrying the item
 *                   with its quantity and price together ("Chal 10 kg = 600"),
 *                   and a grand total under the Taka column.
 *   Khawa & Taka  — a Taka Joma block (one column per member, their deposits
 *                   down the column), the Wifi / Current / Gas bill block, and
 *                   the Name | Khawa Bill | Wifi | Gas | Current | Total | Due
 *                   table.
 *
 * The file is assembled here rather than with a library: an .xlsx is a ZIP of
 * XML parts, and a stored (uncompressed) ZIP is a few dozen lines, which is
 * cheaper than pulling a spreadsheet library into a page that already loads
 * three CDN scripts.
 */
'use strict';
(() => {
  if (window.__mmBazarExport) return;
  window.__mmBazarExport = true;

  /* ------------------------------------------------------------- zip ---- */
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c >>> 0;
    }
    return table;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* Stored-mode ZIP. Entries keep a fixed 1980-01-01 timestamp so the same
     data always produces the same bytes. */
  function zip(entries) {
    const encoder = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    for (const entry of entries) {
      const name = encoder.encode(entry.name);
      const data = entry.data;
      const crc = crc32(data);

      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(10, 0, true);          // stored
      lv.setUint16(12, 0x0021, true);     // 1980-01-01
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, name.length, true);
      local.set(name, 30);

      const record = new Uint8Array(46 + name.length);
      const cv = new DataView(record.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(14, 0x0021, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      record.set(name, 46);

      parts.push(local, data);
      central.push(record);
      offset += local.length + data.length;
    }
    const directory = central.reduce((sum, r) => sum + r.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, central.length, true);
    ev.setUint16(10, central.length, true);
    ev.setUint32(12, directory, true);
    ev.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end],
      {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }

  /* ----------------------------------------------------------- sheets --- */
  const xml = value => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    // control characters are not legal in XML 1.0 and Excel rejects the file
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  const bytes = text => new TextEncoder().encode(text);
  const colName = index => {
    let name = '';
    let n = index;
    do { name = String.fromCharCode(65 + (n % 26)) + name; n = Math.floor(n / 26) - 1; } while (n >= 0);
    return name;
  };

  /* Style ids, in the order they appear in cellXfs below. */
  const S = {plain: 0, title: 1, subtitle: 2, banner: 3, head: 4, headGreen: 5,
    date: 6, cell: 7, money: 8, totalText: 9, totalMoney: 10, member: 11,
    tint: 12, tintMoney: 13};

  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.##"/></numFmts>
<fonts count="7">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="16"/><color rgb="FF10285F"/><name val="Calibri"/></font>
<font><sz val="10"/><color rgb="FF6B7A92"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FF10285F"/><name val="Calibri"/></font>
<font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FF1B2A44"/><name val="Calibri"/></font>
</fonts>
<fills count="9">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF2457D6"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEAF0FB"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFD93A3A"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1E9E5A"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE9FBFC"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEEF0FF"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF6E6"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFD3DEEE"/></left><right style="thin"><color rgb="FFD3DEEE"/></right><top style="thin"><color rgb="FFD3DEEE"/></top><bottom style="thin"><color rgb="FFD3DEEE"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="14">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="5" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="164" fontId="4" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="6" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  function sheetXml({rows, widths, freeze, merges}) {
    const cols = widths?.length
      ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
      : '';
    const pane = freeze
      ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${freeze}" topLeftCell="A${freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
    const body = rows.map((cells, r) => {
      const number = r + 1;
      const tall = (cells || []).some(cell => typeof cell?.v === 'string' && cell.v.includes('\n'));
      const height = tall ? ' ht="34" customHeight="1"' : '';
      const painted = (cells || []).map((cell, c) => {
        if (cell === null || cell === undefined) return '';
        const ref = `${colName(c)}${number}`;
        const style = cell.s ? ` s="${cell.s}"` : '';
        if (typeof cell.n === 'number' && Number.isFinite(cell.n)) {
          return `<c r="${ref}"${style}><v>${cell.n}</v></c>`;
        }
        const text = cell.v ?? '';
        if (text === '') return `<c r="${ref}"${style}/>`;
        return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
      }).join('');
      return `<row r="${number}"${height}>${painted}</row>`;
    }).join('');
    const merged = merges?.length
      ? `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
      : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}${cols}<sheetData>${body}</sheetData>${merged}</worksheet>`;
  }

  function workbook(sheets) {
    const files = [
      {name: '[Content_Types].xml', data: bytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`)},
      {name: '_rels/.rels', data: bytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`)},
      {name: 'xl/workbook.xml', data: bytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`)},
      {name: 'xl/_rels/workbook.xml.rels', data: bytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`)},
      {name: 'xl/styles.xml', data: bytes(STYLES)},
    ];
    sheets.forEach((sheet, i) => files.push({name: `xl/worksheets/sheet${i + 1}.xml`, data: bytes(sheetXml(sheet))}));
    return zip(files);
  }

  /* ------------------------------------------------------------- data --- */
  const num = value => Math.round((Number(value) || 0) * 100) / 100;
  const shortDate = value => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value || '');
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const monthLabel = month => {
    const [y, m] = String(month || '').split('-').map(Number);
    if (!y || !m) return String(month || '');
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {month: 'long', year: 'numeric', timeZone: 'UTC'});
  };
  const activeList = () => (db.members || []).filter(m => m.active !== false);

  /* The sheet's columns, and how an app item lands in one. Staples match on
     the category the editor stores; spices are matched on the item name
     because the app has no মসলা category and the sheet keeps holud, jira and
     lobon together in Mosla rather than under Kacha Bazar. */
  const SPICE = /হলুদ|মরিচ|জিরা|ধনিয়া|লবণ|দারচিনি|এলাচ|তেজপাতা|গরম\s*মসলা|মসলা|holud|moris|morich|zira|jira|dhon|dhun|lobon|salt|darchini|elach|tejpata|mosla|masala|spice/i;
  const COLUMNS = [
    {key: 'Chal', category: 'চাল'},
    {key: 'Murgi', category: 'মুরগি'},
    {key: 'Mach', category: 'মাছ'},
    {key: 'Tel', category: 'তেল'},
    {key: 'Dim', category: 'ডিম'},
    {key: 'Mosla', category: 'মসলা'},
    {key: 'Kacha Bazar', category: 'কাঁচাবাজার'},
    {key: 'Others', category: null},
  ];
  function columnFor(item) {
    const name = String(item.item_name || '');
    const category = String(item.category || '');
    const staple = COLUMNS.findIndex(col => col.category && col.category === category && col.key !== 'Mosla' && col.key !== 'Kacha Bazar');
    if (staple >= 0) return staple;
    if (SPICE.test(name) || SPICE.test(category)) return COLUMNS.findIndex(col => col.key === 'Mosla');
    const kacha = COLUMNS.findIndex(col => col.category === category);
    return kacha >= 0 ? kacha : COLUMNS.length - 1;
  }
  const itemTotal = item => num(item.entered_total ?? item.total ?? (Number(item.quantity) * Number(item.unit_price)));
  /* "Chal 10 kg = 600" — quantity and price in the one cell, as in the sheet. */
  function itemLabel(item) {
    const total = itemTotal(item);
    const quantity = Number(item.quantity);
    const unit = String(item.unit || '').trim();
    const size = Number.isFinite(quantity) && quantity > 0 ? `${quantity}${unit ? ' ' + unit : ''} ` : '';
    return `${item.item_name || 'Item'} ${size}= ${total}`.replace(/\s+/g, ' ');
  }

  function bazarSheet() {
    const head = [{v: 'Date', s: S.head}, ...COLUMNS.map(col => ({v: col.key, s: S.head})), {v: 'Taka', s: S.head}];
    const rows = [
      [{v: 'Bazar List', s: S.banner}, ...Array(COLUMNS.length + 1).fill({v: '', s: S.banner})],
      head,
    ];
    let grand = 0;
    const entries = [...(db.bazar || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    for (const entry of entries) {
      const buckets = COLUMNS.map(() => []);
      let total = 0;
      const items = entry.items || [];
      if (items.length) {
        for (const item of items) {
          buckets[columnFor(item)].push(itemLabel(item));
          total += itemTotal(item);
        }
      } else {
        total = num(entry.amount);
        buckets[COLUMNS.length - 1].push(`${entry.note || 'Bazar'} = ${total}`);
      }
      grand += total;
      rows.push([
        {v: shortDate(entry.date), s: S.date},
        ...buckets.map(lines => ({v: lines.join('\n'), s: S.cell})),
        {n: num(total), s: S.money},
      ]);
    }
    if (!entries.length) {
      rows.push([{v: '', s: S.date}, ...COLUMNS.map(() => ({v: '', s: S.cell})), {v: '', s: S.money}]);
    }
    rows.push([
      {v: 'Total', s: S.totalText},
      ...COLUMNS.map(() => ({v: '', s: S.totalText})),
      {n: num(grand), s: S.totalMoney},
    ]);
    const last = rows.length;
    return {
      name: 'Bazar',
      rows,
      widths: [10, 16, 16, 16, 14, 14, 18, 22, 20, 11],
      freeze: 2,
      merges: [`A1:${colName(COLUMNS.length + 1)}1`, `A${last}:${colName(COLUMNS.length)}${last}`],
    };
  }

  function khawaSheet() {
    const members = activeList();
    const span = Math.max(members.length, 1);
    const rows = [];
    const merges = [];

    /* --- Taka Joma: one column per member ------------------------------- */
    rows.push([{v: 'Taka Joma', s: S.banner}, ...Array(span - 1).fill({v: '', s: S.banner})]);
    merges.push(`A1:${colName(span - 1)}1`);
    rows.push(members.map(m => ({v: m.name, s: S.member})));
    const perMember = members.map(m =>
      (db.deposits || []).filter(d => d.memberId === m.id).map(d => num(d.amount)));
    const deepest = Math.max(1, ...perMember.map(list => list.length));
    for (let i = 0; i < deepest; i += 1) {
      rows.push(perMember.map(list =>
        i < list.length ? {n: list[i], s: S.tintMoney} : {v: '', s: S.tint}));
    }
    rows.push(perMember.map(list => ({n: num(list.reduce((sum, x) => sum + x, 0)), s: S.totalMoney})));
    rows.push([]);

    /* --- the bill block ------------------------------------------------- */
    const billsTop = rows.length + 1;
    rows.push([{v: 'Wifi & Current Bill & Gas', s: S.banner}, ...Array(3).fill({v: '', s: S.banner})]);
    merges.push(`A${billsTop}:D${billsTop}`);
    rows.push(['Bill', 'Date', 'Taka', 'Per head'].map(v => ({v, s: S.head})));
    const bills = [...(db.utilities || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    for (const bill of bills) {
      const heads = (bill.memberIds || []).length || span;
      rows.push([
        {v: bill.type || 'Bill', s: S.cell},
        {v: shortDate(bill.date), s: S.date},
        {n: num(bill.amount), s: S.money},
        {n: num(Number(bill.amount || 0) / heads), s: S.money},
      ]);
    }
    if (!bills.length) rows.push([{v: 'No bills this month', s: S.cell}, {v: '', s: S.date}, {v: '', s: S.money}, {v: '', s: S.money}]);
    rows.push([
      {v: 'Total', s: S.totalText}, {v: '', s: S.totalText},
      {n: num(bills.reduce((sum, b) => sum + Number(b.amount || 0), 0)), s: S.totalMoney},
      {v: '', s: S.totalText},
    ]);
    rows.push([]);

    /* --- the settlement table ------------------------------------------- */
    const calc = typeof calcMonth === 'function' ? (calcMonth() || []) : [];
    const ledger = typeof utilityLedger === 'function' ? utilityLedger()
      : (typeof window.mmUtilityLedger === 'function' ? window.mmUtilityLedger() : {categories: []});
    const charge = (key, memberId) => {
      const category = (ledger.categories || []).find(c => c.key === key);
      return num(category?.memberCharges?.get(memberId) || 0);
    };
    rows.push(['Name', 'Khawa Bill', 'Wifi Bill', 'Gas Bill', 'Current Bill', 'Total', 'Due']
      .map(v => ({v, s: S.headGreen})));
    const totals = {food: 0, wifi: 0, gas: 0, current: 0, all: 0, due: 0};
    for (const row of calc) {
      const wifi = charge('WiFi', row.member.id);
      const gas = charge('Gas', row.member.id);
      const current = charge('Current', row.member.id);
      const due = Math.max(0, -Number(row.balance || 0));
      totals.food += num(row.food); totals.wifi += wifi; totals.gas += gas;
      totals.current += current; totals.all += num(row.total); totals.due += num(due);
      rows.push([
        {v: row.member.name, s: S.member},
        {n: num(row.food), s: S.tintMoney}, {n: wifi, s: S.tintMoney},
        {n: gas, s: S.tintMoney}, {n: current, s: S.tintMoney},
        {n: num(row.total), s: S.tintMoney}, {n: num(due), s: S.tintMoney},
      ]);
    }
    if (!calc.length) rows.push([{v: 'No members', s: S.member}, ...Array(6).fill({v: '', s: S.tint})]);
    rows.push([
      {v: 'Total', s: S.totalText},
      {n: num(totals.food), s: S.totalMoney}, {n: num(totals.wifi), s: S.totalMoney},
      {n: num(totals.gas), s: S.totalMoney}, {n: num(totals.current), s: S.totalMoney},
      {n: num(totals.all), s: S.totalMoney}, {n: num(totals.due), s: S.totalMoney},
    ]);
    return {name: 'Khawa & Taka', rows, widths: Array(Math.max(7, span)).fill(0).map((_, i) => i === 0 ? 20 : 15), merges};
  }

  function buildWorkbook() {
    const month = monthLabel(typeof state !== 'undefined' ? state.month : '');
    const name = ((typeof mess !== 'undefined' && mess?.name) || 'Mess').replace(/[^\w\s-]/g, '').trim() || 'Mess';
    return {
      blob: workbook([bazarSheet(), khawaSheet()]),
      filename: `${name} Bazar ${month}.xlsx`,
    };
  }
  window.mmBuildMessWorkbook = buildWorkbook;

  /* Plain 2D value arrays (no cell styling) for the two sheets — reused by
     mess-sheet-sync.js to push the exact same rows to the live Google Sheet,
     so the workbook download and the live sheet can never disagree. A styled
     {v,n,s} cell collapses to its number if it has one, else its text. */
  const plainValue = cell => (cell && cell.n !== undefined ? cell.n : (cell?.v ?? ''));
  function plainRows(sheet) {
    return sheet.rows.map(row => row.map(plainValue));
  }
  window.mmBuildSheetSnapshotRows = () => ({bazar: plainRows(bazarSheet()), khawa: plainRows(khawaSheet())});

  /* On a phone, a plain <a download> just drops the file in Downloads, where
     nothing opens it automatically — there is no "Excel" app to hand off to.
     The Web Share API instead opens the OS share sheet, and Android/iOS both
     list every installed app that can take an .xlsx (Google Sheets, Excel,
     Drive…), so tapping Sheets there opens the file straight into it. Where
     the browser doesn't support sharing files (most desktops), this falls
     back to the ordinary download link. */
  async function shareOrDownload(blob, filename) {
    if (navigator.canShare && navigator.share) {
      try {
        const file = new File([blob], filename, {type: blob.type});
        if (navigator.canShare({files: [file]})) {
          await navigator.share({files: [file], title: filename});
          return true;
        }
      } catch (error) {
        if (error?.name === 'AbortError') return true; // user cancelled the share sheet, not a failure
        console.warn('Web Share failed, falling back to a direct download.', error);
      }
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return false;
  }

  async function download() {
    try {
      const {blob, filename} = buildWorkbook();
      const shared = await shareOrDownload(blob, filename);
      if (typeof notify === 'function') notify(shared ? 'Sheet ready to open.' : 'Sheet downloaded.', 'success');
    } catch (error) {
      console.error('Sheet export failed', error);
      if (typeof notify === 'function') notify('Sheet তৈরি করা যায়নি। আবার চেষ্টা করুন।');
    }
  }
  window.mmDownloadMessWorkbook = download;

  /* settings-pro.js renders the button and wires it to its own stub, so the
     handler is replaced after that render rather than in place of it. */
  const baseSettings = window.settings;
  window.settings = function settingsWithBazarExport(container) {
    const result = typeof baseSettings === 'function' ? baseSettings(container) : undefined;
    const button = document.getElementById('exportMessData');
    if (button) button.onclick = download;
    return result;
  };
})();
