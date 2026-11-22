import { describe, expect, it, jest } from '@jest/globals';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import {
  createGestureController,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';
import { Board, moveCard } from '../index';
import {
  drag,
  initial,
  layout,
  measureBoard,
  queueLift,
  titlesIn,
} from '../__fixtures__/dragHarness';

// Drag visuals are hidden from screen readers; tests still look at them.
const HIDDEN = { includeHiddenElements: true };

describe('drag and drop', () => {
  it('moves a card to another column (uncontrolled)', async () => {
    const onBoardChange = jest.fn();
    const onCardDragStart = jest.fn();
    const onCardDragEnd = jest.fn();
    await render(
      <Board
        initialBoard={initial}
        onBoardChange={onBoardChange}
        onCardDragStart={onCardDragStart}
        onCardDragEnd={onCardDragEnd}
      />
    );
    await measureBoard();

    // Grab card 1 and drop it into the empty "done" column.
    await drag(1, [
      [100, 80],
      [400, 120],
    ]);

    expect(onCardDragStart).toHaveBeenCalledWith({
      card: initial.columns[0]!.cards[0],
      source: { fromColumnId: 'todo', fromPosition: 0 },
    });
    expect(onCardDragEnd).toHaveBeenCalledWith({
      card: initial.columns[0]!.cards[0],
      source: { fromColumnId: 'todo', fromPosition: 0 },
      destination: { toColumnId: 'done', toPosition: 0 },
      via: 'drag',
    });
    expect(onBoardChange).toHaveBeenCalledTimes(1);
    expect(titlesIn('todo')).toEqual(['2']);
    expect(titlesIn('done')).toEqual(['1']);
    expect(screen.queryByTestId('kanban-drag-overlay', HIDDEN)).toBeNull();
    expect(screen.queryByTestId('kanban-placeholder', HIDDEN)).toBeNull();
  });

  it('reorders within a column', async () => {
    const onBoardChange = jest.fn();
    await render(
      <Board initialBoard={initial} onBoardChange={onBoardChange} />
    );
    await measureBoard();

    // Card 1 below card 2's midpoint (viewport top 52 + 98 = 150).
    await drag(1, [
      [100, 80],
      [100, 170],
    ]);

    expect(titlesIn('todo')).toEqual(['2', '1']);
    expect(onBoardChange).toHaveBeenCalledTimes(1);
  });

  it('puts the card back when dropped where it started', async () => {
    const onBoardChange = jest.fn();
    const onCardDragEnd = jest.fn();
    await render(
      <Board
        initialBoard={initial}
        onBoardChange={onBoardChange}
        onCardDragEnd={onCardDragEnd}
      />
    );
    await measureBoard();

    await drag(2, [
      [100, 150],
      [110, 155],
    ]);

    expect(onCardDragEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        source: { fromColumnId: 'todo', fromPosition: 1 },
        destination: { toColumnId: 'todo', toPosition: 1 },
      })
    );
    expect(onBoardChange).not.toHaveBeenCalled();
    expect(titlesIn('todo')).toEqual(['1', '2']);
  });

  it('leaves controlled boards to the parent', async () => {
    const onCardDragEnd = jest.fn();
    const { rerender } = await render(
      <Board board={initial} onCardDragEnd={onCardDragEnd} />
    );
    await measureBoard();
    await drag(1, [
      [100, 80],
      [400, 120],
    ]);

    // The parent didn't apply the move, so nothing changed.
    expect(onCardDragEnd).toHaveBeenCalledTimes(1);
    expect(titlesIn('todo')).toEqual(['1', '2']);

    // Applying it with moveCard moves the card.
    const { source, destination } = onCardDragEnd.mock.calls[0]![0] as any;
    await rerender(
      <Board
        board={moveCard(initial, source, destination)}
        onCardDragEnd={onCardDragEnd}
      />
    );
    expect(titlesIn('done')).toEqual(['1']);
  });

  it('does not move a tall card when it is lifted above a short one', async () => {
    const onCardDragEnd = jest.fn();
    await render(
      <Board initialBoard={initial} onCardDragEnd={onCardDragEnd} />
    );
    await measureBoard();
    // Card 1 is tall (116), card 2 short (60) right below it.
    await layout('kanban-card-1', 12, 0, 256, 116);
    await layout('kanban-card-2', 12, 124, 256, 60);

    // Hold card 1 without moving, then release.
    await drag(
      1,
      [
        [100, 110],
        [101, 112],
      ],
      { pageX: 28, pageY: 52, height: 116 }
    );

    expect(onCardDragEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: { toColumnId: 'todo', toPosition: 0 },
      })
    );
    expect(titlesIn('todo')).toEqual(['1', '2']);
  });

  it('keeps hit testing right after a reorder, without new layout events', async () => {
    const onCardDragEnd = jest.fn();
    await render(
      <Board initialBoard={initial} onCardDragEnd={onCardDragEnd} />
    );
    await measureBoard();

    // Reorder: card 1 below card 2.
    await drag(1, [
      [100, 80],
      [100, 170],
    ]);
    expect(titlesIn('todo')).toEqual(['2', '1']);

    // No layout events fire after the drop (as on device when a card already
    // reached its final spot during the drag). Hold card 1, now second, and
    // release: it must stay second.
    await drag(
      1,
      [
        [100, 150],
        [101, 151],
      ],
      { pageX: 28, pageY: 120 }
    );
    expect(onCardDragEnd).toHaveBeenLastCalledWith(
      expect.objectContaining({
        source: { fromColumnId: 'todo', fromPosition: 1 },
        destination: { toColumnId: 'todo', toPosition: 1 },
      })
    );
    expect(titlesIn('todo')).toEqual(['2', '1']);
  });

  it('keeps the dragged card mounted and adds landing spots', async () => {
    await render(<Board initialBoard={initial} />);
    await measureBoard();
    queueLift(1);
    const gesture = createGestureController(
      getByGestureTestId('kanban-card-drag-1')
    );
    await act(async () => {
      gesture.begin({ absoluteX: 100, absoluteY: 80 });
      gesture.activate({ absoluteX: 100, absoluteY: 80 });
    });

    // The card floats above the board...
    expect(screen.getByTestId('kanban-drag-overlay', HIDDEN)).toBeTruthy();
    // ...while its original view stays mounted and out of the layout. It must
    // stay hit-testable (iOS cancels the gesture otherwise): only content fades.
    const original = screen.getByTestId('kanban-card-1');
    const originalStyle = StyleSheet.flatten(original.props.style);
    expect(originalStyle).toMatchObject({ position: 'absolute' });
    expect(originalStyle.opacity).toBeUndefined();
    expect(original.props.pointerEvents).toBeUndefined();
    // The faded content is also hidden from screen readers.
    const content = screen.getByTestId('kanban-content-1', {
      includeHiddenElements: true,
    });
    expect(StyleSheet.flatten(content.props.style)).toMatchObject({
      opacity: 0,
    });
    expect(content.props.accessibilityElementsHidden).toBe(true);
    // Landing spots: one before card 2 and one at the end of "todo", and the
    // empty "done" column becomes a drop zone.
    const todo = within(screen.getByTestId('kanban-column-todo'));
    expect(todo.getAllByTestId('kanban-spacer', HIDDEN)).toHaveLength(1);
    expect(todo.getByTestId('kanban-spacer-end', HIDDEN)).toBeTruthy();
    expect(screen.getByTestId('kanban-empty-column')).toBeTruthy();

    await act(async () => {
      gesture.update({ absoluteX: 400, absoluteY: 120 });
      gesture.end();
    });
    expect(screen.queryByTestId('kanban-drag-overlay', HIDDEN)).toBeNull();
    expect(screen.queryByTestId('kanban-spacer', HIDDEN)).toBeNull();
    expect(titlesIn('done')).toEqual(['1']);
  });

  it('does not drag when disableCardDrag is set', async () => {
    const onCardDragStart = jest.fn();
    await render(
      <Board
        initialBoard={initial}
        disableCardDrag
        onCardDragStart={onCardDragStart}
      />
    );
    await measureBoard();
    await drag(1, [
      [100, 80],
      [400, 120],
    ]);
    expect(onCardDragStart).not.toHaveBeenCalled();
    expect(titlesIn('todo')).toEqual(['1', '2']);
  });

  it('does not fire onCardPress for a press that became a drag', async () => {
    const onCardPress = jest.fn();
    await render(<Board initialBoard={initial} onCardPress={onCardPress} />);
    await measureBoard();
    await fireEvent(screen.getByText('One'), 'pressIn');
    await drag(1, [
      [100, 80],
      [110, 85],
    ]);
    await fireEvent.press(screen.getByText('One'));
    expect(onCardPress).not.toHaveBeenCalled();
  });
});
