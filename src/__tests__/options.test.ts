import { describe, expect, it, jest } from '@jest/globals';
import {
  resolveActivationDelay,
  resolveAutoScroll,
  resolveDragStyle,
} from '../dnd/options';
import { Platform } from 'react-native';

describe('resolveDragStyle', () => {
  it('uses the default lift when nothing is given', () => {
    expect(resolveDragStyle()).toEqual({
      scale: 1.03,
      rotation: 2,
      opacity: 1,
    });
  });

  it('keeps valid values and fills the rest', () => {
    expect(resolveDragStyle({ scale: 1, rotation: 0 })).toEqual({
      scale: 1,
      rotation: 0,
      opacity: 1,
    });
    expect(resolveDragStyle({ opacity: 0.6 }).opacity).toBe(0.6);
  });

  it('ignores values that would break the animation', () => {
    expect(resolveDragStyle({ scale: 0 }).scale).toBe(1.03);
    expect(resolveDragStyle({ scale: NaN }).scale).toBe(1.03);
    expect(resolveDragStyle({ rotation: Infinity }).rotation).toBe(2);
    expect(resolveDragStyle({ opacity: 3 }).opacity).toBe(1);
    expect(resolveDragStyle({ opacity: -1 }).opacity).toBe(0);
  });
});

describe('resolveAutoScroll', () => {
  it('is on with the default zones and speed', () => {
    const defaults = { edgeX: 64, edgeY: 56, speed: 14 };
    expect(resolveAutoScroll(undefined)).toEqual(defaults);
    expect(resolveAutoScroll(true)).toEqual(defaults);
    expect(resolveAutoScroll({})).toEqual(defaults);
  });

  it('is off (speed 0) when false', () => {
    expect(resolveAutoScroll(false).speed).toBe(0);
  });

  it('uses one edge for both directions and a custom speed', () => {
    expect(resolveAutoScroll({ edge: 80, speed: 30 })).toEqual({
      edgeX: 80,
      edgeY: 80,
      speed: 30,
    });
  });

  it('ignores negative or invalid numbers', () => {
    expect(resolveAutoScroll({ edge: -5, speed: NaN })).toEqual({
      edgeX: 64,
      edgeY: 56,
      speed: 14,
    });
  });
});

describe('resolveActivationDelay', () => {
  it('starts mouse drags on movement on web', () => {
    const os = jest.replaceProperty(Platform, 'OS', 'web');
    const g = globalThis as { matchMedia?: unknown };
    const media = (fine: boolean) => () => ({ matches: fine });
    try {
      g.matchMedia = media(true); // mouse or trackpad
      expect(resolveActivationDelay(undefined)).toBe(0);
      expect(resolveActivationDelay(300)).toBe(300); // an explicit delay wins
      g.matchMedia = media(false); // touch screen
      expect(resolveActivationDelay(undefined)).toBe(300);
    } finally {
      delete g.matchMedia;
      os.restore();
    }
  });

  it('defaults to 300 ms and accepts 0', () => {
    expect(resolveActivationDelay(undefined)).toBe(300);
    expect(resolveActivationDelay(0)).toBe(0);
    expect(resolveActivationDelay(600)).toBe(600);
  });

  it('ignores negative or invalid delays', () => {
    expect(resolveActivationDelay(-1)).toBe(300);
    expect(resolveActivationDelay(NaN)).toBe(300);
  });
});
