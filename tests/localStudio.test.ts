import assert from 'node:assert/strict';
import test from 'node:test';
import { localStudioEnabled, localStudioMode, LOCAL_PROJECT_SCOPE, LOCAL_CREATOR_LABEL } from '../src/services/localStudio.ts';

test('local studio is one-click only on loopback development origins',()=>{
  for(const host of ['localhost','LOCALHOST','127.0.0.1','::1','[::1]']){
    assert.equal(localStudioEnabled(true,host),true,host);
  }
});
test('local studio bypass cannot enable itself on production or LAN origins',()=>{
  for(const host of ['cartoon-maker-theta.vercel.app','sirvibe.com','192.168.1.42','10.0.0.1','badlocalhost.com','']){
    assert.equal(localStudioEnabled(true,host),false,host);
    assert.equal(localStudioEnabled(false,host),false,host);
  }
  assert.equal(localStudioEnabled(false,'localhost'),false);
});
test('local creator retains the existing IndexedDB guest project namespace',()=>{
  assert.equal(LOCAL_PROJECT_SCOPE,'guest');
  assert.equal(LOCAL_CREATOR_LABEL,'Local Creator');
  // Node tests have no browser dev origin, so the default must never be
  // interpreted as an authenticated or cloud-logged-in session.
  assert.equal(localStudioMode,false);
});
