import { runOnJS } from 'react-native-reanimated';

/**
 * Errors thrown on the UI thread during a drag are caught and reported here
 * instead of being rethrown: on Reanimated 4.7 an uncaught error in a frame
 * callback crashes the app on iOS, and in an animated style it stops every
 * animation until the next reload.
 */

function logError(where: string, message: string) {
  console.error(`[react-native-kanban] ${where} failed: ${message}`);
}

export function reportDragError(where: string, error: unknown): void {
  'worklet';
  const message =
    error !== null && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error);
  runOnJS(logError)(where, message);
}
