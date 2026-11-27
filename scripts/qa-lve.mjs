import {performance} from 'node:perf_hooks';
import {LveSimulation,lveDefaultConfig} from '../src/engine/lveSimulation.ts';
import {lveFixtures} from '../src/engine/lveFixtures.ts';
const fixtures=lveFixtures(),s=new LveSimulation(fixtures),sample=t=>({transform:[1,0,0,1,Math.sin(t*.04)*6,0],forces:{gravity:{x:0,y:30},wind:{x:15,y:0},turbulence:8}});
const times=[];for(let t=1;t<=600;t++){const start=performance.now();s.seek(t,sample);times.push(performance.now()-start);}
times.sort((a,b)=>a-b);console.log('LVE_QA '+JSON.stringify({environment:process.version,platform:process.platform,arch:process.arch,fixtures:s.instrumentation(),medianMs:times[300],p95Ms:times[570]}));s.dispose();
