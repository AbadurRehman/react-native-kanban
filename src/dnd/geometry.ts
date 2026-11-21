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
  /** Card keys in data order. */
  order: string[];
  /** The "No cards" drop zone, when the column is empty. */
  empty: Rect | null;
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
 * A column's cards as they'd sit with the dragged card taken out, top to
 * bottom. Positions are stacked from the data order and measured heights
 * (not measured positions: on web, onLayout only fires when a view's size
 * changes, so positions go stale when cards above it move).
 */
export function visibleCards(
  column: Pick<ColumnLayout, 'cards' | 'order'>,
  draggedKey: string | null,
  gap: number
): Rect[] {
  'worklet';
  const result: Rect[] = [];
  const first =
    column.order.length > 0 ? column.cards[column.order[0]!] : undefined;
  let y = first ? first.y : 0;
  for (let i = 0; i < column.order.length; i++) {
    const key = column.order[i]!;
    const card = column.cards[key];
    if (!card || key === draggedKey) continue;
    result.push({ x: card.x, y, width: card.width, height: card.height });
    y += card.height + gap;
  }
  return result;
}

/** Number of cards whose vertical midpoint is above `contentY`. */
export function insertIndexAt(
  sortedCards: readonly Rect[],
  contentY: number
): number {
  'worklet';
  let index = 0;
  for (let i = 0; i < sortedCards.length; i++) {
    const card = sortedCards[i]!;
    if (card.y + card.height / 2 < contentY) index++;
  }
  return index;
}

/**
 * Top-left of the slot a dropped card lands in, inside the column's scroll
 * content: the position of the card currently at `index`, or just below the
 * last card, or `fallback` (the empty-column drop zone) when there are none.
 */
export function slotPosition(
  sortedCards: readonly Rect[],
  index: number,
  gap: number,
  fallback: { x: number; y: number }
): { x: number; y: number } {
  'worklet';
  if (sortedCards.length === 0) return { x: fallback.x, y: fallback.y };
  if (index < sortedCards.length) {
    const card = sortedCards[Math.max(0, index)]!;
    return { x: card.x, y: card.y };
  }
  const last = sortedCards[sortedCards.length - 1]!;
  return { x: last.x, y: last.y + last.height + gap };
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
  | { type: 'card'; card: TCard; index: number; hidden: boolean }
  /** Opens to show where the card lands; sits before visible card `slot`. */
  | { type: 'spacer'; key: string; slot: number }
  /** Opens to show a landing spot after the last card. */
  | { type: 'end'; slot: number };

/**
 * What a column renders. While dragging, every visible card gets a spacer in
 * front of it and an end spacer follows the last card; the dragged card stays
 * in place (hidden), so its view and gesture are never unmounted or moved.
 * `index` on card items is the card's real position, for render props.
 */
export function buildColumnItems<TCard extends { id: KanbanId }>(
  cards: readonly TCard[],
  dragging: boolean,
  hiddenCardId: KanbanId | undefined
): ColumnItem<TCard>[] {
  const items: ColumnItem<TCard>[] = [];
  let slot = 0;
  cards.forEach((card, index) => {
    const hidden = hiddenCardId !== undefined && card.id === hiddenCardId;
    if (dragging && !hidden) {
      items.push({ type: 'spacer', key: `spacer:${keyOf(card.id)}`, slot });
    }
    items.push({ type: 'card', card, index, hidden });
    if (!hidden) slot++;
  });
  if (dragging && cards.length > 0) items.push({ type: 'end', slot });
  return items;
}
