import { createContext, useContext, type RefObject } from 'react';
import type { View } from 'react-native';
import type { AnimatedRef, SharedValue } from 'react-native-reanimated';
import type { ColumnLayout, Rect } from './geometry';

/** UI-thread state shared by the board, its columns and its cards. */
export interface DragShared {
  /** The board viewport: the coordinate space for the overlay and hit tests. */
  boardRef: AnimatedRef<View>;
  /** A drag is in progress (from lift until the drop animation ends). */
  active: SharedValue<boolean>;
  /** The card was released and is animating into its placeholder. */
  dropping: SharedValue<boolean>;
  draggedKey: SharedValue<string | null>;

  /** Finger position in window coordinates. */
  fingerX: SharedValue<number>;
  fingerY: SharedValue<number>;
  /** Board viewport position in window coordinates, measured at lift. */
  boardPageX: SharedValue<number>;
  boardPageY: SharedValue<number>;
  /** Where the finger grabbed the card, relative to the card's top-left. */
  grabX: SharedValue<number>;
  grabY: SharedValue<number>;
  /** Overlay (floating card) position relative to the board viewport. */
  overlayX: SharedValue<number>;
  overlayY: SharedValue<number>;
  /** 0 → 1 as the card lifts, back to 0 as it drops. Drives scale/tilt. */
  lift: SharedValue<number>;

  /** Measured layout of every column, keyed by `keyOf(column.id)`. */
  layouts: SharedValue<Record<string, ColumnLayout>>;
  /** Column keys in board order. */
  columnOrder: SharedValue<string[]>;
  boardScrollX: SharedValue<number>;
  boardViewportWidth: SharedValue<number>;
  boardContentWidth: SharedValue<number>;

  /** Current drop target: column key and insert index among visible cards. */
  targetKey: SharedValue<string | null>;
  targetIndex: SharedValue<number>;

  /** The dragged card's column and its rect there, measured before lift. */
  sourceKey: SharedValue<string | null>;
  draggedRect: SharedValue<Rect | null>;
  /** Room the landing spot takes: dragged card height plus the card gap. */
  space: SharedValue<number>;
  /** Theme values the geometry needs: gap between cards, card inset. */
  cardGap: SharedValue<number>;
  cardInset: SharedValue<number>;
}

/** JS-thread callbacks, called from worklets with runOnJS. */
export interface DragActions {
  start: (
    cardKey: string,
    columnKey: string,
    index: number,
    width: number,
    height: number
  ) => void;
  setTarget: (columnKey: string, index: number) => void;
  /** Called after the drop animation; commits the move. */
  finish: () => void;
}

export interface DragContextValue {
  shared: DragShared;
  actions: DragActions;
  /** Dragging is turned on for this board. */
  enabled: boolean;
  /** Increments on every drag start; used to swallow the tap on release. */
  dragCount: RefObject<number>;
}

const DragContext = createContext<DragContextValue | null>(null);

export const DragProvider = DragContext.Provider;

export function useDragContext(): DragContextValue {
  const value = useContext(DragContext);
  if (!value) {
    throw new Error('react-native-kanban: drag context is missing.');
  }
  return value;
}
