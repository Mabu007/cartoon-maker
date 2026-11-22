import type { Action, Character } from './schema.ts';
import type { HandPose, HandSide } from './handRig.ts';
import { gestureHand, type GestureSample, type OccupiedHands } from './livingCharacter.ts';

export type HandPerformanceInput = {
  action: Action;
  locomotion: Action;
  side: HandSide;
  carrying: boolean;
  gesture?: GestureSample;
  actionWeight?: number;
};

export function occupiedHands(character: Character, holding: boolean, action: Action): OccupiedHands | undefined {
  const wardrobe = character.wardrobe;
  const costumeHand = wardrobe?.handheld && wardrobe.handheld !== 'none' ? wardrobe.hand ?? 'right' : undefined;
  if (!holding) return costumeHand;
  return action === 'drive' || costumeHand === 'left' ? 'both' : 'right';
}

const openActions = new Set<Action>(['cry', 'reach', 'surprise', 'cartoon-block', 'celebrate', 'open-hand']);
const fistActions = new Set<Action>(['cartoon-guard', 'cartoon-jab', 'cartoon-hook', 'cartoon-kick', 'fist', 'angry']);

export function handPerformance({ action, locomotion, side, carrying, gesture, actionWeight = 1 }: HandPerformanceInput): { pose: HandPose; blend: number } {
  if (carrying) return { pose: 'grip', blend: 1 };
  const activeHand = side === 'right';
  if (action === 'point') return { pose: activeHand ? 'point' : 'relaxed', blend: actionWeight };
  if (action === 'wave') return { pose: activeHand ? 'open' : 'relaxed', blend: actionWeight };
  if (action === 'shrug') return { pose: 'shrug', blend: actionWeight };
  if (openActions.has(action) || (activeHand && (action === 'throw-prop' || action === 'hand-to-face'))) {
    return { pose: 'open', blend: actionWeight };
  }
  if (fistActions.has(action) || (activeHand && (action === 'hand-on-hip' || action === 'hand-to-pocket'))) {
    return { pose: 'fist', blend: actionWeight };
  }
  const performing = gesture && gestureHand(gesture, side);
  if (performing) return { pose: performing, blend: gesture.weight };
  return locomotion === 'run' ? { pose: 'grip', blend: .42 } : { pose: 'relaxed', blend: 1 };
}
