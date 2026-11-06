// Isolated browser test of the actual study page and new scripts. No real backend configuration is served.
import http from 'node:http';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),port=8767;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.txt':'text/plain; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
http.createServer((req,res)=>{
  if(!/^(127\.0\.0\.1|localhost):8767$/.test(req.headers.host||'')){res.writeHead(403);return res.end();}
  if(req.method!=='GET'){res.writeHead(405);return res.end();}
  let route=new URL(req.url,'http://localhost:'+port).pathname;if(route==='/')route='/mod1.html';
  if(['/supabase-config.js','/cloud.js','/security.js'].includes(route)){res.writeHead(403);return res.end('Live backend disabled in isolated test');}
  try{
    const file=path.resolve(root,'.'+decodeURIComponent(route));if(!file.startsWith(root+path.sep)||file.includes(path.sep+'.git'+path.sep)||file.includes(path.sep+'node_modules'+path.sep)||!mime[path.extname(file)]){res.writeHead(404);return res.end();}
    let bytes=readFileSync(file);
    if(route==='/mod1.html'){
      let html=bytes.toString();html=html.replace(/<script[^>]+src="https:[^"]*supabase[^"]*"[^>]*><\/script>/g,'').replace(/<script src="\.\/supabase-config\.js[^"<]*"><\/script>/g,'').replace(/<script src="\.\/cloud\.js[^"<]*"><\/script>/g,'<script src="./tests/fixtures/learning-fake.js"></script>');bytes=Buffer.from(html);
    }
    if(route==='/learning-config.js')bytes=Buffer.from(bytes.toString().replace('enabled: false','enabled: true').replace('pollIntervalMs: 4000','pollIntervalMs: 1000'));
    res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-src 'self'; object-src 'none'; base-uri 'self'"});res.end(bytes);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log('ISOLATED learning fixture — no live accounts: http://127.0.0.1:'+port+'/'));
