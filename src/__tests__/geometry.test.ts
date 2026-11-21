import { describe, expect, it } from '@jest/globals';
import {
  autoScrollSpeed,
  buildColumnItems,
  clampScroll,
  findTargetColumn,
  insertIndexAt,
  keyOf,
  slotPosition,
  visibleCards,
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
  order: [],
  empty: null,
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

// Three cards with an 8pt gap: one (0–60), two (68–128), three (136–236).
const column3 = {
  order: ['one', 'two', 'three'],
  cards: {
    one: { x: 12, y: 0, width: 256, height: 60 },
    two: { x: 12, y: 68, width: 256, height: 60 },
    three: { x: 12, y: 136, width: 256, height: 100 },
  },
};

describe('visibleCards', () => {
  it('stacks cards in data order using their heights', () => {
    expect(visibleCards(column3, null, 8).map((c) => c.y)).toEqual([
      0, 68, 136,
    ]);
  });

  it('closes the gap left by the dragged card', () => {
    expect(visibleCards(column3, 'two', 8).map((c) => c.y)).toEqual([0, 68]);
  });

  it('ignores stale measured positions (web only reports size changes)', () => {
    const stale = {
      order: ['two', 'three'],
      cards: {
        two: { x: 12, y: 68, width: 256, height: 60 }, // really at the top now
        three: { x: 12, y: 136, width: 256, height: 100 },
      },
    };
    // Starts from the first card's offset, then stacks heights.
    expect(visibleCards(stale, null, 8).map((c) => c.y)).toEqual([68, 136]);
    const fresh = {
      ...stale,
      cards: { ...stale.cards, two: { ...stale.cards.two, y: 0 } },
    };
    expect(visibleCards(fresh, null, 8).map((c) => c.y)).toEqual([0, 68]);
  });

  it('skips cards that have not been measured yet', () => {
    expect(
      visibleCards({ ...column3, order: ['one', 'new', 'two'] }, null, 8)
    ).toHaveLength(2);
  });
});

describe('insertIndexAt', () => {
  const sorted = visibleCards(column3, null, 8);

  it('counts cards whose midpoint is above the point', () => {
    expect(insertIndexAt(sorted, -10)).toBe(0);
    expect(insertIndexAt(sorted, 29)).toBe(0);
    expect(insertIndexAt(sorted, 31)).toBe(1);
    expect(insertIndexAt(sorted, 100)).toBe(2);
    expect(insertIndexAt(sorted, 187)).toBe(3);
  });

  it('returns 0 for an empty column', () => {
    expect(insertIndexAt([], 999)).toBe(0);
  });
});

describe('slotPosition', () => {
  const sorted = visibleCards(column3, null, 8);
  const fallback = { x: 12, y: 0 };

  it('lands on the card currently at the index', () => {
    expect(slotPosition(sorted, 0, 8, fallback)).toEqual({ x: 12, y: 0 });
    expect(slotPosition(sorted, 2, 8, fallback)).toEqual({ x: 12, y: 136 });
  });

  it('lands below the last card at the end', () => {
    expect(slotPosition(sorted, 3, 8, fallback)).toEqual({ x: 12, y: 244 });
  });

  it('uses the fallback in empty columns', () => {
    expect(slotPosition([], 0, 8, { x: 20, y: 4 })).toEqual({ x: 20, y: 4 });
  });

  it("matches the dragged card's own spot when dropped where it started", () => {
    const withoutTwo = visibleCards(column3, 'two', 8);
    expect(slotPosition(withoutTwo, 1, 8, fallback)).toEqual({ x: 12, y: 68 });
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
  const list = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const describeItems = (items: ReturnType<typeof buildColumnItems>) =>
    items.map((item) =>
      item.type === 'card'
        ? `${item.hidden ? 'H' : 'C'}${String(item.card.id)}`
        : item.type === 'spacer'
          ? `S${item.slot}`
          : `E${item.slot}`
    );

  it('renders only cards when idle', () => {
    expect(describeItems(buildColumnItems(list, false, undefined))).toEqual([
      'C1',
      'C2',
      'C3',
    ]);
  });

  it('adds a spacer before every card and one at the end while dragging', () => {
    expect(describeItems(buildColumnItems(list, true, undefined))).toEqual([
      'S0',
      'C1',
      'S1',
      'C2',
      'S2',
      'C3',
      'E3',
    ]);
  });

  it('keeps the dragged card in place, hidden, without its own spacer', () => {
    expect(describeItems(buildColumnItems(list, true, 2))).toEqual([
      'S0',
      'C1',
      'H2',
      'S1',
      'C3',
      'E2',
    ]);
  });

  it('keeps real indexes for render props', () => {
    const items = buildColumnItems(list, true, 1);
    const third = items.find(
      (item) => item.type === 'card' && item.card.id === 3
    );
    expect(third).toMatchObject({ index: 2 });
  });

  it('adds nothing to empty columns', () => {
    expect(buildColumnItems([], true, undefined)).toEqual([]);
  });
});
