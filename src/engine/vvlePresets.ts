import {vvleDefaults} from './vvleSchema.ts';
import type {EnvironmentVisualData} from './environmentVisuals.ts';
type Lighting=NonNullable<EnvironmentVisualData['lighting']>;
const local=(id:string,x:number,y:number,color:string,intensity:number,radius:number,kind:'point'|'directional'|'spot'|'fill'|'rim',direction=0):Lighting['lights'][number]=>({id,x,y,color,intensity,radius,falloff:1.3,volume:{kind,direction,elevation:120,cone:75,softness:.6}});
const setup=(ambient:string,intensity:number,lights:Lighting['lights'],exposure=0):Pick<EnvironmentVisualData,'lighting'|'volume'>=>({lighting:{enabled:true,ambient,intensity,shadow:'#1e1a26',shadowOpacity:.38,lights},volume:{...vvleDefaults,exposure}});
export const cinematicPresets={
 interrogation:setup('#7b8d9f',.32,[local('key',480,105,'#e4eafa',1.4,420,'spot',90),local('rim',780,190,'#669ec9',.7,420,'rim')]),
 candlelit:setup('#785248',.35,[local('key',380,300,'#ffc06a',1.5,360,'point'),local('fill',680,180,'#7d86bb',.38,550,'fill')],.2),
 'night-street':setup('#59668d',.35,[local('street',280,110,'#ffd28f',1.5,550,'spot',70),local('rim',800,260,'#5e98d8',.7,650,'rim')]),
 daylight:setup('#d2e1ef',.64,[local('sun',480,100,'#fff0d2',.8,1200,'directional',-65),local('sky',700,100,'#d4ecff',.3,1000,'fill')]),
 portrait:setup('#a3a0b9',.38,[local('key',250,160,'#ffe0bd',1.25,650,'point'),local('fill',750,270,'#b8cfff',.55,650,'fill'),local('rim',700,110,'#f7e2ba',.7,550,'rim')])
} as const;
