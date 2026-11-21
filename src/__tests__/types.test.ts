import { describe, expect, it } from '@jest/globals';
import { sampleBoard } from '../__fixtures__/sampleBoard';
import type { KanbanBoard, KanbanCard, KanbanColumn } from '../index';

describe('board data model', () => {
  it('keeps column ids unique', () => {
    const ids = sampleBoard.columns.map((column) => column.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps card ids unique across the whole board', () => {
    const ids = sampleBoard.columns.flatMap((column) =>
      column.cards.map((card) => card.id)
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('accepts custom card and column fields through generics', () => {
    interface Card extends KanbanCard {
      assignee: string;
    }
    interface Column extends KanbanColumn<Card> {
      wipLimit: number;
    }

    const board: KanbanBoard<Card, Column> = {
      columns: [
        {
          id: 'review',
          wipLimit: 3,
          cards: [{ id: 'a', title: 'PR #1', assignee: 'abad' }],
        },
      ],
    };

    expect(board.columns[0]?.cards[0]?.assignee).toBe('abad');
  });
});
