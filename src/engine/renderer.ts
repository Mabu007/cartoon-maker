import { Application, Container, Graphics, Text, Sprite, Texture } from 'pixi.js';
import { drawActor } from './actorArt.ts';
import { drawProp, drawWorld, ellipse, propSize, rect } from './art.ts';
import { evaluate } from './evaluate.ts';
import { HEIGHT, WIDTH, type Character, type Scene } from './schema.ts';

export type Format = '16:9' | '9:16' | '1:1';
const sizes: Record<Format, [number, number]> = { '16:9': [960, 540], '9:16': [303.75, 540], '1:1': [540, 540] };
export const dimensions = (format: Format, scale = 1): [number, number] => sizes[format].map(n => Math.round(n * scale)) as [number, number];

type Entity = { group: Container; art: Graphics; face?: Graphics; shadow?: Graphics; color?: string; kind?: string;
  sprite?: Sprite; heldSprite?: Sprite; imageData?: string };
export type RenderOptions = { characterPreview?: boolean; previewFocus?: { x: number; y: number }; selected?: string; staged?: Record<string, { x: number; y: number }>; edit?: boolean; subtitles?: boolean; amplitude?: (id: string, time: number) => number };
export async function createRenderer(format: Format = '16:9', resolution = 1, capture = false) {
  const app = new Application();
  const [width, height] = sizes[format];
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
    const load = new Promise<Texture>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        try {
          const texture = Texture.from(image);
          textures.set(data, texture);
          resolve(texture);
        } catch (error) { reject(error); }
      };
      image.onerror = () => reject(new Error('Could not load a saved image.'));
      image.src = data;
    }).finally(() => { requests.delete(data); });
    requests.set(data, load);
    return load;
  }
  async function prepareImages(scenes: Scene[]) {
    const urls = new Set(scenes.flatMap(scene => [
      ...(scene.backgroundImage ? [scene.backgroundImage] : []),
      ...scene.objects.flatMap(prop => prop.imageData ? [prop.imageData] : [])
    ]));
    await Promise.all([...urls].map(loadImage));
  }
  let requestedBackdrop: string | undefined;
  let destroyed = false;
  const elements = new Container({ sortableChildren: true });
  const guides = new Graphics();
  const fade = new Graphics();
  const captionBackground = new Graphics();
  const caption = new Text({ text: '', style: { fontFamily: 'Arial', fill: '#fffbf4', fontWeight: '600', fontSize: 21, wordWrap: true, wordWrapWidth: width - 44, align: 'center' } });
  caption.anchor.set(.5, 1);
  world.addChild(background, backdrop, elements, guides);
  app.stage.addChild(world, captionBackground, caption, fade);
  app.stage.scale.set(pixelWidth / width, pixelHeight / height);
  const items = new Map<string, Entity>();
  let lastEnvironment: Scene['environment'] | undefined;
  let wasCharacterPreview = false;
  let lastFrame: ReturnType<typeof evaluate> | undefined;
  const hitboxes: { id: string; left: number; right: number; top: number; bottom: number; depth: number }[] = [];
  function get(id: string, isActor = false) {
    let entity = items.get(id);
    if (!entity) {
      const art = new Graphics();
      const group = new Container();
      entity = { group, art };
      if (isActor) {
        entity.shadow = new Graphics(); entity.face = new Graphics();
        group.addChild(entity.shadow, art, entity.face);
      } else {
        const sprite = new Sprite(Texture.EMPTY);
        sprite.anchor.set(.5, 1);
        sprite.visible = false;
        group.addChild(art, sprite);
        entity.sprite = sprite;
      }
      elements.addChild(group);
      items.set(id, entity);
    }
    return entity;
  }
  function draw(scene: Scene, characters: Character[], time: number, options: RenderOptions = {}) {
    lastFrame = evaluate(scene, time);
    const { actors, camera, sounds } = lastFrame;
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
        backdrop.texture = ready; backdrop.width = WIDTH; backdrop.height = HEIGHT;
        backdrop.visible = true;
      } else {
        backdrop.visible = false;
        void loadImage(image).then(texture => {
          if (destroyed || requestedBackdrop !== image) return;
          backdrop.texture = texture; backdrop.width = WIDTH; backdrop.height = HEIGHT;
          backdrop.visible = true; app.render();
        }).catch(error => console.warn('Could not render background image:', error));
      }
    } else if (textures.has(image) && !backdrop.visible) {
      backdrop.texture = textures.get(image)!;
      backdrop.width = WIDTH; backdrop.height = HEIGHT; backdrop.visible = true;
    }
    const cropCenter = format === '16:9' || camera.zoom > 1 ? camera.x : WIDTH / 2;
    world.scale.set(options.edit ? 1 : camera.zoom);
    world.position.set(width / 2 - (options.edit ? WIDTH / 2 : cropCenter * camera.zoom), height / 2 - (options.edit ? HEIGHT / 2 : camera.y * camera.zoom));
    guides.clear(); fade.clear(); hitboxes.length = 0;
    const used = new Set<string>();
    const carrying = new Set(actors.flatMap(actor => actor.held && actor.visible ? [actor.held.id] : []));
    const characterById = new Map(characters.map(character => [character.id, character]));
    const sourceActorById = new Map(scene.actors.map(actor => [actor.id, actor]));
    for (const prop of scene.objects) {
      used.add(prop.id);
      const entity = get(prop.id);
      entity.group.visible = options.edit || !carrying.has(prop.id);
      if (!entity.group.visible) continue;
      const point = options.staged?.[prop.id] ?? prop;
      entity.group.position.set(point.x, point.y);
      entity.group.scale.set(prop.scale);
      entity.group.angle = prop.rotation;
      entity.group.zIndex = prop.depth * 1000 + point.y;
      if (entity.kind !== prop.kind || entity.color !== prop.color || entity.imageData !== prop.imageData) {
        drawProp(entity.art.clear(), prop);
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
            if (destroyed || items.get(prop.id) !== entity || entity.imageData !== url || !entity.sprite) return;
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
      hitboxes.push({ id: prop.id, left: point.x - w / 2, right: point.x + w / 2, top: point.y - h, bottom: point.y + 5, depth: entity.group.zIndex });
    }
    for (const actor of actors) {
      const character = characterById.get(actor.characterId);
      if (!character) continue;
      used.add(actor.id);
      const entity = get(actor.id, true);
      entity.group.visible = actor.visible || Boolean(options.edit);
      if (!entity.group.visible) continue;
      const source = sourceActorById.get(actor.id) ?? actor;
      const point = options.staged?.[actor.id] ?? (options.edit ? source : actor);
      const lift = options.edit ? 0 : actor.lift;
      entity.group.position.set(point.x, point.y);
      entity.group.angle = actor.rotation;
      entity.group.scale.set((actor.flip ? -1 : 1) * actor.scale, actor.scale);
      entity.group.zIndex = actor.depth * 1000 + point.y;
      entity.art.position.y = -lift;
      ellipse(entity.shadow!.clear(), 0, 3, 39 - Math.min(10, Math.max(0, lift / 5)), 7, '#816a61');
      drawActor(entity.art.clear(), entity.face!.clear(), character, (options.edit ? source.view : camera.view) ?? actor.view,
        options.edit ? {} : actor.pose, options.edit ? source.expression : actor.expression,
        options.amplitude?.(actor.id, time) ?? 0, options.edit ? undefined : actor.held,
        time, actor.action, actor.id, actor.speaking, actor.viseme, options.characterPreview ? options.previewFocus : actor.focus, actor.locomotion, actor.lift);
      entity.face!.y -= lift;
      if (actor.held?.imageData && !options.edit) {
        const url = actor.held.imageData;
        if (!entity.heldSprite) {
          entity.heldSprite = new Sprite(Texture.EMPTY);
          entity.heldSprite.anchor.set(.22, .78);
          entity.group.addChild(entity.heldSprite);
        }
        const holder = entity.heldSprite;
        const place = textures.get(url);
        if (place) {
          holder.texture = place;
          const ratio = (actor.held.imageWidth ?? 80) / Math.max(1, actor.held.imageHeight ?? 80);
          holder.width = Math.min(58, 57 * ratio);
          holder.height = Math.min(60, holder.width / ratio);
          holder.position.set(45, -102 - lift);
          holder.visible = true;
        } else {
          holder.visible = false;
          void loadImage(url).then(() => { if (!destroyed) app.render(); }).catch(() => {});
        }
      } else if (entity.heldSprite) entity.heldSprite.visible = false;
      const top = point.y - (172 * character.height + 49 * character.head) * actor.scale - lift;
      hitboxes.push({ id: actor.id, left: point.x - 55 * actor.scale, right: point.x + 64 * actor.scale, top, bottom: point.y + 10, depth: entity.group.zIndex });
    }
    for (const [id, entity] of items) if (!used.has(id)) { entity.group.destroy({ children: true }); items.delete(id); }
    const outline = hitboxes.find(hit => hit.id === options.selected);
    if (outline) {
      const w = outline.right - outline.left + 12, h = outline.bottom - outline.top + 12;
      guides.roundRect(outline.left - 6, outline.top - 6, w, h, 7).stroke({ color: '#f7e3af', width: 2, alpha: .95 });
      for (const x of [outline.left - 6, outline.right + 6]) for (const y of [outline.top - 6, outline.bottom + 6]) rect(guides, x - 3, y - 3, 6, 6, '#f7e3af', 1);
      if (options.staged) {
        const x = (outline.right + outline.left) / 2;
        const y = options.staged[outline.id]?.y ?? outline.bottom;
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
    if (!options.edit && !options.selected && lastFrame.fade) fade.rect(0, 0, width, height).fill({ color: '#171522', alpha: lastFrame.fade });
    app.render();
    return lastFrame;
  }
  function pick(x: number, y: number) {
    const point = world.toLocal({ x: x * pixelWidth / width, y: y * pixelHeight / height });
    const hit = hitboxes.filter(item => point.x >= item.left && point.x <= item.right && point.y >= item.top && point.y <= item.bottom).sort((a, b) => b.depth - a.depth)[0];
    return { id: hit?.id, x: point.x, y: point.y };
  }
  return { canvas: app.canvas, draw, pick, width, height, prepareImages,
    destroy: () => { destroyed = true; requests.clear(); textures.clear(); app.destroy(true, { children: true, texture: true, textureSource: true, context: true }); } };
}
export type Renderer = Awaited<ReturnType<typeof createRenderer>>;
