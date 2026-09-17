/* Computes the two sheets — Bazar and Khawa & Taka — as plain 2D value
 * arrays, modelled on the mess's own Google Sheet:
 *
 *   Bazar         — Date | Chal | Murgi | Mach | Tel | Dim | Mosla |
 *                   Kacha Bazar | Others | Taka, each cell carrying the item
 *                   with its quantity and price together ("Chal 10 kg =
 *                   600"), and a grand total under the Taka column.
 *   Khawa & Taka  — a Taka Joma block (one column per member, their
 *                   deposits down the column), the Wifi / Current / Gas
 *                   bill block, and the Name | Khawa Bill | Wifi | Gas |
 *                   Current | Total | Due table.
 *
 * This used to also assemble a downloadable .xlsx file client-side. That
 * moved server-side: mess-sheet-sync.js pushes these same rows to the
 * mess-sheet edge function, which writes them straight into the mess's own
 * live Google Sheet, so "Download Sheets" opens a Sheet that is already
 * correct rather than a snapshot file — see mess-sheet-sync.js for why.
 */
'use strict';
(() => {
  if (window.__mmSheetRows) return;
  window.__mmSheetRows = true;

  const num = value => Math.round((Number(value) || 0) * 100) / 100;
  const shortDate = value => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value || '');
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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

  function bazarRows() {
    const rows = [['Date', ...COLUMNS.map(col => col.key), 'Taka']];
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
      rows.push([shortDate(entry.date), ...buckets.map(lines => lines.join('\n')), total]);
    }
    rows.push(['Total', ...COLUMNS.map(() => ''), num(grand)]);
    return rows;
  }

  function khawaRows() {
    const members = activeList();
    const rows = [];

    rows.push(['Taka Joma', ...Array(Math.max(0, members.length - 1)).fill('')]);
    rows.push(members.map(m => m.name));
    const perMember = members.map(m =>
      (db.deposits || []).filter(d => d.memberId === m.id).map(d => num(d.amount)));
    const deepest = Math.max(1, ...perMember.map(list => list.length));
    for (let i = 0; i < deepest; i += 1) {
      rows.push(perMember.map(list => (i < list.length ? list[i] : '')));
    }
    rows.push(perMember.map(list => num(list.reduce((sum, x) => sum + x, 0))));
    rows.push([]);

    rows.push(['Wifi & Current Bill & Gas', '', '', '']);
    rows.push(['Bill', 'Date', 'Taka', 'Per head']);
    const bills = [...(db.utilities || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const span = Math.max(members.length, 1);
    for (const bill of bills) {
      const heads = (bill.memberIds || []).length || span;
      rows.push([bill.type || 'Bill', shortDate(bill.date), num(bill.amount), num(Number(bill.amount || 0) / heads)]);
    }
    rows.push(['Total', '', num(bills.reduce((sum, b) => sum + Number(b.amount || 0), 0)), '']);
    rows.push([]);

    const calc = typeof calcMonth === 'function' ? (calcMonth() || []) : [];
    const ledger = typeof utilityLedger === 'function' ? utilityLedger()
      : (typeof window.mmUtilityLedger === 'function' ? window.mmUtilityLedger() : {categories: []});
    const charge = (key, memberId) => {
      const category = (ledger.categories || []).find(c => c.key === key);
      return num(category?.memberCharges?.get(memberId) || 0);
    };
    rows.push(['Name', 'Khawa Bill', 'Wifi Bill', 'Gas Bill', 'Current Bill', 'Total', 'Due']);
    const totals = {food: 0, wifi: 0, gas: 0, current: 0, all: 0, due: 0};
    for (const row of calc) {
      const wifi = charge('WiFi', row.member.id);
      const gas = charge('Gas', row.member.id);
      const current = charge('Current', row.member.id);
      const due = Math.max(0, -Number(row.balance || 0));
      totals.food += num(row.food); totals.wifi += wifi; totals.gas += gas;
      totals.current += current; totals.all += num(row.total); totals.due += num(due);
      rows.push([row.member.name, num(row.food), wifi, gas, current, num(row.total), num(due)]);
    }
    rows.push(['Total', num(totals.food), num(totals.wifi), num(totals.gas), num(totals.current), num(totals.all), num(totals.due)]);
    return rows;
  }

  window.mmBuildSheetSnapshotRows = () => ({bazar: bazarRows(), khawa: khawaRows()});
})();
