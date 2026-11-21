import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePCM, effectiveCues, overrideRegion } from '../src/engine/dspLipSync.ts';
import { evaluate } from '../src/engine/evaluate.ts';
import { makeProject } from '../src/engine/presets.ts';
import { ProjectDocument } from '../src/engine/schema.ts';
import { sampleTimedViseme } from '../src/engine/visemes.ts';
import { useStudio } from '../src/studio.ts';
import { splitTimelineClips, trimTimelineClip } from '../src/engine/timelineEditing.ts';
const rate=16000;
function speech(seconds=3,volume=.4,noise=0){return Float32Array.from({length:rate*seconds},(_,i)=>{
 const time=i/rate,syllable=Math.sin(time*2*Math.PI*4)**2;
 return (time>.3&&time<seconds-.3?volume*syllable*(Math.sin(time*2*Math.PI*190)+.3*Math.sin(time*2*Math.PI*1100)):0)+noise*Math.sin(i*1.723);
});}
test('DSP is deterministic, responds to real energy and closes through silence',()=>{
 const pcm=speech(),a=analyzePCM(pcm,rate),b=analyzePCM(pcm,rate);
 assert.deepEqual(a,b);assert.equal(a.duration,3);assert.equal(a.waveform.length,150);
 assert.equal(sampleTimedViseme(a.cues,.1).shape,'rest');assert.equal(sampleTimedViseme(a.cues,2.9).shape,'rest');
 assert.ok(a.cues.some(c=>c.shape!=='rest'&&(c.strength??0)>.4));assert.ok(a.waveform.some(p=>p>.2));
 assert.ok(a.cues.every((c,i)=>c.end>c.start&&(!i||c.start>=a.cues[i-1].end-.000001)));
});
test('silence, low noise, shouting, fast speech and sample rates stay bounded',()=>{
 for(const pcm of [new Float32Array(rate),speech(2,0,.001),speech(2,.95,.003),speech(2,.3,.015)]){
  const result=analyzePCM(pcm,rate);assert.ok(result.cues.every(c=>Number.isFinite(c.strength)&&c.strength!>=0&&c.strength!<=1));assert.ok(result.cues.length<3000);
 }
 assert.ok(analyzePCM(speech(2,0,.001),rate).cues.every(c=>c.shape==='rest'));
 assert.throws(()=>analyzePCM(new Float32Array(0),rate));
 const samples=speech();const a=analyzePCM(samples,rate),b=analyzePCM(Float32Array.from({length:3*48000},(_,i)=>samples[Math.floor(i/3)]),48000);
 assert.equal(a.duration,b.duration);
});
test('manual regions split automatic cues, reset individually and survive regeneration',()=>{
 const automatic=[{start:0,end:1,shape:'open' as const},{start:1,end:2,shape:'round' as const}];
 const edits=overrideRegion([], .3,.6,'closed');
 const merged=effectiveCues(automatic,edits);
 assert.equal(sampleTimedViseme(merged,.4).shape,'closed');assert.equal(sampleTimedViseme(merged,.8).shape,'open');
 const regenerated=automatic.map(c=>({...c,shape:'wide' as const}));
 assert.equal(sampleTimedViseme(effectiveCues(regenerated,edits),.4).shape,'closed');
 assert.equal(sampleTimedViseme(effectiveCues(regenerated,overrideRegion(edits,.3,.6)),.4).shape,'wide');
 assert.deepEqual(automatic,[{start:0,end:1,shape:'open'},{start:1,end:2,shape:'round'}]);
});
test('corrections use audio source time across trim, split, move, undo and JSON reopening',()=>{
 const project=makeProject(true),scene=project.scenes[0],clip=scene.clips.find(c=>c.track==='dialogue')!;
 assert.equal(clip.track,'dialogue');if(clip.track!=='dialogue')return;
 clip.visemes=[{start:0,end:3,shape:'open'}];clip.manualVisemes=[{start:.4,end:.8,shape:'closed'}];
 clip.lipSync={source:'dsp',engine:'toonroom-dsp-1',analyzedDuration:3};
 const at=clip.start+.5;
 assert.equal(evaluate(scene,at).actors.find(a=>a.id===clip.actor)!.viseme?.shape,'closed');
 const trimmed=trimTimelineClip(scene,clip.id,'in',clip.start+.3);
 assert.equal(evaluate(trimmed,at).actors.find(a=>a.id===clip.actor)!.viseme?.shape,'closed');
 const split=splitTimelineClips(scene,[clip.id],at).scene;
 assert.equal(evaluate(split,at+.01).actors.find(a=>a.id===clip.actor)!.viseme?.shape,'closed');
 useStudio.getState().open(project);useStudio.getState().editScene(s=>({...s,clips:s.clips.map(c=>c.id===clip.id?{...clip,manualVisemes:[{start:.4,end:.8,shape:'bite'}]}:c)}));
 useStudio.getState().undo();assert.deepEqual(useStudio.getState().project.scenes[0].clips.find(c=>c.id===clip.id),clip);
 useStudio.getState().redo();const saved=ProjectDocument.parse(JSON.parse(JSON.stringify(useStudio.getState().project)));
 assert.equal(evaluate(saved.scenes[0],at).actors.find(a=>a.id===clip.actor)!.viseme?.shape,'bite');
});
test('invalid manual cue ranges cannot corrupt saved projects',()=>{
 const project=makeProject(true),clip=project.scenes[0].clips.find(c=>c.track==='dialogue')!;
 if(clip.track!=='dialogue')return;clip.manualVisemes=[{start:1,end:.5,shape:'open'}];
 assert.equal(ProjectDocument.safeParse(project).success,false);
});

test('maximum-length rapid audio fits the project cue budget',()=>{
 const pcm=Float32Array.from({length:16000*180},(_,i)=>Math.sin(i*.07)*Math.sin(i*.002)**2*.4);
 const result=analyzePCM(pcm,16000);assert.ok(result.cues.length<=3000);assert.equal(result.cues.at(-1)!.end,180);
 assert.ok(result.cues.some(c=>c.shape!=='rest'));
});

test('door anchors open and close deterministically without becoming held props',()=>{
 const project=makeProject(true),scene=project.scenes[0],door=scene.objects.find(o=>o.kind==='door')!,actor=scene.actors[0];
 scene.clips.push({id:'open-door',track:'props',actor:actor.id,target:door.id,interaction:'open',start:2,length:1});
 scene.clips.push({id:'close-door',track:'props',actor:actor.id,target:door.id,interaction:'close',start:10,length:1});
 const valid=ProjectDocument.parse(project).scenes[0];
 const opening=(time:number)=>{const item=evaluate(valid,time).objects.find(o=>o.id===door.id)!;return 'doorOpen' in item?item.doorOpen:0;};
 assert.equal(opening(1),0);assert.ok(Number(opening(2.35))>0);assert.equal(opening(3),1);assert.equal(opening(11),0);
 assert.notEqual(evaluate(valid,3).actors.find(a=>a.id===actor.id)!.held?.id,door.id);
});
