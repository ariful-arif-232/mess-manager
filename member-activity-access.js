/* Member read-only Activity access. */
'use strict';
(()=>{
  if(typeof adminPages!=='undefined'&&adminPages?.delete)adminPages.delete('activity');

  const baseLoadData=loadData;
  loadData=async function loadDataWithMemberActivity(){
    await baseLoadData();
    if(profile?.role!=='admin'){
      const r=await client.from('activity_logs').select('*').order('created_at',{ascending:false}).limit(100);
      if(r.error)throw r.error;
      db.logs=r.data||[];
    }
  };

  document.addEventListener('click',e=>{
    const trigger=e.target.closest?.('#mobileMore');
    if(!trigger||profile?.role==='admin')return;
    setTimeout(()=>{
      const grid=document.querySelector('#moreSheet .sheet-grid');
      if(!grid||grid.querySelector('[data-member-activity]'))return;
      const b=document.createElement('button');
      b.type='button';
      b.dataset.memberActivity='1';
      b.innerHTML='<span>◷</span><b>Activity</b>';
      b.onclick=()=>{document.querySelector('#moreSheet')?.remove();state.page='activity';render();};
      grid.appendChild(b);
    },0);
  },true);
})();
