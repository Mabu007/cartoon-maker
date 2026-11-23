/**
 * A lightweight silent acting study, built entirely from editable SIRVIBE
 * timeline clips. Captions stand in for user-recorded dialogue; no false
 * claim of synthesized speech and no added network/media dependencies.
 */
import { makeProject, makeScene } from './presets.ts';
import { uid, type Clip, type Project, type Scene } from './schema.ts';

export function makeActingDemoProject():Project {
  const project=makeProject(), scene:Scene=makeScene('Living room');
  const sbu='demo-actor-sbu',zee='demo-actor-zee';
  scene.name="You're Lying — 30-second acting study";
  scene.duration=30;
  scene.actors=[
    {id:sbu,characterId:'sbu',x:327,y:442,scale:1,rotation:0,depth:0,view:'three-quarter',flip:false,expression:'neutral'},
    {id:zee,characterId:'zee',x:680,y:444,scale:1,rotation:0,depth:0,view:'three-quarter',flip:true,expression:'neutral'}
  ];
  const face=(actor:string,expression:Extract<Clip,{track:'face'}>['expression'],
    intent:NonNullable<Extract<Clip,{track:'face'}>['intent']>,
    start:number,length:number,intensity=1):Clip=>
    ({id:uid(),track:'face',actor,expression,intent,start,length,intensity});
  const body=(actor:string,action:Extract<Clip,{track:'body'}>['action'],
    start:number,length:number):Clip=>
    ({id:uid(),track:'body',actor,action,layer:'gesture',start,length});
  const gaze=(actor:string,target:string,start:number,length:number):Clip=>
    ({id:uid(),track:'gaze',actor,target,start,length});
  const camera=(shot:Extract<Clip,{track:'camera'}>['shot'],start:number,length:number,focus?:string):Clip=>
    ({id:uid(),track:'camera',shot,start,length,transition:'cut',...(focus?{focus}:{})});
  const caption=(text:string,start:number,length:number):Clip=>
    ({id:uid(),track:'text',text,start,length,x:480,y:484,size:26,color:'#ffffff',style:'caption'});
  scene.clips=[
    {id:uid(),track:'actors',actor:sbu,start:0,length:30},
    {id:uid(),track:'actors',actor:zee,start:0,length:30},
    camera('two-shot',0,5),
    camera('medium',5,5,sbu),
    camera('medium',10,5,zee),
    camera('reaction',15,5,sbu),
    camera('medium',20,5,zee),
    camera('two-shot',25,5),
    gaze(sbu,zee,0,30),
    // This deliberately leaves Zee's gaze automatic so avoidance still reads.
    face(sbu,'thinking','suspicious',.25,4.65,.85),
    face(zee,'nervous','lying-nervously',2,3,.55),
    face(sbu,'angry','skeptical',5,4.9,.8),
    body(sbu,'point',6.1,1.6),
    caption('Bro, are you lying to me?',5.1,4.2),
    face(zee,'happy','forced-smile',10,4.9,1),
    body(zee,'shrug',10.9,1.7),
    caption('Me? Never!',10.4,3.4),
    face(sbu,'smug','silent-judgment',15,4.9,1.15),
    caption('...',17,2),
    face(zee,'nervous','uncomfortable',20,4.9,1.1),
    body(zee,'think',21.5,1.6),
    face(sbu,'surprised','disbelieving',25,4.95,1.1),
    face(zee,'nervous','forced-smile',25.4,4.4,1.2),
    caption('Seriously, bro?',25.6,3.3)
  ];
  return {...project,name:"You're Lying — Acting Demo",scenes:[scene]};
}
