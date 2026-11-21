import { describe, expect, it } from '@jest/globals';
import {
  addCard,
  addColumn,
  findCard,
  moveCard,
  moveColumn,
  removeCard,
  removeColumn,
  updateCard,
  updateColumn,
} from '../helpers';
import type { KanbanBoard, KanbanCard, KanbanColumn } from '../types';

interface Task extends KanbanCard {
  points?: number;
}
interface Lane extends KanbanColumn<Task> {
  wipLimit?: number;
}

const makeBoard = (): KanbanBoard<Task, Lane> => ({
  columns: [
    {
      id: 'todo',
      title: 'To do',
      cards: [
        { id: 1, title: 'A' },
        { id: 2, title: 'B' },
        { id: 3, title: 'C' },
      ],
    },
    { id: 'doing', title: 'Doing', cards: [{ id: 4, title: 'D' }] },
    { id: 'done', title: 'Done', wipLimit: 5, cards: [] },
  ],
});

const ids = (board: KanbanBoard<Task, Lane>, columnIndex: number) =>
  board.columns[columnIndex]!.cards.map((card) => card.id);

describe('findCard', () => {
  it('returns the card and where it lives', () => {
    const board = makeBoard();
    expect(findCard(board, 4)).toEqual({
      card: board.columns[1]!.cards[0],
      columnId: 'doing',
      columnIndex: 1,
      position: 0,
    });
  });

  it('returns undefined for an unknown id', () => {
    expect(findCard(makeBoard(), 99)).toBeUndefined();
  });
});

describe('moveCard', () => {
  it('moves a card to another column at the given position', () => {
    const board = makeBoard();
    const next = moveCard(
      board,
      { fromColumnId: 'todo', fromPosition: 0 },
      { toColumnId: 'doing', toPosition: 0 }
    );
    expect(ids(next, 0)).toEqual([2, 3]);
    expect(ids(next, 1)).toEqual([1, 4]);
  });

  it('reorders within the same column (toPosition is the final index)', () => {
    const board = makeBoard();
    const down = moveCard(
      board,
      { fromColumnId: 'todo', fromPosition: 0 },
      { toColumnId: 'todo', toPosition: 2 }
    );
    expect(ids(down, 0)).toEqual([2, 3, 1]);

    const up = moveCard(
      board,
      { fromColumnId: 'todo', fromPosition: 2 },
      { toColumnId: 'todo', toPosition: 0 }
    );
    expect(ids(up, 0)).toEqual([3, 1, 2]);
  });

  it('moves into an empty column and clamps out-of-range positions', () => {
    const next = moveCard(
      makeBoard(),
      { fromColumnId: 'todo', fromPosition: 1 },
      { toColumnId: 'done', toPosition: 42 }
    );
    expect(ids(next, 2)).toEqual([2]);
  });

  it('keeps untouched columns and the input board unchanged', () => {
    const board = makeBoard();
    const snapshot = JSON.stringify(board);
    const next = moveCard(
      board,
      { fromColumnId: 'todo', fromPosition: 0 },
      { toColumnId: 'doing', toPosition: 1 }
    );
    expect(JSON.stringify(board)).toBe(snapshot);
    expect(next.columns[2]).toBe(board.columns[2]);
    expect(next.columns[0]).not.toBe(board.columns[0]);
  });

  it('keeps custom column fields', () => {
    const next = moveCard(
      makeBoard(),
      { fromColumnId: 'todo', fromPosition: 0 },
      { toColumnId: 'done', toPosition: 0 }
    );
    expect(next.columns[2]!.wipLimit).toBe(5);
  });

  it('returns the same board for no-ops and invalid input', () => {
    const board = makeBoard();
    expect(
      moveCard(
        board,
        { fromColumnId: 'todo', fromPosition: 1 },
        { toColumnId: 'todo', toPosition: 1 }
      )
    ).toBe(board);
    expect(
      moveCard(
        board,
        { fromColumnId: 'nope', fromPosition: 0 },
        { toColumnId: 'todo', toPosition: 0 }
      )
    ).toBe(board);
    expect(
      moveCard(
        board,
        { fromColumnId: 'todo', fromPosition: 9 },
        { toColumnId: 'doing', toPosition: 0 }
      )
    ).toBe(board);
  });
});

describe('moveColumn', () => {
  it('moves a column to a new index', () => {
    const next = moveColumn(makeBoard(), { fromPosition: 0 }, { toPosition: 2 });
    expect(next.columns.map((column) => column.id)).toEqual([
      'doing',
      'done',
      'todo',
    ]);
  });

  it('returns the same board for no-ops and invalid input', () => {
    const board = makeBoard();
    expect(moveColumn(board, { fromPosition: 1 }, { toPosition: 1 })).toBe(board);
    expect(moveColumn(board, { fromPosition: 7 }, { toPosition: 0 })).toBe(board);
  });
});

describe('addCard', () => {
  it('adds to the bottom by default', () => {
    const next = addCard(makeBoard(), 'doing', { id: 5, title: 'E' });
    expect(ids(next, 1)).toEqual([4, 5]);
  });

  it('supports top and numeric positions', () => {
    const top = addCard(makeBoard(), 'todo', { id: 5 }, { position: 'top' });
    expect(ids(top, 0)).toEqual([5, 1, 2, 3]);
    const middle = addCard(makeBoard(), 'todo', { id: 5 }, { position: 1 });
    expect(ids(middle, 0)).toEqual([1, 5, 2, 3]);
  });

  it('ignores unknown columns', () => {
    const board = makeBoard();
    expect(addCard(board, 'nope', { id: 5 })).toBe(board);
  });
});

describe('removeCard', () => {
  it('removes a card wherever it is', () => {
    const next = removeCard(makeBoard(), 2);
    expect(ids(next, 0)).toEqual([1, 3]);
  });

  it('ignores unknown cards', () => {
    const board = makeBoard();
    expect(removeCard(board, 99)).toBe(board);
  });
});

describe('updateCard', () => {
  it('merges a partial update', () => {
    const next = updateCard(makeBoard(), 4, { title: 'D2', points: 3 });
    expect(next.columns[1]!.cards[0]).toEqual({ id: 4, title: 'D2', points: 3 });
  });

  it('accepts an updater function and never changes the id', () => {
    const next = updateCard(makeBoard(), 1, (card) => ({
      ...card,
      id: 'hacked',
      title: card.title + '!',
    }));
    expect(next.columns[0]!.cards[0]).toEqual({ id: 1, title: 'A!' });
  });

  it('returns the same board when the updater returns the same card', () => {
    const board = makeBoard();
    expect(updateCard(board, 1, (card) => card)).toBe(board);
    expect(updateCard(board, 99, { title: 'x' })).toBe(board);
  });
});

describe('columns', () => {
  it('adds a column at the end by default, or at a position', () => {
    const end = addColumn(makeBoard(), { id: 'qa', cards: [] });
    expect(end.columns.at(-1)!.id).toBe('qa');
    const top = addColumn(makeBoard(), { id: 'qa', cards: [] }, { position: 'top' });
    expect(top.columns[0]!.id).toBe('qa');
  });

  it('removes a column', () => {
    const next = removeColumn(makeBoard(), 'doing');
    expect(next.columns.map((column) => column.id)).toEqual(['todo', 'done']);
  });

  it('updates a column with a partial or a function', () => {
    const renamed = updateColumn(makeBoard(), 'done', { title: 'Shipped' });
    expect(renamed.columns[2]).toMatchObject({ id: 'done', title: 'Shipped', wipLimit: 5 });
    const limited = updateColumn(makeBoard(), 'done', (column) => ({
      ...column,
      wipLimit: (column.wipLimit ?? 0) + 1,
    }));
    expect(limited.columns[2]!.wipLimit).toBe(6);
  });

  it('ignores unknown columns', () => {
    const board = makeBoard();
    expect(removeColumn(board, 'nope')).toBe(board);
    expect(updateColumn(board, 'nope', { title: 'x' })).toBe(board);
  });
});
