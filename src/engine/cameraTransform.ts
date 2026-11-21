import { WIDTH, HEIGHT } from './schema.ts';
export type CameraPose = { x: number; y: number; zoom: number };
export type Point = { x: number; y: number };
export type Viewport = { width: number; height: number };
export type { Format as ViewportFormat } from './videoFormats.ts';
import type { Format as ViewportFormat } from './videoFormats.ts';
/** The authored world is always 960 × 540, independent of camera framing. */
export function cameraViewport(camera: CameraPose, viewport: Viewport, format: ViewportFormat) {
  const zoom = Math.max(0.001,camera.zoom);
  const halfWidth = Math.min(WIDTH / 2, viewport.width / (2 * zoom));
  const centerX = format === '16:9' ? camera.x : Math.max(halfWidth, Math.min(WIDTH - halfWidth, camera.x));
  return { zoom, x: viewport.width / 2 - centerX * zoom, y: viewport.height / 2 - camera.y * zoom };
}
export function worldToScreen(point: Point, camera: CameraPose, viewport: Viewport, format: ViewportFormat): Point {
  const transform = cameraViewport(camera, viewport, format);
  return { x: point.x * transform.zoom + transform.x, y: point.y * transform.zoom + transform.y };
}
export function screenToWorld(point: Point, camera: CameraPose, viewport: Viewport, format: ViewportFormat): Point {
  const transform = cameraViewport(camera, viewport, format);
  return { x: (point.x - transform.x) / transform.zoom, y: (point.y - transform.y) / transform.zoom };
}
export type WorldEntityRect = { x:number; y:number; scaleX:number; scaleY:number; angle:number; left:number; right:number; top:number; bottom:number };
const radians=Math.PI / 180;
export function entityToWorld(point: Point, rect: WorldEntityRect): Point {
  const angle=rect.angle*radians, dx=point.x*rect.scaleX, dy=point.y*rect.scaleY;
  return {x:rect.x+dx*Math.cos(angle)-dy*Math.sin(angle),y:rect.y+dx*Math.sin(angle)+dy*Math.cos(angle)};
}
export function worldToEntity(point: Point, rect: WorldEntityRect): Point {
  const angle=-rect.angle*radians, dx=point.x-rect.x,dy=point.y-rect.y;
  return {x:(dx*Math.cos(angle)-dy*Math.sin(angle))/rect.scaleX,y:(dx*Math.sin(angle)+dy*Math.cos(angle))/rect.scaleY};
}
export function pointHitsEntity(point: Point, rect: WorldEntityRect) {
  if(!rect.scaleX||!rect.scaleY)return false;
  const local=worldToEntity(point,rect);
  return local.x>=rect.left&&local.x<=rect.right&&local.y>=rect.top&&local.y<=rect.bottom;
}
export function worldEntityBounds(rect: WorldEntityRect) {
  const vertices=[
    {x:rect.left,y:rect.top},{x:rect.right,y:rect.top},
    {x:rect.left,y:rect.bottom},{x:rect.right,y:rect.bottom}
  ].map(point=>entityToWorld(point,rect));
  return {left:Math.min(...vertices.map(p=>p.x)),right:Math.max(...vertices.map(p=>p.x)),
    top:Math.min(...vertices.map(p=>p.y)),bottom:Math.max(...vertices.map(p=>p.y))};
}
/** Authored depth dominates automatic foot-plane Y sorting. */
export const renderDepth = (depth: number, footY: number) => depth*10000+footY;
export const WORLD_SIZE={width:WIDTH,height:HEIGHT};
