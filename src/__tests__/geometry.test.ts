import { describe, expect, it } from '@jest/globals';
import {
  autoScrollSpeed,
  buildColumnItems,
  clampScroll,
  columnInsertIndex,
  columnLeft,
  findTargetColumn,
  insertIndexAt,
  keyOf,
  slotPosition,
  visibleCards,
  visibleRange,
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
  contentTop: 0,
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

  // Columns start at 16 and are 292 apart (280 wide + 12 gap).
  const find = (
    x: number,
    keys: string[] = order,
    layouts: Record<string, ColumnLayout> = columns
  ) => findTargetColumn(keys, layouts, x, 16, 292);

  it('returns the column under the finger', () => {
    expect(find(20)).toBe('a');
    expect(find(400)).toBe('b');
    expect(find(879)).toBe('c');
  });

  it('picks the nearest column in gaps and past the edges', () => {
    expect(find(298)).toBe('a'); // 2pt from a, 10pt from b
    expect(find(305)).toBe('b');
    expect(find(0)).toBe('a');
    expect(find(5000)).toBe('c');
  });

  it('places columns by order, not by their measured x', () => {
    // Measured positions from before a reorder: c was first, a last.
    const stale = { a: column(600), b: column(308), c: column(16) };
    expect(find(20, ['a', 'b', 'c'], stale)).toBe('a');
    expect(find(700, ['a', 'b', 'c'], stale)).toBe('c');
  });

  it('ignores unmeasured columns and handles empty boards', () => {
    expect(find(10, ['x', 'a'], { x: column(0, 0), a: column(300) })).toBe('a');
    expect(find(10, [], {})).toBeNull();
  });
});

// Three cards with an 8pt gap: one (0–60), two (68–128), three (136–236).
const column3 = {
  order: ['one', 'two', 'three'],
  contentTop: 0,
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

  it('ignores measured positions entirely (they go stale)', () => {
    // "two" moved to the top during a drag; its last layout event said y=68.
    const stale = {
      order: ['two', 'three'],
      contentTop: 0,
      cards: {
        two: { x: 12, y: 68, width: 256, height: 60 },
        three: { x: 12, y: 999, width: 256, height: 100 },
      },
    };
    expect(visibleCards(stale, null, 8).map((c) => c.y)).toEqual([0, 68]);
  });

  it('starts below custom top padding', () => {
    expect(visibleCards({ ...column3, contentTop: 10 }, null, 8)[0]!.y).toBe(
      10
    );
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

  it('does not move a tall card on lift when a short card sits below it', () => {
    // A 116pt card on top of a 63pt card. Lifted, its center is at 58, which
    // is below the short card's middle *if* the short card moved up into the
    // gap (31). The landing spot is open at 0, so the short card still shows
    // below it: its visible middle is 124 + 31 = 155.
    const tall = {
      order: ['tall', 'short'],
      contentTop: 0,
      cards: {
        tall: { x: 12, y: 0, width: 256, height: 116 },
        short: { x: 12, y: 124, width: 256, height: 63 },
      },
    };
    const rest = visibleCards(tall, 'tall', 8);
    const space = 116 + 8;
    expect(insertIndexAt(rest, 58, 0, space)).toBe(0);
    // It moves below once its center passes the short card's visible middle.
    expect(insertIndexAt(rest, 156, 0, space)).toBe(1);
    // ...and from there, needs to come back above that card's middle (31).
    expect(insertIndexAt(rest, 100, 1, space)).toBe(1);
    expect(insertIndexAt(rest, 30, 1, space)).toBe(0);
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

describe('columnLeft', () => {
  it('stacks columns from the start by their order', () => {
    expect(columnLeft(['a', 'b', 'c'], 'c', 16, 292)).toBe(600);
    expect(columnLeft(['a', 'b', 'c'], 'missing', 16, 292)).toBe(16);
  });
});

describe('columnInsertIndex', () => {
  // Two other columns at 16 and 308, 280 wide (midpoints 156 and 448).
  const index = (centerX: number, current = -1) =>
    columnInsertIndex(2, 16, 292, 280, centerX, current, 292);

  it('counts the columns left of the dragged center', () => {
    expect(index(100)).toBe(0);
    expect(index(200)).toBe(1);
    expect(index(500)).toBe(2);
  });

  it('keeps the landing spot until the center passes a midpoint', () => {
    // Spot at 0 shifts both columns right by 292 (midpoints 448 and 740).
    expect(index(200, 0)).toBe(0);
    expect(index(460, 0)).toBe(1);
    // Spot at 2 leaves them in place: moving back past 448 goes to 1.
    expect(index(440, 2)).toBe(1);
  });
});

describe('visibleRange', () => {
  const rects = [
    { x: 0, y: 0, width: 100, height: 60 },
    { x: 0, y: 68, width: 100, height: 60 },
    { x: 0, y: 136, width: 100, height: 100 },
    { x: 0, y: 244, width: 100, height: 60 },
  ];

  it("returns the cards in the viewport and the first one's offset", () => {
    expect(visibleRange(rects, 0, 130)).toEqual({
      first: 0,
      last: 1,
      offset: 0,
    });
    expect(visibleRange(rects, 100, 100)).toEqual({
      first: 1,
      last: 2,
      offset: -32,
    });
  });

  it('is empty for an empty column', () => {
    expect(visibleRange([], 0, 300)).toEqual({
      first: -1,
      last: -1,
      offset: 0,
    });
  });
});
