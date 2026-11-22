export const gaitStyles = ['natural', 'zombie', 'elder', 'kid', 'tsotsi', 'goofy', 'sneak', 'sprint'] as const;
export type GaitStyle = typeof gaitStyles[number];
export const gaitStyleNames: Record<GaitStyle, string> = {
  natural:'Natural', zombie:'Zombie shuffle', elder:'Elder stroll', kid:'Kid skip', tsotsi:'Tsotsi swagger',
  goofy:'Goofy walk', sneak:'Sneak', sprint:'Athletic sprint'
};
export const gaitProfiles = {
  natural:{speed:1,step:1,lift:1,arm:1,lean:0,reach:0},
  zombie:{speed:.58,step:1.23,lift:.35,arm:.28,lean:12,reach:60},
  elder:{speed:.64,step:.86,lift:.5,arm:.32,lean:17,reach:4},
  kid:{speed:1.17,step:.77,lift:1.8,arm:1.24,lean:-5,reach:0},
  tsotsi:{speed:.83,step:1.18,lift:.78,arm:1.34,lean:-10,reach:0},
  goofy:{speed:.94,step:1.16,lift:2,arm:1.55,lean:-9,reach:10},
  sneak:{speed:.61,step:1.21,lift:1.28,arm:.5,lean:19,reach:24},
  sprint:{speed:1.25,step:.88,lift:1.15,arm:1.25,lean:9,reach:0}
} satisfies Record<GaitStyle,{speed:number;step:number;lift:number;arm:number;lean:number;reach:number}>;

export const dailyActions = ['sleep-seated','sleep','eat','drink','write','read','phone-call','drive','pick-up','put-down','throw-prop','cartoon-stab'] as const;
export const dailyProps = ['snack','pencil','steering-wheel','ball','foam-dagger'] as const;
export const propActions = {
  eat:['snack'],drink:['cup'],write:['pencil'],read:['book'],'phone-call':['phone'],
  drive:['steering-wheel'],'pick-up':[],'put-down':[],'throw-prop':[],'cartoon-stab':['foam-dagger']
} as const;
export const actionUsesProp = (action:string):action is keyof typeof propActions => Object.hasOwn(propActions,action);
export const isSleep = (action:string) => action==='sleep'||action==='sleep-seated';
export const usesSeat = (action:string) => action==='sit'||action==='sleep-seated';
const gestureActions=['wave','point','reach','nod','shake','shrug','clap','laugh','cry','talk','fist','open-hand','blink','look-away',
  'hand-on-hip','hand-to-face','hand-to-pocket','eat','drink','write','read','phone-call','throw-prop','cartoon-stab'];
export const actionLayer = (action:string) => gestureActions.includes(action)?'gesture' as const:'body' as const;
export const propRelease = {'pick-up':.50,'put-down':.69,'throw-prop':.46} as const;
export const extraActions = [
  'idle-relaxed','idle-alert','idle-bored','idle-nervous',
  'cartoon-guard','cartoon-jab','cartoon-hook','cartoon-kick','cartoon-block','cartoon-dodge','cartoon-recoil','cartoon-fall',
  'dance-bounce','dance-side-step','dance-shuffle','dance-arm-wave','dance-celebration','clap','crouch','reach','stumble', ...dailyActions
] as const;
export const actionGroups = {
  'Idle & movement':['idle','idle-relaxed','idle-alert','idle-bored','idle-nervous','walk','run','stop','turn','jump','sit','stand','lean','crouch','stumble'],
  Acting:['wave','point','reach','nod','shake','shrug','laugh','cry','angry','surprise','celebrate','talk','listen','think','hand-on-hip','hand-to-face','hand-to-pocket','fist','open-hand','blink','look-away','clap'],
  'Daily life':['sleep-seated','sleep','eat','drink','write','read','phone-call','drive','pick-up','put-down','throw-prop'],
  'Cartoon fight':['cartoon-guard','cartoon-jab','cartoon-hook','cartoon-kick','cartoon-block','cartoon-dodge','cartoon-recoil','cartoon-fall','cartoon-stab'],
  Dance:['dance-bounce','dance-side-step','dance-shuffle','dance-arm-wave','dance-celebration']
} as const;
export const vfxNames = ['camera-shake','impact-boom','impact-stars','speed-lines','dust-puff','comic-sweat','sparkles','confetti','shock-ring','comedy-flash'] as const;
export const transitionNames = ['fade-in','fade-out','dissolve','wipe-left','wipe-right','flash-cut','iris-in','iris-out'] as const;
export const transitionPresets = ['fade-in','fade-out','wipe-left','wipe-right','flash-cut','iris-in','iris-out'] as const;
export const soundDurations = {
  ding:.47,pop:.21,sting:.47,whoosh:.55,rimshot:.47,
  'impact-thud':.29,'cartoon-boom':.62,'punch-pop':.22,'swing-swish':.37,
  'sparkle-chime':.84,'comedy-boing':.58,'record-scratch':.52,'dramatic-hit':.75,
  'funny-sting':.85,'sad-trombone':1.4,'footstep':.18,'slide-whistle':.67,
  'crowd-cheer':.98,'dance-kick':.26,'dance-clap':.24,'short-drum-roll':1.1
} as const;
export type SoundName = keyof typeof soundDurations;
export const soundGroups = {
  Comic:['pop','rimshot','comedy-boing','record-scratch','funny-sting','sad-trombone','slide-whistle'],
  Impact:['impact-thud','cartoon-boom','punch-pop','swing-swish','dramatic-hit'],
  'Motion & ambience':['ding','sting','whoosh','sparkle-chime','footstep','crowd-cheer'],
  Rhythm:['dance-kick','dance-clap','short-drum-roll']
} satisfies Record<string,SoundName[]>;
