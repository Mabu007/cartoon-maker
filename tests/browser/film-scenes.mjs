import { makeProject, makeScene } from '../../src/engine/presets.ts';

const demo = makeProject(true).scenes[0];
const settings = [
  ['Living room', 'The empty plate', 'sbu-food'],
  ['Township street', 'The inspection', 'zee-safe'],
  ['Podcast studio', 'The receipt', 'sbu-receipt'],
];

const scenes = settings.map(([world, name, recording], index) => {
  const scene = makeScene(world);
  const voice = demo.clips.find(clip => clip.track === 'dialogue' && clip.asset === 'builtin:' + recording);
  const listener = voice.actor === 'actor-sbu' ? 'actor-zee' : 'actor-sbu';
  return {
    ...scene,
    id: 'lunch-' + index,
    name,
    duration: 4,
    actors: demo.actors.map(actor => ({ ...actor, depth: 5 })),
    clips: [
      { ...voice, id: 'line', start: .35, length: 2.7 },
      { id: 'look', track: 'gaze', actor: listener, target: voice.actor, start: 0, length: 4 },
      { id: 'look-back', track: 'gaze', actor: voice.actor, target: listener, start: 0, length: 4 },
      { id: 'point', track: 'body', actor: voice.actor, action: index === 1 ? 'shrug' : 'point', layer: 'gesture', start: .6, length: 2 },
      { id: 'walk', track: 'movement', actor: 'actor-sbu', fromX: 300, fromY: 454, toX: 365, toY: 454, gait: 'walk', start: 0, length: 1.5 },
      { id: 'establish', track: 'camera', shot: 'wide', transition: 'cut', start: 0, length: 1.35 },
      { id: 'reaction', track: 'camera', shot: 'close-up', transition: 'cut', focus: voice.actor, start: 1.35, length: 2.65 },
      { id: 'bed', track: 'music', asset: 'builtin:sting', name: 'Mystery music', start: 0, length: 4, volume: .065, muted: false, loop: true, offset: 0 },
      { id: 'fx', track: 'audio', asset: 'builtin:' + ['ding', 'pop', 'rimshot'][index], name: 'Beat', start: 3, length: .5, volume: .4, muted: false, offset: 0 },
    ],
  };
});

console.log(JSON.stringify(scenes));
