# Migrating from react-kanban

This guide is for apps using [react-kanban](https://github.com/lourenci/react-kanban) (`@lourenci/react-kanban`, or the `@asseinfo/react-kanban` fork) that are moving to React Native, or sharing board data between a web app and a mobile app.

**Your data doesn't change.** react-native-kanban uses the same board shape: columns with `id`, `title` and `cards`, cards with `id`, `title` and `description`, and any extra fields you add. `moveCard` and `moveColumn` take the same `source` and `destination` objects. Most of the work is in four places:

1. Callbacks get **one event object** instead of positional arguments.
2. The built-in add, remove and rename buttons are gone. You render your own controls and call the **helpers**.
3. The helpers take **ids** instead of column and card objects.
4. Styling uses a **theme** and a `styles` prop instead of a CSS file.

- [Install](#install)
- [Before and after](#before-and-after)
- [Props](#props)
- [Callbacks](#callbacks)
- [Render props](#render-props)
- [Adding, removing and renaming](#adding-removing-and-renaming)
- [Helpers](#helpers)
- [Styling](#styling)
- [What you get on top](#what-you-get-on-top)
- [Checklist](#checklist)

## Install

```sh
npm uninstall @lourenci/react-kanban
npm install react-native-kanban react-native-reanimated react-native-worklets react-native-gesture-handler
```

Remove the `@lourenci/react-kanban/dist/styles.css` import. For the Babel plugin and supported versions, see [Installation](../README.md#installation).

## Before and after

`Board` is a named export, and a controlled board is passed with `board` instead of as children.

**Uncontrolled**

```jsx
// react-kanban
import Board from '@lourenci/react-kanban';
import '@lourenci/react-kanban/dist/styles.css';

<Board
  initialBoard={board}
  onCardDragEnd={(newBoard, card, source, destination) => save(newBoard)}
/>;
```

```tsx
// react-native-kanban
import { Board } from 'react-native-kanban';

<Board initialBoard={board} onBoardChange={(newBoard) => save(newBoard)} />;
```

`onBoardChange` gets the new board after every move that changes it, for cards and columns alike.

**Controlled**

```jsx
// react-kanban
import Board, { moveCard } from '@lourenci/react-kanban';

const [board, setBoard] = useState(initialBoard);

<Board
  onCardDragEnd={(_board, _card, source, destination) =>
    setBoard((b) => moveCard(b, source, destination))
  }
>
  {board}
</Board>;
```

```tsx
// react-native-kanban
import { Board, moveCard } from 'react-native-kanban';

const [board, setBoard] = useState(initialBoard);

<Board
  board={board}
  onCardDragEnd={({ source, destination }) =>
    setBoard((b) => moveCard(b, source, destination))
  }
/>;
```

`moveCard(board, source, destination)` is unchanged, so the line inside the handler usually stays as it is.

## Props

| react-kanban                                                               | react-native-kanban                                  | Notes                                                           |
| -------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| `children` (the board)                                                     | `board`                                              | Controlled mode.                                                |
| `initialBoard`                                                             | `initialBoard`                                       | Same. Add `onBoardChange` to get the updated board.             |
| `onCardDragEnd`                                                            | `onCardDragEnd`                                      | One event object (see [Callbacks](#callbacks)).                 |
| `onColumnDragEnd`                                                          | `onColumnDragEnd`                                    | One event object.                                               |
| `renderCard`                                                               | `renderCard`                                         | Second argument changed (see [Render props](#render-props)).    |
| `renderColumnHeader`                                                       | `renderColumnHeader`                                 | Second argument changed.                                        |
| `disableCardDrag`                                                          | `disableCardDrag`                                    | Same. Lock single cards with `canDragCard`.                     |
| `disableColumnDrag`                                                        | `disableColumnDrag`                                  | Same. Lock single columns with `canDragColumn`.                 |
| `allowAddCard`, `onNewCardConfirm`, `onCardNew`                            | Your button in `renderColumnFooter` + `addCard`      | [Adding cards](#adding-cards)                                   |
| `allowRemoveCard`, `onCardRemove`                                          | Your button in `renderCard` + `removeCard`           | [Removing cards](#removing-cards)                               |
| `allowRenameColumn`, `onColumnRename`                                      | Your header in `renderColumnHeader` + `updateColumn` | [Renaming and removing columns](#renaming-and-removing-columns) |
| `allowRemoveColumn`, `onColumnRemove`                                      | Your header in `renderColumnHeader` + `removeColumn` | [Renaming and removing columns](#renaming-and-removing-columns) |
| `allowAddColumn`, `onNewColumnConfirm`, `onColumnNew`, `renderColumnAdder` | Your button outside the board + `addColumn`          | [Adding columns](#adding-columns)                               |

## Callbacks

react-kanban passes positional arguments; react-native-kanban passes one object. The `source` and `destination` objects have the same shapes as before.

| react-kanban                                          | react-native-kanban                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| `onCardDragEnd(board, card, source, destination)`     | `onCardDragEnd({ card, source, destination, via })`                          |
| `onColumnDragEnd(board, column, source, destination)` | `onColumnDragEnd({ column, source, destination, via })`                      |
| —                                                     | `onCardDragStart({ card, source })`, `onColumnDragStart({ column, source })` |
| the `board` argument (uncontrolled)                   | `onBoardChange(board)`                                                       |

- `source` is `{ fromColumnId, fromPosition }` for cards and `{ fromPosition }` for columns; `destination` is `{ toColumnId, toPosition }` and `{ toPosition }`.
- `onCardDragEnd` also fires when a card is dropped back where it started (`source` and `destination` are equal) and when a screen-reader user moves a card with an action (`via: 'accessibility'`). Apply it the same way in all cases: `moveCard` returns the same board when nothing moved.

## Render props

**`renderCard(card, info)`**

| react-kanban `cardBag` | react-native-kanban                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `removeCard()`         | Call `removeCard(board, card.id)` on your state ([example](#removing-cards)).                                                           |
| `dragging`             | Not needed: the floating card is drawn separately. Style it with `dragStyle`, or draw it yourself with `renderDragPreview(card, info)`. |

`info` is `{ column, index, theme }`: the card's column, its position in it, and the board's theme.

**`renderColumnHeader(column, info)`**

| react-kanban `columnBag` | react-native-kanban                                 |
| ------------------------ | --------------------------------------------------- |
| `removeColumn()`         | `removeColumn(board, column.id)`                    |
| `renameColumn(title)`    | `updateColumn(board, column.id, { title })`         |
| `addCard(card, { on })`  | `addCard(board, column.id, card, { position: on })` |

`info` is `{ index, cardCount, theme }`.

The bag functions in react-kanban worked on uncontrolled boards. Here, changes outside dragging always go through your own state, so **a board you add to, remove from or rename should be controlled** (`board` + `onCardDragEnd`/`onColumnDragEnd`).

New render props with no react-kanban equivalent: `renderColumnFooter` (under the cards, e.g. an "Add card" button), `renderEmptyColumn`, `renderDragPreview` and `renderPlaceholder` (the landing spot).

## Adding, removing and renaming

react-kanban drew its own buttons and forms for these. react-native-kanban leaves the controls to you, so they match your app, and gives you pure helpers to update the board. The examples below use a controlled board:

```tsx
const [board, setBoard] = useState(initialBoard);
```

### Adding cards

```tsx
import { Pressable, Text } from 'react-native';
import { Board, addCard } from 'react-native-kanban';

<Board
  board={board}
  renderColumnFooter={(column) => (
    <Pressable
      onPress={() =>
        setBoard((b) =>
          addCard(b, column.id, { id: newId(), title: 'New card' })
        )
      }
    >
      <Text>+ Add card</Text>
    </Pressable>
  )}
/>;
```

`allowAddCard={{ on: 'top' }}` becomes `addCard(b, column.id, card, { position: 'top' })`. `position` also takes an index.

### Removing cards

```tsx
import { Pressable, Text, View } from 'react-native';
import { Board, removeCard } from 'react-native-kanban';

<Board
  board={board}
  renderCard={(card) => (
    <View style={styles.card}>
      <Text>{card.title}</Text>
      <Pressable onPress={() => setBoard((b) => removeCard(b, card.id))}>
        <Text>Remove</Text>
      </Pressable>
    </View>
  )}
/>;
```

Taps on buttons inside a card work as usual: a card only lifts after a long press (with a mouse on web, once it's dragged).

For screen readers, each card is read as one element with Move actions (see [Accessibility](../README.md#accessibility)), so buttons inside it can't be focused on their own. If your cards have buttons like this, set `disableAccessibilityActions`.

### Renaming and removing columns

```tsx
import { Pressable, Text, TextInput, View } from 'react-native';
import { Board, removeColumn, updateColumn } from 'react-native-kanban';

<Board
  board={board}
  renderColumnHeader={(column) => (
    <View style={styles.header}>
      <TextInput
        defaultValue={column.title}
        onEndEditing={(e) => {
          const title = e.nativeEvent.text;
          setBoard((b) => updateColumn(b, column.id, { title }));
        }}
      />
      <Pressable onPress={() => setBoard((b) => removeColumn(b, column.id))}>
        <Text>Delete</Text>
      </Pressable>
    </View>
  )}
/>;
```

A long press on the header lifts the column for dragging (with a mouse on web, dragging it does); taps and typing work as usual. Use `canDragColumn` or `disableColumnDrag` if a header shouldn't drag at all.

### Adding columns

There's no column adder slot inside the board. Put your button next to it:

```tsx
import { addColumn } from 'react-native-kanban';

<Button
  title="Add column"
  onPress={() =>
    setBoard((b) => addColumn(b, { id: newId(), title: 'New column', cards: [] }))
  }
/>
<Board board={board} />
```

`addColumn` also takes `{ position: 'top' | 'bottom' | index }`; `'top'` adds it first.

## Helpers

All helpers are pure: they take the board first and return a new board (or the same board when nothing changes).

| react-kanban                             | react-native-kanban                                                     |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| `moveCard(board, source, destination)`   | Same.                                                                   |
| `moveColumn(board, source, destination)` | Same.                                                                   |
| `addCard(board, inColumn, card, { on })` | `addCard(board, columnId, card, { position })`                          |
| `removeCard(board, fromColumn, card)`    | `removeCard(board, cardId)`                                             |
| `addColumn(board, column)`               | `addColumn(board, column, { position })` (`position` optional)          |
| `removeColumn(board, column)`            | `removeColumn(board, columnId)`                                         |
| `changeColumn(board, column, object)`    | `updateColumn(board, columnId, partialOrFn)`                            |
| —                                        | `updateCard(board, cardId, partialOrFn)`                                |
| —                                        | `findCard(board, cardId)` → `{ card, columnId, columnIndex, position }` |

`updateCard` and `updateColumn` merge a partial object, or take a function that returns the next card or column. Neither changes the `id`.

## Styling

There's no CSS file. Pick a theme, then override parts with `styles`:

```tsx
<Board
  board={board}
  theme="auto" // 'light', 'dark', 'auto' (follows the device) or your own tokens
  styles={{ card: { borderRadius: 4 }, columnTitle: { fontSize: 15 } }}
/>
```

| react-kanban class                                                                                    | `styles` key or prop                                                             |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `react-kanban-board`                                                                                  | `styles.boardContent` (or `style` for the outer view)                            |
| `react-kanban-column`                                                                                 | `styles.column`                                                                  |
| `react-kanban-column-header`                                                                          | `styles.columnHeader`, `styles.columnTitle`, `styles.countBadge`                 |
| `react-kanban-card`                                                                                   | `styles.card`                                                                    |
| `react-kanban-card__title`                                                                            | `styles.cardTitle`                                                               |
| `react-kanban-card__description`                                                                      | `styles.cardDescription`                                                         |
| `react-kanban-card--dragging`                                                                         | `dragStyle` (scale, tilt, opacity), `styles.dragOverlay`, or `renderDragPreview` |
| `react-kanban-card-skeleton` (where a card will land)                                                 | `styles.placeholder` or `renderPlaceholder`                                      |
| `react-kanban-card-adder-*`, `react-kanban-column-adder-button`, `react-kanban-column-header__button` | Your own controls (see above)                                                    |

Theme tokens (colors, spacing, radii, typography, shadows) are covered in [Theming](../README.md#theming), and every `styles` key in [Style overrides](../README.md#style-overrides).

## What you get on top

Things react-kanban didn't have, all optional:

- **Touch-first dragging:** long press to lift (`dragActivationDelay`; mouse drags on web start on movement), auto-scroll near edges (`autoScroll`), haptics hooks (`onCardDragStart`).
- **Rules:** lock cards and columns (`canDragCard`, `canDragColumn`) and choose where cards may go (`canDropCard`).
- **Large boards:** columns only render the cards near the screen (`virtualize`, on by default).
- **Layouts:** compact density, one column per screen on phones (`columnWidth="fullScreen"`), responsive widths for tablets (`columnWidth={{ min, max }}`), fill-height columns.
- **Accessibility:** VoiceOver and TalkBack support with Move actions, announcements and translatable labels.
- **Right-to-left** layouts (`direction`), and TypeScript generics for your own card and column fields.

## Checklist

- [ ] Replace the package and remove the CSS import.
- [ ] `import Board from …` → `import { Board } from 'react-native-kanban'`.
- [ ] Controlled: `<Board>{board}</Board>` → `<Board board={board} />`.
- [ ] Uncontrolled: read changes from `onBoardChange(board)` instead of the `board` argument.
- [ ] `onCardDragEnd` / `onColumnDragEnd`: take `{ card | column, source, destination }`.
- [ ] Replace `cardBag` / `columnBag` calls and the `allow*` props with your own controls and the helpers.
- [ ] Helpers: pass ids (`removeCard(board, card.id)`), rename `changeColumn` to `updateColumn` and `{ on }` to `{ position }`.
- [ ] Move CSS to `theme` and `styles`.
