import { describe, expect, it } from '@jest/globals';
import {
  autoScrollSpeed,
  buildColumnItems,
  clampScroll,
  findInsertIndex,
  findTargetColumn,
  keyOf,
  type ColumnLayout,
} from '../dnd/geometry';

const column = (x: number, width = 280): ColumnLayout => ({
  x,
  width,
  viewportTop: 60,
  viewportHeight: 500,
  scrollY: 0,
  contentHeight: 400,
  cards: {},
});

describe('keyOf', () => {
  it('keeps numeric and string ids apart', () => {
    expect(keyOf(1)).not.toBe(keyOf('1'));
    expect(keyOf('a')).toBe(keyOf('a'));
  });
});

describe('findTargetColumn', () => {
  const columns = { a: column(16), b: column(308), c: column(600) };
  const order = ['a', 'b', 'c'];

  it('returns the column under the finger', () => {
    expect(findTargetColumn(order, columns, 20)).toBe('a');
    expect(findTargetColumn(order, columns, 400)).toBe('b');
    expect(findTargetColumn(order, columns, 879)).toBe('c');
  });

  it('picks the nearest column in gaps and past the edges', () => {
    expect(findTargetColumn(order, columns, 298)).toBe('a'); // 2pt from a, 10pt from b
    expect(findTargetColumn(order, columns, 305)).toBe('b');
    expect(findTargetColumn(order, columns, 0)).toBe('a');
    expect(findTargetColumn(order, columns, 5000)).toBe('c');
  });

  it('ignores unmeasured columns and handles empty boards', () => {
    expect(
      findTargetColumn(['x', 'a'], { x: column(0, 0), a: column(300) }, 10)
    ).toBe('a');
    expect(findTargetColumn([], {}, 10)).toBeNull();
  });
});

describe('findInsertIndex', () => {
  const cards = {
    one: { x: 12, y: 0, width: 256, height: 60 },
    two: { x: 12, y: 68, width: 256, height: 60 },
    three: { x: 12, y: 136, width: 256, height: 100 },
  };

  it('counts cards whose midpoint is above the finger', () => {
    expect(findInsertIndex(cards, -10, null)).toBe(0);
    expect(findInsertIndex(cards, 29, null)).toBe(0);
    expect(findInsertIndex(cards, 31, null)).toBe(1);
    expect(findInsertIndex(cards, 100, null)).toBe(2);
    expect(findInsertIndex(cards, 187, null)).toBe(3);
  });

  it('ignores the dragged card', () => {
    expect(findInsertIndex(cards, 187, 'two')).toBe(2);
    expect(findInsertIndex(cards, 31, 'one')).toBe(0);
  });

  it('returns 0 for an empty column', () => {
    expect(findInsertIndex({}, 999, null)).toBe(0);
  });
});

describe('autoScrollSpeed', () => {
  it('is zero away from the edges', () => {
    expect(autoScrollSpeed(200, 0, 400, 50, 10)).toBe(0);
  });

  it('ramps up towards each edge', () => {
    expect(autoScrollSpeed(25, 0, 400, 50, 10)).toBeCloseTo(-5);
    expect(autoScrollSpeed(0, 0, 400, 50, 10)).toBe(-10);
    expect(autoScrollSpeed(-30, 0, 400, 50, 10)).toBe(-10);
    expect(autoScrollSpeed(375, 0, 400, 50, 10)).toBeCloseTo(5);
    expect(autoScrollSpeed(420, 0, 400, 50, 10)).toBe(10);
  });

  it('shrinks the edge zones in small viewports', () => {
    // 90pt viewport: zones become 30pt so the middle stays still.
    expect(autoScrollSpeed(45, 0, 90, 50, 10)).toBe(0);
    expect(autoScrollSpeed(0, 0, 0, 50, 10)).toBe(0);
  });
});

describe('clampScroll', () => {
  it('keeps offsets inside the scrollable range', () => {
    expect(clampScroll(-5, 1000, 400)).toBe(0);
    expect(clampScroll(300, 1000, 400)).toBe(300);
    expect(clampScroll(900, 1000, 400)).toBe(600);
    expect(clampScroll(50, 300, 400)).toBe(0);
  });
});

describe('buildColumnItems', () => {
  const cards = [{ id: 1 }, { id: 2 }, { id: 3 }];

  it('renders cards unchanged when idle', () => {
    expect(buildColumnItems(cards, undefined, undefined)).toEqual([
      { type: 'card', card: cards[0], index: 0 },
      { type: 'card', card: cards[1], index: 1 },
      { type: 'card', card: cards[2], index: 2 },
    ]);
  });

  it('hides the dragged card and inserts the placeholder', () => {
    const items = buildColumnItems(cards, 1, 1);
    expect(
      items.map((item) => (item.type === 'card' ? item.card.id : 'P'))
    ).toEqual([2, 'P', 3]);
    // Real indexes are kept for render props.
    expect(items[0]).toMatchObject({ index: 1 });
  });

  it('clamps the placeholder and works in empty columns', () => {
    expect(buildColumnItems([], undefined, 3)).toEqual([
      { type: 'placeholder' },
    ]);
    const end = buildColumnItems(cards, undefined, 99);
    expect(end.at(-1)).toEqual({ type: 'placeholder' });
  });
});
