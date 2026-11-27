import {hairDesignDefaults} from './hairDesignSchema.ts';
import { modularExample } from './modularExample.ts';
import { visualExamples } from './visualExamples.ts';
import { compileComponents } from './visualAssets.ts';
import { characters } from './presets.ts';
import type { Character } from './schema.ts';
import type { CharacterVisualData } from './visualAssets.ts';
export const profileSettings:Record<CharacterVisualData['profile'],Partial<Character>>={
  slim:{height:1.06,head:.87,thickness:.83,bodyBuild:{frame:'slim',arms:'slim',legs:'slim'}},
  lean:{height:1.1,head:.85,thickness:.91,bodyBuild:{frame:'slim',arms:'regular',legs:'slim'}},
  heavyset:{height:1.02,head:.93,thickness:1.19,bodyBuild:{frame:'round',arms:'regular',legs:'full',hips:.5}},
  petite:{height:.83,head:.91,thickness:.86,torso:.92,legs:.93,bodyBuild:{frame:'slim',arms:'slim',legs:'slim'}},
  average:{height:1.08,head:.88,bodyBuild:{frame:'regular',arms:'regular',legs:'regular'}},
  curvy:{height:1.02,head:.86,bodyBuild:{frame:'regular',arms:'regular',legs:'full',chest:.65,hips:.75}},
  athletic:{height:1.12,head:.85,bodyBuild:{frame:'broad',arms:'regular',legs:'muscular'}},
  muscular:{height:1.15,head:.85,thickness:1.1,bodyBuild:{frame:'broad',arms:'muscular',legs:'muscular',chest:.2}},
  broad:{height:1.06,head:.9,thickness:1.1,bodyBuild:{frame:'broad',arms:'regular',legs:'full'}},
  larger:{height:1.04,head:.9,thickness:1.15,bodyBuild:{frame:'round',arms:'regular',legs:'full',hips:.4}},
  short:{height:.8,head:.86,torso:.9,legs:.9,bodyBuild:{frame:'regular'}},
  tall:{height:1.26,head:.83,legs:1.15,bodyBuild:{frame:'slim'}},
  'young-adult':{height:1.04,head:.92,bodyBuild:{frame:'slim',arms:'slim',legs:'slim'}},
  mature:{height:1.13,head:.87,bodyBuild:{frame:'broad',arms:'regular',legs:'regular'},wardrobe:{undereye:.38,jawWidth:1.2,chinWidth:1.1,noseLength:1.18}},
  elderly:{height:.91,head:.91,torso:.9,bodyBuild:{frame:'slim',arms:'slim',legs:'regular'},hairColor:'#939097',wardrobe:{undereye:.65,eyelid:.2,noseLength:1.25,cheekWidth:.9}}
};
export function applyProfile(character:Character,profile:CharacterVisualData['profile']):Character{
  const settings=profileSettings[profile];
  const limbArt=character.visual?.limbArt;
  const visual:CharacterVisualData={version:1,style:character.visual?.style??'illustrated',profile};
  if(limbArt)visual.limbArt=limbArt;
  if(character.visual?.primaryArt)visual.primaryArt=character.visual.primaryArt;
  if(character.visual?.headRig)visual.headRig=character.visual.headRig;
  if(character.visual?.vectorComponents)visual.vectorComponents=character.visual.vectorComponents.filter(c=>c.profiles.includes(profile));
  const components=character.visual?.components?.filter(c=>c.profiles.includes(profile));
  return {...character,height:1,head:1,thickness:1,torso:1,arms:1,legs:1,...settings,
    wardrobe:{...character.wardrobe,...settings.wardrobe},visual:{...visual,components}};
}
export const illustratedCharacters:Character[]=[
  {...applyProfile(characters[0],'mature'),id:'revenent',name:'Revenent',skin:'#784d3c',shirt:'#292d39',pants:'#191d2b',shoes:'#323342',hair:'fade',hairColor:'#211f2a',beard:'stubble',shape:'square',eyes:'squint',brows:'straight',nose:'flat',mouth:'line',outfit:'jacket',
    wardrobe:{jawWidth:1.2,chinWidth:1.12,cheekWidth:.94,headStretch:1.12,noseLength:1.18,noseWidth:1.15,undereye:.38,eyelid:.16,trim:'#8d7a65',footwear:'boot',sleeve:'long'},personality:{preset:'serious',autoActing:'subtle'}},
  {...applyProfile(characters[1],'curvy'),id:'nandi',name:'Nandi',skin:'#92563f',shirt:'#bc7256',pants:'#26363a',shoes:'#b89767',hair:'braids',hairColor:'#26212c',beard:'none',shape:'oval',eyes:'almond',brows:'arched',nose:'button',outfit:'blouse',
    wardrobe:{jawWidth:.85,chinWidth:.8,crownWidth:.95,headStretch:1.1,noseWidth:1.12,lipThickness:1.18,trim:'#dfbc85',footwear:'chelsea',bottoms:'wide-leg'},personality:{preset:'confident',autoActing:'subtle'}}
];

illustratedCharacters[0].visual!.components=compileComponents(modularExample);
illustratedCharacters[1].visual!.components=compileComponents(visualExamples.find(p=>p.category==='hair')!);

/** Native premium presets intentionally use no baked raster components:
 * every face, colour, body shape, hair and garment remains editable. The
 * original imported-art examples remain available unchanged. */
export const studioCharacters:Character[]=[
  {...applyProfile(characters[0],'athletic'),id:'sbu-studio',name:'Sbu · Studio',
    skin:'#a7684b',shirt:'#304a48',pants:'#28363e',shoes:'#d3c1a2',
    hair:'fade',hairColor:'#242120',beard:'goatee',shape:'oblong',eyes:'hooded',brows:'bold',nose:'flat',mouth:'smile',outfit:'biker',
    head:.78,height:1.15,legs:1.12,arms:1.03,thickness:1.06,
    wardrobe:{jawWidth:1.12,chinWidth:1.05,cheekWidth:.93,headStretch:1.04,noseWidth:1.12,trim:'#cba97b',footwear:'boot',sleeve:'long',bottoms:'straight'},
    visual:{version:1,style:'illustrated',profile:'athletic',limbArt:'anatomical-v1',shoulders:1.08,waist:.91,hips:.94,armWidth:1.17,thighWidth:1.12,calfWidth:1.07,handSize:1.08,footSize:1.04},
    personality:{preset:'confident',autoActing:'subtle'}},
  {...applyProfile(characters[1],'curvy'),id:'zee-studio',name:'Zee · Studio',
    skin:'#9c5b43',shirt:'#b46d50',pants:'#263b40',shoes:'#d9b482',
    hair:'braids',hairColor:'#302327',beard:'none',shape:'heart',eyes:'almond',brows:'arched',nose:'button',mouth:'smile',outfit:'blouse',
    head:.79,height:1.08,legs:1.12,arms:1.02,thickness:1,
    wardrobe:{jawWidth:.87,chinWidth:.9,cheekWidth:.95,headStretch:1.05,lipThickness:1.13,trim:'#e0b98c',footwear:'chelsea',sleeve:'rolled',bottoms:'wide-leg'},
    visual:{version:1,style:'illustrated',profile:'curvy',limbArt:'anatomical-v1',shoulders:.94,waist:.83,hips:1.12,armWidth:1.02,thighWidth:1.08,calfWidth:1.02,handSize:1.02,footSize:.98},
    personality:{preset:'confident',autoActing:'subtle'}}
];

/** Explicit upgrade presets; original Studio IDs/art remain available. */
export const flagshipCharacters:Character[]=studioCharacters.map((base,i)=>({
  ...structuredClone(base),id:i?'zee-vector-v1':'sbu-vector-v1',name:i?'Zee · Vector Studio':'Sbu · Vector Studio',
  hair:i?'box-braids':'fade',hairDesign:{...hairDesignDefaults,volume:i?1.05:.78,length:i?1.16:.8,parting:i?-.12:0,highlight:i?.26:.18,material:{...hairDesignDefaults.material,stiffness:i?54:180,damping:i?12:24,wind:i?.35:0,maxDisplacement:i?7:0}},
  wardrobe:{...base.wardrobe,forehead:i?1.02:1.06,jawAngle:i?.28:.79,eyeWidth:i?1.12:.96,eyeTilt:i?5:-2,irisSize:i?1.08:.93,lidCurvature:i?1.06:.88,browLength:i?1.12:1.06,browAsymmetry:i?.3:-.2,cupidBow:i?.82:.25,upperLipRatio:i?1.15:.8,lowerLipRatio:i?1.24:1.05,lipColor:i?'#934d50':'#74453d',cheekBlush:i?.18:0},
  mouthRig:{width:i?1.04:1.08,jawScale:1,roundness:i?.66:.4,asymmetry:i?.08:-.08},
  visual:{...base.visual!,primaryArt:'pose-v1',abdomen:i?1.04:.94,muscleDefinition:i?.44:.76,softness:i?.64:.32,wristWidth:i?.94:1.08,kneeWidth:1,ankleWidth:i?.95:1.03,fingerLengths:i?[1,1.02,1.04,1.02,.98]:[1.04,1.02,1.01,1,.96]}
}));
