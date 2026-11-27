export const characterStyles = {
  shape: ['oval','round','square','heart','diamond','pear','inverted-triangle','oblong','bean','egg','trapezoid','capsule','pentagon'],
  eyes: ['almond','round','upturned','downturned','hooded','monolid','wide','squint','bead','triangle','relaxed'],
  brows: ['straight','arched','angled','bold'],
  ears: ['round','pointed','wide','small'],
  nose: ['minimal','button','wedge','long','flat'],
  mouth: ['line','full','wavy','smile'],
  hair: ['bald','fade','buzz','pompadour','spiky-crop','man-bun','slicked-back','curtain-bangs','locs','mullet','side-part','bob','ponytail','space-buns','pixie','waves','afro-puffs','braids','wolf-cut','hime','top-knot','afro','puff','curls','short-afro','cornrows','box-braids'],
  beard: ['none','stubble','full','goatee','van-dyke','circle-beard','mutton-chops','chin-strap','handlebar','soul-patch','braided-beard'],
  hat: ['none','cap','beanie','fedora','bucket','cowboy','flat-cap','top-hat','snapback','ushanka','visor','sun-hat','beret','cloche','sun-visor','pillbox','witch','boater','headwrap','fascinator','slouch-beanie'],
  outfit: ['tee','oversized-tee','polo','dress-shirt','hoodie','tracksuit','blazer','biker','tank','sweater','jacket','uniform','fitted-tee','blouse','camisole','cropped-hoodie','cardigan','slip-dress','sundress','athleisure','fitted-turtleneck','bikini','shirtless'],
  accessory: ['none','chain','scarf']
} as const;

export const wardrobeStyles = {
  bottoms: ['straight','cargo','joggers','shorts','wide-leg','skinny-jeans','skirt','cargo-joggers','leggings','biker-shorts'],
  footwear: ['classic','high-top','runner','skate','oxford','loafer','boot','chelsea','heel','platform','slide','sandal','flip-flops'],
  watch: ['none','metal-link','leather-strap','digital','smartwatch','sport','bracelets'],
  bag: ['none','crossbody','tote','shoulder-bag','backpack','duffle','messenger','waist-pack','clutch'],
  eyewear: ['none','wayfarer','wireframe','aviator','cat-eye','browline','oversized','visor','monocle','eye-patch','shutters','novelty','goggles','cinema','taped'],
  piercing: ['none','stud','huggie','large-hoop','drop','gauge','cuff','charm','septum','nostril','eyebrow','lip','bridge'],
  extra: ['none','headphones','earbuds','chain','choker','scarf','bandana','mask','tie','lanyard','sticker','bandage','headband','crown','halo'],
  handheld: ['none','phone','coffee','controller','microphone','spray-can','skateboard','tablet','camera','clipboard','cash','drink','sling','umbrella','pet'],
  pattern: ['solid','stripes','plaid','camo','dots'],
  pupil: ['round','slit','heart','star','cross'],
  side: ['left','right','both'],
  toothStyle: ['standard','fangs','gap','braces','tongue','none'],
  sleeve: ['auto','rolled','long'],
  neckline: ['auto','crew','v-neck','bow','off-shoulder','racerback'],
  closure: ['auto','open','closed'],
  hatWear: ['forward','backward','sideways'],
  mustache: ['auto','none','pencil','chevron','handlebar','walrus'],
  chinHair: ['auto','none','soul-patch','goatee','pointed','braided'],
  jawHair: ['auto','none','stubble','chin-strap','mutton-chops','full']
} as const;

export const seatingStyles = ['gaming-chair','executive-chair','mesh-chair','dining-chair','armchair','beanbag','bar-stool','camp-chair','throne','salon-chair','wheelchair','corner-sofa'] as const;
export const seatingNames = {
  'gaming-chair':'Gaming chair','executive-chair':'Executive chair','mesh-chair':'Mesh task chair','dining-chair':'Dining chair',
  armchair:'Wingback armchair',beanbag:'Beanbag','bar-stool':'Bar stool','camp-chair':'Folding camp chair',throne:'Throne',
  'salon-chair':'Barber chair',wheelchair:'Wheelchair','corner-sofa':'Corner sofa'
} satisfies Record<typeof seatingStyles[number], string>;

export const styleNames: Record<string,string> = {
  fade:'High-top fade', buzz:'Buzz cut', locs:'Freeform locs', sidePart:'Side-parted quiff', bob:'Blunt bob',
  braids:'Box braids', puff:'Single afro puff', waves:'Long waves', full:'Full', goatee:'Goatee',
  cap:'Baseball cap', witch:'Pointed hat', tee:'Crewneck tee', tracksuit:'Zip-up tracksuit', biker:'Biker jacket',
  tank:'Athletic singlet', sweater:'Knit turtleneck', cardigan:'Structured cardigan', athleisure:'Sports bra set',
  classic:'Low-top court sneakers', boot:'Combat boots', highTop:'High tops', runner:'Chunky runners',
  heel:'Stiletto heels', slide:'Slides', wireframe:'Round wireframe', shutters:'Shutter shades',
  novelty:'Heart frames', cinema:'3D cinema', taped:'Cracked and taped', wide:'Wide', bold:'Bushy',
  angled:'Sharp angled', arched:'Soft arch', minimal:'Minimal line', long:'Aquiline', flat:'Broad flat'
};

export const garmentDefaults = {
  trim:'#e9d7bc', sole:'#ddd8d1', laces:'#f3eadf', metal:'#e7ba65', accessoryColor:'#404363',
  iris:'#705041', sclera:'#fff5e9', lens:'#46526a', frame:'#353047', lipColor:'#713d4c',
  patternScale:1, patternRotation:0, patternOpacity:.65, logoScale:1, waist:1, hem:0,
  lensOpacity:.19, rim:1.7, glint:true, pupilSize:1, ring:.36, veins:0, eyelid:0, undereye:0,
  crownWidth:1, cheekWidth:1, jawWidth:1, chinWidth:1, headStretch:1,
  forehead:1,jawAngle:.5,eyeWidth:1,eyeTilt:0,eyeHeight:0,irisSize:1,lidCurvature:1,lashes:0,browLength:1,browAsymmetry:0,
  freckles:0,wrinkles:0,makeup:0,cheekBlush:0,upperLipRatio:1,lowerLipRatio:1,cupidBow:0,mouthHeight:0,
  browInner:0, browOuter:0, browBend:0, browThickness:1, browSpacing:0, browOffset:0, unibrow:false,
  earScale:1, earTilt:0, earTip:0, earlobe:1, noseLength:1, noseWidth:1, noseTilt:0, noseFlare:0, noseBlush:0,
  mouthCurve:0, restJaw:0, lipThickness:1, teethIntensity:1, facialOffset:0, beardLength:1, beardWidth:1, beardFullness:1,
  piercingSize:1, heelHeight:1, hatTilt:0, propTilt:0, tucked:false, socks:false, hood:true
};
