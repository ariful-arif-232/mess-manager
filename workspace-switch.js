/* Secure multi-workspace login gate.
 * One membership opens directly. Two or more memberships show a chooser once per
 * signed-in session; explicit sign-out clears the remembered choice.
 */
'use strict';
(()=>{
  if(window.__mmWorkspaceSwitchLoaded)return;
  window.__mmWorkspaceSwitchLoaded=true;
  if(typeof client==='undefined'||!client?.auth||typeof window.bootstrap!=='function')return;

  const CHOICE_KEY='mm_workspace_choice_v1';
  const baseBootstrap=window.bootstrap;
  let resolving=null;
  let chooserSession=null;
  let chooserWorkspaces=[];

  function readChoice(userId){
    try{
      const value=JSON.parse(localStorage.getItem(CHOICE_KEY)||'null');
      return value?.userId===userId&&value?.memberId?value:null;
    }catch(_){
      localStorage.removeItem(CHOICE_KEY);
      return null;
    }
  }
  function saveChoice(userId,memberId){
    try{localStorage.setItem(CHOICE_KEY,JSON.stringify({userId,memberId,at:Date.now()}))}catch(_){ }
  }
  function clearChoice(){try{localStorage.removeItem(CHOICE_KEY)}catch(_){ }}

  function roleLabel(role){return role==='admin'?'Admin':'Member'}
  function initials(name){
    const value=String(name||'M').trim();
    return esc((value[0]||'M').toUpperCase());
  }

  async function fetchWorkspaces(){
    const result=await client.rpc('list_my_workspaces');
    if(result.error)throw result.error;
    return Array.isArray(result.data)?result.data:[];
  }

  async function selectWorkspace(s,workspace,button=null){
    if(!s?.user||!workspace?.member_id)return;
    const old=button?.innerHTML;
    if(button){
      button.disabled=true;
      button.setAttribute('aria-busy','true');
      button.querySelectorAll?.('button');
      button.innerHTML=`<span class="workspace-choice-icon">${initials(workspace.mess_name)}</span><span class="workspace-choice-copy"><b>Opening ${esc(workspace.mess_name)}</b><span>Please wait…</span></span><span class="workspace-role ${workspace.role==='admin'?'admin':''}">${esc(roleLabel(workspace.role))}</span>`;
    }
    try{
      const selected=await client.rpc('select_workspace',{p_member_id:workspace.member_id});
      if(selected.error)throw selected.error;
      saveChoice(s.user.id,workspace.member_id);
      chooserSession=null;
      chooserWorkspaces=[];
      return baseBootstrap(s);
    }catch(error){
      if(button&&old){button.disabled=false;button.removeAttribute('aria-busy');button.innerHTML=old}
      notify(error?.message||'Workspace open করা যাচ্ছে না।');
    }
  }

  function renderChooser(s,workspaces,errorMessage=''){
    chooserSession=s;
    chooserWorkspaces=workspaces;
    session=s;
    profile=null;
    mess=null;
    if(typeof realtimeChannel!=='undefined'&&realtimeChannel){
      try{client.removeChannel(realtimeChannel)}catch(_){ }
      realtimeChannel=null;
    }

    const email=esc(s?.user?.email||'');
    const rows=workspaces.map((w,index)=>`<button type="button" class="workspace-choice" data-workspace-index="${index}"><span class="workspace-choice-icon">${initials(w.mess_name)}</span><span class="workspace-choice-copy"><b>${esc(w.mess_name||'Mess workspace')}</b><span>${esc(w.member_name||'Member')} · ${esc(roleLabel(w.role))}</span></span><span class="workspace-role ${w.role==='admin'?'admin':''}">${esc(roleLabel(w.role))}</span></button>`).join('');
    $('#app').innerHTML=`<div class="auth-page"><main class="auth-wrap"><section class="auth-card workspace-choice-card"><div class="workspace-choice-head"><div class="workspace-choice-mark">M</div><h2>Choose Workspace</h2><p>${email?`${email}<br>`:''}এই account একাধিক Mess workspace-এ আছে। কোনটিতে ঢুকতে চান?</p></div>${errorMessage?`<div class="workspace-choice-error">${esc(errorMessage)}</div>`:''}<div class="workspace-choice-list">${rows}</div><div class="workspace-choice-foot">🔒 <span>Only the selected workspace will be opened</span></div><button type="button" class="workspace-choice-signout" id="workspaceSignOut">Use another account</button></section></main></div>`;

    document.querySelectorAll('[data-workspace-index]').forEach(button=>{
      button.onclick=()=>selectWorkspace(s,workspaces[Number(button.dataset.workspaceIndex)],button);
    });
    $('#workspaceSignOut').onclick=async()=>{
      clearChoice();
      try{await client.auth.signOut({scope:'local'})}catch(error){notify(error?.message||'Sign out failed.');}
    };
  }

  async function resolveWorkspace(s,{forceChooser=false}={}){
    if(!s?.user){
      clearChoice();
      chooserSession=null;
      chooserWorkspaces=[];
      return baseBootstrap(s);
    }

    const workspaces=await fetchWorkspaces();
    if(workspaces.length===0){
      clearChoice();
      return baseBootstrap(s);
    }

    if(workspaces.length===1){
      const only=workspaces[0];
      const selected=await client.rpc('select_workspace',{p_member_id:only.member_id});
      if(selected.error)throw selected.error;
      saveChoice(s.user.id,only.member_id);
      return baseBootstrap(s);
    }

    const remembered=forceChooser?null:readChoice(s.user.id);
    const rememberedWorkspace=remembered&&workspaces.find(w=>w.member_id===remembered.memberId);
    if(rememberedWorkspace){
      const selected=await client.rpc('select_workspace',{p_member_id:rememberedWorkspace.member_id});
      if(selected.error)throw selected.error;
      return baseBootstrap(s);
    }

    renderChooser(s,workspaces);
  }

  window.bootstrap=async function workspaceAwareBootstrap(s){
    if(resolving)return resolving;
    resolving=(async()=>{
      try{
        return await resolveWorkspace(s);
      }catch(error){
        console.error('Workspace resolution failed',error);
        if(s?.user){
          try{
            const spaces=await fetchWorkspaces();
            if(spaces.length>1){renderChooser(s,spaces,error?.message||'Workspace list load করা যাচ্ছে না।');return;}
          }catch(_){ }
        }
        return baseBootstrap(s);
      }finally{
        resolving=null;
      }
    })();
    return resolving;
  };

  window.openWorkspaceChooser=async function(){
    const current=(await client.auth.getSession()).data.session;
    if(!current?.user)return;
    try{
      const spaces=await fetchWorkspaces();
      if(spaces.length<2){
        if(spaces.length===1)notify('এই account-এ একটাই workspace আছে।','success');
        return;
      }
      clearChoice();
      renderChooser(current,spaces);
    }catch(error){notify(error?.message||'Workspace list load করা যাচ্ছে না।')}
  };

  client.auth.onAuthStateChange((event)=>{
    if(event==='SIGNED_OUT'){
      clearChoice();
      chooserSession=null;
      chooserWorkspaces=[];
    }
  });

  /* app.js can complete its first cached-session lookup before deferred auth
     enhancements load. Re-run once so a multi-workspace account still gets the
     chooser deterministically, without requiring an extra refresh. */
  client.auth.getSession().then(({data})=>{
    if(data?.session)return window.bootstrap(data.session);
  }).catch(console.warn);
})();
