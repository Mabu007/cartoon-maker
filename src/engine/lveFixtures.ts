import {lveMaterials,LveDefinition,type LveDefinitionData} from './lveSimulation.ts';
export function lveFixtures():LveDefinitionData[]{
 const mat=lveMaterials.braid;
 return [
 {version:1,id:'spring',nodes:[{id:'tip',rest:{x:0,y:0},pin:0,material:lveMaterials.spring}],constraints:[],colliders:[]},
 {version:1,id:'braid',nodes:[0,1,2,3].map(i=>({id:'n'+i,rest:{x:0,y:i*6},pin:i===0?1:0,material:mat})),constraints:[0,1,2].map(i=>({a:'n'+i,b:'n'+(i+1),length:6,strength:1,kind:'distance'})),colliders:[{id:'head',a:{x:-4,y:7},b:{x:-4,y:15},radius:3,groups:[0]}]},
 {version:1,id:'fabric',nodes:Array.from({length:6},(_,i)=>({id:'n'+i,rest:{x:i%3*7,y:Math.floor(i/3)*8},pin:i<3?1:0,material:lveMaterials.fabric})),constraints:[...Array.from({length:3},(_,i)=>({a:'n'+i,b:'n'+(i+3),length:8,strength:1,kind:'distance'})),...Array.from({length:2},(_,i)=>({a:'n'+(i+3),b:'n'+(i+4),length:7,strength:1,kind:'distance'})),{a:'n3',b:'n5',length:14,strength:.5,kind:'bend'}],colliders:[]}
 ].map(x=>LveDefinition.parse(x));
}
