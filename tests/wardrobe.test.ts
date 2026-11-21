import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../src/engine/evaluate.ts';
import { facialPerformance } from '../src/engine/facialAnimation.ts';
import { eyeWorldPoint } from '../src/engine/gaze.ts';
import { anchorFor } from '../src/engine/interactions.ts';
import { mouthGeometry } from '../src/engine/mouthRig.ts';
import { characters, makeProject, makeProp } from '../src/engine/presets.ts';
import { CharacterDefinition, ProjectDocument, type Scene } from '../src/engine/schema.ts';

test('extended wardrobes and seating survive project validation alongside legacy characters', () => {
  const project=makeProject();
  const wardrobe={eyewear:'cinema',footwear:'high-top',handheld:'camera',hatTilt:18,pattern:'plaid'} as const;
  project.characters[0]=CharacterDefinition.parse({...project.characters[0],hair:'pompadour',hat:'boater',wardrobe});
  const chair=makeProp('gaming-chair');
  project.scenes[0].objects.push(chair);
  const saved=ProjectDocument.parse(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(saved.characters[0].wardrobe,wardrobe);
  assert.equal(saved.characters[1].wardrobe,undefined);
  assert.equal(anchorFor(saved.scenes[0].objects.at(-1)!)?.action,'sit');
});

test('tooth pigment intensity, custom interiors and speech closure share the same mouth rig', () => {
  const character=CharacterDefinition.parse({...characters[0],toothColors:Array(6).fill('#ff0000'),
    wardrobe:{toothStyle:'fangs',teethIntensity:0,restJaw:.6}});
  const open=mouthGeometry(character,facialPerformance(1,character.id,'idle','neutral'),'front');
  assert(open.open);
  assert.equal(open.teeth[1].fill,'#fff4de');
  assert.equal(open.teeth[1].pointed,true);
  character.wardrobe!.teethIntensity=1;
  const painted=mouthGeometry(character,facialPerformance(1,character.id,'idle','neutral'),'side');
  assert.equal(painted.teeth[1].fill,'#ff0000');
  const closed=mouthGeometry(character,facialPerformance(1,character.id,'talk','neutral',1,{shape:'closed',weight:1}),'front');
  assert.equal(closed.open,false);
});

test('actor-targeted gaze follows the other cast member’s posed eye line and mirrors pupil direction', () => {
  const scene:Scene={...makeProject().scenes[0],objects:[],clips:[],actors:[
    {id:'left',characterId:characters[0].id,x:310,y:440,scale:1,depth:0,rotation:0,view:'front',flip:true,expression:'neutral',gazeTarget:'right'},
    {id:'right',characterId:characters[1].id,x:610,y:430,scale:1.16,depth:0,rotation:0,view:'front',flip:false,expression:'neutral'}
  ]};
  const cast=new Map(characters.map(character=>[character.id,character]));
  const [left,right]=evaluate(scene,1,cast).actors;
  assert.deepEqual(left.gazePoint,eyeWorldPoint(right,characters[1]));
  assert(left.focus&&left.focus.x<0,'a mirrored actor aiming screen-right moves pupils left in rig space');
});
