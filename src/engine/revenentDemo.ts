import { ProjectDocument, uid, type Project } from './schema.ts';
import { makeScene } from './presets.ts';
import { illustratedCharacters } from './visualPresets.ts';
import { visualExamples } from './visualExamples.ts';
import { defaultPerspective } from './environmentVisuals.ts';
/** Original illustrated scene; silent dialogue audition is labelled, never passed off as generated speech. */
export function makeRevenentDemo():Project{
  const scene=makeScene('Township street',false),actor='revenent-actor';
  const backdrop=visualExamples.find(pack=>pack.category==='environment')!,car=visualExamples.find(pack=>pack.category==='prop')!;
  return ProjectDocument.parse({version:1,id:uid(),name:'REVENENT · Alexandra night visual test',characters:structuredClone(illustratedCharacters),scenes:[{
    ...scene,name:'Alexandra · silent visual benchmark',duration:16,backgroundImage:backdrop.files[0].data,
    visual:{version:1,quality:'balanced',perspective:{...defaultPerspective,retimeMovement:true},
      lighting:{enabled:true,ambient:'#81769a',intensity:.72,shadow:'#171b2c',shadowOpacity:.48,
        lights:[{id:'amber-streetlight',x:695,y:225,color:'#ffbf7f',intensity:.85,radius:230,falloff:1.4}]}},
    actors:[{id:actor,characterId:'revenent',x:260,y:495,scale:1,depth:0,rotation:0,view:'three-quarter',flip:false,expression:'neutral'}],
    objects:[{id:'parked-car',name:'Parked car · depth occluder',kind:'image',color:'#36404b',x:450,y:423,scale:1,rotation:0,depth:0,imageData:car.files[0].data,imageWidth:300,imageHeight:120,visual:{perspective:false}},
      {id:'lamp',kind:'streetlight',name:'Amber streetlight',color:'#49434e',x:695,y:350,scale:.86,rotation:0,depth:0,visual:{perspective:false,lighting:false}}],
    markers:[{id:'near',name:'Foreground',time:0},{id:'occlusion',name:'Behind car',time:5},{id:'amber',name:'Under amber light',time:10},{id:'voice',name:'Silent viseme audition · record dialogue',time:12}],
    clips:[{id:'walk',track:'movement',actor,start:1,length:10,fromX:260,fromY:495,toX:696,toY:352,gait:'walk',
      keyframes:[{time:0,x:260,y:495},{time:.45,x:450,y:375},{time:.7,x:600,y:345},{time:1,x:696,y:352}]},
      {id:'talk',track:'body',actor,start:12,length:4,action:'talk',layer:'body'},
      {id:'face',track:'face',actor,start:12,length:4,expression:'thinking',intensity:.55},
      {id:'camera-wide',track:'camera',shot:'wide',start:0,length:11,transition:'cut'},
      {id:'camera-close',track:'camera',shot:'medium',focus:actor,start:11,length:5,transition:'glide',movement:'dolly-in',strength:.45},
      {id:'draft-title',track:'text',text:'REVENENT · silent visual test',start:0,length:3,x:480,y:68,size:25,color:'#ead1ae',style:'title'}]
  }]});
}
