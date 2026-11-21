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
  /** Top padding of the column's scroll content (where the first card starts). */
  contentTop: number;
  /** The "No cards" drop zone, when the column is empty. */
  empty: Rect | null;
  /**
   * Height assumed for cards that haven't been measured yet (never rendered,
   * because the column only renders the cards near its viewport).
   */
  estimate: number;
}

/** Stable string key for an id, so 1 and '1' never collide. */
export function keyOf(id: KanbanId): string {
  'worklet';
  return `${typeof id}:${id}`;
}

/**
 * The column under `contentX` (board content coordinates), or the nearest one
 * when it's in a gap or past an edge. Column `i` starts at `start + i * step`:
 * positions come from the column order, not from measurements, which go stale
 * after a reorder (web only reports size changes).
 */
export function findTargetColumn(
  order: readonly string[],
  columns: Readonly<Record<string, ColumnLayout>>,
  contentX: number,
  start: number,
  step: number
): string | null {
  'worklet';
  let nearest: string | null = null;
  let nearestDistance = Infinity;
  for (let i = 0; i < order.length; i++) {
    const key = order[i]!;
    const column = columns[key];
    if (!column || column.width <= 0) continue;
    const left = start + i * step;
    const right = left + column.width;
    if (contentX >= left && contentX <= right) return key;
    const distance = contentX < left ? left - contentX : contentX - right;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = key;
    }
  }
  return nearest;
}

/** Left edge of a column in board content coordinates (see findTargetColumn). */
export function columnLeft(
  order: readonly string[],
  key: string,
  start: number,
  step: number
): number {
  'worklet';
  const index = order.indexOf(key);
  return start + (index < 0 ? 0 : index) * step;
}

/**
 * Where a dragged column lands: how many of the other `count` columns (laid
 * out from `start`, `step` apart, `width` wide) sit left of its center.
 * Like insertIndexAt, columns from the current landing spot on are compared
 * shifted right by `space`, so the spot only moves once the center passes a
 * neighbour's visible midpoint.
 */
export function columnInsertIndex(
  count: number,
  start: number,
  step: number,
  width: number,
  centerX: number,
  currentIndex = -1,
  space = 0
): number {
  'worklet';
  let index = 0;
  for (let i = 0; i < count; i++) {
    const shift = currentIndex >= 0 && i >= currentIndex ? space : 0;
    if (start + i * step + shift + width / 2 < centerX) index++;
  }
  return index;
}

/**
 * The cards of `rects` (stacked, top to bottom) visible in a viewport scrolled
 * to `scrollY`, and where the first one starts relative to the viewport top.
 */
export function visibleRange(
  rects: readonly Rect[],
  scrollY: number,
  viewportHeight: number
): { first: number; last: number; offset: number } {
  'worklet';
  let first = -1;
  let last = -1;
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i]!;
    if (rect.y + rect.height <= scrollY) continue;
    if (rect.y >= scrollY + viewportHeight) break;
    if (first < 0) first = i;
    last = i;
  }
  return {
    first,
    last,
    offset: first < 0 ? 0 : rects[first]!.y - scrollY,
  };
}

/**
 * A column's cards as they'd sit with the dragged card taken out, top to
 * bottom. Positions are stacked from the data order, measured heights and the
 * content's top padding. Measured positions are never used: they go stale
 * (web only reports size changes; on native, a card that moved while a drag
 * was in progress gets no further layout event once it settles).
 */
export function visibleCards(
  column: Pick<ColumnLayout, 'cards' | 'order' | 'contentTop' | 'estimate'>,
  draggedKey: string | null,
  gap: number,
  inset = 0
): Rect[] {
  'worklet';
  const result: Rect[] = [];
  let y = column.contentTop;
  for (let i = 0; i < column.order.length; i++) {
    const key = column.order[i]!;
    if (key === draggedKey) continue;
    // Cards that were never rendered count at the estimated height, like
    // the column's spacing for them.
    const card = column.cards[key] ?? {
      x: inset,
      y: 0,
      width: 0,
      height: column.estimate,
    };
    result.push({ x: card.x, y, width: card.width, height: card.height });
    y += card.height + gap;
  }
  return result;
}

export interface CardWindow {
  /** Indices of the first and last card to render (`last < first`: none). */
  first: number;
  last: number;
  /** Room the cards above and below the window take, each with its gap. */
  before: number;
  after: number;
}

/**
 * Which of a column's cards to render: the ones within `overscan` points of
 * its viewport, scrolled to `scrollY`. Cards are stacked from `contentTop`,
 * `gap` apart; `heights[i]` is card i's height, or null for a card that is
 * out of the flow (the dragged card, drawn elsewhere).
 */
export function cardWindow(
  heights: readonly (number | null)[],
  gap: number,
  contentTop: number,
  scrollY: number,
  viewportHeight: number,
  overscan: number
): CardWindow {
  'worklet';
  const top = scrollY - overscan;
  const bottom = scrollY + viewportHeight + overscan;
  let y = contentTop;
  let first = -1;
  let last = -1;
  let lastAbove = -1;
  let before = 0;
  let after = 0;
  for (let i = 0; i < heights.length; i++) {
    const height = heights[i];
    if (height === null || height === undefined) continue;
    const cardTop = y;
    y += height + gap;
    if (cardTop + height <= top) {
      before += height + gap;
      lastAbove = i;
    } else if (cardTop >= bottom) {
      after += height + gap;
    } else {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) {
    first = lastAbove + 1;
    last = lastAbove;
  }
  return { first, last, before, after };
}

/**
 * Insert index for a dragged card whose center is at `contentY`: the number of
 * cards whose midpoint is above it, measured where the cards currently appear.
 * When this column already shows the landing spot at `currentIndex`, cards at
 * or after it are pushed down by `space`. This gives hysteresis: lifting a
 * card never moves it, and the spot only moves once the dragged card's center
 * passes a neighbour's visible middle.
 *
 * @param currentIndex the landing spot's index in this column, or -1 if the
 *   column isn't the current target.
 */
export function insertIndexAt(
  sortedCards: readonly Rect[],
  contentY: number,
  currentIndex = -1,
  space = 0
): number {
  'worklet';
  let index = 0;
  for (let i = 0; i < sortedCards.length; i++) {
    const card = sortedCards[i]!;
    const shift = currentIndex >= 0 && i >= currentIndex ? space : 0;
    if (card.y + shift + card.height / 2 < contentY) index++;
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
  hiddenCardId: KanbanId | undefined,
  range?: { first: number; last: number }
): ColumnItem<TCard>[] {
  const items: ColumnItem<TCard>[] = [];
  const isHidden = (card: TCard) =>
    hiddenCardId !== undefined && card.id === hiddenCardId;
  let slot = 0;
  let lastInFlow = -1;
  cards.forEach((card, index) => {
    const hidden = isHidden(card);
    if (!hidden) lastInFlow = index;
    // Only the window is rendered, but the dragged card always stays mounted.
    const inWindow = !range || (index >= range.first && index <= range.last);
    if (inWindow || hidden) {
      if (dragging && !hidden) {
        items.push({ type: 'spacer', key: `spacer:${keyOf(card.id)}`, slot });
      }
      items.push({ type: 'card', card, index, hidden });
    }
    if (!hidden) slot++;
  });
  const reachesEnd = !range || range.last >= lastInFlow;
  if (dragging && cards.length > 0 && reachesEnd) {
    items.push({ type: 'end', slot });
  }
  return items;
}
