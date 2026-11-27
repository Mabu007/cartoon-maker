import type { Character } from './schema.ts';

export const bodyFrames = ['slim','regular','broad','round'] as const;
export const armBuilds = ['slim','regular','muscular'] as const;
export const legBuilds = ['slim','regular','full','muscular'] as const;

const frames={
  slim:{shoulder:.88,waist:.78,hip:.89,bell:.78},
  regular:{shoulder:1,waist:1,hip:1,bell:1},
  broad:{shoulder:1.23,waist:.91,hip:1.06,bell:.92},
  round:{shoulder:1.12,waist:1.51,hip:1.23,bell:1.53}
};
export function bodyProportions(character:Character) {
  const build=character.bodyBuild;
  const frame=frames[build?.frame??'regular'];
  const visual=character.visual;
  return {
    ...frame,shoulder:frame.shoulder*(visual?.shoulders??1),waist:frame.waist*(visual?.waist??1),hip:(frame.hip+(build?.hips??0)*.38)*(visual?.hips??1),chest:build?.chest??0,
    arm:{slim:.72,regular:1,muscular:1.62}[build?.arms??'regular']*(visual?.armWidth??1),
    leg:{slim:.75,regular:1,full:1.49,muscular:1.35}[build?.legs??'regular']*(visual?.thighWidth??1),
    calves:{slim:.92,regular:1,full:1.05,muscular:1.18}[build?.legs??'regular']*(visual?.calfWidth??1)
  };
}
