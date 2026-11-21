import type { Graphics } from 'pixi.js';
import { ellipse, rect, segment } from './art.ts';
import { shade } from './illustration.ts';
import { vector } from './wardrobeArt.ts';

import { seats, type Seat, type SeatingKind } from './seatingCatalog.ts';

export function drawSeat(g:Graphics,kind:SeatingKind,color:string,foreground=false) {
  const item:Seat=seats[kind];
  const edge=kind==='throne'?'#b58b48':shade(color,-.47);
  if(foreground) {
    if(item.arms)vector(g,item.arms,shade(color,-.13),edge,2.6);
    return;
  }
  if(item.base)vector(g,item.base,'none',edge,kind==='salon-chair'?5:4.4);
  if(kind==='wheelchair'){
    for(const x of [-42,42]){
      ellipse(g,x,-26,18,25,'#323245',2.4);
      ellipse(g,x,-26,13,19,'#bec3cf',1.2);
      segment(g,x,-45,x,-7,'#606679',1.5);segment(g,x-10,-26,x+10,-26,'#606679',1.5);
      ellipse(g,x*.56,-8,5,7,'#303040',1);
    }
  }
  vector(g,item.back,color,edge,2.8);
  vector(g,item.detail,'none',kind==='throne'?'#e5bf70':shade(color,item.upholstered?-.23:.28),1.45);
  if(kind!=='beanbag'&&kind!=='bar-stool'){
    const width=item.size[0]*.77;
    rect(g,-width/2,item.seat-4,width,item.upholstered?20:11,shade(color,.16),4,2,edge);
  }
}
