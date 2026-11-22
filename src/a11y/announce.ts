import { AccessibilityInfo, Platform } from 'react-native';

/** Reads `message` out with the screen reader, after what it's saying now. */
export function announce(message: string) {
  if (!message) return;
  if (Platform.OS === 'ios') {
    AccessibilityInfo.announceForAccessibilityWithOptions(message, {
      queue: true,
    });
  } else {
    AccessibilityInfo.announceForAccessibility(message);
  }
}

/** Moves screen-reader focus to a view (a ref's current value). */
export function focusElement(node: unknown) {
  if (!node) return;
  if (Platform.OS === 'web') {
    (node as { focus?: () => void }).focus?.();
    return;
  }
  AccessibilityInfo.sendAccessibilityEvent(
    node as Parameters<typeof AccessibilityInfo.sendAccessibilityEvent>[0],
    'focus'
  );
}

/**
 * Delay before moving focus to a view that was just moved or mounted: screen
 * readers handle the layout change first and would drop an earlier request.
 */
export const FOCUS_DELAY_MS = 100;
