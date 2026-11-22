import { describe, expect, it } from '@jest/globals';
import { cardActionTarget, cardMoves, columnActionTarget } from '../a11y/moves';

const columns = [
  { id: 'a', cards: [{ id: 1 }, { id: 2 }, { id: 3 }] },
  { id: 'b', cards: [{ id: 4 }] },
  { id: 'c', cards: [] },
];
const all = () => true;

describe('cardMoves', () => {
  it('offers up and down inside the column', () => {
    expect(cardMoves(columns, 0, 0, all)).toMatchObject({
      up: false,
      down: true,
    });
    expect(cardMoves(columns, 0, 1, all)).toMatchObject({
      up: true,
      down: true,
    });
    expect(cardMoves(columns, 0, 2, all)).toMatchObject({
      up: true,
      down: false,
    });
  });

  it('finds the columns on either side', () => {
    expect(cardMoves(columns, 1, 0, all)).toMatchObject({
      previous: 0,
      next: 2,
    });
    expect(cardMoves(columns, 0, 0, all)).toMatchObject({
      previous: -1,
      next: 1,
    });
  });

  it('skips columns that turn the card away', () => {
    expect(cardMoves(columns, 0, 0, (to) => to !== 1).next).toBe(2);
    expect(cardMoves(columns, 0, 0, () => false).next).toBe(-1);
  });
});

describe('cardActionTarget', () => {
  it('steps up and down', () => {
    expect(cardActionTarget(columns, 0, 1, 'moveUp', all)).toEqual({
      columnIndex: 0,
      position: 0,
    });
    expect(cardActionTarget(columns, 0, 1, 'moveDown', all)).toEqual({
      columnIndex: 0,
      position: 2,
    });
    expect(cardActionTarget(columns, 0, 0, 'moveUp', all)).toBeNull();
  });

  it('keeps the index in the next column, clamped to its end', () => {
    // Card 3 (index 2) into "b", which has one card: lands at its end.
    expect(cardActionTarget(columns, 0, 2, 'moveToNextColumn', all)).toEqual({
      columnIndex: 1,
      position: 1,
    });
    expect(
      cardActionTarget(columns, 1, 0, 'moveToPreviousColumn', all)
    ).toEqual({ columnIndex: 0, position: 0 });
    expect(
      cardActionTarget(columns, 0, 0, 'moveToPreviousColumn', all)
    ).toBeNull();
  });
});

describe('columnActionTarget', () => {
  it('moves one step, not past the edges', () => {
    expect(columnActionTarget(3, 1, 'moveBefore')).toBe(0);
    expect(columnActionTarget(3, 1, 'moveAfter')).toBe(2);
    expect(columnActionTarget(3, 0, 'moveBefore')).toBeNull();
    expect(columnActionTarget(3, 2, 'moveAfter')).toBeNull();
  });
});
