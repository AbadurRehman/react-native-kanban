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
  /** How far the board is scrolled from its start edge (the right in RTL). */
  boardScrollX: SharedValue<number>;
  boardViewportWidth: SharedValue<number>;
  boardContentWidth: SharedValue<number>;
  /**
   * Right-to-left board: columns run from the right. Column positions
   * (`contentLeft`, `columnStep`) and `boardScrollX` then count from the
   * right edge; finger positions stay measured from the left.
   */
  rtl: SharedValue<boolean>;
  /**
   * Column geometry: the first column's left edge in the board content, the
   * distance between column starts (width + gap) and the column width.
   * Columns are placed from these and their order, never from measurements.
   */
  contentLeft: SharedValue<number>;
  columnStep: SharedValue<number>;
  columnWidth: SharedValue<number>;

  /** Current drop target: column key and insert index among visible cards. */
  targetKey: SharedValue<string | null>;
  targetIndex: SharedValue<number>;

  /** The dragged card's column, index and rect there, measured before lift. */
  sourceKey: SharedValue<string | null>;
  sourceIndex: SharedValue<number>;
  draggedRect: SharedValue<Rect | null>;
  /** Columns the dragged card may not be dropped into (`canDropCard`). */
  dropBlocked: SharedValue<Record<string, boolean>>;
  /** Room the landing spot takes: dragged card height plus the card gap. */
  space: SharedValue<number>;
  /** Theme values the geometry needs: gap between cards, card inset. */
  cardGap: SharedValue<number>;
  cardInset: SharedValue<number>;

  /** Auto-scroll edge zones and top speed (`0` = off). */
  scrollEdgeX: SharedValue<number>;
  scrollEdgeY: SharedValue<number>;
  scrollSpeed: SharedValue<number>;

  /**
   * Column drag (never at the same time as a card drag). Reuses the finger
   * and board position values above.
   */
  colActive: SharedValue<boolean>;
  colDropping: SharedValue<boolean>;
  colDraggedKey: SharedValue<string | null>;
  /** Where the column was and where it will land, among the other columns. */
  colSourceIndex: SharedValue<number>;
  colTargetIndex: SharedValue<number>;
  /** Where the finger grabbed the column, relative to its top-left. */
  colGrabX: SharedValue<number>;
  colGrabY: SharedValue<number>;
  /** Floating column position relative to the board viewport. */
  colOverlayX: SharedValue<number>;
  colOverlayY: SharedValue<number>;
  /** Top of the column in the board viewport, where the drop lands. */
  colStartY: SharedValue<number>;
  colLift: SharedValue<number>;
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

  /** A column lifted. `cards` is the visible range to draw in its copy. */
  startColumn: (
    columnKey: string,
    index: number,
    width: number,
    height: number,
    cards: { first: number; last: number; offset: number }
  ) => void;
  setColumnTarget: (index: number) => void;
  finishColumn: () => void;
}

export interface DragContextValue {
  shared: DragShared;
  actions: DragActions;
  /** Dragging is turned on for this board. */
  enabled: boolean;
  /** Long-press time before a card lifts (ms); `0` = on the first move. */
  activationDelay: number;
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
