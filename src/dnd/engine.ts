import { runOnJS } from 'react-native-reanimated';
import type { DragShared } from './DragContext';
import {
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
  const key = findTargetColumn(
    s.columnOrder.value,
    layouts,
    x + s.boardScrollX.value
  );
  if (key === null) return;
  const column = layouts[key]!;
  const cards = visibleCards(
    column.cards,
    s.draggedKey.value,
    key === s.sourceKey.value ? dragged : null,
    s.space.value
  );
  const index = insertIndexAt(
    cards,
    centerY - column.viewportTop + column.scrollY
  );

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
    column.cards,
    s.draggedKey.value,
    key === s.sourceKey.value ? dragged : null,
    s.space.value
  );
  const slot = slotPosition(cards, s.targetIndex.value, s.cardGap.value, {
    x: column.empty?.x ?? s.cardInset.value,
    y: column.empty?.y ?? 0,
  });
  return {
    x: column.x - s.boardScrollX.value + slot.x,
    y: column.viewportTop - column.scrollY + slot.y,
  };
}
