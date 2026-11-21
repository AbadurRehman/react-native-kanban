import type { SharedValue } from 'react-native-reanimated';
import type { ColumnLayout, Rect } from './geometry';

/**
 * Writes to the layout registry from the JS thread (onLayout / onScroll).
 * `modify` runs the updater on the UI thread, where drag hit tests read it.
 */

type Layouts = SharedValue<Record<string, ColumnLayout>>;

const EMPTY_COLUMN: ColumnLayout = {
  x: 0,
  width: 0,
  viewportTop: 0,
  viewportHeight: 0,
  scrollY: 0,
  contentHeight: 0,
  cards: {},
  order: [],
  contentTop: 0,
  empty: null,
  estimate: 0,
};

export function patchColumnLayout(
  layouts: Layouts,
  columnKey: string,
  patch: Partial<Omit<ColumnLayout, 'cards'>>
) {
  layouts.modify((all) => {
    'worklet';
    const previous = all[columnKey] ?? { ...EMPTY_COLUMN, cards: {} };
    // Card sizes outlive their views (columns only render a window of
    // cards); forget the ones that left the column.
    let cards = previous.cards;
    if (patch.order) {
      const kept: Record<string, Rect> = {};
      for (let i = 0; i < patch.order.length; i++) {
        const key = patch.order[i]!;
        const rect = cards[key];
        if (rect) kept[key] = rect;
      }
      cards = kept;
    }
    all[columnKey] = {
      ...previous,
      ...patch,
      cards,
      order: patch.order ?? previous.order,
      empty: patch.empty !== undefined ? patch.empty : previous.empty,
    };
    return all;
  });
}

export function removeColumnLayout(layouts: Layouts, columnKey: string) {
  layouts.modify((all) => {
    'worklet';
    delete all[columnKey];
    return all;
  });
}

/**
 * Records a card's rect (hit tests use its size; positions are stacked).
 * While a drag is active, known cards keep their size: the dragged card is
 * re-laid out as a hidden absolute view, and the registry must keep its
 * in-column size until the drop. Cards rendered for the first time (the
 * column scrolled) are still recorded.
 */
export function setCardLayout(
  layouts: Layouts,
  active: SharedValue<boolean>,
  columnKey: string,
  cardKey: string,
  rect: Rect
) {
  layouts.modify((all) => {
    'worklet';
    const column = all[columnKey];
    if (active.value && column?.cards[cardKey]) return all;
    if (column) {
      column.cards[cardKey] = rect;
    } else {
      all[columnKey] = {
        ...EMPTY_COLUMN,
        cards: { [cardKey]: rect },
        order: [],
      };
    }
    return all;
  });
}
