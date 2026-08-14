/* Premium member profile and personal account dashboard. */
'use strict';
(()=>{
  const safeMoney=n=>money(Number(n||0));
  const currentMemberCalc=()=>calcMonth().find(x=>x.member.id===profile.id)||{member:profile,units:0,food:0,util:0,deposit:0,total:0,balance:0};
  const personalBazar=()=>db.bazar.filter(x=>x.buyer_member_id===profile.id).reduce((s,x)=>s+Number(x.amount||0),0);
  const avatar=()=>profile.avatar_url?`<img src="${esc(profile.avatar_url)}" alt="${esc(profile.name)}">`:`<span