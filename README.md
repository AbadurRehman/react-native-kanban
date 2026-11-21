# react-native-kanban

[![npm version](https://img.shields.io/npm/v/react-native-kanban.svg)](https://www.npmjs.com/package/react-native-kanban)
[![CI](https://github.com/AbadurRehman/react-native-kanban/actions/workflows/ci.yml/badge.svg)](https://github.com/AbadurRehman/react-native-kanban/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/react-native-kanban.svg)](./LICENSE)

Customizable drag-and-drop Kanban board for React Native, built on [Reanimated](https://docs.swmansion.com/react-native-reanimated/) and [Gesture Handler](https://docs.swmansion.com/react-native-gesture-handler/). Inspired by [react-kanban](https://github.com/lourenci/react-kanban), so the data model will feel familiar if you've used it on the web.

> [!WARNING]
> **Work in progress.** `0.0.x` only ships the data model types. The `<Board />` component lands in `0.1.0`, and drag & drop in `0.2.0`. See the [roadmap](#roadmap).

## Goals

- 🧩 **Pure JavaScript.** No native code of its own. Works with Expo and React Native CLI.
- 🎨 **Fully themeable.** Theme tokens, light/dark/auto presets, per-part style overrides and render props.
- 🚀 **UI-thread drag & drop.** Long-press to drag, auto-scroll, smooth reordering on Reanimated 4.
- 🔁 **react-kanban–style API.** Controlled and uncontrolled modes plus pure helpers (`moveCard`, `addCard`, …).
- ♿ **Accessible.** Screen-reader actions for moving cards (planned for v1).

## Installation

```sh
npm install react-native-kanban react-native-reanimated react-native-worklets react-native-gesture-handler
```

| Peer dependency                | Supported  |
| ------------------------------ | ---------- |
| `react-native`                 | New Architecture |
| `react-native-reanimated`      | `>= 4.0.0` |
| `react-native-worklets`        | matching your Reanimated version |
| `react-native-gesture-handler` | `>= 2.20.0` (2.x and 3.x) |

- **React Native CLI:** add `'react-native-worklets/plugin'` as the **last** plugin in `babel.config.js`.
- **Expo (SDK 54+):** no Babel changes needed. Install the peers with `npx expo install`.
- Wrap your app in `GestureHandlerRootView`.

## Data model

```ts
import type { KanbanBoard } from 'react-native-kanban';

const board: KanbanBoard = {
  columns: [
    {
      id: 'todo',
      title: 'To do',
      cards: [{ id: 1, title: 'Design card', description: 'Theme tokens first' }],
    },
    { id: 'done', title: 'Done', cards: [] },
  ],
};
```

Add your own fields with generics:

```ts
interface TaskCard extends KanbanCard {
  priority: 'low' | 'medium' | 'high';
}

const board: KanbanBoard<TaskCard> = { columns: [] };
```

Exported types: `KanbanBoard`, `KanbanColumn`, `KanbanCard`, `KanbanId`, `CardSource`, `CardDestination`, `ColumnSource`, `ColumnDestination`.

## Roadmap

- [x] **0.0.x: Setup.** Library scaffold, React Native CLI + Expo example apps, CI, data model types.
- [ ] **0.1.0: Static board + theming.** `<Board />`, theme presets, style overrides, render props, layout options, helpers.
- [ ] **0.2.0: Card drag & drop.** Long-press drag, placeholder, auto-scroll, controlled/uncontrolled, callbacks.
- [ ] **0.3.0: Drag customization.** `dragStyle`, custom drag preview/placeholder, `canDragCard`/`canDropCard`.
- [ ] **0.4.0: Columns & scale.** Column reordering, virtualization, 500+ card benchmarks.
- [ ] **1.0.0: Polish.** Accessibility, RTL, tablets, web demo, migration guide from react-kanban.

## Example apps

This repo has two example apps that use the library straight from `src/`:

| App | Folder | Run |
| --- | --- | --- |
| React Native CLI | [`example/`](./example) | `yarn example android` / `yarn example ios` |
| Expo | [`example-expo/`](./example-expo) | `yarn example:expo android` / `yarn example:expo ios` / `yarn example:expo web` |

CI builds both apps on Android and iOS, plus the Expo app for web, on every PR.

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT © [Abad](https://github.com/AbadurRehman)

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
