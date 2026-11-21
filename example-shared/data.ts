import type { KanbanBoard, KanbanCard } from 'react-native-kanban';

export interface Task extends KanbanCard {
  priority: 'low' | 'medium' | 'high';
  tags?: string[];
  assignee?: string;
}

export const initialBoard: KanbanBoard<Task> = {
  columns: [
    {
      id: 'backlog',
      title: 'Backlog',
      cards: [
        {
          id: 'k-1',
          title: 'Theme tokens & presets',
          description: 'Light, dark and auto, with deep overrides.',
          priority: 'high',
          tags: ['theme'],
          assignee: 'AR',
        },
        {
          id: 'k-2',
          title: 'Compact density',
          priority: 'medium',
          tags: ['layout'],
        },
        {
          id: 'k-3',
          title: 'Translate labels',
          description: 'Empty-column text via the labels prop.',
          priority: 'low',
          tags: ['i18n'],
        },
        {
          id: 'k-7',
          title: 'Custom drag preview',
          description: 'renderDragPreview, coming in 0.3.0.',
          priority: 'medium',
          tags: ['dnd'],
        },
        {
          id: 'k-8',
          title: 'Lock cards',
          description: 'canDragCard / canDropCard.',
          priority: 'low',
          tags: ['dnd'],
        },
        {
          id: 'k-9',
          title: 'Column reordering',
          priority: 'medium',
          tags: ['0.4.0'],
        },
        {
          id: 'k-10',
          title: 'Screen reader actions',
          description: 'Move cards without dragging.',
          priority: 'high',
          tags: ['a11y'],
          assignee: 'AR',
        },
        {
          id: 'k-11',
          title: 'Right-to-left layouts',
          priority: 'low',
          tags: ['i18n'],
        },
      ],
    },
    {
      id: 'todo',
      title: 'To do',
      cards: [
        {
          id: 'k-4',
          title: 'Long-press to drag',
          description: 'Hold a card, then move it anywhere.',
          priority: 'high',
          tags: ['dnd'],
          assignee: 'AR',
        },
        {
          id: 'k-5',
          title: 'Auto-scroll near edges',
          priority: 'medium',
          tags: ['dnd'],
        },
      ],
    },
    {
      id: 'doing',
      title: 'In progress',
      cards: [
        {
          id: 'k-6',
          title: 'Board component',
          description: 'Columns, cards and render props.',
          priority: 'high',
          tags: ['core'],
          assignee: 'AR',
        },
      ],
    },
    { id: 'review', title: 'Review', cards: [] },
    { id: 'done', title: 'Done', cards: [] },
  ],
};
