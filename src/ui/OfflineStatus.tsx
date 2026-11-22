import { useState, useSyncExternalStore } from 'react';
import { Download, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { offlineSnapshot, retryOffline, subscribeOffline } from '../services/offline.ts';
export function OfflineStatus({save,status}:{save?:()=>Promise<boolean>;status?:string}) {
  const state=useSyncExternalStore(subscribeOffline,offlineSnapshot);
  const [busy,setBusy]=useState(false);
  const act=async(fn:()=>Promise<void>)=>{setBusy(true);try{await fn();}finally{setBusy(false);}};
  return <aside className="offline-status" aria-label="Connection and installation">
    <span role="status" title={state.ready?'The complete studio is cached on this device.':'Keep this page open online until the offline download finishes.'}>
      {state.online?<Wifi size={14}/>:<WifiOff size={14}/>}
      {!state.online?'Offline':state.ready?'Ready offline':import.meta.env.PROD?'Preparing offline…':'Online'}
    </span>
    {status&&<span className="offline-save-status">{status}</span>}
    {state.install&&<button disabled={busy} onClick={()=>void act(state.install!)}><Download size={14}/>Install</button>}
    {state.update&&<button disabled={busy} onClick={()=>void act(async()=>{if(!save||await save())await state.update!();})}><RefreshCw size={14}/>Update</button>}
    {state.error&&<button title={state.error} disabled={busy} onClick={()=>void act(retryOffline)}>Retry offline download</button>}
  </aside>;
}
