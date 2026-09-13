import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {canonicalJSON, createPodcastStore, MANIFEST_PATH, validateManifest} from './podcast-media.mjs';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const audio = Object.assign(new Blob(['ID3test audio'], {type:'audio/mpeg'}), {name:'episode.mp3'});
const pdf = Object.assign(new Blob(['%PDF-test transcript'], {type:'application/pdf'}), {name:'transcript.pdf'});
const revision = '12345678-1234-1234-1234-123456789abc';
const validManifest = {version:1, revision, publishedAt:'2026-09-13T12:00:00Z', sourceFingerprint:'a'.repeat(64), questionCount:115, audioPath:`podcasts/mod2/${revision}/audio.mp3`, transcriptPath:`podcasts/mod2/${revision}/transcript.pdf`};

function fixture({role='developer', failPdf=false, changed=false, downloadError=null, manifest=validManifest}={}) {
  const uploads=[], signatures=[];
  let reads=0;
  const storage={
    async download() { return downloadError ? {error:downloadError} : {data:new Blob([JSON.stringify(manifest)])}; },
    async createSignedUrl(path, ttl, options) { signatures.push({path,ttl,options}); return {data:{signedUrl:'https://example.invalid/private/'+path}}; },
    async upload(path, file, options) { uploads.push({path,file,options}); return failPdf && path.endsWith('.pdf') ? {error:new Error('PDF upload failed')} : {data:{path}}; }
  };
  const fc={
    config:{imageBucket:'question-images'},
    client:{
      storage:{from(bucket){assert.equal(bucket,'question-images');return storage;}},
      auth:{async getUser(){return {data:{user:{id:'owner'}}};}},
      from(table){
        const query={
          select(fields){ if(table==='question_groups') assert.ok(!fields.includes('updated_at')); return query; },
          eq(){return query;},order(){return query;},range(){return query;},
          then(resolve,reject){return Promise.resolve({data:table==='question_groups' ? [{id:'group',name:'Frequency',sort_order:1}] : [{id:'q',answer_data:{text:changed && reads>1?'updated':'original'},is_active:true}]}).then(resolve,reject);}
        }; return query;
      }
    },
    async getProfile(){return {id:'owner',role};},
    async getModule(){reads++;return {id:'module',slug:'mod2',name:'MOD 2',description:'',is_published:true};}
  };
  return {store:createPodcastStore(fc),uploads,signatures};
}

test('fingerprints ignore object key order but retain meaningful array order',()=>{
  assert.equal(canonicalJSON({b:1,a:{z:2,x:3}}),canonicalJSON({a:{x:3,z:2},b:1}));
  assert.notEqual(canonicalJSON([1,2]),canonicalJSON([2,1]));
});

test('manifest cannot point at another folder or an external URL',()=>{
  assert.throws(()=>validateManifest({...validManifest,audioPath:'https://other.invalid/audio.mp3'}));
  assert.throws(()=>validateManifest({...validManifest,transcriptPath:'podcasts/mod1/file.pdf'}));
  assert.equal(validateManifest(validManifest),validManifest);
});

test('private downloads use expiring signed links and explicit download names',async()=>{
  const f=fixture();await f.store.load();
  assert.equal(f.signatures.length,3);
  assert.ok(f.signatures.every(s=>s.ttl===7200));
  assert.equal(f.signatures[1].options.download,'Module_2_SATCOM_Podcast.mp3');
  assert.equal(f.signatures[2].options.download,'Module_2_SATCOM_Transcript.pdf');
});

test('missing episode is distinct from an authorization failure',async()=>{
  assert.equal(await fixture({downloadError:{statusCode:'404'}}).store.load(),null);
  await assert.rejects(fixture({downloadError:new Error('Unauthorized')}).store.load(),/Unauthorized/);
});

test('a tester cannot start uploads',async()=>{
  const f=fixture({role:'tester'});
  await assert.rejects(f.store.publish(audio,pdf),/developer account/);
  assert.equal(f.uploads.length,0);
});

test('failed PDF upload preserves the selected episode',async()=>{
  const f=fixture({failPdf:true});
  await assert.rejects(f.store.publish(audio,pdf),/PDF upload failed/);
  assert.ok(!f.uploads.some(u=>u.path===MANIFEST_PATH));
});

test('a source change during upload prevents publication',async()=>{
  const f=fixture({changed:true});
  await assert.rejects(f.store.publish(audio,pdf),/changed during the upload/);
  assert.ok(!f.uploads.some(u=>u.path===MANIFEST_PATH));
});

test('a complete matching pair publishes the manifest last',async()=>{
  const f=fixture();const result=await f.store.publish(audio,pdf);
  assert.equal(f.uploads.length,3);
  assert.equal(f.uploads[2].path,MANIFEST_PATH);
  assert.equal(f.uploads[0].options.upsert,false);
  assert.equal(f.uploads[1].options.upsert,false);
  assert.equal(f.uploads[2].options.upsert,true);
  assert.deepEqual(validateManifest(JSON.parse(await f.uploads[2].file.text())),result);
});
