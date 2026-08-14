/* Focused polish for Utility Bills and Mess Chat. */
'use strict';
(() => {
  const memberById = id => db.members.find(m => m.id === id);
  const initials = name => String(name || 'M').trim().split(/\s+/).slice(0,2).map(x => x[0]).join('').toUpperCase();
  const avatar = (m, cls='') => m?.avatar_url
    ? `<img class="detail-avatar ${cls}" src="${esc(m.avatar_url)}" alt="${esc(m.name || 'Member')}" loading="lazy"/>`
    : `<span class="detail-avatar detail-avatar-fallback ${cls}">${esc(initials(m?.name))}</span>`;
  const dateOnly = value => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'});
  };
  const utilityIcon = type => ({Gas:'🔥',WiFi:'📶',Current:'⚡',Water:'💧'}[type] || '🧾');

  window.utilities = function utilitiesDetailed(c){
    const controls = profile.role === 'admin';
    c.innerHTML = `<div class="section-head"><div><span class="eyebrow">Monthly shared costs</span><h2>Utility Bills</h2></div>${controls?'<button class="btn primary" data-add>+ Add Bill</button>':''}</div>
      <div class="utility-list utility-list-pro">${db.utilities.map(u => {
        const count = u.memberIds.length || 1;
        const each = Number(u.amount || 0) / count;
        const people = u.memberIds.map(id => memberById(id)).filter(Boolean);
        return `<article class="utility-card utility-card-pro">
          <div class="utility-top utility-top-pro">
            <div class="utility-icon utility-icon-pro">${utilityIcon(u.type)}</div>
            <div class="utility-title"><span>${esc(u.date)}</span><h3>${esc(u.type)}</h3></div>
            <div class="utility-amount"><span>Total</span><b>${money(u.amount)}</b></div>
          </div>
          <div class="utility-share-summary">
            <div><span>Shared</span><b>${count} ${count === 1 ? 'member' : 'members'}</b></div>
            <i></i>
            <div><span>Per person</span><b>${money(each)}</b></div>
          </div>
          <div class="utility-member-grid">${people.map(m => `<div class="utility-member-card">
            ${avatar(m,'utility-member-avatar')}
            <div class="utility-member-copy"><b>${esc(m.name)}</b><span>Share</span></div>
            <strong>${money(each)}</strong>
          </div>`).join('')}</div>
          ${controls?`<div class="entry-actions utility-actions"><button class="btn" data-edit="${u.id}">Edit</button><button class="btn danger" data-delete="${u.id}" data-kind="utilities">Delete</button></div>`:''}
        </article>`;
      }).join('') || '<div class="card empty">No utility bills</div>'}</div>`;
    if (controls) bindCrud(c,'utilities',utilityModal);
  };

  window.chat = async function chatDetailed(c){
    const messages = db.messages || [];
    c.innerHTML = `<div class="chat-shell chat-shell-pro">
      <div class="chat-simple-head"><span class="eyebrow">Mess community</span><h2>Chat</h2></div>
      <div class="chat-messages chat-messages-pro" id="chatMessages">${messages.map(m => {
        const mine = m.sender_member_id === profile.id;
        const sender = memberById(m.sender_member_id) || {name:memberName(m.sender_member_id)};
        return `<div class="chat-row chat-row-pro ${mine?'mine':''}">
          ${avatar(sender,'chat-profile-avatar')}
          <div class="chat-message-wrap">
            <div class="chat-message-meta"><b>${esc(sender.name || 'Member')}</b><time>${esc(dateOnly(m.created_at))}</time></div>
            <div class="chat-bubble chat-bubble-pro"><p>${esc(m.body)}</p></div>
          </div>
        </div>`;
      }).join('') || '<div class="chat-empty">এখনও কোনো message নেই। প্রথম message লিখুন।</div>'}</div>
      <form class="chat-compose chat-compose-pro" id="chatForm"><textarea name="body" rows="1" maxlength="2000" placeholder="Message লিখুন…" required></textarea><button class="btn primary" aria-label="Send">Send</button></form>
    </div>`;
    const list = $('#chatMessages');
    if (list) list.scrollTop = list.scrollHeight;
    const form = $('#chatForm');
    if (form) form.onsubmit = async e => {
      e.preventDefault();
      const body = new FormData(e.target).get('body').trim();
      if (!body) return;
      await run(async () => {
        assertResult(await client.from('mess_messages').insert({mess_id:profile.mess_id,sender_member_id:profile.id,body}));
        e.target.reset();
        await loadData();
        await window.chat(c);
      });
    };
  };

  const previousRenderPage = window.renderPage;
  window.renderPage = function renderPageWithDetailPolish(){
    if (state.page === 'chat') return window.chat($('#content'));
    if (state.page === 'utilities') return window.utilities($('#content'));
    return previousRenderPage();
  };
})();
