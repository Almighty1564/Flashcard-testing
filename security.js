(function(){
  "use strict";
  const $=id=>document.getElementById(id);
  let all=[], filtered=[];
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  function profile(row){return row.profile||row.profiles||{}}
  function accountName(row){const p=profile(row);return p.username||p.display_name||row.account_label||row.user_id.slice(0,8)}
  function location(row){return [row.city,row.region,row.country_code].filter(Boolean).join(", ")||"Unknown"}
  function device(ua){
    ua=ua||"";
    let browser=/Edg\//.test(ua)?"Edge":/Chrome\//.test(ua)?"Chrome":/Firefox\//.test(ua)?"Firefox":/Safari\//.test(ua)&&!/Chrome\//.test(ua)?"Safari":"Other";
    let os=/Windows/.test(ua)?"Windows":/Android/.test(ua)?"Android":/iPhone|iPad/.test(ua)?"iOS/iPadOS":/Mac OS X/.test(ua)?"macOS":/Linux/.test(ua)?"Linux":"Unknown OS";
    return browser+" · "+os;
  }
  function markNewIps(rows){
    const chronological=[...rows].sort((a,b)=>new Date(a.logged_in_at)-new Date(b.logged_in_at)), seen=new Map();
    chronological.forEach(row=>{
      const set=seen.get(row.user_id)||new Set();
      row._ipState=!row.ip_address?"unknown":set.size===0?"baseline":set.has(row.ip_address)?"known":"new";
      if(row.ip_address)set.add(row.ip_address);seen.set(row.user_id,set);
    });
  }
  function render(){
    const q=$("search").value.trim().toLowerCase();
    filtered=all.filter(r=>!q||[accountName(r),r.ip_address,location(r),device(r.user_agent),r.user_agent,r.source].join(" ").toLowerCase().includes(q));
    $("loginCount").textContent=filtered.length;
    $("accountCount").textContent=new Set(filtered.map(r=>r.user_id)).size;
    $("ipCount").textContent=new Set(filtered.map(r=>r.ip_address).filter(Boolean)).size;
    $("newIpCount").textContent=filtered.filter(r=>r._ipState==="new").length;
    $("rows").innerHTML=filtered.map(r=>{
      const state=r._ipState==="new"?'<span class="badge new">NEW IP</span>':r._ipState==="baseline"?'<span class="badge base">BASELINE</span>':"";
      return '<tr><td><span class="who">'+esc(accountName(r))+'</span>'+state+'</td><td>'+esc(new Date(r.logged_in_at).toLocaleString())+'<br><span class="muted">'+esc(r.timezone||"")+'</span></td><td>'+esc(location(r))+'</td><td class="mono">'+esc(r.ip_address||"Unknown")+'</td><td>'+esc(device(r.user_agent))+'<br><span class="muted" title="'+esc(r.user_agent||"")+'">'+esc((r.user_agent||"").slice(0,95))+'</span></td><td>'+esc(r.source||"web")+'</td></tr>';
    }).join("");
    $("empty").hidden=filtered.length>0;
  }
  async function load(){
    $("refreshBtn").disabled=true;
    try{
      const days=Number($("range").value)||30, since=new Date(Date.now()-days*86400000).toISOString();
      const res=await FC.client.from("login_audit").select("id,user_id,account_label,ip_address,city,region,country_code,timezone,user_agent,logged_in_at,source,profile:profiles(username,display_name)").gte("logged_in_at",since).order("logged_in_at",{ascending:false}).limit(1000);
      if(res.error)throw res.error;
      all=res.data||[];markNewIps(all);render();
    }catch(error){$("rows").innerHTML='<tr><td colspan="6" class="error">Could not load security activity: '+esc(error.message||error)+'</td></tr>'}
    finally{$("refreshBtn").disabled=false}
  }
  function csv(){
    const cols=["account","logged_in_at","city","region","country_code","ip_address","timezone","device","user_agent","source","ip_state"];
    const quote=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
    const lines=[cols.join(",")].concat(filtered.map(r=>[accountName(r),r.logged_in_at,r.city,r.region,r.country_code,r.ip_address,r.timezone,device(r.user_agent),r.user_agent,r.source,r._ipState].map(quote).join(",")));
    const blob=new Blob([lines.join("\n")],{type:"text/csv"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="tomato08-login-activity.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  $("range").addEventListener("change",load);$("search").addEventListener("input",render);$("refreshBtn").addEventListener("click",load);$("exportBtn").addEventListener("click",csv);$("clearBtn").addEventListener("click",()=>{$("search").value="";render();$("search").focus()});
  (async()=>{
    try{
      if(!window.FC)throw new Error("Account service did not load.");
      const access=await FC.requireDeveloper();
      if(!access||access.denied){location.replace("./index.html?return="+encodeURIComponent("/security.html"));return}
      $("gate").hidden=true;$("app").hidden=false;await load();
    }catch(error){$("gate").querySelector("h1").textContent="Security activity unavailable";$("gateError").textContent=error.message||error}
  })();
})();
