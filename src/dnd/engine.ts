import { runOnJS } from 'react-native-reanimated';
import type { DragShared } from './DragContext';
import {
  columnInsertIndex,
  columnLeft,
  findTargetColumn,
  insertIndexAt,
  slotPosition,
  visibleCards,
} from './geometry';

/**
 * UI-thread drag steps, shared by the card's pan gesture (every finger move)
 * and the frame loops (after auto-scroll moves content under the finger).
 */

/** Positions the floating card under the finger. */
export function moveOverlay(s: DragShared) {
  'worklet';
  s.overlayX.value = s.fingerX.value - s.boardPageX.value - s.grabX.value;
  s.overlayY.value = s.fingerY.value - s.boardPageY.value - s.grabY.value;
}

/**
 * Finds the column and index under the dragged card's center and, when they
 * change, records them for the drop (spacers react on the UI thread).
 */
export function updateDragTarget(
  s: DragShared,
  setTarget: (columnKey: string, index: number) => void
) {
  'worklet';
  const dragged = s.draggedRect.value;
  if (!dragged) return;
  const x = s.fingerX.value - s.boardPageX.value;
  const centerY =
    s.fingerY.value - s.boardPageY.value - s.grabY.value + dragged.height / 2;

  const layouts = s.layouts.value;
  let key = findTargetColumn(
    s.columnOrder.value,
    layouts,
    x + s.boardScrollX.value,
    s.contentLeft.value,
    s.columnStep.value
  );
  if (key === null) return;
  let index: number;
  if (s.dropBlocked.value[key] && s.sourceKey.value !== null) {
    // Not allowed here: the landing spot stays where the card came from.
    key = s.sourceKey.value;
    index = s.sourceIndex.value;
  } else {
    const column = layouts[key]!;
    const cards = visibleCards(
      column,
      s.draggedKey.value,
      s.cardGap.value,
      s.cardInset.value
    );
    index = insertIndexAt(
      cards,
      centerY - column.viewportTop + column.scrollY,
      key === s.targetKey.value ? s.targetIndex.value : -1,
      s.space.value
    );
  }

  if (key !== s.targetKey.value || index !== s.targetIndex.value) {
    s.targetKey.value = key;
    s.targetIndex.value = index;
    runOnJS(setTarget)(key, index);
  }
}

/**
 * Where the drop animation should land, relative to the board viewport, or
 * null when the target can't be located.
 */
export function dropPosition(s: DragShared): { x: number; y: number } | null {
  'worklet';
  const key = s.targetKey.value;
  const dragged = s.draggedRect.value;
  if (key === null || !dragged) return null;
  const column = s.layouts.value[key];
  if (!column) return null;
  const cards = visibleCards(
    column,
    s.draggedKey.value,
    s.cardGap.value,
    s.cardInset.value
  );
  const slot = slotPosition(cards, s.targetIndex.value, s.cardGap.value, {
    x: column.empty?.x ?? s.cardInset.value,
    y: column.empty?.y ?? 0,
  });
  const left = columnLeft(
    s.columnOrder.value,
    key,
    s.contentLeft.value,
    s.columnStep.value
  );
  return {
    x: left - s.boardScrollX.value + slot.x,
    y: column.viewportTop - column.scrollY + slot.y,
  };
}

/** Positions the floating column under the finger. */
export function moveColumnOverlay(s: DragShared) {
  'worklet';
  s.colOverlayX.value = s.fingerX.value - s.boardPageX.value - s.colGrabX.value;
  s.colOverlayY.value = s.fingerY.value - s.boardPageY.value - s.colGrabY.value;
}

/**
 * Finds where the dragged column would land among the other columns and, when
 * that changes, records it for the drop (column spacers react on the UI thread).
 */
export function updateColumnTarget(
  s: DragShared,
  setTarget: (index: number) => void
) {
  'worklet';
  const centerX =
    s.fingerX.value -
    s.boardPageX.value -
    s.colGrabX.value +
    s.columnWidth.value / 2 +
    s.boardScrollX.value;
  const index = columnInsertIndex(
    s.columnOrder.value.length - 1,
    s.contentLeft.value,
    s.columnStep.value,
    s.columnWidth.value,
    centerX,
    s.colTargetIndex.value,
    s.columnStep.value
  );
  if (index !== s.colTargetIndex.value) {
    s.colTargetIndex.value = index;
    runOnJS(setTarget)(index);
  }
}

/** Where the dropped column lands, relative to the board viewport. */
export function columnDropPosition(s: DragShared): { x: number; y: number } {
  'worklet';
  return {
    x:
      s.contentLeft.value +
      s.colTargetIndex.value * s.columnStep.value -
      s.boardScrollX.value,
    y: s.colStartY.value,
  };
}
