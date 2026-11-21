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
};

export function patchColumnLayout(
  layouts: Layouts,
  columnKey: string,
  patch: Partial<Omit<ColumnLayout, 'cards'>>
) {
  layouts.modify((all) => {
    'worklet';
    const previous = all[columnKey] ?? { ...EMPTY_COLUMN, cards: {} };
    all[columnKey] = {
      ...previous,
      ...patch,
      cards: previous.cards,
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
 * Ignored while a drag is active: the dragged card is re-laid out as a hidden
 * absolute view, and the registry must keep its in-column size until the drop.
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
    if (active.value) return all;
    const column = all[columnKey];
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

export function removeCardLayout(
  layouts: Layouts,
  active: SharedValue<boolean>,
  columnKey: string,
  cardKey: string
) {
  layouts.modify((all) => {
    'worklet';
    if (active.value) return all;
    const column = all[columnKey];
    if (column) delete column.cards[cardKey];
    return all;
  });
}
