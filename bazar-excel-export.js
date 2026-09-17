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
  /* The editor stores vegetables under the category "Vegetable", so the
     Kacha Bazar column has to match that — matching the Bengali label alone
     sent every vegetable into Others and left the column empty. Mosla has no
     category of its own: spices are logged under অন্যান্য and can only be
     recognised by name, which is why the category check runs first. */
  const COLUMNS = [
    {key: 'Chal', categories: ['চাল']},
    {key: 'Murgi', categories: ['মুরগি']},
    {key: 'Mach', categories: ['মাছ']},
    {key: 'Tel', categories: ['তেল']},
    {key: 'Dim', categories: ['ডিম']},
    {key: 'Mosla', categories: ['মসলা']},
    {key: 'Kacha Bazar', categories: ['Vegetable', 'কাঁচাবাজার', 'সবজি']},
    {key: 'Others', categories: []},
  ];
  function columnFor(item) {
    const category = String(item.category || '').trim();
    const matched = COLUMNS.findIndex(col => col.categories.includes(category));
    if (matched >= 0) return matched;
    if (SPICE.test(String(item.item_name || ''))) return COLUMNS.findIndex(col => col.key === 'Mosla');
    return COLUMNS.length - 1;
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

    /* Each member gets two columns — what they put in, and what it was for.
       The amount stays a bare number in its own cell so the Total row below
       still adds up; writing "344 Gas" into one cell would break that. */
    const perMember = members.map(m => (db.deposits || [])
      .filter(d => d.memberId === m.id)
      .map(d => ({amount: num(d.amount), purpose: String(d.purpose || '').trim()})));
    const deepest = Math.max(1, ...perMember.map(list => list.length));

    rows.push(['Taka Joma']);
    rows.push(['', ...members.flatMap(m => [m.name, ''])]);
    for (let i = 0; i < deepest; i += 1) {
      rows.push(['', ...perMember.flatMap(list => (i < list.length ? [list[i].amount, list[i].purpose] : ['', '']))]);
    }
    rows.push(['Total', ...perMember.flatMap(list => [num(list.reduce((sum, d) => sum + d.amount, 0)), ''])]);
    rows.push([]);

    rows.push(['Wifi & Current Bill & Gas']);
    rows.push(['Bill', 'Date', 'Taka', 'Members', 'Per head']);
    const bills = [...(db.utilities || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const span = Math.max(members.length, 1);
    let billTotal = 0;
    for (const bill of bills) {
      const heads = (bill.memberIds || []).length || span;
      // A fixed bill charges each listed member the full amount; a shared one
      // splits it between them. Showing the same "Taka" for both would make
      // the column disagree with what members are actually billed below.
      const fixed = bill.mode === 'fixed';
      const charged = num(fixed ? Number(bill.amount || 0) * heads : Number(bill.amount || 0));
      billTotal += charged;
      rows.push([
        bill.type || 'Bill',
        shortDate(bill.date),
        charged,
        `${heads} member${heads === 1 ? '' : 's'} · ${fixed ? 'fixed' : 'shared'}`,
        num(fixed ? Number(bill.amount || 0) : Number(bill.amount || 0) / heads),
      ]);
    }
    rows.push(['Total', '', num(billTotal), '', '']);
    rows.push([]);

    const calc = typeof calcMonth === 'function' ? (calcMonth() || []) : [];
    const ledger = typeof utilityLedger === 'function' ? utilityLedger()
      : (typeof window.mmUtilityLedger === 'function' ? window.mmUtilityLedger() : {categories: []});
    const charge = (key, memberId) => {
      const category = (ledger.categories || []).find(c => c.key === key);
      return num(category?.memberCharges?.get(memberId) || 0);
    };
    rows.push(['Name', 'Khawa Bill', 'Wifi Bill', 'Gas Bill', 'Current Bill', 'Total', 'Due / Advance']);
    const totals = {food: 0, wifi: 0, gas: 0, current: 0, all: 0, balance: 0};
    for (const row of calc) {
      const wifi = charge('WiFi', row.member.id);
      const gas = charge('Gas', row.member.id);
      const current = charge('Current', row.member.id);
      // Carries its sign rather than hiding it: negative is still owed,
      // positive is paid ahead. The Sheet prints negatives in red.
      const balance = num(row.balance);
      totals.food += num(row.food); totals.wifi += wifi; totals.gas += gas;
      totals.current += current; totals.all += num(row.total); totals.balance += balance;
      rows.push([row.member.name, num(row.food), wifi, gas, current, num(row.total), balance]);
    }
    rows.push(['Total', num(totals.food), num(totals.wifi), num(totals.gas), num(totals.current), num(totals.all), num(totals.balance)]);
    return rows;
  }

  window.mmBuildSheetSnapshotRows = () => ({bazar: bazarRows(), khawa: khawaRows()});
})();
