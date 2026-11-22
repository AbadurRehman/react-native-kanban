import { I18nManager, Platform, StyleSheet } from 'react-native';

/** The app's own direction (native only: react-native-web always says LTR). */
export const appDirection = (): 'ltr' | 'rtl' =>
  I18nManager.isRTL ? 'rtl' : 'ltr';

/**
 * On native, `left` and `right` styles mean start and end
 * (`doLeftAndRightSwapInRTL`, on by default); on web they stay physical.
 */
export const swapsLeftAndRight =
  Platform.OS !== 'web' &&
  (I18nManager.getConstants?.().doLeftAndRightSwapInRTL ?? true);

const anchors = StyleSheet.create({
  ltr: { start: 0 },
  rtl: { end: 0 },
});

/**
 * Pins an absolutely positioned view to its parent's left edge in either
 * direction, so translateX (always physical) works the same in RTL.
 */
export const leftEdge = (rtl: boolean) => (rtl ? anchors.rtl : anchors.ltr);
