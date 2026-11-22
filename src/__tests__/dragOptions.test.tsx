import { describe, expect, it, jest } from '@jest/globals';
import { act, render, screen, within } from '@testing-library/react-native';
import { StyleSheet, Text, View } from 'react-native';
import {
  createGestureController,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';
import { Board, type BoardBaseProps, type KanbanCard } from '../index';
import {
  drag,
  initial,
  measureBoard,
  queueLift,
  titlesIn,
} from '../__fixtures__/dragHarness';

// Drag visuals are hidden from screen readers; tests still look at them.
const HIDDEN = { includeHiddenElements: true };

const gestureConfig = (id: number) =>
  (
    getByGestureTestId(`kanban-card-drag-${id}`) as unknown as {
      config: Record<string, unknown>;
    }
  ).config;

/** Lifts card 1 and keeps it held (no drop), so mid-drag UI can be checked. */
async function liftCard1() {
  queueLift(1);
  const gesture = createGestureController(
    getByGestureTestId('kanban-card-drag-1')
  );
  await act(async () => {
    gesture.begin({ absoluteX: 100, absoluteY: 80 });
    gesture.activate({ absoluteX: 100, absoluteY: 80 });
  });
  return gesture;
}

async function renderBoard(props: Partial<BoardBaseProps> = {}) {
  await render(<Board initialBoard={initial} {...props} />);
  await measureBoard();
}

describe('dragActivationDelay', () => {
  it('lifts after a 300 ms long press by default', async () => {
    await renderBoard();
    expect(gestureConfig(1).activateAfterLongPress).toBe(300);
  });

  it('uses a custom delay', async () => {
    await renderBoard({ dragActivationDelay: 600 });
    expect(gestureConfig(1).activateAfterLongPress).toBe(600);
  });

  it('lifts on the first movement when the delay is 0', async () => {
    await renderBoard({ dragActivationDelay: 0 });
    expect(gestureConfig(1).activateAfterLongPress).toBeUndefined();
    expect(gestureConfig(1).minDist).toBe(4);
  });
});

describe('canDragCard', () => {
  it('locks the cards it returns false for', async () => {
    const onCardDragStart = jest.fn();
    await renderBoard({
      canDragCard: (card: KanbanCard) => card.id !== 1,
      onCardDragStart,
    });
    expect(gestureConfig(1).enabled).toBe(false);
    expect(gestureConfig(2).enabled).toBe(true);

    await drag(1, [
      [100, 80],
      [400, 120],
    ]);
    expect(onCardDragStart).not.toHaveBeenCalled();
    expect(titlesIn('todo')).toEqual(['1', '2']);
  });
});

describe('canDropCard', () => {
  it('asks once per column when a drag starts', async () => {
    const canDropCard = jest.fn(() => true);
    await renderBoard({ canDropCard });
    // Cards also ask while rendering, for their Move actions.
    canDropCard.mockClear();
    await drag(1, [
      [100, 80],
      [101, 81],
    ]);
    const [todo, done] = initial.columns;
    expect(canDropCard).toHaveBeenCalledTimes(2);
    expect(canDropCard).toHaveBeenCalledWith({
      card: todo!.cards[0],
      fromColumn: todo,
      toColumn: done,
    });
  });

  it('puts the card back when dropped into a blocked column', async () => {
    const onCardDragEnd = jest.fn();
    await renderBoard({
      canDropCard: ({ toColumn }) => toColumn.id !== 'done',
      onCardDragEnd,
    });
    await drag(1, [
      [100, 80],
      [400, 120],
    ]);
    expect(onCardDragEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: { toColumnId: 'todo', toPosition: 0 },
      })
    );
    expect(titlesIn('todo')).toEqual(['1', '2']);
    expect(titlesIn('done')).toEqual([]);
  });

  it('still allows moves into columns that are not blocked', async () => {
    await renderBoard({
      canDropCard: ({ toColumn }) => toColumn.id !== 'done',
    });
    // Reorder within "todo": card 1 below card 2.
    await drag(1, [
      [100, 80],
      [100, 170],
    ]);
    expect(titlesIn('todo')).toEqual(['2', '1']);
  });
});

describe('renderDragPreview', () => {
  it('draws the floating card', async () => {
    await renderBoard({
      renderCard: (card) => <Text testID={`card-${card.id}`}>{card.id}</Text>,
      renderDragPreview: (card, info) => (
        <Text testID="preview">{`${card.id} from ${info.column.id}`}</Text>
      ),
    });
    await liftCard1();
    const overlay = within(screen.getByTestId('kanban-drag-overlay', HIDDEN));
    expect(overlay.getByTestId('preview', HIDDEN).props.children).toBe(
      '1 from todo'
    );
    expect(overlay.queryByTestId('card-1', HIDDEN)).toBeNull();
    // The preview brings its own look: no default lifted shadow around it.
    const style = StyleSheet.flatten(
      screen.getByTestId('kanban-drag-overlay', HIDDEN).props.style
    );
    expect(style.boxShadow).toBeUndefined();
  });

  it('defaults to renderCard', async () => {
    await renderBoard({
      renderCard: (card) => <Text testID={`card-${card.id}`}>{card.id}</Text>,
    });
    await liftCard1();
    const overlay = within(screen.getByTestId('kanban-drag-overlay', HIDDEN));
    expect(overlay.getByTestId('card-1', HIDDEN)).toBeTruthy();
    const style = StyleSheet.flatten(
      screen.getByTestId('kanban-drag-overlay', HIDDEN).props.style
    );
    expect(style.boxShadow).toBeDefined();
  });
});

describe('renderPlaceholder', () => {
  it('replaces the dashed landing spot', async () => {
    const renderPlaceholder = jest.fn(() => <View testID="my-landing-spot" />);
    await renderBoard({ renderPlaceholder });
    await liftCard1();

    expect(renderPlaceholder).toHaveBeenCalledWith(
      expect.objectContaining({
        card: initial.columns[0]!.cards[0],
        height: 60,
      })
    );
    const todo = within(screen.getByTestId('kanban-column-todo'));
    const spots = todo.getAllByTestId('kanban-placeholder-custom', HIDDEN);
    // One per spacer in "todo": before card 2, and at the end.
    expect(spots).toHaveLength(2);
    expect(StyleSheet.flatten(spots[0]!.props.style)).toMatchObject({
      height: 60,
    });
    expect(todo.getAllByTestId('my-landing-spot', HIDDEN)).toHaveLength(2);
  });
});

describe('dragStyle', () => {
  const overlayStyle = () =>
    StyleSheet.flatten(
      screen.getByTestId('kanban-drag-overlay', HIDDEN).props.style
    );

  it('lifts with a slight scale and tilt by default', async () => {
    await renderBoard();
    await liftCard1();
    expect(overlayStyle().opacity).toBe(1);
    expect(overlayStyle().transform).toEqual(
      expect.arrayContaining([{ scale: 1.03 }, { rotate: '2deg' }])
    );
  });

  it('uses a custom scale, tilt and opacity', async () => {
    await renderBoard({
      dragStyle: { scale: 1.1, rotation: -4, opacity: 0.8 },
    });
    await liftCard1();
    expect(overlayStyle().opacity).toBeCloseTo(0.8);
    expect(overlayStyle().transform).toEqual(
      expect.arrayContaining([{ scale: 1.1 }, { rotate: '-4deg' }])
    );
  });
});

describe('autoScroll', () => {
  it('still drags with auto-scroll turned off', async () => {
    await renderBoard({ autoScroll: false });
    await drag(1, [
      [100, 80],
      [400, 120],
    ]);
    expect(titlesIn('done')).toEqual(['1']);
  });
});
