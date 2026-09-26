/* Compatibility endpoint: audit identity/IP/device from the authenticated Auth session.
   No service-role credential, client-supplied identity, IP, location or timestamp is accepted. */
const allowed = new Set(['https://tomato08.com','https://www.tomato08.com','http://localhost:8000','http://127.0.0.1:8000']);
Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const headers: Record<string,string> = {
    'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',
    'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods':'POST, OPTIONS'
  };
  if (origin && allowed.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  const reply = (body: unknown,status: number) => new Response(JSON.stringify(body),{status,headers});
  if (origin && !allowed.has(origin)) return reply({error:'Origin not allowed'},403);
  if (req.method === 'OPTIONS') return new Response(null,{status:204,headers});
  if (req.method !== 'POST') return reply({error:'POST required'},405);
  const authorization = req.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) return reply({error:'Authentication required'},401);
  const base = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_ANON_KEY');
  if (!base || !key) return reply({error:'Audit service unavailable'},503);
  try {
    const response = await fetch(base + '/rest/v1/rpc/security_record_session',{
      method:'POST',headers:{authorization,apikey:key,'Content-Type':'application/json'},
      body:JSON.stringify({p_source:'app-session'}),signal:AbortSignal.timeout(5000)
    });
    if (!response.ok) return reply({error:'Audit authorization failed'},response.status===401?401:403);
    const result = await response.json();
    if (result?.allowed !== true) return reply({error:'Account, session or MFA is not authorized'},403);
    return reply({ok:true},200);
  } catch (_) {
    console.error('login-audit: request failed');
    return reply({error:'Audit service unavailable'},503);
  }
});