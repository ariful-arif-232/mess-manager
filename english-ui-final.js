/* Final language layer: concise English everywhere except the Meal page. User-authored content is never translated. */
'use strict';
(()=>{
  if(window.__mmEnglishUiFinalLoaded)return;
  window.__mmEnglishUiFinalLoaded=true;

  const hasBangla=value=>/[\u0980-\u09FF]/.test(String(value||''));
  const mealPage=()=>String(state?.page||'')==='meals';
  const EXACT=new Map([
    ['মোট খরচ','Total Expense'],['মোট জমা','Total Deposit'],['মোট বাজার','Total Bazar'],['বাজার ফান্ড','Bazar Fund'],['মোট Due','Member Due'],['সব Member','All Members'],
    ['এই মাসে কোনো Utility Bill নেই।','No Utility Bill this month.'],['এই মাসে কোনো member utility charge নেই।','No member utility charge this month.'],['এই member-এর কোনো Utility Bill নেই।','No Utility Bill for this member.'],['এই মাসে কোনো Utility Due নেই।','No Utility Due this month.'],
    ['এই মাসে কোনো member expense নেই।','No member expense this month.'],['এই member-এর কোনো expense নেই।','No expense for this member.'],
    ['এই account একাধিক Mess workspace-এ আছে। কোনটিতে ঢুকতে চান?','This account belongs to multiple Mess workspaces. Choose one to continue.'],['এই account-এ একটাই workspace আছে।','This account has only one workspace.'],['Workspace open করা যাচ্ছে না।','Unable to open this workspace.'],
    ['এই mess-এ কোনো admin profile পাওয়া যায়নি।','No admin profile was found in this workspace.'],['যার profile দেখতে চান তার নাম নির্বাচন করুন।','Choose an admin to view the profile.'],
    ['Email দিন।','Enter your email.'],['8-digit OTP দিন।','Enter the 8-digit OTP.'],['আগে OTP পাঠান।','Send the OTP first.'],['Login session তৈরি হয়নি।','A login session could not be created.'],['Verification session তৈরি হয়নি।','A verification session could not be created.'],['Login complete করা যাচ্ছে না।','Unable to complete sign in.'],
    ['JPG, PNG, WebP বা HEIC photo দিন।','Choose a JPG, PNG, WebP or HEIC photo.'],
    ['কমপক্ষে একটি কাঁচাবাজার item select করুন।','Select at least one fresh-market item.'],['কমপক্ষে একজন member select করুন।','Select at least one member.'],['Valid amount দিন।','Enter a valid amount.'],['Utility type select করুন।','Select a Utility type.'],['Fixed or Shared bill select করুন।','Select Fixed or Shared bill.'],
    ['Remaining shared bill ভাগ করার জন্য অন্তত একজন non-fixed member select করুন।','Select at least one non-fixed member for the remaining shared bill.'],['Utility bill id তৈরি হয়নি।','Utility bill ID could not be created.'],
    ['Bazar এবং Utility deposit আলাদা fund হিসেবে track হবে। Member card tap করলে purpose-wise history দেখবেন।','Bazar and Utility deposits are tracked as separate funds. Tap a member card to view purpose-wise history.'],
    ['এই মাসের Bazar ও meal হিসাব স্বাভাবিকভাবে চলছে।','Bazar and meal accounting is running normally this month.'],['Bazar close date select করুন।','Choose a Bazar close date.'],['Selected date বা তার পরের Bazar entry আগে Edit/Delete করুন।','Edit or delete Bazar entries on or after the selected date first.'],
    ['Existing Close Bazar আছে','An existing Bazar Close is active'],['হিসাব মিলেছে','Account is balanced'],['Finalize করার আগে ঠিক করুন','Resolve before finalizing'],['4-digit Reopen PIN দিন।','Enter a 4-digit Reopen PIN.'],['PIN দুটো match করছে না।','The two PINs do not match.'],['4-digit PIN দিন।','Enter the 4-digit PIN.'],
    ['Bazar Due received.','Bazar Due received.'],['Bazar Advance refunded.','Bazar Advance refunded.'],
    ['এখনও কোনো message নেই। প্রথম message লিখুন।','No messages yet. Start the conversation.'],['Chat & খাবার আলোচনা','Chat & Food Discussion'],
    ['আপনার এই মাসের মেসের হিসাব দেখে প্রয়োজনীয় টাকা জমা দেওয়ার অনুরোধ রইল।','Please review your monthly mess account and deposit any required amount.'],['আপনার এই মাসের মেসের বকেয়া/জমার হিসাব দেখে প্রয়োজনীয় টাকা জমা দেওয়ার অনুরোধ রইল।','Please review your monthly balance and deposit any required amount.'],
    ['আপনার মেসের হিসাব, মিল ও খরচ','Your mess accounts, meals and expenses'],['নিরাপদভাবে প্রস্তুত হচ্ছে','are being prepared securely'],['তথ্য সমন্বয় করা হচ্ছে…','Syncing your data…'],
    ['Selected member-এর জন্য fixed amount','Fixed amount for selected members'],['Remaining amount selected members-এর মধ্যে ভাগ হবে','The remaining amount is split among selected members'],['প্রতি selected member-এর fixed amount','Fixed amount per selected member'],['বাকি bill যাদের মধ্যে ভাগ হবে','Members who share the remaining bill'],
    ['Meal count চলতে থাকবে','Meal count will continue'],['Meal count-ও একই date থেকে বন্ধ','Meal count will also stop from the same date'],
    ['Bazar entries আবার save করা যাবে।','Bazar entries can be saved again.'],['Reopen locked','Reopen locked'],
    ['এই দিন পর্যন্ত Bazar + Meal final হবে','Bazar and Meal will be final through this day'],['Final হিসাব check করা হচ্ছে…','Checking the final account…'],
    ['PIN required','PIN required'],['Accidental settlement?','Accidental settlement?']
  ]);

  const REPLACEMENTS=[
    [/এই মাসে কোনো member expense নেই।/g,'No member expense this month.'],
    [/এই member-এর কোনো expense নেই।/g,'No expense for this member.'],
    [/এই মাসে কোনো Utility Bill নেই।/g,'No Utility Bill this month.'],
    [/এই মাসে কোনো member utility charge নেই।/g,'No member utility charge this month.'],
    [/এই member-এর কোনো Utility Bill নেই।/g,'No Utility Bill for this member.'],
    [/এই মাসে কোনো Utility Due নেই।/g,'No Utility Due this month.'],
    [/এই date পর্যন্ত Bazar bill-এ থাকবে।/g,'Bazar entries through this date remain in the bill.'],
    [/Old cache\/other device থেকেও এই date বা পরের date-এ Save হবে না।/g,'Saving on or after this date is blocked on every device.'],
    [/Existing future meal ON থাকলে Close করার সময় OFF হবে।/g,'Existing future active meals will be turned off when closing.'],
    [/Stock থাকলে meal count বাড়তে পারবে; total Bazar fixed থাকবে।/g,'Meal count may continue while stock remains; total Bazar cost stays fixed.'],
    [/আগে Deactivate হওয়া member-এর locked food হিসাব পরিবর্তন হবে না।/g,'Previously deactivated members keep their locked food calculation.'],
    [/Selected date থেকে সব member-এর নতুন meal ON বন্ধ হবে/g,'New active meals are blocked from the selected date'],
    [/Finalize করলে Bazar, Meal ও Bazar Deposit হিসাব lock হবে।/g,'Finalizing locks Bazar, Meal and Bazar Deposit records for this month.'],
    [/Finalize Bazar ব্যবহার করতে আগে পুরনো Close state reopen করতে হবে। এতে কোনো হিসাব delete হবে না।/g,'Reopen the previous Close state before Finalize Bazar. No accounting data will be deleted.'],
    [/Selected final day-এর পরের Bazar\/Bazar Deposit remove বা correct করুন এবং Meal OFF করুন।/g,'Correct or remove Bazar and Bazar Deposit entries after the final day, and turn later meals off.'],
    [/Bazar Advance − Bazar Due = Bazar Fund\. Finalize-এর পর এই Food\/Bazar হিসাব আর বদলাবে না।/g,'Bazar Advance − Bazar Due = Bazar Fund. This Food/Bazar snapshot will not change after finalization.'],
    [/একটি 4-digit PIN দিন। পরে settlement শুরু হওয়ার আগে এই PIN দিয়েই month reopen করা যাবে। PIN হারালে app থেকে reopen করা যাবে না।/g,'Create a 4-digit PIN. Before settlement starts, use it to reopen the month. Keep the PIN safe.'],
    [/Correct PIN দিলে final snapshot inactive হবে এবং আগের live Bazar\/Meal\/Bazar Deposit data ঠিক আগের অবস্থায় editable হবে।/g,'A correct PIN disables the final snapshot and restores the previous Bazar, Meal and Bazar Deposit data for editing.'],
    [/Finalized Bazar reopened\. আগের live state ফিরে এসেছে।/g,'Finalized Bazar reopened. The previous live state is restored.'],
    [/Settlement transaction শুরু হয়েছে, তাই accidental reopen বন্ধ।/g,'Settlement has started, so normal reopen is locked.'],
    [/Collect Due \+ Refund Advance করলে Fund 0 হবে/g,'Collect Due and refund Advance to settle the Fund at 0'],
    [/Active Collect\/Refund records audit history-তে void হবে/g,'Active Collect/Refund records will be voided in the audit history'],
    [/যে date দরকার Admin নিজে ON করবেন।/g,'The admin can re-enable only the dates that are needed.'],
    [/Close করার সময় OFF হওয়া meal rows auto-ON হবে না/g,'Meal rows turned off during Close will not auto-enable'],
    [/Bazar (\d{1,2} [A-Za-z]{3} \d{4}) পর্যন্ত finalized\. PIN নিরাপদে রাখুন।/g,'Bazar finalized through $1. Keep the PIN safe.'],
    [/Bazar ([^ ]+) থেকে closed\./g,'Bazar is closed from $1.'],
    [/Meal count-ও stopped\./g,'Meal count is also stopped.'],
    [/Selected date বা তার পরের Bazar entry আগে Edit\/Delete করুন।/g,'Edit or delete Bazar entries on or after the selected date first.'],
    [/([\w\s().-]+) এর price লিখুন।/g,'Enter the price for $1.'],
    [/Fixed allocation ([^ ]+) shared bill ([^-]+)-এর বেশি হতে পারবে না।/g,'Fixed allocation $1 cannot exceed the shared bill $2.'],
    [/Bazar entries আবার save করা যাবে।/g,'Bazar entries can be saved again.'],
    [/আগের live Bazar\/Meal\/Bazar Deposit data/g,'previous live Bazar/Meal/Bazar Deposit data'],
    [/এই account/g,'this account'],[/এই মাসে/g,'this month'],[/এই member/g,'this member'],
    [/কোনো /g,'any '],[/ পাওয়া যায়নি/g,' was not found'],[/ নির্বাচন করুন/g,' choose'],
    [/ select করুন/g,' select'],[/ দিন।/g,'.'],[/ থেকে/g,' from'],[/ পর্যন্ত/g,' through'],
    [/ আগে/g,' first'],[/ পরে/g,' later'],[/ হিসাব/g,' account'],[/ বন্ধ/g,' stopped'],[/ চালু/g,' active'],
    [/ হবে না/g,' will not be'],[/ হবে/g,' will be'],[/ পরিবর্তন/g,' change'],[/ সদস্য/g,' member'],
    [/ জমা/g,' deposit'],[/ বাজার/g,' Bazar'],[/ খাবার/g,' food'],[/ প্রয়োজনীয়/g,' required'],[/ টাকা/g,' amount']
  ];

  function translateText(value){
    const original=String(value??'');if(!hasBangla(original))return original;
    const trimmed=original.trim();
    if(EXACT.has(trimmed)){
      const translated=EXACT.get(trimmed);return original.replace(trimmed,translated);
    }
    let out=original;
    for(const [pattern,replacement] of REPLACEMENTS)out=out.replace(pattern,replacement);
    return out;
  }
  window.mmTranslateUiText=translateText;

  function isUserContent(element){
    return !!element?.closest?.('.chat-bubble,.chat-messages,.message-body,.notice-body,.notice-strip,.mess-notice-body,[data-user-content],.activity-meta,.activity-detail');
  }
  function translateElementAttributes(element){
    if(!element||element.nodeType!==1||isUserContent(element))return;
    for(const attr of ['placeholder','title','aria-label']){
      const value=element.getAttribute?.(attr);if(value&&hasBangla(value))element.setAttribute(attr,translateText(value));
    }
    if((element.matches?.('textarea,input'))&&hasBangla(element.value||'')){
      const known=EXACT.get(String(element.value||'').trim());if(known)element.value=known;
    }
  }
  function translateTree(root=document){
    if(mealPage())return;
    const start=root?.nodeType===1||root?.nodeType===9?root:document;
    const walker=document.createTreeWalker(start,NodeFilter.SHOW_TEXT);
    const nodes=[];let node;
    while((node=walker.nextNode()))nodes.push(node);
    nodes.forEach(textNode=>{
      const parent=textNode.parentElement;if(!parent||isUserContent(parent)||parent.matches('script,style,noscript'))return;
      const value=textNode.nodeValue||'';if(!hasBangla(value))return;
      const translated=translateText(value);if(translated!==value)textNode.nodeValue=translated;
    });
    if(start.nodeType===1)translateElementAttributes(start);
    start.querySelectorAll?.('[placeholder],[title],[aria-label],textarea,input').forEach(translateElementAttributes);
  }

  const baseNotify=typeof window.notify==='function'?window.notify:null;
  if(baseNotify){
    const englishNotify=function(message,type='error'){
      const output=mealPage()?String(message??''):translateText(message);
      return baseNotify(output,type);
    };
    window.notify=englishNotify;
    try{notify=englishNotify;}catch(_){ }
  }
  const baseFriendly=typeof window.friendlyError==='function'?window.friendlyError:null;
  if(baseFriendly){
    const englishFriendly=function(error){const output=baseFriendly(error);return mealPage()?output:translateText(output);};
    window.friendlyError=englishFriendly;try{friendlyError=englishFriendly;}catch(_){ }
  }

  document.documentElement.lang='en';
  const splash=document.querySelector('.app-splash');if(splash){
    const p=splash.querySelector('.splash-brand p');if(p)p.innerHTML='Your mess accounts, meals and expenses<br>are being prepared securely';
    const status=splash.querySelector('.splash-status span');if(status)status.textContent='Syncing your data…';
  }

  let queued=false;
  const schedule=root=>{
    if(mealPage()||queued)return;queued=true;
    requestAnimationFrame(()=>{queued=false;translateTree(root||document);});
  };
  const observer=new MutationObserver(records=>{
    if(mealPage())return;
    for(const record of records){
      if(record.type==='characterData'&&record.target?.parentElement){schedule(record.target.parentElement);return;}
      for(const added of record.addedNodes){if(added.nodeType===1){schedule(added);return;}if(added.nodeType===3&&added.parentElement){schedule(added.parentElement);return;}}
    }
  });
  if(document.body)observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>translateTree(document),{once:true});else translateTree(document);
  window.addEventListener('pageshow',()=>schedule(document));
})();
