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
      ],
    },
    {
      id: 'todo',
      title: 'To do',
      cards: [
        {
          id: 'k-4',
          title: 'Long-press to drag',
          description: 'Arrives in 0.2.0.',
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
    { id: 'done', title: 'Done', cards: [] },
  ],
};
