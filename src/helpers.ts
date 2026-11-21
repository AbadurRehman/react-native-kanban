import type {
  CardDestination,
  CardSource,
  ColumnDestination,
  ColumnSource,
  KanbanBoard,
  KanbanCard,
  KanbanColumn,
  KanbanId,
} from './types';

/**
 * Pure, immutable helpers for updating a board.
 *
 * Every helper returns a new board and never mutates its input. Columns and
 * cards that did not change keep their object identity, so memoized columns
 * and cards skip re-rendering. When nothing changes (unknown id, same
 * position), the original board object is returned as-is.
 */

/** Where a new card or column goes: start, end, or an exact index. */
export type InsertPosition = 'top' | 'bottom' | number;

export interface CardLocation<TCard extends KanbanCard = KanbanCard> {
  card: TCard;
  columnId: KanbanId;
  columnIndex: number;
  position: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const resolveIndex = (position: InsertPosition | undefined, length: number) => {
  if (position === 'top') return 0;
  if (position === undefined || position === 'bottom') return length;
  return clamp(Math.trunc(position), 0, length);
};

const insertAt = <T>(list: readonly T[], index: number, item: T): T[] => {
  const next = list.slice();
  next.splice(index, 0, item);
  return next;
};

const removeAt = <T>(list: readonly T[], index: number): T[] => {
  const next = list.slice();
  next.splice(index, 1);
  return next;
};

const columnIndexOf = (
  board: { columns: ReadonlyArray<{ id: KanbanId }> },
  columnId: KanbanId
) => board.columns.findIndex((column) => column.id === columnId);

/** Finds a card anywhere on the board. */
export function findCard<
  TCard extends KanbanCard,
  TColumn extends KanbanColumn<TCard>,
>(
  board: KanbanBoard<TCard, TColumn>,
  cardId: KanbanId
): CardLocation<TCard> | undefined {
  for (let columnIndex = 0; columnIndex < board.columns.length; columnIndex++) {
    const column = board.columns[columnIndex]!;
    const position = column.cards.findIndex((card) => card.id === cardId);
    if (position !== -1) {
      return {
        card: column.cards[position]!,
        columnId: column.id,
        columnIndex,
        position,
      };
    }
  }
  return undefined;
}

/**
 * Moves a card within a column or to another column.
 * `toPosition` is the card's final index in the destination column.
 */
export function moveCard<
  TCard extends KanbanCard,
  TColumn extends KanbanColumn<TCard>,
>(
  board: KanbanBoard<TCard, TColumn>,
  source: CardSource,
  destination: CardDestination
): KanbanBoard<TCard, TColumn> {
  const fromIndex = columnIndexOf(board, source.fromColumnId);
  const toColumnIndex = columnIndexOf(board, destination.toColumnId);
  if (fromIndex === -1 || toColumnIndex === -1) return board;

  const fromColumn = board.columns[fromIndex]!;
  const card = fromColumn.cards[source.fromPosition];
  if (!card) return board;

  if (fromIndex === toColumnIndex) {
    const position = clamp(
      Math.trunc(destination.toPosition),
      0,
      fromColumn.cards.length - 1
    );
    if (position === source.fromPosition) return board;
    const cards = insertAt(
      removeAt(fromColumn.cards, source.fromPosition),
      position,
      card
    );
    const columns = board.columns.slice();
    columns[fromIndex] = { ...fromColumn, cards };
    return { ...board, columns };
  }

  const toColumn = board.columns[toColumnIndex]!;
  const columns = board.columns.slice();
  columns[fromIndex] = {
    ...fromColumn,
    cards: removeAt(fromColumn.cards, source.fromPosition),
  };
  columns[toColumnIndex] = {
    ...toColumn,
    cards: insertAt(
      toColumn.cards,
      resolveIndex(destination.toPosition, toColumn.cards.length),
      card
    ),
  };
  return { ...board, columns };
}

/** Moves a column to a new index. */
export function moveColumn<
  TCard extends KanbanCard,
  TColumn extends KanbanColumn<TCard>,
>(
  board: KanbanBoard<TCard, TColumn>,
  source: ColumnSource,
  destination: ColumnDestination
): KanbanBoard<TCard, TColumn> {
  const column = board.columns[source.fromPosition];
  if (!column) return board;
  const position = clamp(
    Math.trunc(destination.toPosition),
    0,
    board.columns.length - 1
  );
  if (position === source.fromPosition) return board;
  return {
    ...board,
    columns: insertAt(
      removeAt(board.columns, source.fromPosition),
      position,
      column
    ),
  };
}

/** Adds a card to a column. Defaults to the bottom of the column. */
export function addCard<
  TCard extends KanbanCard,
  TColumn extends KanbanColumn<TCard>,
>(
  board: KanbanBoard<TCard, TColumn>,
  columnId: KanbanId,
  card: TCard,
  options: { position?: InsertPosition } = {}
): KanbanBoard<TCard, TColumn> {
  const index = columnIndexOf(board, columnId);
  if (index === -1) return board;
  const column = board.columns[index]!;
  const columns = board.columns.slice();
  columns[index] = {
    ...column,
    cards: insertAt(
      column.cards,
      resolveIndex(options.position, column.cards.length),
      card
    ),
  };
  return { ...board, columns };
}

/** Removes a card from the board, wherever it is. */
export function removeCard<
  TCard extends KanbanCard,
  TColumn extends KanbanColumn<TCard>,
>(
  board: KanbanBoard<TCard, TColumn>,
  cardId: KanbanId
): KanbanBoard<TCard, TColumn> {
  const location = findCard(board, cardId);
  if (!location) return board;
  const column = board.columns[location.columnIndex]!;
  const columns = board.columns.slice();
  columns[location.columnIndex] = {
    ...column,
    cards: removeAt(column.cards, location.position),
  };
  return { ...board, columns };
}

/**
 * Updates a card in place. Pass a partial object to merge, or a function that
 * returns the next card. The card's `id` cannot be changed.
 */
export function updateCard<
  TCard extends KanbanCard,
  TColumn extends KanbanColumn<TCard>,
>(
  board: KanbanBoard<TCard, TColumn>,
  cardId: KanbanId,
  update: Partial<Omit<TCard, 'id'>> | ((card: TCard) => TCard)
): KanbanBoard<TCard, TColumn> {
  const location = findCard(board, cardId);
  if (!location) return board;
  const next =
    typeof update === 'function'
      ? update(location.card)
      : ({ ...location.card, ...update } as TCard);
  if (next === location.card) return board;
  const column = board.columns[location.columnIndex]!;
  const cards = column.cards.slice();
  cards[location.position] = { ...next, id: location.card.id };
  const columns = board.columns.slice();
  columns[location.columnIndex] = { ...column, cards };
  return { ...board, columns };
}

/** Adds a column. Defaults to the end of the board. */
export function addColumn<
  TCard extends KanbanCard,
  TColumn extends KanbanColumn<TCard>,
>(
  board: KanbanBoard<TCard, TColumn>,
  column: TColumn,
  options: { position?: InsertPosition } = {}
): KanbanBoard<TCard, TColumn> {
  return {
    ...board,
    columns: insertAt(
      board.columns,
      resolveIndex(options.position, board.columns.length),
      column
    ),
  };
}

/** Removes a column and all of its cards. */
export function removeColumn<
  TCard extends KanbanCard,
  TColumn extends KanbanColumn<TCard>,
>(
  board: KanbanBoard<TCard, TColumn>,
  columnId: KanbanId
): KanbanBoard<TCard, TColumn> {
  const index = columnIndexOf(board, columnId);
  if (index === -1) return board;
  return { ...board, columns: removeAt(board.columns, index) };
}

/**
 * Updates a column's fields (title, custom fields, or cards). Pass a partial
 * object to merge, or a function that returns the next column. The column's
 * `id` cannot be changed.
 */
export function updateColumn<
  TCard extends KanbanCard,
  TColumn extends KanbanColumn<TCard>,
>(
  board: KanbanBoard<TCard, TColumn>,
  columnId: KanbanId,
  update: Partial<Omit<TColumn, 'id'>> | ((column: TColumn) => TColumn)
): KanbanBoard<TCard, TColumn> {
  const index = columnIndexOf(board, columnId);
  if (index === -1) return board;
  const column = board.columns[index]!;
  const next =
    typeof update === 'function'
      ? update(column)
      : ({ ...column, ...update } as TColumn);
  if (next === column) return board;
  const columns = board.columns.slice();
  columns[index] = { ...next, id: column.id };
  return { ...board, columns };
}
