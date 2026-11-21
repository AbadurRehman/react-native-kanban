import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ProfilerOnRenderCallback,
} from 'react';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';

/**
 * Tiny benchmark kit for the demo: how long the JS thread is busy after a
 * board event (mount, lift, drop), and how smooth the UI thread is while a
 * drag is held.
 *
 * - `total`: from the event until a frame is drawn after the work it caused.
 *   Works in release builds.
 * - `render`: React render time from <Profiler>. Dev and profiling builds
 *   only (null in release).
 * - Frames: every UI-thread frame during the drag; "slow" ones took longer
 *   than ~1.7 frames at 60 Hz (they dropped at least one frame).
 */

export type BenchEvent =
  'mount' | 'lift' | 'drop' | 'columnLift' | 'columnDrop';

export interface BenchTiming {
  total: number;
  render: number | null;
}

export type DragKind = 'card' | 'column';

export interface FrameStats {
  frames: number;
  slow: number;
  worst: number;
  fps: number;
}

const SLOW_FRAME_MS = 28;
const now = () => globalThis.performance?.now?.() ?? Date.now();

export function useBenchmark(enabled: boolean) {
  const [timings, setTimings] = useState<
    Partial<Record<BenchEvent, BenchTiming>>
  >({});
  const [frames, setFrames] = useState<Partial<Record<DragKind, FrameStats>>>(
    {}
  );
  const sampledKind = useRef<DragKind>('card');
  const pending = useRef<{
    event: BenchEvent;
    start: number;
    render: number | null;
  } | null>(null);

  const finish = useCallback(() => {
    const current = pending.current;
    if (!current) return;
    pending.current = null;
    const timing = { total: now() - current.start, render: current.render };
    setTimings((previous) => ({ ...previous, [current.event]: timing }));
  }, []);

  /** Call right when the event happens (before React renders for it). */
  const mark = useCallback(
    (event: BenchEvent) => {
      if (!enabled && event !== 'mount') return;
      pending.current = { event, start: now(), render: null };
      // Queued behind the render the event triggers; two frames later the
      // result of that render has been drawn.
      setTimeout(() => {
        requestAnimationFrame(() => requestAnimationFrame(finish));
      }, 0);
    },
    [enabled, finish]
  );

  const onRender = useCallback<ProfilerOnRenderCallback>(
    (_id, _phase, actualDuration) => {
      const current = pending.current;
      if (current) current.render = (current.render ?? 0) + actualDuration;
    },
    []
  );

  // UI-thread frame sampling while a drag is held.
  const sampling = useSharedValue(false);
  const count = useSharedValue(0);
  const slow = useSharedValue(0);
  const worst = useSharedValue(0);
  const elapsed = useSharedValue(0);
  const frameCallback = useFrameCallback((frame) => {
    'worklet';
    if (!sampling.value) return;
    const dt = frame.timeSincePreviousFrame;
    if (dt === null) return;
    count.value += 1;
    elapsed.value += dt;
    if (dt > SLOW_FRAME_MS) slow.value += 1;
    if (dt > worst.value) worst.value = dt;
  }, false);
  const { setActive } = frameCallback;
  useEffect(() => {
    setActive(enabled);
  }, [enabled, setActive]);

  const startFrames = useCallback(
    (kind: DragKind) => {
      sampledKind.current = kind;
      count.value = 0;
      slow.value = 0;
      worst.value = 0;
      elapsed.value = 0;
      sampling.value = true;
    },
    [count, slow, worst, elapsed, sampling]
  );

  const stopFrames = useCallback(() => {
    if (!sampling.value) return;
    sampling.value = false;
    const seconds = elapsed.value / 1000;
    const stats: FrameStats = {
      frames: count.value,
      slow: slow.value,
      worst: worst.value,
      fps: seconds > 0 ? count.value / seconds : 0,
    };
    setFrames((previous) => ({ ...previous, [sampledKind.current]: stats }));
  }, [count, slow, worst, elapsed, sampling]);

  const reset = useCallback(() => {
    setTimings({});
    setFrames({});
  }, []);

  return { timings, frames, mark, onRender, startFrames, stopFrames, reset };
}

const ms = (timing: BenchTiming | undefined) =>
  timing
    ? `${Math.round(timing.total)} ms` +
      (timing.render !== null ? ` (render ${Math.round(timing.render)})` : '')
    : '–';

/** One line per result, for the demo's stats panel. */
export function formatBenchmark(
  cards: number,
  timings: Partial<Record<BenchEvent, BenchTiming>>,
  frames: Partial<Record<DragKind, FrameStats>>
): string[] {
  return [
    `${cards} cards · mount ${ms(timings.mount)}`,
    `card lift ${ms(timings.lift)} · drop ${ms(timings.drop)} · ${fps(frames.card)}`,
    `column lift ${ms(timings.columnLift)} · drop ${ms(timings.columnDrop)} · ${fps(frames.column)}`,
  ];
}

const fps = (stats: FrameStats | undefined) =>
  stats
    ? `${Math.round(stats.fps)} fps, ${stats.slow}/${stats.frames} slow, worst ${Math.round(stats.worst)} ms`
    : '– fps';
