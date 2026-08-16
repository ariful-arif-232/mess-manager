/* Final interaction-state guard for iOS Chat/Voice Assistant navigation.
 *
 * Some iOS sessions keep an old VisualViewport keyboard offset after an Add/Edit
 * sheet closes. mobile-shell-final.js can then mistake that stale offset for a
 * keyboard when Chat/Voice Assistant opens, which hides the bottom nav and fixes
 * the composer halfway up the screen. This guard uses a fresh focus baseline and
 * only accepts keyboard geometry while the page composer is actually focused.
 */
'use strict';
(()=>{
  if(window.__mmInteractionStateFixLoaded)return;
  window.__mmInteractionStateFixLoaded=true;

  const root=document.documentElement;
  const KEYBOARD_THRESHOLD=96;
  const FOCUS_GRACE_MS=900;
  let focusBaseline=0;
  let focusStartedAt=0;
  let scheduled=false;

  const page=()=>{
    try{return typeof state!=='undefined'?String(state?.page||''):'';}
    catch(_){return'';}
  };
  const visualBottom=()=>{
    const vv=window.visualViewport;
    return vv?Number(vv.height||0)+Number(vv.offsetTop||0):Number(window.innerHeight||document.documentElement.clientHeight||0);
  };
  const layoutHeight=()=>Math.max(
    Number(window.innerHeight||0),
    Number(document.documentElement.clientHeight||0),
    visualBottom()
  );
  const focusedComposer=current=>{
    const active=document.activeElement;
    if(current==='chat')return !!active?.matches?.('.chat-compose-pro textarea');
    if(current==='assistant')return !!active?.matches?.('.ai-reference-composer input');
    return false;
  };

  const clearClosedOverrides=()=>{
    const nav=document.querySelector('.mobilebar');
    const main=document.querySelector('.main');
    const assistantPage=document.querySelector('.ai-reference-page');
    ['opacity','visibility','pointer-events','transform'].forEach(prop=>nav?.style.removeProperty(prop));
    if(main?.dataset.mmInteractionClosed==='1'){
      main.style.removeProperty('padding-bottom');
      delete main.dataset.mmInteractionClosed;
    }
    if(assistantPage?.dataset.mmInteractionClosed==='1'){
      assistantPage.style.removeProperty('grid-template-rows');
      delete assistantPage.dataset.mmInteractionClosed;
    }
  };

  const forceClosedLayout=current=>{
    const nav=document.querySelector('.mobilebar');
    if(nav){
      nav.style.setProperty('opacity','1','important');
      nav.style.setProperty('visibility','visible','important');
      nav.style.setProperty('pointer-events','auto','important');
      nav.style.setProperty('transform','none','important');
    }
    if(current==='assistant'){
      const main=document.querySelector('.main');
      const assistantPage=document.querySelector('.ai-reference-page');
      if(main){
        main.dataset.mmInteractionClosed='1';
        main.style.setProperty('padding-bottom','82px','important');
      }
      if(assistantPage){
        assistantPage.dataset.mmInteractionClosed='1';
        assistantPage.style.setProperty('grid-template-rows','auto auto minmax(92px,1fr) auto','important');
      }
    }
  };

  const sync=()=>{
    scheduled=false;
    const current=page();
    const keyboardPage=current==='chat'||current==='assistant';

    if(root.dataset.mmPage!==current)root.dataset.mmPage=current;
    root.classList.toggle('mm-chat-page',current==='chat');
    root.classList.toggle('mm-assistant-page',current==='assistant');

    if(!keyboardPage){
      root.classList.remove('mm-chat-keyboard','mm-assistant-keyboard');
      root.style.setProperty('--mm-keyboard-bottom','0px');
      focusBaseline=0;
      focusStartedAt=0;
      clearClosedOverrides();
      return;
    }

    const focused=focusedComposer(current);
    if(!focused){
      root.classList.remove('mm-chat-keyboard','mm-assistant-keyboard');
      root.style.setProperty('--mm-keyboard-bottom','0px');
      focusBaseline=0;
      focusStartedAt=0;
      forceClosedLayout(current);
      return;
    }

    if(!focusBaseline)focusBaseline=layoutHeight();
    const occlusion=Math.max(0,focusBaseline-visualBottom());
    const grace=Date.now()-focusStartedAt<FOCUS_GRACE_MS;
    const open=occlusion>=KEYBOARD_THRESHOLD||grace;

    root.classList.toggle('mm-chat-keyboard',current==='chat'&&open);
    root.classList.toggle('mm-assistant-keyboard',current==='assistant'&&open);
    root.style.setProperty('--mm-keyboard-bottom',`${Math.round(open?occlusion:0)}px`);

    if(open)clearClosedOverrides();
    else forceClosedLayout(current);
  };

  const queue=()=>{
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>requestAnimationFrame(sync));
  };

  document.addEventListener('focusin',event=>{
    if(!event.target?.matches?.('.chat-compose-pro textarea,.ai-reference-composer input'))return;
    focusBaseline=layoutHeight();
    focusStartedAt=Date.now();
    queue();
    setTimeout(queue,120);
    setTimeout(queue,520);
    setTimeout(queue,1000);
  },true);

  document.addEventListener('focusout',event=>{
    if(!event.target?.matches?.('.chat-compose-pro textarea,.ai-reference-composer input'))return;
    setTimeout(()=>{focusBaseline=0;focusStartedAt=0;queue();},60);
    setTimeout(queue,240);
  },true);

  window.visualViewport?.addEventListener('resize',queue);
  window.visualViewport?.addEventListener('scroll',queue);
  window.addEventListener('resize',queue);
  window.addEventListener('pageshow',()=>{focusBaseline=0;focusStartedAt=0;queue();});
  window.addEventListener('orientationchange',()=>{focusBaseline=0;focusStartedAt=0;setTimeout(queue,180);});

  const app=document.getElementById('app');
  if(app&&'MutationObserver'in window){
    new MutationObserver(()=>{
      focusBaseline=0;
      focusStartedAt=0;
      queue();
      setTimeout(queue,120);
      setTimeout(queue,420);
    }).observe(app,{childList:true,subtree:true});
  }

  if('MutationObserver'in window){
    new MutationObserver(()=>queue()).observe(root,{attributes:true,attributeFilter:['class','data-mm-page']});
  }

  queue();
})();
