import { runOnJS } from 'react-native-reanimated';
import type { DragShared } from './DragContext';

/**
 * Drag diagnostics.
 *
 * Errors thrown on the UI thread are caught and reported here instead of
 * being rethrown: on Reanimated 4.7, one uncaught error in a frame callback or
 * animated style stops every animation in the app until the next reload.
 */

function logError(where: string, message: string) {
  console.error(`[react-native-kanban] ${where} failed: ${message}`);
}

export function reportDragError(
  s: DragShared,
  where: string,
  error: unknown
): void {
  'worklet';
  const message =
    error !== null && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error);
  s.debugError.value = `${where}: ${message}`;
  runOnJS(logError)(where, message);
}

export interface DragDebugInfo {
  /** Finger updates the drag received. */
  updates: number;
  /** Frames the drag loop ran. */
  frames: number;
  /** Frames the animated-style loop saw (should track `frames`). */
  mapper: number;
  /** Last error caught on the UI thread, if any. */
  error: string | null;
  /** Touch moves the gesture saw after the lift. */
  touches: number;
  /** Raw UI-thread animation frames during the drag. */
  raf: number;
  /** When and how the gesture ended, e.g. "1520ms ended". */
  end: string;
}

/** Dev builds: logs the finished drag's stats and exposes them for the demo. */
export function publishDragDebug(s: DragShared): void {
  if (!__DEV__) return;
  const info: DragDebugInfo = {
    updates: s.debugUpdates.value,
    frames: s.debugFrames.value,
    mapper: s.debugMapper.value,
    error: s.debugError.value,
    touches: s.debugTouches.value,
    raf: s.debugRaf.value,
    end: s.debugEnd.value,
  };
  (globalThis as { __KANBAN_DEBUG__?: DragDebugInfo }).__KANBAN_DEBUG__ = info;
  console.log(`[react-native-kanban] drag ${JSON.stringify(info)}`);
}
