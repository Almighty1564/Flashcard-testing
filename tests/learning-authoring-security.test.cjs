const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../learning-authoring.js'),'utf8');
async function render(sources){
  const node=()=>({onclick:null,onsubmit:null}),body={innerHTML:'',replaceChildren(){},querySelector:()=>node()},status={textContent:''};
  const host={open:false,setAttribute(){},addEventListener(){},querySelector:key=>key==='[data-body]'?body:key==='.lw-status'?status:node(),showModal(){this.open=true;}};
  const ctx={URL,location:{href:'https://study.example.invalid/developer.html',origin:'https://study.example.invalid'},document:{createElement:()=>host,body:{append(){}}},FC:{config:{url:'https://backend.example.invalid'},getProfile:async()=>({role:'developer'})},T08Learning:{isAvailable:()=>true,getUserId:()=> 'author',subscribe(){},request:async action=>action==='list_sources'?{sources,mappings:[]}:{rules:null}}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);await ctx.T08LearningAuthoring.open({moduleId:'course',questions:[]});return body.innerHTML;
}
test('authors can inspect original sources through protected-origin links without rendering hostile filenames',async()=>{
  const html=await render([{id:'s',filename:'<img src=x onerror=alert(1)>',mime_type:'text/plain',url:'https://backend.example.invalid/storage/v1/object/sign/source?token=fixture'}]);
  assert.match(html,/Open original source/);assert.match(html,/rel="noopener noreferrer"/);assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.doesNotMatch(html,/<img src=x/);
});
test('authoring never creates source links for executable, foreign, lookalike or missing URLs',async()=>{
  for(const url of ['javascript:alert(1)','data:text/html,test','https://foreign.example.invalid/source','https://backend.example.invalid.evil.test/source',undefined]){
    const html=await render([{id:'s',filename:'source.txt',mime_type:'text/plain',url}]);assert.doesNotMatch(html,/Open original source/,String(url));
  }
});
