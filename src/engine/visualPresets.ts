import { modularExample } from './modularExample.ts';
import { visualExamples } from './visualExamples.ts';
import { compileComponents } from './visualAssets.ts';
import { characters } from './presets.ts';
import type { Character } from './schema.ts';
import type { CharacterVisualData } from './visualAssets.ts';
export const profileSettings:Record<CharacterVisualData['profile'],Partial<Character>>={
  slim:{height:1.06,head:.87,thickness:.83,bodyBuild:{frame:'slim',arms:'slim',legs:'slim'}},
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
  const visual={version:1 as const,style:character.visual?.style??'illustrated' as const,profile};
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
