import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source=(await readFile(new URL('../scripts/sw-template.js',import.meta.url),'utf8')).replace('__VERSION__','"test"').replace('__PRECACHE__','["/index.html","/assets/export.js","/assets/dsp.js"]');
function harness(fail=false){
  const events:Record<string,(e:any)=>void>={},rows=new Map<string,Map<string,any>>(),deleted:string[]=[];
  let skipped=0,fetches=0;
  const cache=(name:string)=>{
    const data=rows.get(name)??new Map();rows.set(name,data);
    return {addAll:async(requests:Request[])=>{if(fail)throw Error('network interrupted');for(const r of requests)data.set(new URL(r.url).pathname,{body:r.url});},match:async(url:string)=>data.get(url)};
  };
  const self={location:{origin:'https://studio.test'},clients:{claim:async()=>{}},addEventListener:(type:string,fn:any)=>{events[type]=fn;},skipWaiting:()=>{skipped++;}};
  vm.runInNewContext(source,{self,URL,Request:class{url:string;constructor(path:string){this.url='https://studio.test'+path;}},caches:{open:async(n:string)=>cache(n),keys:async()=>[...rows.keys()],delete:async(n:string)=>{deleted.push(n);return rows.delete(n);}},fetch:async()=>{fetches++;throw Error('offline');}});
  async function dispatch(type:string,other:Record<string,any>={}){let pending:Promise<unknown>=Promise.resolve();events[type]({waitUntil:(p:Promise<unknown>)=>{pending=p;},respondWith:(p:Promise<unknown>)=>{pending=p;},...other});return pending;}
  return {dispatch,rows,deleted,get skipped(){return skipped;},get fetches(){return fetches;}};
}
test('complete cache serves navigation and unvisited lazy chunks without any network',async()=>{
  const h=harness();await h.dispatch('install');await h.dispatch('activate');
  const shell:any=await h.dispatch('fetch',{request:{method:'GET',url:'https://studio.test/?studio=1',mode:'navigate'}});
  const lazy:any=await h.dispatch('fetch',{request:{method:'GET',url:'https://studio.test/assets/export.js',mode:'cors'}});
  assert.equal(shell.body,'https://studio.test/index.html');assert.equal(lazy.body,'https://studio.test/assets/export.js');assert.equal(h.fetches,0);
  assert.equal(h.skipped,0); // no surprise update/reload
});
test('interrupted installation discards its partial cache',async()=>{
  const h=harness(true);await assert.rejects(h.dispatch('install'),/interrupted/);
  assert.deepEqual(h.deleted,['sirvibe-shell-test']);assert.equal(h.rows.size,0);
});
test('cloud APIs are never intercepted; update requires explicit activation message',async()=>{
  const h=harness();await h.dispatch('install');
  assert.equal(await h.dispatch('fetch',{request:{method:'GET',url:'https://studio.test/api/media',mode:'cors'}}),undefined);
  assert.equal(h.skipped,0);await h.dispatch('message',{data:{type:'ACTIVATE_UPDATE'}});assert.equal(h.skipped,1);
});
