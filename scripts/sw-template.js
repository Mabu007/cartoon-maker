/* Built with a content-derived version. Only complete bundles become active. */
const VERSION = __VERSION__;
const PRECACHE = __PRECACHE__;
const CACHE = 'sirvibe-shell-' + VERSION;
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      // Bound concurrency for inexpensive phones and slower connections.
      for (let i=0;i<PRECACHE.length;i+=6) await cache.addAll(PRECACHE.slice(i,i+6).map(url => new Request(url,{cache:'reload'})));
    } catch(error) { await caches.delete(CACHE); throw error; }
    // Updates wait for the creator to save and explicitly choose Update.
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Keep the previous bundle for open tabs using its lazy chunks.
    const names=(await caches.keys()).filter(name=>name.startsWith('sirvibe-shell-')&&name!==CACHE);
    await Promise.all(names.slice(0,-1).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if(event.data?.type==='ACTIVATE_UPDATE') self.skipWaiting();
  if(event.data?.type==='OFFLINE_STATUS') event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    const ready=(await Promise.all(PRECACHE.map(url=>cache.match(url)))).every(Boolean);
    event.ports[0]?.postMessage({ready,version:VERSION});
  })());
});
self.addEventListener('fetch', event => {
  const request=event.request, url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  if(request.mode==='navigate') {
    event.respondWith((async()=> (await caches.open(CACHE)).match('/index.html').then(hit=>hit||fetch(request)))());
    return;
  }
  if(PRECACHE.includes(url.pathname)||url.pathname.startsWith('/assets/')) {
    event.respondWith((async()=>{
      const hit=await (await caches.open(CACHE)).match(url.pathname);
      if(hit)return hit;
      // A previous tab can still load the version it started with.
      for(const name of (await caches.keys()).filter(n=>n.startsWith('sirvibe-shell-'))) {
        const prior=await (await caches.open(name)).match(url.pathname); if(prior)return prior;
      }
      return fetch(request);
    })());
  }
});
