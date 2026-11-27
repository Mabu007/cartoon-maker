import type {VectorArtwork} from './vectorArtwork.ts';
/** A new opt-in fixture; does not replace the Stage 0 anatomy or presets. */
export const forearmVectorFixture:VectorArtwork={
  version:1,units:'bone-normalized',bounds:[-.2,-.7,1.2,.7],pivot:[0,0],
  anchors:[{id:'start',point:[0,0]},{id:'end',point:[1,0]}],
  palette:{skin:'#9c5b43',ink:'#52362b'},
  materials:[{id:'soft',stiffness:40,damping:12}],controlGroups:['belly'],collisionProxies:[],
  regions:[{id:'forearm',layer:0,fillRule:'nonzero',fill:{kind:'palette',key:'skin'},
    stroke:{paint:{kind:'palette',key:'ink'},width:.03},
    commands:[['M',0,0],['C',.1,-.45,.6,-.4,1,0],['Q',.4,.42,0,0],['Z']],
    material:{materialId:'soft',controlGroup:'belly',maxDisplacement:.08,
      weights:[{pin:1,influence:1},{pin:0,influence:1},{pin:0,influence:1},{pin:1,influence:1},{pin:0,influence:1},{pin:1,influence:1}]}}],
  poses:[],compatibility:{rig:'sirvibe-native-v1',mirrorSafe:true}
};
