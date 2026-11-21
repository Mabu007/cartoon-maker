import { Container, Graphics } from 'pixi.js';
import type { Character, View } from './schema.ts';
import type { FacialPerformance } from './facialAnimation.ts';
import { mouthGeometry, type MouthGeometry } from './mouthRig.ts';

type MouthLayer = { root:Container; cavity:Graphics; mask:Graphics; inside:Container;
  teeth:Graphics[]; tongue:Graphics; lips:Graphics };
const layers=new WeakMap<Graphics,MouthLayer>();
function getLayer(face:Graphics):MouthLayer {
  const previous=layers.get(face);
  if(previous)return previous;
  const root=new Container(),cavity=new Graphics(),mask=new Graphics();
  const inside=new Container(),lips=new Graphics(),tongue=new Graphics();
  const teeth=Array.from({length:6},()=>new Graphics());
  root.addChild(cavity,inside,mask,lips);
  inside.addChild(tongue,...teeth);
  inside.mask=mask; // A real GPU stencil mask: teeth/tongue cannot escape lips.
  face.addChild(root);
  const result={root,cavity,mask,inside,teeth,tongue,lips};
  layers.set(face,result);
  return result;
}
/** Clearing Graphics paths does not remove cached children on rear views. */
export function hideExpressionMouth(face:Graphics){
  const layer=layers.get(face);
  if(layer)layer.root.visible=false;
}
export function traceMouthCavity(g:Graphics,shape:MouthGeometry):Graphics {
  const {rx,top,bottom,cornerLeft,cornerRight}=shape;
  return g.moveTo(-rx,cornerLeft)
    .bezierCurveTo(-rx*.76,top*.9,-rx*.36,top,0,top)
    .bezierCurveTo(rx*.36,top,rx*.76,top*.9,rx,cornerRight)
    .bezierCurveTo(rx*.75,bottom*.9,rx*.36,bottom,0,bottom)
    .bezierCurveTo(-rx*.36,bottom,-rx*.75,bottom*.9,-rx,cornerLeft)
    .closePath();
}
/** The exact geometry also powers <SvgMouthRig />. SVG preview uses
 * <clipPath>, and Pixi's renderer uses its equivalent native Graphics mask.
 * Neither implementation swaps image mouth shapes or approximates clipping.
 */
export function drawExpressionMouth(face:Graphics,character:Character,mood:FacialPerformance,x:number,view:View='front') {
  const layer=getLayer(face),model=mouthGeometry(character,mood,view);
  layer.root.visible=true;
  layer.root.position.set(x,27);
  layer.root.scale.set(model.profileScale,1);
  layer.cavity.clear();layer.mask.clear();layer.lips.clear();
  layer.inside.visible=model.open;
  if(!model.open) {
    for(const item of layer.teeth)item.clear();
    layer.tongue.clear();
    const asym=model.parameters.asymmetry;
    layer.lips.moveTo(-model.rx,asym*1.9)
      .quadraticCurveTo(0,mood.expression==='sad'?-2.6:1.4,
        model.rx,-asym*1.9)
      .stroke({color:'#302438',width:character.mouth==='full'?3.1:2.5,cap:'round'});
    if(character.mouth==='full')layer.lips.moveTo(-model.rx*.7,2.4)
      .quadraticCurveTo(0,3.3,model.rx*.7,2.2)
      .stroke({color:'#693a4a',width:1.2,cap:'round'});
    return;
  }
  traceMouthCavity(layer.cavity,model).fill('#352333').stroke({color:'#291f32',width:1.85});
  traceMouthCavity(layer.mask,model).fill('#ffffff');
  layer.tongue.clear();
  if(model.tongue.visible)layer.tongue.ellipse(model.tongue.x,model.tongue.y,model.tongue.rx,model.tongue.ry)
    .fill('#c66f79').stroke({color:'#9d4a62',width:.8});
  for(let i=0;i<layer.teeth.length;i++){
    const graphic=layer.teeth[i];graphic.clear();
    const tooth=model.teeth.find(item=>item.index===i);
    if(!tooth||tooth.height<.3)continue;
    graphic.roundRect(tooth.x,tooth.y,tooth.width,tooth.height,.6)
      .fill(tooth.fill).stroke({color:tooth.outline,width:.48});
  }
  const {rx,top,bottom,cornerLeft,cornerRight}=model;
  // Same lip control points and quadratic paths as SvgMouthRig.
  layer.lips.moveTo(-rx,cornerLeft)
    .quadraticCurveTo(-rx*.4,top-1.2,0,top-1.45)
    .quadraticCurveTo(rx*.4,top-1.05,rx,cornerRight)
    .stroke({color:'#713d4c',width:character.mouth==='full'?2.1:1.65,cap:'round'});
  layer.lips.moveTo(-rx,cornerLeft)
    .quadraticCurveTo(-rx*.35,bottom+.65,0,bottom+1.15)
    .quadraticCurveTo(rx*.35,bottom+.65,rx,cornerRight)
    .stroke({color:'#653946',width:1.35,cap:'round'});
}
