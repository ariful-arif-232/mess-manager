/* Bazar workbook export (.xlsx).
 *
 * Settings > Data backup used to promise "separate sheets for every section"
 * and its handler was a stub that only raised a toast. It now writes a real
 * three-sheet workbook modelled on the mess's own August Bazar sheet:
 *
 *   1. Bazar Schedule  — Schedule | Present / Absent | Date & Bazar List
 *   2. Bazar List      — every item bought in the month, with cost
 *   3. Bazar Summary   — per-buyer totals for the month
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

  /* Style ids used by the builders below, in the order they appear in
     styles.xml cellXfs. */
  const S = {plain: 0, title: 1, subtitle: 2, head: 3, text: 4, mid: 5, money: 6,
    totalText: 7, totalMoney: 8, present: 9, absent: 10};

  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
<fonts count="7">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="16"/><color rgb="FF10285F"/><name val="Calibri"/></font>
<font><sz val="10"/><color rgb="FF6B7A92"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FF10285F"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FF0B7A4B"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFB23A3A"/><name val="Calibri"/></font>
</fonts>
<fills count="5">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF2457D6"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEAF0FB"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF5F8FD"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFD3DEEE"/></left><right style="thin"><color rgb="FFD3DEEE"/></right><top style="thin"><color rgb="FFD3DEEE"/></top><bottom style="thin"><color rgb="FFD3DEEE"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="11">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="164" fontId="4" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="5" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="6" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
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
      return `<row r="${number}">${painted}</row>`;
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
  const buyerName = entry => {
    const member = (db.members || []).find(m => m.id === entry.buyer_member_id);
    return member?.name || entry.buyer || 'Unknown';
  };

  function scheduleSheet(title) {
    const rows = [
      [{v: title, s: S.title}],
      [{v: 'Bazar Schedule', s: S.subtitle}],
      [],
      [{v: 'Schedule', s: S.head}, {v: 'Present / Absent', s: S.head}, {v: 'Date & Bazar List', s: S.head}],
    ];
    const list = [...(db.schedules || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    for (const entry of list) {
      const detail = [shortDate(entry.date), String(entry.bazar_list || '').trim()].filter(Boolean).join(' — ');
      rows.push([
        {v: entry.names || '', s: S.text},
        {v: entry.done ? 'Present' : 'Absent', s: entry.done ? S.present : S.absent},
        {v: detail, s: S.text},
      ]);
    }
    if (!list.length) rows.push([{v: 'No bazar schedule for this month', s: S.text}, {v: '', s: S.text}, {v: '', s: S.text}]);
    const done = list.filter(x => x.done).length;
    rows.push([]);
    rows.push([{v: 'Total turns', s: S.totalText}, {v: `${done} / ${list.length} done`, s: S.totalText}, {v: '', s: S.totalText}]);
    return {name: 'Bazar Schedule', rows, widths: [26, 18, 42], freeze: 4,
      merges: ['A1:C1', 'A2:C2']};
  }

  function listSheet(title) {
    const rows = [
      [{v: title, s: S.title}],
      [{v: 'Bazar List — every item bought this month', s: S.subtitle}],
      [],
      ['Date', 'Buyer', 'Item', 'Category', 'Qty', 'Unit', 'Unit Price', 'Total'].map(v => ({v, s: S.head})),
    ];
    let grand = 0;
    const entries = [...(db.bazar || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    for (const entry of entries) {
      const who = buyerName(entry);
      const items = entry.items || [];
      if (!items.length) {
        const total = num(entry.amount);
        grand += total;
        rows.push([
          {v: shortDate(entry.date), s: S.mid}, {v: who, s: S.text},
          {v: String(entry.note || 'Bazar'), s: S.text}, {v: '', s: S.text},
          {v: '', s: S.mid}, {v: '', s: S.mid}, {v: '', s: S.money}, {n: total, s: S.money},
        ]);
        continue;
      }
      for (const item of items) {
        const total = num(item.entered_total ?? item.total ?? (Number(item.quantity) * Number(item.unit_price)));
        grand += total;
        rows.push([
          {v: shortDate(entry.date), s: S.mid},
          {v: who, s: S.text},
          {v: item.item_name || '', s: S.text},
          {v: item.category || '', s: S.text},
          {n: num(item.quantity), s: S.mid},
          {v: item.unit || '', s: S.mid},
          {n: num(item.unit_price), s: S.money},
          {n: total, s: S.money},
        ]);
      }
    }
    if (!entries.length) rows.push([{v: 'No bazar this month', s: S.text}, ...Array(7).fill({v: '', s: S.text})]);
    rows.push([]);
    rows.push([
      {v: 'Grand total', s: S.totalText}, {v: '', s: S.totalText}, {v: '', s: S.totalText},
      {v: '', s: S.totalText}, {v: '', s: S.totalText}, {v: '', s: S.totalText},
      {v: '', s: S.totalText}, {n: num(grand), s: S.totalMoney},
    ]);
    return {name: 'Bazar List', rows, widths: [10, 18, 30, 16, 9, 10, 13, 14], freeze: 4,
      merges: ['A1:H1', 'A2:H2']};
  }

  function summarySheet(title) {
    const rows = [
      [{v: title, s: S.title}],
      [{v: 'Bazar Summary — who spent what', s: S.subtitle}],
      [],
      ['Member', 'Bazar days', 'Items', 'Total Spent'].map(v => ({v, s: S.head})),
    ];
    const totals = new Map();
    for (const entry of db.bazar || []) {
      const who = buyerName(entry);
      const current = totals.get(who) || {days: 0, items: 0, amount: 0};
      current.days += 1;
      current.items += (entry.items || []).length;
      current.amount += (entry.items || []).length
        ? (entry.items || []).reduce((sum, item) =>
            sum + num(item.entered_total ?? item.total ?? (Number(item.quantity) * Number(item.unit_price))), 0)
        : num(entry.amount);
      totals.set(who, current);
    }
    const ranked = [...totals.entries()].sort((a, b) => b[1].amount - a[1].amount);
    for (const [who, value] of ranked) {
      rows.push([
        {v: who, s: S.text}, {n: value.days, s: S.mid},
        {n: value.items, s: S.mid}, {n: num(value.amount), s: S.money},
      ]);
    }
    if (!ranked.length) rows.push([{v: 'No bazar this month', s: S.text}, {v: '', s: S.mid}, {v: '', s: S.mid}, {v: '', s: S.money}]);
    const grand = ranked.reduce((sum, [, value]) => sum + value.amount, 0);
    const days = ranked.reduce((sum, [, value]) => sum + value.days, 0);
    rows.push([]);
    rows.push([
      {v: 'Total', s: S.totalText}, {n: days, s: S.totalText},
      {n: ranked.reduce((sum, [, v]) => sum + v.items, 0), s: S.totalText},
      {n: num(grand), s: S.totalMoney},
    ]);
    rows.push([]);
    rows.push([{v: 'Average per bazar', s: S.text}, {v: '', s: S.text}, {v: '', s: S.text},
      {n: days ? num(grand / days) : 0, s: S.money}]);
    return {name: 'Bazar Summary', rows, widths: [26, 14, 12, 16], freeze: 4,
      merges: ['A1:D1', 'A2:D2']};
  }

  function buildWorkbook() {
    const month = monthLabel(typeof state !== 'undefined' ? state.month : '');
    const title = `${(typeof mess !== 'undefined' && mess?.name) || 'Mess'} — ${month}`;
    return {
      blob: workbook([scheduleSheet(title), listSheet(title), summarySheet(title)]),
      filename: `${((typeof mess !== 'undefined' && mess?.name) || 'Mess').replace(/[^\w\s-]/g, '').trim() || 'Mess'} Bazar ${month}.xlsx`,
    };
  }
  window.mmBuildBazarWorkbook = buildWorkbook;

  function download() {
    try {
      const {blob, filename} = buildWorkbook();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      if (typeof notify === 'function') notify('Bazar workbook downloaded.', 'success');
    } catch (error) {
      console.error('Bazar export failed', error);
      if (typeof notify === 'function') notify('Excel তৈরি করা যায়নি। আবার চেষ্টা করুন।');
    }
  }
  window.mmDownloadBazarWorkbook = download;

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
