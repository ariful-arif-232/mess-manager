/* Mobile refinement: member wording, avatars, compact meals, professional statements. */
'use strict';
(() => {
  const initials = name => String(name || 'M').trim().split(/\s+/).slice(0,2).map(x => x[0]).join('').toUpperCase();
  const avatarHtml = (member, extra='') => member?.avatar_url
    ? `<img class="pro-avatar ${extra}" src="${esc(member.avatar_url)}" alt="${esc(member.name || 'Member')}"/>`
    : `<span class="pro-avatar fallback ${extra}">${esc(initials(member?.name))}</span>`;

  function enhanceCurrentPage() {
    if (state.page === 'members') {
      const heading = document.querySelector('#content .section-head h2');
      if (heading) heading.textContent = 'All Members';
    }

    if (state.page === 'bazar') {
      document.querySelectorAll('.bazar-entry').forEach(card => {
        const nameEl = card.querySelector('.bazar-entry-head h3');
        if (!nameEl || nameEl.dataset.avatarReady) return;
        const member = db.members.find(m => m.name === nameEl.textContent.trim());
        nameEl.dataset.avatarReady = '1';
        nameEl.classList.add('buyer-name-line');
        nameEl.innerHTML = `${avatarHtml(member, 'tiny')}<span>${esc(member?.name || nameEl.textContent.trim())}</span>`;
      });
    }
  }

  const previousRender = window.render;
  window.render = function renderV3() {
    previousRender();
    requestAnimationFrame(enhanceCurrentPage);
  };

  function statementData(x) {
    return [
      ['Meal units', String(x.units)],
      ['Deposit', money(x.deposit)],
      ['Food cost', money(x.food)],
      ['Utility share', money(x.util)],
      ['Total bill', money(x.total)],
      [x.balance >= 0 ? 'Advance' : 'Due', money(Math.abs(x.balance))]
    ];
  }

  function openProfessionalInvoice(x) {
    const rows = statementData(x);
    const status = x.balance >= 0 ? 'ADVANCE' : 'DUE';
    const statusClass = x.balance >= 0 ? 'good' : 'due';
    const invoiceNo = `${state.month.replace('-', '')}-${String(x.member.id).slice(0, 6).toUpperCase()}`;
    const generated = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const win = window.open('', '_blank');
    if (!win) return notify('Allow pop-ups to generate PDF.');

    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(x.member.name)} - ${esc(state.month)} Statement</title><style>
      *{box-sizing:border-box}body{margin:0;background:#eef3fa;color:#15223b;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.page{width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:18mm 18mm 16mm}.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1f57c9;padding-bottom:16px}.brand{display:flex;gap:12px;align-items:center}.logo{width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#255fdb,#163e91);color:white;display:grid;place-items:center;font-weight:800;font-size:20px}.brand h1{font-size:22px;margin:0}.brand p{margin:4px 0 0;color:#738198;font-size:12px}.meta{text-align:right}.meta b{display:block;color:#1f57c9;font-size:20px;letter-spacing:.04em}.meta span{display:block;color:#7a879b;font-size:11px;margin-top:4px}.member{display:flex;justify-content:space-between;gap:20px;margin:25px 0;background:#f6f9fe;border:1px solid #e1e9f4;border-radius:18px;padding:18px}.member h2{margin:0 0 5px;font-size:20px}.member p{margin:0;color:#748199;font-size:12px}.status{align-self:center;text-align:right}.status small{display:block;color:#8390a3;font-size:10px;text-transform:uppercase;letter-spacing:.12em}.status strong{font-size:22px}.status.good strong{color:#09815e}.status.due strong{color:#be6018}.statement-title{display:flex;justify-content:space-between;align-items:end;margin:24px 0 10px}.statement-title h3{margin:0;font-size:16px}.statement-title span{font-size:11px;color:#7d899b}.rows{border:1px solid #e2e9f3;border-radius:16px;overflow:hidden}.row{display:flex;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #e8eef5}.row:last-child{border-bottom:0}.row span{color:#68778f}.row b{font-size:15px}.row.total{background:#eef4ff}.row.total b{color:#1f57c9;font-size:18px}.footer{margin-top:30px;border-top:1px solid #e5ebf3;padding-top:14px;display:flex;justify-content:space-between;color:#8a95a6;font-size:10px}.actions{position:fixed;right:20px;bottom:20px}.actions button{border:0;background:#1f57c9;color:#fff;padding:11px 18px;border-radius:10px;font-weight:700;box-shadow:0 8px 24px #1f57c944}@page{size:A4;margin:0}@media print{body{background:#fff}.page{margin:0;width:auto;min-height:auto}.actions{display:none}}@media(max-width:800px){.page{width:100%;min-height:100vh;padding:24px 18px}.top{gap:12px}.meta b{font-size:16px}}
    </style></head><body><main class="page"><section class="top"><div class="brand"><div class="logo">M</div><div><h1>${esc(mess.name)}</h1><p>Mess Manager · Monthly Statement</p></div></div><div class="meta"><b>STATEMENT</b><span>#${esc(invoiceNo)}</span><span>${esc(generated)}</span></div></section><section class="member"><div><h2>${esc(x.member.name)}</h2><p>${esc(x.member.email || '')}</p><p>Period: ${esc(state.month)}</p></div><div class="status ${statusClass}"><small>${status}</small><strong>${money(Math.abs(x.balance))}</strong></div></section><div class="statement-title"><h3>Account Summary</h3><span>Amounts in BDT</span></div><section class="rows">${rows.map(([label,value]) => `<div class="row ${label==='Total bill'?'total':''}"><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('')}</section><footer class="footer"><span>Generated by Mess Manager</span><span>This is a computer-generated statement.</span></footer></main><div class="actions"><button onclick="window.print()">Save / Print PDF</button></div></body></html>`);
    win.document.close();
  }

  async function emailStatement(x) {
    const message = `${mess.name}\n${state.month} Monthly Statement\n\nMember: ${x.member.name}\nMeals: ${x.units}\nDeposit: ${money(x.deposit)}\nFood: ${money(x.food)}\nUtility: ${money(x.util)}\nTotal bill: ${money(x.total)}\n${x.balance >= 0 ? 'Advance' : 'Due'}: ${money(Math.abs(x.balance))}`;
    const result = await client.functions.invoke('mess-notify', { body: { member_id: x.member.id, subject: `${mess.name}: ${state.month} monthly statement`, message } });
    if (result.error) throw result.error;
    if (result.data?.error) throw new Error(result.data.error);
  }

  function openNotice(x) {
    modal(`<div class="modal-title"><div><span class="eyebrow">Member notice</span><h2>${esc(x.member.name)}</h2></div><button class="icon-btn" data-close>×</button></div><form id="v3NoticeForm"><div class="field"><label>Message</label><textarea name="message" rows="5" required>আপনার এই মাসের মেসের হিসাব দেখে প্রয়োজনীয় টাকা জমা দেওয়ার অনুরোধ রইল।</textarea></div><div class="actions gap-top"><button class="btn primary">Send Email Notice</button><button class="btn" type="button" data-cancel>Cancel</button></div></form>`);
    $('[data-close]').onclick = closeModal;
    $('[data-cancel]').onclick = closeModal;
    $('#v3NoticeForm').onsubmit = async e => {
      e.preventDefault();
      const text = new FormData(e.target).get('message').trim();
      await run(async () => {
        const result = await client.functions.invoke('mess-notify', { body: { member_id: x.member.id, subject: `${mess.name}: Notice`, message: text } });
        if (result.error) throw result.error;
        if (result.data?.error) throw new Error(result.data.error);
        closeModal();
      }, 'Notice emailed.');
    };
  }

  window.reports = function reportsV3(c) {
    const calc = calcMonth();
    c.innerHTML = `<div class="section-head report-page-head v3-report-head"><div><span class="eyebrow">Monthly accounts</span><h2>${esc(state.month)} Statements</h2></div><div class="report-count"><span>Members</span><b>${calc.length}</b></div></div><div class="report-list clean-report-list">${calc.map(x => `<article class="report-card clean-report-card v3-report-card"><div class="report-person">${avatarHtml(x.member)}<div><h3>${esc(x.member.name)}</h3>${x.member.email?`<span>${esc(x.member.email)}</span>`:''}</div>${x.balance>=0?`<span class="pill advance">Advance ${money(x.balance)}</span>`:`<span class="pill due">Due ${money(-x.balance)}</span>`}</div><div class="report-stat-grid"><div><span>Deposit</span><b>${money(x.deposit)}</b></div><div><span>Total bill</span><b>${money(x.total)}</b></div><div><span>Meals</span><b>${x.units}</b></div></div><div class="report-actions report-actions-pro"><button class="btn" data-pdf="${x.member.id}">PDF</button>${profile.role==='admin'?`<button class="btn" data-notice="${x.member.id}">Notice</button><button class="btn primary" data-email="${x.member.id}" ${x.member.email?'':'disabled'}>Email</button>`:''}</div></article>`).join('')}</div>`;
    c.querySelectorAll('[data-pdf]').forEach(b => b.onclick = () => openProfessionalInvoice(calc.find(x => x.member.id === b.dataset.pdf)));
    c.querySelectorAll('[data-email]').forEach(b => b.onclick = () => run(() => emailStatement(calc.find(x => x.member.id === b.dataset.email)), 'Statement emailed.'));
    c.querySelectorAll('[data-notice]').forEach(b => b.onclick = () => openNotice(calc.find(x => x.member.id === b.dataset.notice)));
  };
})();
