export type OfflineState={online:boolean;ready:boolean;install?:()=>Promise<void>;update?:()=>Promise<void>;error?:string};
type InstallPrompt=Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
let state:OfflineState={online:navigator.onLine,ready:false};
const listeners=new Set<()=>void>();
export const offlineSnapshot=()=>state;
export function subscribeOffline(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};}
function patch(change:Partial<OfflineState>){state={...state,...change};listeners.forEach(fn=>fn());}
window.addEventListener('online',()=>patch({online:true}));
window.addEventListener('offline',()=>patch({online:false}));
window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();const prompt=event as InstallPrompt;
  patch({install:async()=>{await prompt.prompt();await prompt.userChoice;patch({install:undefined});}});
});
window.addEventListener('appinstalled',()=>patch({install:undefined}));
let registration:ServiceWorkerRegistration|undefined;
async function check(){
  const worker=navigator.serviceWorker.controller??registration?.active;
  if(!worker)return;
  await new Promise<void>(resolve=>{
    const channel=new MessageChannel();
    const timer=setTimeout(()=>{channel.port1.close();resolve();},10000);
    channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();patch({ready:!!event.data.ready,error:undefined});resolve();};
    worker.postMessage({type:'OFFLINE_STATUS'},[channel.port2]);
  });
}
export async function registerOffline(){
  if(!import.meta.env.PROD)return;
  if(!('serviceWorker' in navigator)){patch({error:'Offline installation is unavailable in this browser.'});return;}
  try {
    registration=await navigator.serviceWorker.getRegistration('/');
    await check();
    registration=await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
    const offerUpdate=()=>{
      if(!registration?.waiting||!navigator.serviceWorker.controller)return;
      patch({update:async()=>{
        const worker=registration?.waiting;if(!worker)return;
        navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});
        worker.postMessage({type:'ACTIVATE_UPDATE'});
      }});
    };
    navigator.serviceWorker.addEventListener('controllerchange',()=>void check());
    offerUpdate();
    registration.addEventListener('updatefound',()=>{
      const worker=registration?.installing;
      worker?.addEventListener('statechange',()=>{
        if(worker.state==='installed'){offerUpdate();void check();}
        if(worker.state==='redundant')patch({error:'Offline download interrupted. Reconnect and retry.'});
      });
    });
    void navigator.serviceWorker.ready.then(()=>check());
    await check();
  } catch {if(!state.ready)patch({error:'Offline download failed. Reconnect and retry.'});}
}
export async function retryOffline(){await registration?.update().catch(()=>{});await registerOffline();}
