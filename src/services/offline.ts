export type OfflineState={online:boolean;ready:boolean;install?:()=>Promise<void>;update?:()=>Promise<void>;error?:string};
type InstallPrompt=Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
let state:OfflineState={online:navigator.onLine,ready:false};
const listeners=new Set<()=>void>();
export const offlineSnapshot=()=>state;
export function subscribeOffline(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};}
function patch(change:Partial<OfflineState>){state={...state,...change};listeners.forEach(fn=>fn());}
window.addEventListener('online',()=>{patch({online:true});if(!state.ready)void retryOffline();});
window.addEventListener('offline',()=>patch({online:false}));
window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();const prompt=event as InstallPrompt;
  patch({install:async()=>{await prompt.prompt();await prompt.userChoice;patch({install:undefined});}});
});
window.addEventListener('appinstalled',()=>patch({install:undefined}));
let registration:ServiceWorkerRegistration|undefined,running:Promise<void>|undefined;
const watched=new WeakSet<ServiceWorkerRegistration>(),workers=new WeakSet<ServiceWorker>();
async function check(repair=false){
  const worker=navigator.serviceWorker.controller??registration?.active;
  if(!worker)return;
  await new Promise<void>(resolve=>{
    const channel=new MessageChannel();
    const timer=setTimeout(()=>{channel.port1.close();if(!state.ready)patch({error:'Offline cache did not respond. Reconnect and retry.'});resolve();},repair?45000:10000);
    channel.port1.onmessage=event=>{
      clearTimeout(timer);channel.port1.close();
      const ready=!!event.data.ready;
      patch({ready,error:ready?undefined:'Offline files are incomplete. Reconnect and retry the download.'});resolve();
    };
    worker.postMessage({type:repair?'REPAIR_OFFLINE':'OFFLINE_STATUS'},[channel.port2]);
  });
}
if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('controllerchange',()=>void check());
function offerUpdate(){
  if(!registration?.waiting||!navigator.serviceWorker.controller)return;
  patch({update:async()=>{
    const worker=registration?.waiting;if(!worker){patch({update:undefined});return;}
    navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});
    worker.postMessage({type:'ACTIVATE_UPDATE'});
  }});
}
function watchWorker(worker:ServiceWorker|null){
  if(!worker||workers.has(worker))return;workers.add(worker);
  const changed=()=>{
    if(worker.state==='installed'){offerUpdate();void check();}
    if(worker.state==='redundant'&&!state.ready)patch({error:'Offline download interrupted. Reconnect and retry.'});
  };
  worker.addEventListener('statechange',changed);changed();
}
export function registerOffline():Promise<void>{
  if(!import.meta.env.PROD)return Promise.resolve();
  if(running)return running;
  running=(async()=>{
    if(!('serviceWorker' in navigator)){patch({error:'Offline installation is unavailable in this browser.'});return;}
    try {
      registration=await navigator.serviceWorker.getRegistration('/');await check();
      registration=await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
      if(!watched.has(registration)){
        watched.add(registration);
        registration.addEventListener('updatefound',()=>watchWorker(registration?.installing??null));
      }
      watchWorker(registration.installing);offerUpdate();
      void navigator.serviceWorker.ready.then(()=>check());await check();
    } catch {if(!state.ready)patch({error:'Offline download failed. Reconnect and retry.'});}
  })().finally(()=>{running=undefined;});
  return running;
}
export async function retryOffline(){await registerOffline();if(registration?.active)await check(true);await registration?.update().catch(()=>{});}
