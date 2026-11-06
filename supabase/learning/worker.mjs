// Run on a persistent server, never in the browser. Does not require a DB key.
import {setTimeout as sleep} from 'node:timers/promises';
const endpoint=process.env.LEARNING_API_URL;
const token=process.env.LEARNING_WORKER_TOKEN;
if(!endpoint||!token||token.length<32)throw new Error('Set LEARNING_API_URL and a random LEARNING_WORKER_TOKEN of at least 32 characters');
const url=new URL(endpoint);
if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))throw new Error('Worker endpoint must use HTTPS');
let stopping=false;
process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
while(!stopping){
  let pause=15000;
  try{
    const response=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action:'process_job'}),signal:AbortSignal.timeout(100000)});
    if(!response.ok){console.error('Worker endpoint unavailable; status',response.status);pause=30000;}
    else {const result=await response.json();if(result.processed){console.log('Learning stage',result.stage,result.error?'retry or stopped':'finished');pause=result.error?15000:1000;}}
  }catch{console.error('Worker connection failed; retrying');pause=30000;}
  if(!stopping)await sleep(pause);
}
