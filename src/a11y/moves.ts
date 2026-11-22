import type { KanbanCard, KanbanColumn } from '../types';

/** What screen readers call a card or column: its title, else its id. */
export const titleOf = (item: { id: string | number; title?: string }) =>
  item.title ?? String(item.id);

/** Card actions, by name. Their labels come from `KanbanLabels`. */
export type CardActionName =
  'moveUp' | 'moveDown' | 'moveToPreviousColumn' | 'moveToNextColumn';

/** Column header actions, by name. */
export type ColumnActionName = 'moveBefore' | 'moveAfter';

export interface CardMoves {
  up: boolean;
  down: boolean;
  /** Nearest column before / after that accepts the card, or -1. */
  previous: number;
  next: number;
}

/**
 * Where a card can go with one action: a step up or down in its column, or
 * to the nearest column on either side that `accepts` it (columns that turn
 * it away are skipped).
 */
export function cardMoves(
  columns: readonly KanbanColumn<KanbanCard>[],
  columnIndex: number,
  cardIndex: number,
  accepts: (toColumnIndex: number) => boolean
): CardMoves {
  const count = columns[columnIndex]?.cards.length ?? 0;
  let previous = -1;
  for (let i = columnIndex - 1; i >= 0; i--) {
    if (accepts(i)) {
      previous = i;
      break;
    }
  }
  let next = -1;
  for (let i = columnIndex + 1; i < columns.length; i++) {
    if (accepts(i)) {
      next = i;
      break;
    }
  }
  return { up: cardIndex > 0, down: cardIndex < count - 1, previous, next };
}

/**
 * The destination of a card action, or null when it can't be done. A card
 * moved to another column keeps its index there (clamped to the end), like a
 * drag straight across.
 */
export function cardActionTarget(
  columns: readonly KanbanColumn<KanbanCard>[],
  columnIndex: number,
  cardIndex: number,
  action: CardActionName,
  accepts: (toColumnIndex: number) => boolean
): { columnIndex: number; position: number } | null {
  const moves = cardMoves(columns, columnIndex, cardIndex, accepts);
  switch (action) {
    case 'moveUp':
      return moves.up ? { columnIndex, position: cardIndex - 1 } : null;
    case 'moveDown':
      return moves.down ? { columnIndex, position: cardIndex + 1 } : null;
    case 'moveToPreviousColumn':
    case 'moveToNextColumn': {
      const to =
        action === 'moveToPreviousColumn' ? moves.previous : moves.next;
      if (to < 0) return null;
      const length = columns[to]!.cards.length;
      return { columnIndex: to, position: Math.min(cardIndex, length) };
    }
  }
}

/** The new index of a column action, or null at the board's edge. */
export function columnActionTarget(
  count: number,
  index: number,
  action: ColumnActionName
): number | null {
  const to = action === 'moveBefore' ? index - 1 : index + 1;
  return to >= 0 && to < count ? to : null;
}
