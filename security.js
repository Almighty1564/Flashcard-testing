/* Developer-only login records. Server RPC enforces approval, active session and role. */
(function () {
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let all=[],filtered=[],total=0,serial=0;
  const place=r=>[r.city,r.region,r.country_code].filter(Boolean).join(', ')||'Unknown';
  const name=r=>r.username||r.account_label||String(r.user_id||'').slice(0,8);
  const when=v=>v?new Date(v).toLocaleString():'Not recorded';
  function device(ua=''){
    const browser=/Edg\//.test(ua)?'Edge':/Chrome\//.test(ua)?'Chrome':/Firefox\//.test(ua)?'Firefox':/Safari\//.test(ua)?'Safari':'Other';
    const os=/Windows/.test(ua)?'Windows':/Android/.test(ua)?'Android':/iPhone|iPad/.test(ua)?'iOS / iPadOS':/Mac OS X/.test(ua)?'macOS':/Linux/.test(ua)?'Linux':'Unknown OS';
    return browser+' / '+os;
  }
  const status=document.createElement('p');status.className='privacy';status.setAttribute('role','status');$('rows').closest('.table-wrap').after(status);
  const more=document.createElement('button');more.type='button';more.className='btn';more.textContent='Load more records';more.hidden=true;status.after(more);
  function render(){
    const q=$('search').value.trim().toLowerCase();
    filtered=all.filter(r=>[name(r),r.ip_address,place(r),r.user_agent,r.source].join(' ').toLowerCase().includes(q));
    $('loginCount').textContent=filtered.length;$('accountCount').textContent=new Set(filtered.map(r=>r.user_id)).size;
    $('ipCount').textContent=new Set(filtered.map(r=>r.ip_address).filter(Boolean)).size;
    $('newIpCount').textContent=filtered.filter(r=>r.first_recorded_ip&&r.ip_address).length;
    $('newIpCount').nextElementSibling.textContent='First recorded IP observations';
    $('rows').innerHTML=filtered.map(r=>'<tr><td><strong>'+esc(name(r))+'</strong>'+(r.first_recorded_ip&&r.ip_address?'<br><span class="badge">FIRST RECORDED IP</span>':'')+'</td><td>'+esc(when(r.logged_in_at))+'<br><span class="muted">Observed: '+esc(when(r.observed_at))+'</span></td><td>'+esc(place(r))+'<br><span class="muted">'+(r.city?'Approximate; not verified identity':'Location unavailable')+'</span></td><td class="mono">'+esc(r.ip_address||'Unknown')+'</td><td>'+esc(device(r.user_agent||''))+'<details><summary>Details</summary>'+esc(r.user_agent||'Not provided')+'</details></td><td>'+esc(r.source)+'<br><span class="muted">'+(r.session_id?'Auth session observation':'Legacy client event')+'</span></td></tr>').join('');
    $('empty').hidden=filtered.length>0;
    status.textContent=filtered.length+' matching / '+all.length+' loaded / '+total+' in range. Search and export cover loaded rows. Times shown in '+(Intl.DateTimeFormat().resolvedOptions().timeZone||'browser local time')+'.';
    more.hidden=all.length>=total;
  }
  async function load(append=false){
    const current=++serial;$('refreshBtn').disabled=true;more.disabled=true;
    status.textContent='Loading authentication records…';
    try{
      const res=await FC.client.rpc('security_overview',{p_days:Number($('range').value),p_offset:append?all.length:0,p_limit:200});
      if(current!==serial)return;
      if(res.error)throw res.error;
      if(!res.data||!Array.isArray(res.data.events))throw new Error('Invalid server response');
      all=append?[...all,...res.data.events]:res.data.events;total=Number(res.data.total)||0;render();
    }catch(error){
      if(current!==serial)return;
      all=[];filtered=[];total=0;render();status.textContent='Could not load security activity: '+(error.message||'Access unavailable');
    }finally{if(current===serial){$('refreshBtn').disabled=false;more.disabled=false;}}
  }
  function csv(){
    const quote=value=>{let s=String(value??'');if(/^[\s]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
    const rows=[['account','sign_in_time_utc','observed_at_utc','ip_address','city','region','country_code','device','user_agent','source'],...filtered.map(r=>[name(r),r.logged_in_at,r.observed_at,r.ip_address,r.city,r.region,r.country_code,device(r.user_agent||''),r.user_agent,r.source])];
    const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');
    a.href=url;a.download='tomato08-login-activity.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  more.addEventListener('click',()=>load(true));$('range').addEventListener('change',()=>load());$('search').addEventListener('input',render);$('refreshBtn').addEventListener('click',()=>load());$('exportBtn').addEventListener('click',csv);$('clearBtn').addEventListener('click',()=>{$('search').value='';render();});
  (async()=>{
    try{
      if(!window.FC)throw new Error('Account service did not load.');
      const access=await FC.requireDeveloper();
      if(!access){window.location.replace('./index.html?return='+encodeURIComponent('/security.html'));return;}
      if(access.denied)throw new Error('Developer access is required.');
      $('gate').hidden=true;$('app').hidden=false;
      document.querySelector('.top p.muted').textContent='App login events and available Auth-session observations. Not a complete failed-password or visitor log.';
      const note=document.querySelector('#app > p.privacy');
      if(note)note.textContent='Session IP and device are as observed and may reflect a session refresh, not its original location. Legacy location estimates are unverified. Records older than 180 days are pruned when this dashboard loads. Public files and previously downloaded data are not made private by these controls.';
      await load();
      FC.client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){serial++;all=[];filtered=[];$('rows').replaceChildren();$('app').hidden=true;$('gate').hidden=false;$('gateError').textContent='Sign in again to view records.';}});
    }catch(error){$('gate').querySelector('h1').textContent='Security activity unavailable';$('gateError').textContent=error.message||String(error);}
  })();
})();
