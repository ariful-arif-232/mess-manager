/* Mobile logout integration + polished schedule workflow. */
'use strict';
(()=>{
  function closeFloatingUi(){document.querySelectorAll('#moreSheet,#choiceSheet,#modal,.sheet-backdrop,.modal-wrap').forEach(x=>x.remove());document.body.style.overflow='';}
  document.addEventListener('click',e=>{
    const b=e.target.closest('#sheetLogout');
    if(!b)return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if(typeof window.requestMessLogout==='function'){
      window.requestMessLogout(b);
      return;
    }
    notify('Logout confirmation is loading. Please try again.');
  },true);

  const baseLoadData=window.loadData;
  window.loadData=async function(){await baseLoadData();const r=await client.from('bazar_schedules').select('*').gte('schedule_date',dateRange()[0]).lte('schedule_date',dateRange()[1]).order('schedule_date');if(!r.error)db.schedules=r.data.map(x=>({...x,date:x.schedule_date,names:x.assigned_names,done:x.status==='done',bazarList:x.bazar_list||'',assignedMemberId:x.assigned_member_id||null}));};

  async function sendScheduleMail(memberId,date,list){
    const m=db.members.find(x=>x.id===memberId);if(!m?.email)throw new Error('Selected member-এর email নেই।');
    const pretty=new Date(`${date}T00:00:00`).toLocaleDateString('en-BD',{day:'numeric',month:'long',year:'numeric'});
    const lines=String(list||'').split(/\n|,/).map(x=>x.trim()).filter(Boolean);
    const message=`🛒 BAZAR SCHEDULE\n\nHello ${m.name},\n\nআপনার বাজারের তারিখ: ${pretty}\n\nযে বাজারগুলো লাগবে:\n${lines.map((x,i)=>`${i+1}. ${x}`).join('\n')}\n\nসময়মতো বাজার সম্পন্ন করার অনুরোধ রইল।\n\n— ${mess.name}\nMess Manager`;
    const r=await client.functions.invoke('mess-notify',{body:{member_id:memberId,subject:`${mess.name}: Bazar list for ${pretty}`,message}});if(r.error)throw r.error;if(r.data?.error)throw new Error(r.data.error);
  }

  window.scheduleModal=function scheduleModalPro(id){
    const x=db.schedules.find(z=>z.id===id)||{date:today(),names:'',done:false,bazarList:'',assignedMemberId:''};
    const selected=x.assignedMemberId||activeMembers().find(m=>m.name===x.names)?.id||'';
    modal(`<h2>${id?'Edit':'Add'} Schedule</h2><form id="scheduleProForm"><div class="form-grid"><div class="field"><label>Date</label><input name="schedule_date" type="date" value="${esc(x.date)}" required></div><div class="field"><label>Assigned Member</label><select name="assigned_member_id" required><option value="">Member বাছাই করুন</option>${activeMembers().map(m=>`<option value="${m.id}" ${selected===m.id?'selected':''}>${esc(m.name)}${m.email?'':' — no email'}</option>`).join('')}</select></div><div class="field"><label>Bazar List</label><textarea name="bazar_list" rows="5" maxlength="3000" placeholder="চাল 5 kg\nডাল 2 kg\nতেল 2 L" required>${esc(x.bazarList||'')}</textarea></div><div class="field"><label>Status</label><select name="status"><option value="pending" ${!x.done?'selected':''}>Pending</option><option value="done" ${x.done?'selected':''}>Done</option></select></div></div><label class="check-row schedule-email-toggle gap-top"><input type="checkbox" name="send_email" checked><span><b>Email Bazar List</b><small>Save করলে assigned member-কে list পাঠানো হবে</small></span></label><div class="actions gap-top"><button class="btn primary">Save Schedule</button><button class="btn" type="button" data-close>Cancel</button></div></form>`);
    $('[data-close]').onclick=closeModal;
    $('#scheduleProForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),memberId=f.get('assigned_member_id'),m=db.members.find(y=>y.id===memberId),list=f.get('bazar_list').trim(),date=f.get('schedule_date');await run(async()=>{const payload={mess_id:profile.mess_id,schedule_date:date,assigned_names:m?.name||'',assigned_member_id:memberId||null,bazar_list:list,status:f.get('status')};let savedId=id;if(id)assertResult(await client.from('bazar_schedules').update(payload).eq('id',id));else savedId=assertResult(await client.from('bazar_schedules').insert(payload).select('id').single()).id;await logActivity(id?'update':'create','schedule',savedId,{assigned_member_id:memberId});if(f.get('send_email'))await sendScheduleMail(memberId,date,list);closeModal();await loadData();render();},f.get('send_email')?'Schedule saved & email sent.':'Schedule saved.');};
  };
})();
