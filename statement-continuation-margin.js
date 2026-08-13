/* Add balanced top/bottom breathing room only to continued Bazar PDF pages (page 3+). */
'use strict';
(()=>{
  function install(){
    const jsPDF=window.jspdf?.jsPDF;
    if(!jsPDF?.API?.addImage){setTimeout(install,150);return;}
    if(jsPDF.API.addImage.__mmContinuationMargin)return;
    const original=jsPDF.API.addImage;
    function patchedAddImage(){
      const args=[...arguments];
      try{
        const pageCount=this.getNumberOfPages?.()||1;
        const isStatementSlice=pageCount>=3 && Number(args[2])===0 && Number(args[3])===0 && Math.abs(Number(args[4])-794)<2;
        if(isStatementSlice){
          const top=36;
          const bottom=52;
          args[3]=top;
          if(Number.isFinite(Number(args[5])) && Number(args[5])>(top+bottom)) args[5]=Number(args[5])-top-bottom;
        }
      }catch(_){ }
      return original.apply(this,args);
    }
    patchedAddImage.__mmContinuationMargin=true;
    jsPDF.API.addImage=patchedAddImage;
  }
  install();
})();