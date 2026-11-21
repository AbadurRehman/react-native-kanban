/**
 * Minimal Reanimated mock for Jest.
 *
 * Reanimated 4's bundled mock runs its native initializers, which fail under
 * Jest. The library only uses a small part of the API, so this mock covers
 * exactly that: shared values are plain objects, animations resolve
 * immediately, and UI-thread-only functions (measure, scrollTo) are no-ops.
 */
import { useRef } from 'react';
import { ScrollView, Text, View } from 'react-native';

type Callback = ((finished?: boolean) => void) | undefined;

function makeSharedValue<T>(initial: T) {
  return {
    value: initial,
    get() {
      return this.value;
    },
    set(next: T) {
      this.value = next;
    },
    modify(updater: (value: T) => T) {
      this.value = updater(this.value);
    },
  };
}

export const useSharedValue = <T,>(initial: T) =>
  useRef(makeSharedValue(initial)).current;

export const makeMutable = makeSharedValue;

export const useAnimatedStyle = <T,>(updater: () => T): T => updater();

export const useDerivedValue = <T,>(updater: () => T) =>
  makeSharedValue(updater());

export const useAnimatedRef = () => {
  const ref = useRef<unknown>(null);
  return ref;
};

export const useAnimatedReaction = () => {};

export const useFrameCallback = () => ({
  setActive: () => {},
  isActive: false,
  callbackId: 0,
});

// Used internally by react-native-gesture-handler's detectors.
export const isSharedValue = (value: unknown) =>
  typeof value === 'object' && value !== null && 'modify' in value;
export const useEvent = () => undefined;
export const useComposedEventHandler = () => undefined;
export const useHandler = () => ({
  context: {},
  doDependenciesDiffer: false,
  useWeb: false,
});
export const setGestureState = () => {};

export const measure = () => null;
export const scrollTo = () => {};
export const runOnJS =
  <A extends unknown[], R>(fn: (...args: A) => R) =>
  (...args: A) =>
    fn(...args);
export const runOnUI =
  <A extends unknown[], R>(fn: (...args: A) => R) =>
  (...args: A) =>
    fn(...args);

const finishNow = <T,>(value: T, _config?: unknown, callback?: Callback) => {
  callback?.(true);
  return value;
};
export const withTiming = finishNow;
export const withSpring = finishNow;
export const cancelAnimation = () => {};

const transition: Record<string, unknown> = {};
for (const method of ['duration', 'delay', 'springify', 'damping', 'easing']) {
  transition[method] = () => transition;
}
export const LinearTransition = transition;
export const FadeIn = transition;
export const FadeOut = transition;

export const Easing = {
  linear: (t: number) => t,
  out: (fn: (t: number) => number) => fn,
  cubic: (t: number) => t,
};

const createAnimatedComponent = <C,>(component: C) => component;

const Animated = {
  View,
  Text,
  ScrollView,
  createAnimatedComponent,
};

export { createAnimatedComponent };
export default Animated;
