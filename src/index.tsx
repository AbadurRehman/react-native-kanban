// Components
export { Board } from './components/Board';
export { DefaultCard } from './components/Card';
export type {
  BoardBaseProps,
  BoardDataProps,
  BoardProps,
  CardDragEndEvent,
  CardDragStartEvent,
  CardRenderInfo,
  ColumnRenderInfo,
  KanbanLabels,
  KanbanStyles,
} from './components/types';

// Board helpers
export {
  addCard,
  addColumn,
  findCard,
  moveCard,
  moveColumn,
  removeCard,
  removeColumn,
  updateCard,
  updateColumn,
} from './helpers';
export type { CardLocation, InsertPosition } from './helpers';

// Theming
export {
  createKanbanTheme,
  darkTheme,
  lightTheme,
  useKanbanTheme,
} from './theme';
export type {
  CreateKanbanThemeOptions,
  DeepPartial,
  KanbanColorScheme,
  KanbanDensity,
  KanbanTextStyle,
  KanbanTheme,
  KanbanThemeColors,
  KanbanThemeInput,
  KanbanThemeOverrides,
  KanbanThemePreset,
  KanbanThemeProp,
  KanbanThemeRadius,
  KanbanThemeShadows,
  KanbanThemeSpacing,
  KanbanThemeTypography,
} from './theme';

// Data model
export type {
  CardDestination,
  CardSource,
  ColumnDestination,
  ColumnSource,
  KanbanBoard,
  KanbanCard,
  KanbanColumn,
  KanbanId,
} from './types';
