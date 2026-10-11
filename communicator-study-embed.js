/* Same-origin presentation bridge. No new grading, question storage, credentials or sync layer. */
(function () {
  'use strict';
  if(window.T08StudyEmbed || window.parent===window)return;
  try{if(window.parent.location.origin!==location.origin || !window.parent.T08Communicator)return;}catch(_){return;}
  const $=id=>document.getElementById(id);
  if(!$('fcSidebar')||!$('atelierMain'))return;
  document.body.classList.add('cw-embedded');document.body.classList.remove('sb-collapsed');
  const css=document.createElement('link');css.rel='stylesheet';css.href='./communicator-study.css?v=20261011-1';document.head.append(css);
  let listener=null,last='',timer=null,observer=null,resizer=null;
  const actions=new Set(['ringBtn','unlockBtn','customPickBtn','customWeakBtn','customUntestedBtn','customAllCardsBtn','calcBtn','exportBtn','importBtn']);
  const text=id=>$(id)?.textContent||'';
  const number=id=>Number.parseInt(text(id),10)||0;
  function snapshot(){
    const main=$('atelierMain'),status=text('progressSaveStatus');
    return {title:text('pageTitle'),subtitle:text('pageSub'),saveStatus:status,pending:/pending|not saved|saving|queued/i.test(status),
      ready:!$('ringBtn').disabled,percent:number('ringPct'),counts:['lgConfident','lgCorrect','lgGuessed','lgWrong','lgSkipped'].map(number),
      total:typeof cards==='function'?cards().length:0,seen:text('ringSub'),height:Math.ceil(main.getBoundingClientRect().height+8),
      activeSession:typeof session!=='undefined'&&!!session&&session.cursor<session.queue.length,
      calculator:$('calcBtn')&&!$('calcBtn').hidden?text('calcBtnLabel'):null,
      disabled:[...actions].filter(id=>!$(id)||$(id).disabled),
      groups:[...document.querySelectorAll('#groupList [data-group]')].map(b=>({id:b.dataset.group,name:b.querySelector('.group-name')?.textContent||b.textContent,meta:b.querySelector('.group-meta')?.textContent||'',active:b.classList.contains('active')}))};
  }
  function emit(force=false){if(!listener)return;const value=snapshot(),sig=JSON.stringify(value);if(force||last!==sig){last=sig;listener(value);}}
  function queue(){clearTimeout(timer);timer=setTimeout(()=>emit(),40);}
  function loadScript(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(Error('Study safeguards could not load. Retry this module.'));document.head.append(s);});}
  const ready=(async()=>{
    // atelier-shell intentionally skips embedded navigation; retain its study safeguards here.
    if(!window.FC_STUDY_RELIABILITY)await loadScript('./study-reliability.js?v=1');
    if(!$('studyView').dataset.presentationReady){
      const style=document.createElement('link');style.rel='stylesheet';style.href='./study-presentation.css?v=20260930-1';document.head.append(style);
      await loadScript('./study-presentation.js?v=20260930-1');
    }
    $('importInput').addEventListener('change',queue);
    observer=new MutationObserver(queue);observer.observe($('fcSidebar'),{subtree:true,childList:true,characterData:true,attributes:true});
    observer.observe($('atelierMain'),{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','disabled','hidden']});
    resizer=new ResizeObserver(queue);resizer.observe($('atelierMain'));
  })();
  window.T08StudyEmbed=Object.freeze({ready,
    connect(callback){listener=typeof callback==='function'?callback:null;emit(true);},
    refresh(){emit(true);},
    run(id){if(!actions.has(id)||!$(id)||$(id).disabled)return;$(id).click();queue();},
    group(id){const b=[...document.querySelectorAll('#groupList [data-group]')].find(el=>el.dataset.group===id);if(b)b.click();queue();},
    disconnect(){listener=null;clearTimeout(timer);observer?.disconnect();resizer?.disconnect();}
  });
})();
