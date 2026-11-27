import {randomizeWorkspace} from '../engine/characterWorkspace.ts';
import type {IdentityLock} from '../engine/characterIdentity.ts';
import {useState} from 'react';
import {characterIdentity,exportCharacterIdentity,importCharacterIdentity,randomizeCharacterIdentity,setIdentityLock} from '../engine/characterIdentity.ts';
import {identityLockGroups,type Character} from '../engine/schema.ts';
import {downloadText} from '../services/assetPreparation.ts';
export function CharacterIdentityPanel({character,change}:{character:Character;change:(c:Character)=>void}){
  const identity=characterIdentity(character);
  const [seed,setSeed]=useState(String(identity.seed)),[status,setStatus]=useState(''),[group,setGroup]=useState<IdentityLock|'all'>('all');
  function randomize(){
    try{if(!/^\d+$/.test(seed))throw Error('Enter an integer seed');change(randomizeWorkspace(character,Number(seed),group));setStatus('Seeded identity applied. Locked groups retained.');}
    catch(error){setStatus(error instanceof Error?error.message:'Invalid seed');}
  }
  return <details className="character-visual-studio"><summary>Character identity · DNA</summary>
    <p className="small-text">The saved character is the identity. Locks apply to seeded randomization only; manual edits are still available.</p>
    <label className="field">Randomization seed<input aria-label="Identity seed" inputMode="numeric" value={seed} onChange={e=>setSeed(e.target.value)} maxLength={10}/></label>
    <label>Randomize group<select aria-label="Randomize group" value={group} onChange={e=>setGroup(e.target.value as IdentityLock|'all')}><option value="all">All unlocked</option>{identityLockGroups.map(k=><option key={k}>{k}</option>)}</select></label><div className="field-row"><button type="button" onClick={randomize}>Apply seed</button><button type="button" onClick={()=>setSeed(String((Number(seed||0)+1)>>>0))}>Next seed</button></div>
    {identityLockGroups.map(group=><label key={group} className="field"><input type="checkbox" checked={identity.locks.includes(group)} onChange={e=>change(setIdentityLock(character,group,e.target.checked))}/> Lock {group}</label>)}
    <button type="button" onClick={()=>{try{downloadText(character.name.replace(/[^a-z0-9_-]/gi,'-')+'.sirvibe-character',exportCharacterIdentity(character));setStatus('Character identity exported.');}catch(error){setStatus(error instanceof Error?error.message:'Export failed');}}}>Export character identity</button>
    <label className="field">Import character identity into this draft<input aria-label="Import character identity" type="file" accept=".sirvibe-character,.json" onChange={async e=>{
      const input=e.currentTarget,file=input.files?.[0];if(!file)return;
      try{if(file.size>4_000_000)throw Error('Character file exceeds 4 MB');const next=importCharacterIdentity(await file.text(),character.id);change(next);setSeed(String(characterIdentity(next).seed));setStatus('Identity imported; save the character to keep it.');}
      catch(error){setStatus(error instanceof Error?error.message:'Import failed');}finally{input.value='';}
    }}/></label>
    {status&&<p role="status" className="small-text">{status}</p>}
  </details>;
}
