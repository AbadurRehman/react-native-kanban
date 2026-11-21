import type { KanbanId } from '../types';

/**
 * Pure geometry for drag and drop. Every function is a worklet so it can run
 * on the UI thread every frame, and stays plain JS so Jest can test it.
 *
 * Coordinates:
 * - "content X" is relative to the board's horizontal scroll content
 *   (already includes the board's scroll offset).
 * - "content Y" inside a column is relative to that column's vertical scroll
 *   content (already includes the column's scroll offset).
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ColumnLayout {
  /** Column position within the board's scroll content. */
  x: number;
  width: number;
  /** Top of the column's card viewport, relative to the board. */
  viewportTop: number;
  viewportHeight: number;
  /** Current vertical scroll offset of the column. */
  scrollY: number;
  /** Height of the column's scroll content (all cards). */
  contentHeight: number;
  /** Card rects relative to the column's scroll content, keyed by `keyOf(id)`. */
  cards: Record<string, Rect>;
}

/** Stable string key for an id, so 1 and '1' never collide. */
export function keyOf(id: KanbanId): string {
  'worklet';
  return `${typeof id}:${id}`;
}

/**
 * The column under `contentX`, or the nearest one when the finger is in a gap
 * or past either end of the board.
 */
export function findTargetColumn(
  order: readonly string[],
  columns: Readonly<Record<string, ColumnLayout>>,
  contentX: number
): string | null {
  'worklet';
  let nearest: string | null = null;
  let nearestDistance = Infinity;
  for (let i = 0; i < order.length; i++) {
    const key = order[i]!;
    const column = columns[key];
    if (!column || column.width <= 0) continue;
    const left = column.x;
    const right = column.x + column.width;
    if (contentX >= left && contentX <= right) return key;
    const distance = contentX < left ? left - contentX : contentX - right;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = key;
    }
  }
  return nearest;
}

/**
 * Index to insert at: the number of cards whose vertical midpoint is above
 * `contentY`, ignoring the card being dragged. Order-independent, so the card
 * map doesn't need sorting.
 */
export function findInsertIndex(
  cards: Readonly<Record<string, Rect>>,
  contentY: number,
  excludeKey: string | null
): number {
  'worklet';
  let index = 0;
  for (const key in cards) {
    if (key === excludeKey) continue;
    const card = cards[key]!;
    if (card.y + card.height / 2 < contentY) index++;
  }
  return index;
}

/**
 * Auto-scroll speed (points per frame) for a finger at `position` inside the
 * range `[start, end]`. Negative near `start`, positive near `end`, zero in
 * the middle; ramps up linearly as the finger gets closer to the edge.
 */
export function autoScrollSpeed(
  position: number,
  start: number,
  end: number,
  threshold: number,
  maxSpeed: number
): number {
  'worklet';
  const size = end - start;
  if (size <= 0) return 0;
  // Small viewports: never let both edge zones cover the whole range.
  const zone = Math.min(threshold, size / 3);
  if (zone <= 0) return 0;
  const fromStart = position - start;
  const fromEnd = end - position;
  if (fromStart < zone) {
    return -maxSpeed * Math.min(1, (zone - fromStart) / zone);
  }
  if (fromEnd < zone) {
    return maxSpeed * Math.min(1, (zone - fromEnd) / zone);
  }
  return 0;
}

/** Clamps a scroll offset to the scrollable range. */
export function clampScroll(
  offset: number,
  contentSize: number,
  viewportSize: number
): number {
  'worklet';
  const max = Math.max(0, contentSize - viewportSize);
  return Math.min(Math.max(offset, 0), max);
}

export type ColumnItem<TCard> =
  { type: 'card'; card: TCard; index: number } | { type: 'placeholder' };

/**
 * What a column renders during a drag: its cards without the dragged one,
 * plus a placeholder where the card will land. `index` on each card item is
 * the card's real position in the column, for render props.
 */
export function buildColumnItems<TCard extends { id: KanbanId }>(
  cards: readonly TCard[],
  hiddenCardId: KanbanId | undefined,
  placeholderIndex: number | undefined
): ColumnItem<TCard>[] {
  const items: ColumnItem<TCard>[] = [];
  cards.forEach((card, index) => {
    if (hiddenCardId !== undefined && card.id === hiddenCardId) return;
    items.push({ type: 'card', card, index });
  });
  if (placeholderIndex !== undefined) {
    const at = Math.min(Math.max(placeholderIndex, 0), items.length);
    items.splice(at, 0, { type: 'placeholder' });
  }
  return items;
}
