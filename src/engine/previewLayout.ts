import { rig } from './animation.ts';
import type { Action, Character } from './schema.ts';

/** Keep the shoes and tallest hair fully visible in the character editor.
 * All coordinates are in the 540 x 540 character preview, independent of CSS size.
 * The user's zoom is a preference, never permission to clip the character.
 */
export const PREVIEW_GROUND_Y = 443;
export const PREVIEW_TOP_PADDING = 34;
export const PREVIEW_FOOT_PADDING = 14;

export function fitCharacterPreview(character: Character, requestedZoom: number, action: Action = 'idle') {
  const head = rig(character, {}, 1).head;
  const hair = character.hair === 'puff' ? 100 : character.hair === 'curls' ? 75 : character.hair === 'afro' ? 65 : ['braids', 'locs'].includes(character.hair) ? 24 : 20;
  const highestPoint = Math.min(
    head.y - (50 + hair) * character.head,
    -76 * character.legs * character.height - 54 * character.torso * character.height - 71 * character.arms
  );
  const motion = action === 'jump' ? 83 : action === 'celebrate' ? 54 : action === 'wave' ? 37 : action === 'run' ? 29 : 20;
  const verticalReach = Math.abs(highestPoint) + motion;
  const maximumZoom = (PREVIEW_GROUND_Y - PREVIEW_TOP_PADDING) / verticalReach;
  const preferred = Number.isFinite(requestedZoom) ? Math.max(.65, Math.min(1.85, requestedZoom)) : 1;
  const scale = Math.min(preferred, maximumZoom);
  return { x: 480, y: PREVIEW_GROUND_Y, scale, maximumZoom, footY: PREVIEW_GROUND_Y + PREVIEW_FOOT_PADDING * scale };
}
