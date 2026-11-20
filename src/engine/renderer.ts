import { Application, Container, Graphics, Text } from 'pixi.js';
import { drawActor } from './actorArt.ts';
import { drawProp, drawWorld, ellipse, propSize, rect } from './art.ts';
import { evaluate } from './evaluate.ts';
import { HEIGHT, WIDTH, type Character, type Scene } from './schema.ts';

export type Format = '16:9' | '9:16' | '1:1';
const sizes: Record<Format, [number, number]> = { '16:9': [960, 540], '9:16': [303.75, 540], '1:1': [540, 540] };
export const dimensions = (format: Format, scale = 1): [number, number] => sizes[format].map(n => Math.round(n * scale)) as [number, number];

type Entity = { group: Container; art: Graphics; face?: Graphics; shadow?: Graphics; color?: string; kind?: string };
export type RenderOptions = { characterPreview?: boolean; selected?: string; staged?: Record<string, { x: number; y: number }>; edit?: boolean; subtitles?: boolean; amplitude?: (id: string, time: number) => number };
export async function createRenderer(format: Format = '16:9', resolution = 1, capture = false) {
  const app = new Application();
  const [width, height] = sizes[format];
  const [pixelWidth, pixelHeight] = dimensions(format, resolution);
  await app.init({ width: pixelWidth, height: pixelHeight, resolution: 1, antialias: true, autoStart: false, background: '#24202c', preference: ['webgl', 'canvas'], preserveDrawingBuffer: capture, powerPreference: 'low-power', hello: false });
  app.canvas.setAttribute('aria-label', 'Cartoon scene preview');
  const world = new Container();
  const background = new Graphics();
  const elements = new Container({ sortableChildren: true });
  const guides = new Graphics();
  const fade = new Graphics();
  const captionBackground = new Graphics();
  const caption = new Text({ text: '', style: { fontFamily: 'Arial', fill: '#fffbf4', fontWeight: '600', fontSize: 21, wordWrap: true, wordWrapWidth: width - 44, align: 'center' } });
  caption.anchor.set(.5, 1);
  world.addChild(background, elements, guides);
  app.stage.addChild(world, captionBackground, caption, fade);
  app.stage.scale.set(pixelWidth / width, pixelHeight / height);
  const items = new Map<string, Entity>();
  let lastEnvironment: Scene['environment'] | undefined;
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
      } else group.addChild(art);
      elements.addChild(group);
      items.set(id, entity);
    }
    return entity;
  }
  function draw(scene: Scene, characters: Character[], time: number, options: RenderOptions = {}) {
    lastFrame = evaluate(scene, time);
    const { actors, camera, sounds } = lastFrame;
    if (options.characterPreview) {
      background.clear().rect(0, 0, WIDTH, HEIGHT).fill('#635575');
      background.rect(0, 435, WIDTH, 105).fill('#493b56');
      for (let x = 0; x < WIDTH; x += 86) background.roundRect(x + 12, 25, 52, 400, 26).fill({ color: x % 172 === 0 ? '#756687' : '#6d5d80', alpha: .72 });
      background.moveTo(0, 435).lineTo(WIDTH, 435).stroke({ color: '#b59ac6', width: 3, alpha: .55 });
      lastEnvironment = undefined;
    } else if (lastEnvironment !== scene.environment) { drawWorld(background.clear(), scene.environment); lastEnvironment = scene.environment; }
    const cropCenter = format === '16:9' || camera.zoom > 1 ? camera.x : WIDTH / 2;
    world.scale.set(options.edit ? 1 : camera.zoom);
    world.position.set(width / 2 - (options.edit ? WIDTH / 2 : cropCenter * camera.zoom), height / 2 - (options.edit ? HEIGHT / 2 : camera.y * camera.zoom));
    guides.clear(); fade.clear(); hitboxes.length = 0;
    const used = new Set<string>();
    const carrying = new Set(actors.flatMap(actor => actor.held && actor.visible ? [actor.held.id] : []));
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
      if (entity.kind !== prop.kind || entity.color !== prop.color) {
        drawProp(entity.art.clear(), prop); entity.kind = prop.kind; entity.color = prop.color;
      }
      const [w, h] = propSize[prop.kind].map(n => n * prop.scale);
      hitboxes.push({ id: prop.id, left: point.x - w / 2, right: point.x + w / 2, top: point.y - h, bottom: point.y + 5, depth: entity.group.zIndex });
    }
    for (const actor of actors) {
      const character = characters.find(item => item.id === actor.characterId);
      if (!character) continue;
      used.add(actor.id);
      const entity = get(actor.id, true);
      entity.group.visible = actor.visible || Boolean(options.edit);
      if (!entity.group.visible) continue;
      const source = scene.actors.find(item => item.id === actor.id) ?? actor;
      const point = options.staged?.[actor.id] ?? (options.edit ? source : actor);
      const lift = options.edit ? 0 : actor.lift;
      entity.group.position.set(point.x, point.y);
      entity.group.angle = actor.rotation;
      entity.group.scale.set((actor.flip ? -1 : 1) * actor.scale, actor.scale);
      entity.group.zIndex = actor.depth * 1000 + point.y;
      entity.art.position.y = -lift;
      ellipse(entity.shadow!.clear(), 0, 3, 39 - Math.min(10, Math.max(0, lift / 5)), 7, '#816a61');
      drawActor(entity.art.clear(), entity.face!.clear(), character, (options.edit ? source.view : camera.view) ?? actor.view, options.edit ? {} : actor.pose, options.edit ? source.expression : actor.expression, options.amplitude?.(actor.id, time) ?? 0, options.edit ? undefined : actor.held);
      entity.face!.y -= lift;
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
  return { canvas: app.canvas, draw, pick, width, height, destroy: () => app.destroy(true, { children: true, texture: true, textureSource: true, context: true }) };
}
export type Renderer = Awaited<ReturnType<typeof createRenderer>>;
