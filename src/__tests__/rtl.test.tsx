import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { State } from 'react-native-gesture-handler';
import {
  createGestureController,
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';
import type { DragShared } from '../dnd/DragContext';
import {
  columnDropPosition,
  columnScreenLeft,
  contentFromStart,
  dropPosition,
} from '../dnd/engine';
import { Board, type BoardBaseProps } from '../index';
import {
  initial,
  layout,
  queueLift,
  titlesIn,
} from '../__fixtures__/dragHarness';

/**
 * The harness board (todo: 1, 2 · done: empty) laid out right to left, in
 * a viewport as wide as its content: 604 (16 + 280 + 12 + 280 + 16). "todo"
 * comes first, on the right at x 308; "done" is on the left at x 16.
 */
async function renderRTL(props: Partial<BoardBaseProps> = {}) {
  await render(<Board initialBoard={initial} direction="rtl" {...props} />);
  await layout('kanban-board-viewport', 0, 0, 604, 800);
  await act(async () => {
    fireEvent(
      screen.getByTestId('kanban-board-scroll'),
      'contentSizeChange',
      604,
      300
    );
  });
  await layout('kanban-column-todo', 308, 16, 280, 300);
  await layout('kanban-column-done', 16, 16, 280, 300);
  await layout('kanban-column-viewport-todo', 0, 36, 280, 260);
  await layout('kanban-column-viewport-done', 0, 36, 280, 260);
  await layout('kanban-card-1', 12, 0, 256, 60);
  await layout('kanban-card-2', 12, 68, 256, 60);
}

const { __queueMeasure } = require('react-native-reanimated') as {
  __queueMeasure: (...boxes: object[]) => void;
};

describe('right-to-left boards', () => {
  it('lay out right to left', async () => {
    await renderRTL();
    expect(
      StyleSheet.flatten(screen.getByTestId('kanban-board').props.style)
        .direction
    ).toBe('rtl');
  });

  it('drop a card into the column on the left', async () => {
    const onCardDragEnd = jest.fn();
    await renderRTL({ onCardDragEnd });
    // Card 1 sits in "todo" on the right; drop it over "done" on the left.
    queueLift(1, { pageX: 320, pageY: 52 });
    await act(async () => {
      fireGestureHandler(getByGestureTestId('kanban-card-drag-1'), [
        { state: State.BEGAN, absoluteX: 350, absoluteY: 80 },
        { state: State.ACTIVE, absoluteX: 350, absoluteY: 80 },
        { state: State.ACTIVE, absoluteX: 100, absoluteY: 80 },
        { state: State.END },
      ]);
    });
    expect(onCardDragEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: { toColumnId: 'done', toPosition: 0 },
      })
    );
    expect(titlesIn('done')).toEqual(['1']);
  });

  it('keep a card in its column while it stays over it', async () => {
    const onCardDragEnd = jest.fn();
    await renderRTL({ onCardDragEnd });
    // x 450 is inside "todo" (308–588); a left-to-right board would see
    // "done" there.
    queueLift(1, { pageX: 320, pageY: 52 });
    await act(async () => {
      fireGestureHandler(getByGestureTestId('kanban-card-drag-1'), [
        { state: State.BEGAN, absoluteX: 350, absoluteY: 80 },
        { state: State.ACTIVE, absoluteX: 350, absoluteY: 80 },
        { state: State.ACTIVE, absoluteX: 450, absoluteY: 150 },
        { state: State.END },
      ]);
    });
    expect(onCardDragEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: { toColumnId: 'todo', toPosition: 1 },
      })
    );
  });

  it('move a column past its neighbour on the left', async () => {
    await renderRTL();
    // Grab "todo" 92pt in from its left edge and drag left until its center
    // passes the middle of "done" (x 156 on screen).
    __queueMeasure(
      { x: 0, y: 0, width: 280, height: 300, pageX: 308, pageY: 16 },
      { x: 0, y: 0, width: 800, height: 800, pageX: 0, pageY: 0 }
    );
    await act(async () => {
      fireGestureHandler(getByGestureTestId('kanban-column-drag-todo'), [
        { state: State.BEGAN, absoluteX: 400, absoluteY: 30 },
        { state: State.ACTIVE, absoluteX: 400, absoluteY: 30 },
        { state: State.ACTIVE, absoluteX: 60, absoluteY: 40 },
        { state: State.END },
      ]);
    });
    const order = screen
      .queryAllByTestId(/^kanban-column-(todo|done)$/)
      .map((node) => node.props.testID);
    expect(order).toEqual(['kanban-column-done', 'kanban-column-todo']);
  });

  it('pin drag overlays to the left edge with end: 0', async () => {
    await renderRTL();
    queueLift(1, { pageX: 320, pageY: 52 });
    const gesture = createGestureController(
      getByGestureTestId('kanban-card-drag-1')
    );
    await act(async () => {
      gesture.begin({ absoluteX: 350, absoluteY: 80 });
      gesture.activate({ absoluteX: 350, absoluteY: 80 });
    });
    const style = StyleSheet.flatten(
      screen.getByTestId('kanban-drag-overlay', { includeHiddenElements: true })
        .props.style
    );
    expect(style.end).toBe(0);
    expect(style.start).toBeUndefined();
    expect(style.left).toBeUndefined();
    await act(async () => gesture.end());
  });
});

describe('drop positions', () => {
  const sv = <T,>(value: T) => ({ value });
  /** Just what the drop math reads, for a board laid out like the above. */
  const shared = (rtl: boolean) =>
    ({
      rtl: sv(rtl),
      boardContentWidth: sv(604),
      boardViewportWidth: sv(604),
      columnWidth: sv(280),
      contentLeft: sv(16),
      columnStep: sv(292),
      columnOrder: sv(['todo', 'done']),
      boardScrollX: sv(0),
      targetKey: sv('done'),
      targetIndex: sv(0),
      draggedKey: sv('1'),
      draggedRect: sv({ x: 12, y: 0, width: 256, height: 60 }),
      cardGap: sv(8),
      cardInset: sv(12),
      layouts: sv({
        done: {
          x: 0,
          width: 280,
          viewportTop: 52,
          viewportHeight: 260,
          scrollY: 0,
          contentHeight: 0,
          cards: {},
          order: [],
          contentTop: 0,
          empty: null,
          estimate: 72,
        },
      }),
      colTargetIndex: sv(1),
      colStartY: sv(16),
    }) as unknown as DragShared;

  it('land cards in the mirrored column', () => {
    // "done" (second column) starts at 308 left to right, at 16 right to left.
    expect(dropPosition(shared(false))).toEqual({ x: 320, y: 52 });
    expect(dropPosition(shared(true))).toEqual({ x: 28, y: 52 });
  });

  it('land columns in the mirrored slot', () => {
    expect(columnDropPosition(shared(false))).toEqual({ x: 308, y: 16 });
    expect(columnDropPosition(shared(true))).toEqual({ x: 16, y: 16 });
  });

  it('count the scroll from the start edge', () => {
    // A 400pt viewport scrolled 100pt from its start edge.
    const scrolled = (rtl: boolean) =>
      ({
        ...shared(rtl),
        boardViewportWidth: sv(400),
        boardScrollX: sv(100),
      }) as unknown as DragShared;
    // 50pt from the viewport's left: 150 into the content left to right;
    // right to left that's 350 from the start edge, plus the scroll.
    expect(contentFromStart(scrolled(false), 50)).toBe(150);
    expect(contentFromStart(scrolled(true), 50)).toBe(450);
    // A column starting 308 from the start edge: 208 into the view either
    // way; right to left its left edge is 400 - 208 - 280 = -88.
    expect(columnScreenLeft(scrolled(false), 308)).toBe(208);
    expect(columnScreenLeft(scrolled(true), 308)).toBe(-88);
  });
});
