/* Non-admin member list polish: fill the empty action area with read-only role/status information. */
'use strict';
(()=>{
  if(window.__mmMemberReadonlyStatusLoaded)return;
  window.__mmMemberReadonlyStatusLoaded=true;

  function decorate(root=document){
    try{
      if(typeof profile==='undefined'||profile?.role==='admin'||typeof db==='undefined')return;
      const cards=[];
      if(root?.matches?.('.member-clean-card'))cards.push(root);
      root?.querySelectorAll?.('.member-clean-card').forEach(card=>cards.push(card));
      cards.forEach(card=>{
        if(card.querySelector('.member-readonly-panel'))return;
        const identity=card.querySelector('[data-view-member]');
        const memberId=String(identity?.dataset?.viewMember||'');
        const member=db.members?.find?.(item=>String(item.id)===memberId);
        if(!identity||!member)return;

        const panel=document.createElement('div');
        panel.className='member-readonly-panel';
        panel.setAttribute('aria-label',`${member.role||'member'}, ${member.active?'active':'inactive'}`);

        const role=document.createElement('span');
        role.className=`member-readonly-role ${String(member.role||'member').toLowerCase()==='admin'?'is-admin':'is-member'}`;
        role.textContent=String(member.role||'member').toLowerCase()==='admin'?'Admin':'Member';

        const status=document.createElement('span');
        status.className=`member-readonly-status ${member.active?'is-active':'is-inactive'}`;
        status.innerHTML=`<i aria-hidden="true"></i><b>${member.active?'Active':'Inactive'}</b>`;

        panel.append(role,status);
        if(String(member.id)===String(profile?.id)){
          const you=document.createElement('small');
          you.className='member-readonly-you';
          you.textContent='You';
          panel.appendChild(you);
        }
        card.appendChild(panel);
      });
    }catch(error){
      console.warn('Member read-only status polish failed',error);
    }
  }

  const observer=new MutationObserver(records=>{
    records.forEach(record=>record.addedNodes.forEach(node=>{
      if(node.nodeType===1)decorate(node);
    }));
  });

  const start=()=>{
    decorate();
    if(document.body)observer.observe(document.body,{childList:true,subtree:true});
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
