/* Final interaction-state arbiter for Chat and Voice Assistant.
 *
 * mobile-shell-final.js owns VisualViewport measurement. This later guard owns the
 * final page/keyboard classes so stale browser chrome geometry can never put a
 * closed composer into keyboard mode. Keyboard mode is allowed only while the
 * actual Chat/Voice input is focused.
 */
'use strict';
(()=>{
  if(window.__mmInteractionStateFixLoaded)return;
  window.__mmInteractionStateFixLoaded=true;

  const root=document.documentElement;
  let scheduled=false;

  const currentPage=()=>{
    try{return typeof state!=='undefined'?String(state?.page||''):'';}
    catch(_){return'';}
  };

  const composerFocused=page=>{
    const active=document.activeElement;
    if(page==='chat')return !!active?.matches?.('.chat-compose-pro textarea');
    if(page==='assistant')return !!active?.matches?.('.ai-reference-composer input');
    return false;
  };

  const enforce=()=>{
    scheduled=false;
    const page=currentPage();
    const focused=composerFocused(page);

    if(root.dataset.mmPage!==page)root.dataset.mmPage=page;
    root.classList.toggle('mm-chat-page',page==='chat');
    root.classList.toggle('mm-assistant-page',page==='assistant');

    if(page!=='chat'||!focused)root.classList.remove('mm-chat-keyboard');
    if(page!=='assistant'||!focused)root.classList.remove('mm-assistant-keyboard');

    if((page==='chat'||page==='assistant')&&!focused){
      root.style.setProperty('--mm-keyboard-bottom','0px');
    }
  };

  const queue=()=>{
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(enforce);
  };

  /* Run after mobile-shell-final.js listeners in the same event turn, before the
     browser paints, so a stale VisualViewport value cannot visibly flip layouts. */
  window.visualViewport?.addEventListener('resize',enforce);
  window.visualViewport?.addEventListener('scroll',enforce);
  window.addEventListener('resize',enforce);
  window.addEventListener('pageshow',enforce);
  window.addEventListener('orientationchange',()=>setTimeout(enforce,120));

  document.addEventListener('focusin',event=>{
    if(event.target?.matches?.('.chat-compose-pro textarea,.ai-reference-composer input')){
      queue();
      setTimeout(enforce,80);
      setTimeout(enforce,260);
    }
  },true);
  document.addEventListener('focusout',event=>{
    if(event.target?.matches?.('.chat-compose-pro textarea,.ai-reference-composer input')){
      setTimeout(enforce,0);
      setTimeout(enforce,80);
      setTimeout(enforce,220);
    }
  },true);

  const app=document.getElementById('app');
  if(app&&'MutationObserver'in window){
    new MutationObserver(queue).observe(app,{childList:true,subtree:true});
  }

  if('MutationObserver'in window){
    new MutationObserver(()=>{
      const page=currentPage();
      if(!composerFocused(page)&&
        (root.classList.contains('mm-chat-keyboard')||root.classList.contains('mm-assistant-keyboard'))){
        enforce();
      }
    }).observe(root,{attributes:true,attributeFilter:['class','data-mm-page']});
  }

  enforce();
})();
