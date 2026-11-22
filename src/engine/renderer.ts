import { drawVisualEffect, drawTransition, effectTime, titleStyle } from './visualEffects.ts';
import { mediaUrl } from '../services/media.ts';
import { aimEyes, eyeWorldPoint } from './gaze.ts';
import { drawSeat } from './seating.ts';
import { isSeating, seats } from './seatingCatalog.ts';
import { costumeImages } from './wardrobeArt.ts';
import { rig, viewForward } from './animation.ts';
import { Application, Container, Graphics, Text, Sprite, Texture } from 'pixi.js';
import { drawActor, heldPropPose } from './actorArt.ts';
import { cameraViewport, screenToWorld, worldToScreen, worldEntityBounds, pointHitsEntity, renderDepth, type WorldEntityRect } from './cameraTransform.ts';
import { drawProp, drawWorld, ellipse, propSize, rect } from './art.ts';
import { evaluate } from './evaluate.ts';
import { HEIGHT, WIDTH, type Character, type Scene } from './schema.ts';
import { videoFormats, type Format } from './videoFormats.ts';

export type { Format } from './videoFormats.ts';
export const dimensions = (format: Format, scale = 1): [number, number] => {
  const [width, height] = videoFormats[format].viewport;
  return [Math.round(width * scale), Math.round(height * scale)];
};

type Entity = { group: Container; art: Graphics; face?: Container; facialArt?:Graphics; gestureArt?:Graphics; shadow?: Graphics; color?: string; kind?: string; doorOpen?:number;
  foreground?: Graphics; sprite?: Sprite; heldSprite?: Sprite; heldArt?:Graphics; heldArtKey?:string; imageData?: string };
export type RenderOptions = { characterPreview?: boolean; previewFocus?: { x: number; y: number };
  previewCamera?: boolean; previewViseme?: import('./visemes.ts').Viseme; selected?: string; hovered?: string; staged?: Record<string, { x: number; y: number }>;
  edit?: boolean; subtitles?: boolean; amplitude?: (id: string, time: number) => number };
export async function createRenderer(format: Format = '16:9', resolution = 1, capture = false) {
  const app = new Application();
  const [width, height] = videoFormats[format].viewport;
  const [pixelWidth, pixelHeight] = dimensions(format, resolution);
  await app.init({ width: pixelWidth, height: pixelHeight, resolution: 1, antialias: true, autoStart: false, background: '#24202c', preference: ['webgl', 'webgpu', 'canvas'], preserveDrawingBuffer: capture, powerPreference: 'low-power', hello: false });
  app.canvas.setAttribute('aria-label', 'Cartoon scene preview');
  const world = new Container();
  const background = new Graphics();
  const backdrop = new Sprite(Texture.EMPTY);
  backdrop.visible = false; backdrop.width = WIDTH; backdrop.height = HEIGHT;
  const textures = new Map<string, Texture>();
  const requests = new Map<string, Promise<Texture>>();
  function loadImage(data: string): Promise<Texture> {
    const existing = textures.get(data);
    if (existing) return Promise.resolve(existing);
    const running = requests.get(data);
    if (running) return running;
    const load = mediaUrl(data).then(source => new Promise<Texture>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        try {
          const texture = Texture.from(image);
          if(destroyed) {texture.destroy(true);reject(new Error('Renderer closed.'));return;}
          textures.set(data, texture);
          resolve(texture);
        } catch (error) { reject(error); }
      };
      image.onerror = () => reject(new Error('Could not load a saved image.'));
      image.src = source;
    })).finally(() => { requests.delete(data); });
    requests.set(data, load);
    return load;
  }
  async function prepareImages(scenes: Scene[], characters:Character[] = []) {
    const usedCharacters=new Set(scenes.flatMap(scene=>scene.actors.map(actor=>actor.characterId)));
    const urls = new Set([...characters.filter(character=>usedCharacters.has(character.id)).flatMap(costumeImages), ...scenes.flatMap(scene => [
      ...(scene.backgroundImage ? [scene.backgroundImage] : []),
      ...scene.objects.flatMap(prop => prop.imageData ? [prop.imageData] : [])
    ])]);
    await Promise.all([...urls].map(loadImage));
  }
  const badCostumes = new Set<string>();
  let repaintLatestFrame: (()=>void)|undefined;
  let imageFrame=0;
  function repaintWhenReady() {
    if(destroyed||imageFrame)return;
    imageFrame=requestAnimationFrame(()=>{imageFrame=0;if(!destroyed)repaintLatestFrame?.();});
  }
  function costumeTexture(data:string):Texture|undefined {
    const ready=textures.get(data);
    if(!ready&&!badCostumes.has(data)&&!requests.has(data)) {
      void loadImage(data).then(repaintWhenReady).catch(()=>{badCostumes.add(data);});
    }
    return ready;
  }
  let requestedBackdrop: string | undefined;
  let destroyed = false;
  const elements = new Container({ sortableChildren: true });
  const guides = new Graphics();
  const fade = new Graphics();
  const vfxArt = new Graphics(), titles = new Container();
  const titleLabels = new Map<string,{text:Text;style:string}>();
  const captionBackground = new Graphics();
  const caption = new Text({ text: '', style: { fontFamily: 'Arial', fill: '#fffbf4', fontWeight: '600', fontSize: 21, wordWrap: true, wordWrapWidth: width - 44, align: 'center' } });
  caption.anchor.set(.5, 1);
  world.addChild(background, backdrop, elements, guides);
  app.stage.addChild(world, vfxArt, titles, captionBackground, caption, fade);
  app.stage.scale.set(pixelWidth / width, pixelHeight / height);
  const items = new Map<string, Entity>();
  let lastEnvironment: Scene['environment'] | undefined;
  let wasCharacterPreview = false;
  let lastFrame: ReturnType<typeof evaluate> | undefined;
  const hitboxes: { id: string; rect: WorldEntityRect; bounds: ReturnType<typeof worldEntityBounds>; depth: number }[] = [];
  let currentCamera = { x: WIDTH / 2, y: HEIGHT / 2, zoom: 1 };
  let lastSelectedId: string | undefined;
  const entityKey = (id: string, isActor: boolean) => (isActor ? 'actor:' : 'prop:') + id;
  function get(id: string, isActor = false) {
    const key = entityKey(id, isActor);
    let entity = items.get(key);
    if (!entity) {
      const art = new Graphics();
      const group = new Container();
      entity = { group, art };
      if (isActor) {
        entity.shadow = new Graphics(); entity.face = new Container(); entity.facialArt=new Graphics();entity.gestureArt=new Graphics();
        entity.face.addChild(entity.facialArt);
        group.addChild(entity.shadow, art, entity.face, entity.gestureArt);
      } else {
        const sprite = new Sprite(Texture.EMPTY);
        sprite.anchor.set(.5, 1);
        sprite.visible = false;
        group.addChild(art, sprite);
        entity.sprite = sprite;
      }
      elements.addChild(group);
      items.set(key, entity);
    }
    return entity;
  }
  function draw(scene: Scene, characters: Character[], time: number, options: RenderOptions = {}) {
    repaintLatestFrame=()=>{draw(scene,characters,time,options);};
    const characterById = new Map(characters.map(character => [character.id, character]));
    lastFrame = evaluate(scene, time, characterById, width);
    const { actors, sounds, effects, transition } = lastFrame;
    const camera={...lastFrame.camera};
    for(const clip of effects){
      if(clip.track!=='vfx'||clip.effect!=='camera-shake')continue;
      const p=effectTime(clip,time), decay=Math.sin(Math.PI*p)*(1-p)*clip.strength;
      camera.x+=Math.sin(p*81)*15*decay;
      camera.y+=Math.cos(p*67)*9*decay;
      camera.zoom+=.026*decay;
    }
    if (options.characterPreview) {
      if (!wasCharacterPreview) {
        background.clear().rect(0, 0, WIDTH, HEIGHT).fill('#635575');
        background.rect(0, 443, WIDTH, 97).fill('#493b56');
        for (let x = 0; x < WIDTH; x += 86) background.roundRect(x + 12, 25, 52, 400, 26).fill({ color: x % 172 === 0 ? '#756687' : '#6d5d80', alpha: .72 });
        background.moveTo(0, 443).lineTo(WIDTH, 443).stroke({ color: '#b59ac6', width: 3, alpha: .55 });
      }
      wasCharacterPreview = true;
    } else {
      if (wasCharacterPreview || lastEnvironment !== scene.environment) {
        drawWorld(background.clear(), scene.environment);
        lastEnvironment = scene.environment;
      }
      wasCharacterPreview = false;
    }
    const image = options.characterPreview ? undefined : scene.backgroundImage;
    if (!image) { backdrop.visible = false; requestedBackdrop = undefined; }
    else if (requestedBackdrop !== image) {
      requestedBackdrop = image;
      const ready = textures.get(image);
      if (ready) {
        // Preloaded exports must include the artwork on their very first frame.
        backdrop.texture = ready; backdrop.width = WIDTH * (scene.backgroundTransform?.scale??1); backdrop.height = HEIGHT * (scene.backgroundTransform?.scale??1);
        backdrop.visible = true;
      } else {
        backdrop.visible = false;
        void loadImage(image).then(() => {
          if (requestedBackdrop === image) repaintWhenReady();
        }).catch(error => console.warn('Could not render background image:', error));
      }
    } else if (textures.has(image) && !backdrop.visible) {
      backdrop.texture = textures.get(image)!;
      backdrop.width = WIDTH * (scene.backgroundTransform?.scale??1); backdrop.height = HEIGHT * (scene.backgroundTransform?.scale??1); backdrop.visible = true;
    }
    backdrop.x=scene.backgroundTransform?.x??0;backdrop.y=scene.backgroundTransform?.y??0;
    if(image){backdrop.width=WIDTH*(scene.backgroundTransform?.scale??1);backdrop.height=HEIGHT*(scene.backgroundTransform?.scale??1);}
    currentCamera = camera;
    // Preview, export and stage picking share one exact camera projection.
    const transform = cameraViewport(camera, { width, height }, format);
    world.scale.set(transform.zoom);
    world.position.set(transform.x, transform.y);
    guides.clear(); fade.clear(); hitboxes.length = 0;
    lastSelectedId = options.selected;
    const used = new Set<string>();
    const carrying = new Set(actors.flatMap(actor => actor.held && actor.visible ? [actor.held.id] : []));
    const sourceActorById = new Map(scene.actors.map(actor => [actor.id, actor]));
    for (const prop of options.edit ? scene.objects : lastFrame.objects) {
      const key = entityKey(prop.id, false);
      used.add(key);
      const entity = get(prop.id);
      entity.group.visible = options.edit || !carrying.has(prop.id);
      if (!entity.group.visible) {if(entity.foreground)entity.foreground.visible=false;continue;}
      const point = options.staged?.[prop.id] ?? prop;
      entity.group.position.set(point.x, point.y);
      entity.group.scale.set(prop.flip ? -prop.scale : prop.scale, prop.scale);
      entity.group.angle = prop.rotation;
      entity.group.zIndex = renderDepth(prop.depth, point.y);
      if(isSeating(prop.kind)) {
        if(!entity.foreground) {entity.foreground=new Graphics();elements.addChild(entity.foreground);}
        const front=entity.foreground, seat=seats[prop.kind];
        front.visible=entity.group.visible;
        front.position.copyFrom(entity.group.position);front.scale.copyFrom(entity.group.scale);front.angle=prop.rotation;
        const seated=options.edit||scene.layersManual?undefined:actors.find(actor=>actor.visible&&actor.sitting&&(!actor.seat||actor.seat===prop.id)&&
          Math.abs(actor.x-point.x)<seat.size[0]*prop.scale*.44&&Math.abs(actor.y-point.y)<70*prop.scale);
        if(seated) {
          const depth=renderDepth(seated.depth,seated.y);
          entity.group.zIndex=Math.min(entity.group.zIndex,depth-.03);
          front.zIndex=depth+.03;
        } else front.zIndex=entity.group.zIndex+.03;
      }
      if (entity.kind !== prop.kind || entity.color !== prop.color || entity.imageData !== prop.imageData || entity.doorOpen !== ('doorOpen' in prop ? prop.doorOpen : undefined)) {
        const opening='doorOpen' in prop ? Number(prop.doorOpen) : undefined;
        drawProp(entity.art.clear(), prop, opening);entity.doorOpen=opening;
        if(entity.foreground&&isSeating(prop.kind))drawSeat(entity.foreground.clear(),prop.kind,prop.color,true);
        entity.kind = prop.kind; entity.color = prop.color; entity.imageData = prop.imageData;
        if (entity.sprite) entity.sprite.visible = false;
      }
      if (prop.imageData && entity.sprite) {
        const url = prop.imageData;
        const sprite = entity.sprite;
        const texture = textures.get(url);
        if (texture) {
          sprite.texture = texture; sprite.width = prop.imageWidth ?? 140;
          sprite.height = prop.imageHeight ?? 140;
          sprite.visible = true; entity.art.visible = false;
        } else {
          entity.art.visible = true;
          void loadImage(url).then(result => {
            if (destroyed || items.get(key) !== entity || entity.imageData !== url || !entity.sprite) return;
            entity.sprite.texture = result;
            entity.sprite.width = prop.imageWidth ?? 140;
            entity.sprite.height = prop.imageHeight ?? 140;
            entity.sprite.visible = true;
            entity.art.visible = false; app.render();
          }).catch(error => console.warn('Could not render imported prop:', error));
        }
      } else { entity.art.visible = true; if (entity.sprite) entity.sprite.visible = false; }
      const [w, h] = [prop.imageData ? prop.imageWidth ?? 140 : propSize[prop.kind][0],
        prop.imageData ? prop.imageHeight ?? 140 : propSize[prop.kind][1]].map(n => n * prop.scale);
      const rect: WorldEntityRect = { x: point.x, y: point.y, scaleX: (prop.flip ? -prop.scale : prop.scale), scaleY: prop.scale,
        angle: prop.rotation, left: -w / (2 * prop.scale), right: w / (2 * prop.scale),
        top: -h / prop.scale, bottom: 5 };
      hitboxes.push({ id: prop.id, rect, bounds: worldEntityBounds(rect), depth: entity.group.zIndex });
    }
    for (const actor of actors) {
      const character = characterById.get(actor.characterId);
      if (!character) continue;
      used.add(entityKey(actor.id, true));
      const entity = get(actor.id, true);
      entity.group.visible = actor.visible || Boolean(options.edit);
      if (!entity.group.visible) continue;
      const source = sourceActorById.get(actor.id) ?? actor;
      const point = options.staged?.[actor.id] ?? (options.edit ? source : actor);
      const lift = options.edit ? 0 : actor.lift;
      entity.group.position.set(point.x, point.y);
      entity.group.angle = actor.rotation;
      const view = (options.edit ? source.view : camera.view) ?? actor.view;
      const directionFlip = options.edit ? source.flip : actor.flip !== (viewForward(view) !== viewForward(actor.view));
      entity.group.scale.set((directionFlip ? -1 : 1) * actor.scale, actor.scale);
      entity.group.zIndex = renderDepth(actor.depth, point.y);
      entity.art.position.y = -lift;
      entity.gestureArt!.position.y=-lift;
      ellipse(entity.shadow!.clear(), 0, 3, 39 - Math.min(10, Math.max(0, lift / 5)), 7, '#816a61');
      const cameraGaze=options.characterPreview?Boolean(options.previewCamera):actor.gazeTarget==='camera'&&actor.action!=='look-away';
      const projectedEyes=actor.gazePoint?eyeWorldPoint({...actor,...point,flip:directionFlip},character):undefined;
      const targetFocus=projectedEyes&&actor.gazePoint
        ? aimEyes(projectedEyes,actor.gazePoint,directionFlip,actor.rotation+rig(character,actor.pose,1).angle*(directionFlip?-1:1),actor.scale):actor.focus;
      drawActor(entity.art.clear(),entity.face!,character,view,
        options.edit ? {} : actor.pose, options.edit ? source.expression : actor.expression,
        options.amplitude?.(actor.id, time) ?? 0, options.edit ? undefined : actor.held,
        time, actor.action, actor.id, actor.speaking || Boolean(options.characterPreview&&options.previewViseme),
        options.characterPreview&&options.previewViseme
          ? {shape:options.previewViseme,weight:options.previewViseme==='rest'?0:1}:actor.viseme,
        options.characterPreview ? options.previewFocus : targetFocus, options.edit ? 'idle' : actor.locomotion, lift, actor.gaitTime, actor.gaitVelocity, viewForward(view), actor.actionTime, actor.gaitWeight, actor.listening, actor.turnScale,
        {texture:costumeTexture,camera:cameraGaze,art:entity.facialArt!.clear(),gaitStyle:actor.gaitStyle,gestureArt:entity.gestureArt!.clear(),actionWeight:actor.actionWeight,propPose:actor.propPose});
      entity.face!.y -= lift;
      if(actor.held&&!options.edit){
        const prop=actor.held;
        const grip=heldPropPose(character,view,actor.pose,prop,actor.propPose??{action:actor.action,time:actor.actionTime,weight:1});
        if(prop.imageData){
          const url=prop.imageData;
          if(entity.heldArt)entity.heldArt.visible=false;
          if(!entity.heldSprite){
            entity.heldSprite=new Sprite(Texture.EMPTY);
            entity.heldSprite.anchor.set(.28,.74);
            entity.group.addChild(entity.heldSprite);
          }
          const holder=entity.heldSprite, texture=textures.get(url);
          if(texture){
            holder.texture=texture;
            const ratio=(prop.imageWidth??80)/Math.max(1,prop.imageHeight??80);
            holder.width=Math.min(62,52*ratio)*grip.scale;
            holder.height=holder.width/ratio;
            holder.position.set(grip.x,grip.y-lift);
            holder.angle=grip.angle;
            holder.visible=true;
          }else{
            holder.visible=false;
            const waitingFrame=lastFrame;
            void loadImage(url).then(()=>{
              if(!destroyed&&lastFrame===waitingFrame)draw(scene,characters,time,options);
            }).catch(error=>console.warn('Could not render held prop:',error));
          }
        }else{
          if(entity.heldSprite)entity.heldSprite.visible=false;
          if(!entity.heldArt){entity.heldArt=new Graphics();entity.group.addChild(entity.heldArt);}
          const key=prop.kind+'/'+prop.color;
          if(entity.heldArtKey!==key){drawProp(entity.heldArt.clear(),prop);entity.heldArtKey=key;}
          entity.heldArt.position.set(grip.x,grip.y-lift);
          entity.heldArt.angle=grip.angle;
          entity.heldArt.scale.set(grip.scale);
          entity.heldArt.visible=true;
        }
      }else{
        if(entity.heldSprite)entity.heldSprite.visible=false;
        if(entity.heldArt)entity.heldArt.visible=false;
      }
      const rect: WorldEntityRect = { x: point.x, y: point.y, scaleX: (directionFlip ? -1 : 1) * actor.scale,
        scaleY: actor.scale, angle: actor.rotation, left: -55, right: 64,
        top: -(172 * character.height + 49 * character.head) - lift / actor.scale, bottom: 10 / actor.scale };
      hitboxes.push({ id: actor.id, rect, bounds: worldEntityBounds(rect), depth: entity.group.zIndex });
    }
    for (const [id, entity] of items) if (!used.has(id)) { entity.group.destroy({ children: true }); entity.foreground?.destroy(); items.delete(id); }
    const hovered = hitboxes.find(hit => hit.id === options.hovered && hit.id !== options.selected);
    if (hovered) {
      const {left,right,top,bottom}=hovered.bounds;
      guides.roundRect(left - 4,top - 4,right-left + 8,bottom-top + 8,8)
        .stroke({color:'#9662ff',width:2,alpha:.86});
    }
    const outline = hitboxes.find(hit => hit.id === options.selected);
    if (outline) {
      const { left, right, top, bottom } = outline.bounds;
      const w = right - left + 12, h = bottom - top + 12;
      guides.roundRect(left - 6, top - 6, w, h, 8).stroke({ color: '#9d6cff', width: 2.6, alpha: 1 });
      for (const x of [left - 6, right + 6]) for (const y of [top - 6, bottom + 6]) rect(guides, x - 4, y - 4, 8, 8, '#ffffff', 1);
      if (options.staged) {
        const x = (right + left) / 2;
        const y = options.staged[outline.id]?.y ?? bottom;
        guides.moveTo(x, 0).lineTo(x, HEIGHT).moveTo(0, y).lineTo(WIDTH, y).stroke({ color: '#f8dc9c', width: 1, alpha: .7 });
      }
    }
    const dialogue = sounds.find(clip => clip.track === 'dialogue' && clip.text);
    caption.visible = Boolean(options.subtitles && dialogue && !options.edit);
    captionBackground.clear();
    if (caption.visible && dialogue?.track === 'dialogue') {
      if (caption.text !== dialogue.text) caption.text = dialogue.text;
      caption.position.set(width / 2, height - 23);
      captionBackground.roundRect((width - caption.width) / 2 - 12, height - 28 - caption.height, caption.width + 24, caption.height + 10, 7).fill({ color: '#211b2c', alpha: .88 });
    }
    vfxArt.clear();
    const activeTitles=new Set<string>();
    for(const clip of effects){
      const point=worldToScreen(clip,camera,{width,height},format);
      if(clip.track==='vfx') {
        if(clip.effect!=='camera-shake')drawVisualEffect(vfxArt,clip,point,effectTime(clip,time),width,height);
        continue;
      }
      activeTitles.add(clip.id);
      const style=[clip.size,clip.color,clip.style].join('/');
      let entry=titleLabels.get(clip.id);
      if(!entry){
        const text=new Text({text:clip.text,style:titleStyle(clip,width)});
        text.anchor.set(.5);titles.addChild(text);entry={text,style};titleLabels.set(clip.id,entry);
      }
      if(entry.text.text!==clip.text)entry.text.text=clip.text;
      if(entry.style!==style){entry.text.style=titleStyle(clip,width);entry.style=style;}
      entry.text.position.set(point.x,point.y);
    }
    for(const [id,entry] of titleLabels)if(!activeTitles.has(id)){entry.text.destroy();titleLabels.delete(id);}
    if(!options.edit&&transition)drawTransition(fade,transition.effect,transition.progress,width,height);
    app.render();
    return lastFrame;
  }
  function pick(x: number, y: number) {
    const point = screenToWorld({ x, y }, currentCamera, { width, height }, format);
    const matches = hitboxes.filter(item => pointHitsEntity(point, item.rect)).sort((a, b) => b.depth - a.depth);
    // Small characters and thin props should not require pixel-perfect clicks.
    // Convert a 12 screen-pixel radius to world units so camera zoom doesn't
    // change selection tolerance. Exact hits always win over nearby hits.
    const tolerance = 12 / Math.max(.2, currentCamera.zoom);
    const nearby = matches.length ? [] : hitboxes.filter(item => {
      const {left,right,top,bottom}=item.bounds;
      return point.x >= left-tolerance && point.x <= right+tolerance &&
        point.y >= top-tolerance && point.y <= bottom+tolerance;
    }).sort((a,b)=>b.depth-a.depth);
    // A selected entity remains draggable even when its box overlaps another.
    const candidates = matches.length ? matches : nearby;
    const hit = candidates.find(item => item.id === lastSelectedId) ?? candidates[0];
    return { id: hit?.id, x: point.x, y: point.y };
  }
  return { canvas: app.canvas, draw, pick, width, height, prepareImages,
    projectPoint: (point:{x:number;y:number})=>worldToScreen(point,currentCamera,{width,height},format),
    preloadBackground: (image: string | undefined) => {if (image) void loadImage(image).catch(()=>{});},
    destroy: () => {
      destroyed=true;
      cancelAnimationFrame(imageFrame);
      repaintLatestFrame=undefined;
      requests.clear();
      // Actor previews and exports can close while a separate stage is active.
      // Keep Pixi's global render pools valid for those remaining renderers.
      app.destroy({removeView:true,releaseGlobalResources:false},{children:true,texture:true,textureSource:true,context:true});
      for(const texture of textures.values())if(!texture.destroyed)texture.destroy(true);
      textures.clear();
    } };
}
export type Renderer = Awaited<ReturnType<typeof createRenderer>>;
