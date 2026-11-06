/* Additive learning service. Existing FC progress/session APIs are deliberately unchanged. */
(function (root) {
  'use strict';
  const config = root.T08_LEARNING_CONFIG || {};
  let userId = null, available = false, serverStatus = null, epoch = 0, initializing = null;
  const listeners = new Set();
  function notify() {
    const detail = {available, userId, status: serverStatus};
    listeners.forEach(fn => { try { fn(detail); } catch (_) {} });
    if (typeof root.dispatchEvent === 'function' && typeof root.CustomEvent === 'function') root.dispatchEvent(new root.CustomEvent('t08-learning-ready', {detail}));
  }
  function safeError(error) {
    const value = new Error(error?.message || 'The learning service is unavailable. Your regular study tools are unaffected.');
    value.code = error?.code || 'learning_unavailable';
    return value;
  }
  async function invoke(action, payload) {
    if (!config.enabled) throw safeError({code:'feature_disabled',message:'The learning extension is switched off.'});
    if (!root.FC?.client?.functions?.invoke) throw safeError({message:'The learning service is not configured.'});
    const owner = userId, requestEpoch = epoch;
    if (!owner) throw safeError({message:'Sign in to use your learning workspace.'});
    let timer;
    try {
      const response = await Promise.race([
        root.FC.client.functions.invoke(config.functionName || 'learning-api', {body:{...payload,action}}),
        new Promise((_,reject) => { timer=setTimeout(()=>reject(safeError({code:'request_timeout',message:'The learning request timed out. You can retry without losing your regular progress.'})),Math.max(1000,Number(config.requestTimeoutMs)||25000)); })
      ]);
      if (owner !== userId || requestEpoch !== epoch) throw safeError({message:'Your account changed. Reopen the learning workspace.'});
      if (response.error) throw safeError(response.error);
      if (!response.data || typeof response.data !== 'object' || response.data.error) throw safeError(typeof response.data?.error === 'object'?response.data.error:{message:response.data?.error || 'The learning service returned an invalid response.'});
      return response.data;
    } finally { clearTimeout(timer); }
  }
  async function refresh() {
    const attempt = ++epoch;
    available=false; serverStatus=null;
    if (!config.enabled || !root.FC?.getSession) { userId=null;notify();return {available:false}; }
    try {
      const session=await root.FC.getSession();
      if (attempt !== epoch) return {available:false};
      userId=session?.user?.id || null;
      if (!userId) {notify();return {available:false};}
      const status=await invoke('status',{});
      if (attempt !== epoch) return {available:false};
      serverStatus=status;
      available=status.enabled===true && status.configured===true && status.worker_configured===true;
    } catch (_) { if(attempt===epoch){available=false;serverStatus={enabled:false,configured:false};} }
    if(attempt===epoch)notify();
    return {available,status:serverStatus};
  }
  function normalizedConfidence(value) {
    const key=String(value||'unknown').toLowerCase();
    return ({confident:'Confident',guessed:'Guessed','no idea':'No idea',no_idea:'No idea',unknown:'Unknown'})[key] || 'Unknown';
  }
  async function saveAttempts({moduleId,sessionId,attempts}) {
    if (!available) throw safeError({message:'Learning evidence is pending until the learning service is available.'});
    const records=(attempts||[]).map(a=>({
      event_id:String(a.id),session_id:String(a.sessionId||sessionId),module_id:moduleId,
      question_id:String(a.questionId),question_type:String(a.questionType||'unknown'),
      question_revision:a.questionRevision||null,question_snapshot:a.questionSnapshot||{},
      response:a.response??null,outcome:a.result,confidence:normalizedConfidence(a.confidence),
      grading_method:a.gradingMethod||'unknown',answered_at:a.recordedAt
    }));
    if(!records.length)return {ok:true,saved:0};
    const result=await invoke('save_attempts',{module_id:moduleId,session_id:sessionId,attempts:records});
    if(result.ok!==true)throw safeError({message:'Learning evidence was not confirmed saved. It will remain pending.'});
    return result;
  }
  const service = {
    config,
    isAvailable:()=>available,
    getUserId:()=>userId,
    getStatus:()=>serverStatus,
    normalizeConfidence:normalizedConfidence,
    refresh,
    request:invoke,
    saveAttempts,
    subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},
    open(context){
      if(!available)throw safeError({message:'The learning extension is unavailable. Your existing retest and review buttons still work.'});
      if(!root.T08LearningWorkspace?.open)throw safeError({message:'The lesson view could not load. Reload the page and try again.'});
      return root.T08LearningWorkspace.open(context);
    }
  };
  root.T08Learning=service;
  function boot(){
    if(initializing)return initializing;
    initializing=refresh().finally(()=>{initializing=null;});
    if(config.enabled && root.FC?.client?.auth?.onAuthStateChange)root.FC.client.auth.onAuthStateChange((_event,session)=>{
      ++epoch;userId=session?.user?.id||null;available=false;serverStatus=null;notify();
      setTimeout(()=>refresh(),0);
    });
    return initializing;
  }
  if(root.document?.readyState==='loading')root.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(typeof window!=='undefined'?window:globalThis);
