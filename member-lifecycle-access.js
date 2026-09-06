/* Month-aware member visibility + active-workspace session guard.
 * Historical accounting remains intact: a member is still shown in the month
 * they were deactivated, then disappears from later Member Management months.
 */
'use strict';
(()=>{
  if(window.__mmMemberLifecycleAccessLoaded)return;
  window.__mmMemberLifecycleAccessLoaded=true;
  if(typeof client==='undefined'||!client)return;

  const CHOICE_KEY='mm_workspace_choice_v1';
  const GUARD_INTERVAL=5000;
  let guardBusy=false;
  let handlingLostAccess=false;
  let guardTimer=null;

  const selectedMonth=()=>String(state?.month||'').slice(0,7);
  const monthStart=()=>selectedMonth()?`${selectedMonth()}-01`:'';
  const monthEnd=()=>{
    const [year,month]=selectedMonth().split('-').map(Number);
    if(!year||!month)return'';
    return new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
  };
  const dateOnly=value=>String(value||'').slice(0,10);
  const memberId=value=>String(value||'');

  function readChoice(userId){
    try{
      const value=JSON.parse(localStorage.getItem(CHOICE_KEY)||'null');
      return value?.userId===userId&&value?.memberId?value:null;
    }catch(_){return null;}
  }
  function saveChoice(userId,id){
    try{localStorage.setItem(CHOICE_KEY,JSON.stringify({userId,memberId:id,at:Date.now()}));}catch(_){ }
  }
  function clearChoice(){try{localStorage.removeItem(CHOICE_KEY);}catch(_){ }}

  async function refreshCutoffHistory(){
    if(!profile?.mess_id){
      if(typeof db!=='undefined')db.memberFoodCutoffHistory=[];
      return [];
    }
    const result=await client.from('member_food_cutoffs')
      .select('id,mess_id,member_id,cutoff_date,created_at')
      .eq('mess_id',profile.mess_id)
      .order('cutoff_date',{ascending:true})
      .order('created_at',{ascending:true});
    if(result.error)throw result.error;
    const rows=Array.isArray(result.data)?result.data:[];
    db.memberFoodCutoffHistory=rows;
    return rows;
  }

  function latestCutoff(member){
    const id=memberId(member?.id);
    const rows=(db?.memberFoodCutoffHistory||[]).filter(row=>memberId(row.member_id)===id);
    return rows.length?dateOnly(rows[rows.length-1].cutoff_date):'';
  }

  function visibleInSelectedMonth(member){
    if(!member||member.deleted_at)return false;
    const start=monthStart();
    const end=monthEnd();
    if(!start||!end)return member.active!==false;

    const joined=dateOnly(member.join_date);
    if(joined&&joined>end)return false;
    if(member.active!==false)return true;

    const cutoff=latestCutoff(member);
    if(cutoff)return start<=cutoff;

    /* Legacy inactive rows from before cutoff tracking: keep only through the
       month in which the membership was changed. */
    const fallback=dateOnly(member.updated_at);
    return !!fallback&&start<=fallback;
  }
  window.mmMemberVisibleInSelectedMonth=visibleInSelectedMonth;

  function filterMemberCards(root){
    if(!root||String(state?.page||'')!=='members')return;
    root.querySelectorAll('.member-clean-card').forEach(card=>{
      const trigger=card.querySelector('[data-view-member]');
      const id=memberId(trigger?.dataset?.viewMember);
      const member=(db?.members||[]).find(row=>memberId(row.id)===id);
      if(member&&!visibleInSelectedMonth(member))card.remove();
    });
  }

  const baseLoadData=window.loadData;
  if(typeof baseLoadData==='function'){
    const loadDataWithLifecycle=async function(){
      const result=await baseLoadData.apply(this,arguments);
      try{await refreshCutoffHistory();}
      catch(error){console.warn('Unable to load member cutoff history',error);db.memberFoodCutoffHistory=[];}
      return result;
    };
    window.loadData=loadDataWithLifecycle;
    try{loadData=loadDataWithLifecycle;}catch(_){/* window assignment is enough */}
  }

  const baseMembers=window.members;
  if(typeof baseMembers==='function'){
    window.members=function membersWithMonthVisibility(c){
      const result=baseMembers(c);
      filterMemberCards(c);
      return result;
    };
    try{members=window.members;}catch(_){/* window assignment is enough */}
  }

  async function activeWorkspaces(){
    const result=await client.rpc('list_my_workspaces');
    if(result.error)throw result.error;
    return Array.isArray(result.data)?result.data:[];
  }

  async function leaveRemovedWorkspace(spaces,currentSession){
    if(handlingLostAccess)return;
    handlingLostAccess=true;
    clearChoice();
    try{
      try{await client.rpc('clear_workspace_selection');}catch(_){ }
      document.querySelector('#moreSheet')?.remove();

      if(!spaces.length){
        if(typeof notify==='function')notify('Workspace access removed. Signing out…');
        await client.auth.signOut({scope:'local'});
        try{if(typeof window.bootstrap==='function')await window.bootstrap(null);}catch(_){ }
        return;
      }

      if(!currentSession?.user)return;
      if(spaces.length===1){
        const next=spaces[0];
        const selected=await client.rpc('select_workspace',{p_member_id:next.member_id});
        if(selected.error)throw selected.error;
        saveChoice(currentSession.user.id,next.member_id);
        if(typeof notify==='function')notify('Previous workspace access was removed. Opened your remaining workspace.','success');
        if(typeof window.bootstrap==='function')await window.bootstrap(currentSession);
        return;
      }

      if(typeof notify==='function')notify('Workspace access removed. Choose another workspace.');
      if(typeof window.openWorkspaceChooser==='function')await window.openWorkspaceChooser();
    }catch(error){
      console.warn('Workspace access cleanup failed',error);
      try{await client.auth.signOut({scope:'local'});}catch(_){ }
    }finally{
      handlingLostAccess=false;
    }
  }

  async function enforceWorkspaceAccess(){
    if(guardBusy||handlingLostAccess)return;
    let currentSession=null;
    try{currentSession=(await client.auth.getSession())?.data?.session||null;}catch(_){return;}
    if(!currentSession?.user)return;

    const currentMemberId=memberId(profile?.id);
    const remembered=readChoice(currentSession.user.id);
    const selectedId=currentMemberId||memberId(remembered?.memberId);
    if(!selectedId)return;

    guardBusy=true;
    try{
      const spaces=await activeWorkspaces();
      if(spaces.some(space=>memberId(space.member_id)===selectedId))return;
      await leaveRemovedWorkspace(spaces,currentSession);
    }catch(error){
      /* A network/transient error must not sign a legitimate user out. */
      console.warn('Workspace membership check skipped',error);
    }finally{guardBusy=false;}
  }

  function scheduleGuard(delay=0){
    clearTimeout(guardTimer);
    guardTimer=setTimeout(enforceWorkspaceAccess,delay);
  }

  window.addEventListener('focus',()=>scheduleGuard(60));
  window.addEventListener('online',()=>scheduleGuard(100));
  window.addEventListener('pageshow',()=>scheduleGuard(120));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleGuard(80);});
  client.auth.onAuthStateChange?.((event)=>{
    if(event==='SIGNED_OUT'){
      clearTimeout(guardTimer);
      handlingLostAccess=false;
      guardBusy=false;
    }else if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED')scheduleGuard(250);
  });
  setInterval(()=>{if(!document.hidden)enforceWorkspaceAccess();},GUARD_INTERVAL);

  Promise.resolve().then(async()=>{
    if(profile?.mess_id){
      try{await refreshCutoffHistory();filterMemberCards(document.querySelector('#content'));}
      catch(error){console.warn('Initial member lifecycle refresh failed',error);}
    }
    scheduleGuard(300);
  });
})();
