import { Platform } from 'react-native';
import type { KanbanAutoScroll, KanbanDragStyle } from '../components/types';
import {
  EDGE_X,
  EDGE_Y,
  LIFT_ROTATE_DEG,
  LIFT_SCALE,
  LONG_PRESS_MS,
  MAX_SCROLL_SPEED,
} from './constants';

/** Turns the drag props into safe numbers for the UI thread. */

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export interface ResolvedDragStyle {
  scale: number;
  rotation: number;
  opacity: number;
}

export function resolveDragStyle(style?: KanbanDragStyle): ResolvedDragStyle {
  return {
    scale:
      isNumber(style?.scale) && style.scale > 0 ? style.scale : 1 + LIFT_SCALE,
    rotation: isNumber(style?.rotation) ? style.rotation : LIFT_ROTATE_DEG,
    opacity: isNumber(style?.opacity)
      ? Math.min(1, Math.max(0, style.opacity))
      : 1,
  };
}

export interface ResolvedAutoScroll {
  /** Board left/right edge zone. */
  edgeX: number;
  /** Column top/bottom edge zone. */
  edgeY: number;
  /** Top speed; `0` turns auto-scroll off. */
  speed: number;
}

export function resolveAutoScroll(
  option: boolean | KanbanAutoScroll | undefined
): ResolvedAutoScroll {
  if (option === false) return { edgeX: EDGE_X, edgeY: EDGE_Y, speed: 0 };
  const config = typeof option === 'object' ? option : {};
  const edge = isNumber(config.edge) && config.edge >= 0 ? config.edge : null;
  return {
    edgeX: edge ?? EDGE_X,
    edgeY: edge ?? EDGE_Y,
    speed:
      isNumber(config.speed) && config.speed >= 0
        ? config.speed
        : MAX_SCROLL_SPEED,
  };
}

/** Long-press delay in ms; `0` means drag on the first movement. */
export function resolveActivationDelay(delay: number | undefined): number {
  if (isNumber(delay) && delay >= 0) return delay;
  return hasFinePointer() ? 0 : LONG_PRESS_MS;
}

/**
 * On web with a mouse or trackpad, drags start on movement like in desktop
 * apps; touch screens keep the long press so columns can still scroll.
 */
function hasFinePointer(): boolean {
  if (Platform.OS !== 'web') return false;
  const media = (
    globalThis as {
      matchMedia?: (query: string) => { matches: boolean };
    }
  ).matchMedia;
  return media?.('(pointer: fine)').matches === true;
}
