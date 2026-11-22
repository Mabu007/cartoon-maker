import { seatingNames, seatingStyles } from './characterCatalog.ts';
import { seats, isSeating, type SeatingKind } from './seatingCatalog.ts';
import { uid, type Anchor, type Character, type Clip, type Project, type Prop, type Scene } from './schema.ts';

const base: Character = {
  id: 'sbu', name: 'Bra Sbu', skin: '#b97550', shirt: '#efbd52', pants: '#282943', hairColor: '#28233e', shoes: '#f5e6cb',
  height: 1, head: 1, torso: 1, arms: 1, legs: 1, thickness: 1, eyeSpacing: 1, shape: 'oval', eyes: 'round', brows: 'bold', nose: 'button', mouth: 'smile', ears: 'round',
  hair: 'fade', beard: 'goatee', hat: 'none', glasses: false, earrings: false, outfit: 'hoodie', accessory: 'none'
};
export const characters: Character[] = [base,
  { ...base, id: 'zee', name: 'Zee', skin: '#a65f42', shirt: '#b8a5f5', pants: '#392c53', hairColor: '#30243b', shoes: '#f7d879', head: 1.07, height: .91, shape: 'round', hair: 'puff', beard: 'none', eyes: 'relaxed', brows: 'arched', earrings: true, outfit: 'jacket' },
  { ...base, id: 'milo', name: 'Milo', skin: '#d99b6a', shirt: '#78ceb5', pants: '#283954', hair: 'locs', beard: 'none', glasses: true, outfit: 'tee', height: 1.09, shape: 'square' },
  { ...base, id: 'tumi', name: 'Tumi', skin: '#8d503a', shirt: '#ef887d', pants: '#4b2943', hair: 'buzz', hat: 'beanie', beard: 'none', eyes: 'wide', outfit: 'jacket', accessory: 'scarf' },
  { ...base, id: 'naledi', name: 'Naledi', skin: '#986044', shirt: '#e996ae', pants: '#423557', shoes: '#faf0d7', hair: 'braids', head: 1.05, height: .94, shape: 'round', beard: 'none', brows: 'arched', outfit: 'sweater', earrings: true, accessory: 'chain' },
  { ...base, id: 'neo', name: 'Neo', skin: '#ac714f', shirt: '#83acd1', pants: '#29334b', shoes: '#ffe3ad', hair: 'afro', beard: 'none', height: 1.12, shape: 'square', outfit: 'tee', glasses: true },
  { ...base, id: 'lerato', name: 'Lerato', skin: '#d49569', shirt: '#7fcfae', pants: '#4c415a', hair: 'curls', beard: 'none', head: 1.12, height: .84, outfit: 'uniform', eyes: 'wide', earrings: true },
  { ...base, id: 'bra-j', name: 'Bra J', skin: '#76452f', shirt: '#ce9472', pants: '#2c3545', shoes: '#dfca9c', hair: 'bald', beard: 'full', head: .98, height: 1.2, thickness: 1.14, shape: 'square', hat: 'cap', outfit: 'jacket', accessory: 'chain' }
];
export const propColors: Record<Prop['kind'], string> = { sofa: '#e18556', chair: '#cf8c69', table: '#754e4b', desk: '#936b57', door: '#b4a38d', window: '#8ebcad', television: '#343447', lamp: '#f6ca70', cup: '#f5e8ce', book: '#f88e78', phone: '#7569a6', plant: '#6d9878', microphone: '#414057', streetlight: '#504b62', counter: '#d59964', image: '#d9c8e4', snack:'#e9ae61',pencil:'#ffcf69','steering-wheel':'#3f465b',ball:'#f28565','foam-dagger':'#b6a2e4', ...Object.fromEntries(seatingStyles.map(kind=>[kind,seats[kind].color])) as Record<SeatingKind,string> };
export const anchors: Partial<Record<Prop['kind'], Anchor>> = {
  sofa: { x: 10, y: -18, action: 'sit', facing: 'three-quarter' }, chair: { x: 0, y: -13, action: 'sit', facing: 'side' },
  snack:{x:0,y:-8,action:'hold'},pencil:{x:0,y:-5,action:'hold'},
  'steering-wheel':{x:0,y:-24,action:'hold'},ball:{x:0,y:-18,action:'hold'},
  'foam-dagger':{x:0,y:-9,action:'hold'},
  cup: { x: 10, y: -10, action: 'hold' }, phone: { x: 3, y: -14, action: 'hold' }, book: { x: 4, y: -6, action: 'hold' }, door: { x: 25, y: -104, action: 'open' }
};
export function makeProp(kind: Prop['kind'], x = 480, y = 420, options: Partial<Prop> = {}): Prop {
  return { id: uid(), name: isSeating(kind)?seatingNames[kind]:kind[0].toUpperCase() + kind.slice(1).replaceAll('-',' '), kind, color: propColors[kind], x, y, scale: 1, rotation: 0, depth: 0, ...options };
}
const furniture = (kind: Prop['kind'], x: number, y: number, scale: number, depth: number, color?: string) => makeProp(kind, x, y, { id: kind, scale, depth, ...(color ? { color } : {}) });
export function makeScene(environment: Scene['environment'] = 'Living room', furnished = true): Scene {
  const sets = {
    'Living room': [furniture('door', 126, 369, 1.15, -4, '#9fa87f'), furniture('window', 622, 237, 1.15, -5, '#9bc4a5'), furniture('sofa', 605, 420, 1.22, -2), furniture('lamp', 841, 395, 1.15, -1), furniture('plant', 76, 419, .9, -1), furniture('table', 578, 472, .94, 3), furniture('cup', 625, 423, .85, 4), furniture('book', 552, 422, .8, 4)],
    'Classroom': [furniture('window', 745, 232, 1.1, -3), furniture('desk', 300, 428, 1.2, -1), furniture('chair', 702, 432, 1.1, 0), furniture('plant', 837, 416, 1, 0), furniture('book', 283, 367, .85, 2)],
    'Township street': [furniture('streetlight', 203, 429, 1.15, -2), furniture('counter', 713, 414, 1.3, -1), furniture('plant', 865, 436, .95, 0)],
    'Podcast studio': [furniture('chair', 310, 412, 1.05, -2), furniture('desk', 485, 463, 1.8, 1), furniture('chair', 667, 416, 1.05, -2), furniture('microphone', 455, 373, 1.2, 2), furniture('plant', 805, 430, 1, 0)]
  };
  return { id: uid(), name: environment, environment, duration: 30, actors: [], objects: furnished ? sets[environment].map((object, index) => ({ ...object, id: sets[environment].findIndex(item => item.id === object.id) === index ? object.id : uid() })) : [], clips: [] };
}
function demoScene(): Scene {
  const scene = makeScene();
  const s = 'actor-sbu', z = 'actor-zee';
  type Body = Extract<Clip, { track: 'body' }>;
  const body = (actor: string, action: Body['action'], start: number, length: number, layer: Body['layer'] = 'body', target?: string): Body => ({ id: uid(), track: 'body', actor, action, start, length, layer, ...(target ? { target } : {}) });
  const move = (actor: string, start: number, length: number, fromX: number, toX: number, y: number): Clip => ({ id: uid(), track: 'movement', actor, start, length, fromX, toX, fromY: y, toY: y });
  const face = (actor: string, expression: Extract<Clip, { track: 'face' }>['expression'], start: number, length: number): Clip => ({ id: uid(), track: 'face', actor, expression, start, length });
  const dialogue = (actor: string, text: string, asset: string, start: number, length: number): Clip => ({ id: uid(), track: 'dialogue', actor, text, asset: `builtin:${asset}`, start, length, volume: .92, muted: false, offset: 0 });
  const sound = (name: string, asset: string, start: number, length: number, volume = .5): Clip => ({ id: uid(), track: 'audio', name, asset: `builtin:${asset}`, start, length, volume, muted: false, offset: 0 });
  const camera = (shot: Extract<Clip, { track: 'camera' }>['shot'], start: number, length: number, focus?: string, transition: 'cut' | 'glide' = 'cut'): Clip => ({ id: uid(), track: 'camera', shot, start, length, ...(focus ? { focus } : {}), transition });
  return { ...scene, name: 'Scene 01 · The living room', actors: [
    { id: s, characterId: 'sbu', x: 300, y: 454, scale: 1.11, rotation: 0, depth: 0, view: 'three-quarter', flip: false, expression: 'neutral' },
    { id: z, characterId: 'zee', x: 640, y: 423, scale: 1.02, rotation: 0, depth: 0, view: 'three-quarter', flip: true, expression: 'happy' }
  ], clips: [
    { id: uid(), track: 'actors', actor: s, start: 0, length: 30 }, { id: uid(), track: 'actors', actor: z, start: 0, length: 30 },
    move(s, 0, 4.65, 300, 446, 454), move(z, 20.25, 5.15, 617, 1020, 450), move(s, 21.15, 5.1, 446, 900, 454),
    body(z, 'sit', 0, 18.8, 'body', 'sofa'), body(z, 'think', 0, 4.3, 'gesture', 'cup'), body(s, 'walk', .1, 4.55), body(s, 'stop', 4.65, .65), body(s, 'surprise', 5.3, 2.3), body(s, 'angry', 8.2, 4), body(s, 'talk', 8.7, 3, 'gesture'), body(z, 'laugh', 12.35, 3.7, 'gesture'), body(s, 'point', 15.7, 3, 'gesture'), body(z, 'stand', 18.8, .8), body(z, 'jump', 19.45, .8), body(z, 'run', 20.25, 5.15), body(s, 'run', 21.15, 5.1), body(s, 'stop', 26.25, .55), body(s, 'shrug', 26.8, 3.2),
    face(s, 'surprised', 4.8, 3.4), face(s, 'angry', 8.2, 10.6), face(z, 'happy', 12.35, 5.2), face(s, 'thinking', 26.8, 3.2),
    dialogue(z, 'Mmm. Extra spicy.', 'zee-spicy', .75, 2.3), dialogue(s, 'Hey! Who ate my food?', 'sbu-food', 8.65, 3.1), dialogue(z, 'I was just checking if it was safe.', 'zee-safe', 12.8, 3.45), dialogue(s, 'Zee! That was my lunch!', 'sbu-lunch', 16.5, 2.55), dialogue(s, 'Fine. I still have the receipt.', 'sbu-receipt', 27, 2.55),
    sound('Door chime', 'ding', 0, .75, .22), sound('Crunch', 'pop', 2.5, .45, .37), sound('Surprise sting', 'sting', 5.3, .95), sound('Comedy pop', 'pop', 12.4, .45), sound('Takeoff', 'whoosh', 19.8, .7), sound('Chase flourish', 'sting', 21.4, .95, .3), sound('Rimshot', 'rimshot', 29.4, .55),
    camera('wide', 0, 5.3), camera('close-up', 5.3, 6.8, s), camera('medium', 12.1, 4.3, z, 'glide'), camera('two-shot', 16.4, 4.2), camera('follow', 20.6, 5.6, s, 'glide'), camera('medium', 26.2, 3.8, s),
    { id: uid(), track: 'transition', effect: 'fade-out', start: 29.55, length: .45 }
  ] };
}
export function makeProject(demo = false): Project {
  return { version: 1, id: uid(), name: demo ? 'Who Ate My Food?' : 'Untitled cartoon', characters: structuredClone(characters), scenes: [demo ? demoScene() : makeScene()] };
}
export { soundNames } from './schema.ts';
export const scenePalettes = {
  'Living room': ['#a9b793', '#c7c39f', '#967564', '#526b5a'], 'Classroom': ['#dfbe80', '#ebd39b', '#9d7163', '#426a65'],
  'Township street': ['#eab98a', '#e5a879', '#a98579', '#7d6e86'], 'Podcast studio': ['#646080', '#8580a2', '#776583', '#53536e']
};
