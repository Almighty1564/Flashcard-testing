/* Load the published catalogs once. No learner data is requested by these fetches. */
(function(){
 'use strict';let cached;
 async function json(path){const r=await fetch(path,{credentials:'same-origin'});if(!r.ok)throw new Error('Could not load the course map. Reload with a connection.');return r.json();}
 window.T08PathData={load(){return cached||(cached=(async()=>{const [plan,course,index,studio]=await Promise.all([json('path/plan.json'),json('manifest.json'),json('drills/index.json'),json('studio/catalog.json')]);course.units=await Promise.all(course.unitFiles.map(json));const packs=await Promise.all(index.topics.map(t=>json(t.file)));return {plan,course,index,packs,studio,map:window.T08PathCore.build(plan,course,packs,studio)};})().catch(e=>{cached=null;throw e;}));}};
})();
