import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import {
  Board,
  addCard,
  createKanbanTheme,
  moveCard,
  useKanbanTheme,
  type CardDragEndEvent,
  type CardDragStartEvent,
  type CardDropCheck,
  type CardRenderInfo,
  type KanbanAutoScroll,
  type KanbanColorScheme,
  type KanbanColumn,
  type KanbanDensity,
  type KanbanDragStyle,
  type KanbanTheme,
  type KanbanThemePreset,
} from 'react-native-kanban';
import { initialBoard, type Task } from './data';

/**
 * Shared demo used by both example apps (example/ and example-expo/).
 * It only imports react, react-native and the library, so Metro resolves
 * everything from each app's own node_modules.
 */

type WidthMode = 'fixed' | 'fullScreen';
type CardMode = 'custom' | 'default';
type HeightMode = 'content' | 'fill';
type DragMode = 'on' | 'off';
type LiftMode = 'subtle' | 'default' | 'bold';
type PreviewMode = 'card' | 'compact';
type LandingMode = 'dashed' | 'tinted';
type DelayMode = '0ms' | '150ms' | '300ms' | '600ms';
type ScrollMode = 'off' | 'normal' | 'fast';
type RulesMode = 'off' | 'on';

const LIFT_STYLES: Record<LiftMode, KanbanDragStyle | undefined> = {
  subtle: { scale: 1.01, rotation: 0 },
  default: undefined,
  bold: { scale: 1.08, rotation: 4, opacity: 0.9 },
};
const DELAYS: Record<DelayMode, number> = {
  '0ms': 0,
  '150ms': 150,
  '300ms': 300,
  '600ms': 600,
};
const AUTO_SCROLL: Record<ScrollMode, boolean | KanbanAutoScroll> = {
  off: false,
  normal: true,
  fast: { edge: 96, speed: 28 },
};

// Rules: finished cards are locked; Review only takes cards from In progress.
const canDragTask = (_task: Task, column: KanbanColumn<Task>) =>
  column.id !== 'done';
const canDropTask = ({
  fromColumn,
  toColumn,
}: CardDropCheck<Task, KanbanColumn<Task>>) =>
  toColumn.id !== 'review' || fromColumn.id === 'doing';

const PRIORITY_COLORS: Record<Task['priority'], string> = {
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#10B981',
};

const TOP_INSET =
  Platform.OS === 'ios' ? 56 : (StatusBar.currentHeight ?? 24) + 8;

export interface KanbanDemoProps {
  /** Shown under the title, e.g. "React Native CLI" or "Expo". */
  platformLabel: string;
  /** Lets the host app match its status bar to the board. */
  onSchemeChange?: (scheme: KanbanColorScheme) => void;
}

export function KanbanDemo({ platformLabel, onSchemeChange }: KanbanDemoProps) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState<KanbanThemePreset>('auto');
  const [density, setDensity] = useState<KanbanDensity>('comfortable');
  const [widthMode, setWidthMode] = useState<WidthMode>('fixed');
  const [cardMode, setCardMode] = useState<CardMode>('custom');
  const [heightMode, setHeightMode] = useState<HeightMode>('content');
  const [dragMode, setDragMode] = useState<DragMode>('on');
  const [showDragSettings, setShowDragSettings] = useState(false);
  const [liftMode, setLiftMode] = useState<LiftMode>('default');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('card');
  const [landingMode, setLandingMode] = useState<LandingMode>('dashed');
  const [delayMode, setDelayMode] = useState<DelayMode>('300ms');
  const [scrollMode, setScrollMode] = useState<ScrollMode>('normal');
  const [rulesMode, setRulesMode] = useState<RulesMode>('off');
  const [board, setBoard] = useState(initialBoard);
  const [lastEvent, setLastEvent] = useState('Long-press a card to drag it.');
  const nextId = useRef(1);

  // Same theme the board resolves, so the demo chrome matches it.
  const theme = useMemo(
    () =>
      createKanbanTheme(themeMode, {
        systemColorScheme: systemScheme === 'dark' ? 'dark' : 'light',
        density,
      }),
    [themeMode, systemScheme, density]
  );

  useEffect(() => {
    onSchemeChange?.(theme.scheme);
  }, [theme.scheme, onSchemeChange]);

  const columnTitle = useCallback(
    (id: KanbanColumn['id']) =>
      board.columns.find((column) => column.id === id)?.title ?? String(id),
    [board.columns]
  );

  const handleDragStart = useCallback(({ card }: CardDragStartEvent<Task>) => {
    setLastEvent(`Lifted “${card.title}”`);
  }, []);

  // Controlled board: apply each drop with moveCard.
  const handleDragEnd = useCallback(
    ({ card, source, destination }: CardDragEndEvent<Task>) => {
      setBoard((current) => moveCard(current, source, destination));
      const stayed =
        source.fromColumnId === destination.toColumnId &&
        source.fromPosition === destination.toPosition;
      setLastEvent(
        stayed
          ? `Put “${card.title}” back`
          : `Moved “${card.title}” to ${columnTitle(destination.toColumnId)}, position ${destination.toPosition + 1}`
      );
    },
    [columnTitle]
  );

  const handleCardPress = useCallback((card: Task) => {
    setLastEvent(`Tapped “${card.title}”`);
  }, []);

  const handleAddCard = useCallback((columnId: KanbanColumn['id']) => {
    const n = nextId.current++;
    setBoard((current) =>
      addCard(current, columnId, {
        id: `new-${n}`,
        title: `New card ${n}`,
        priority: 'low',
        tags: ['new'],
      })
    );
  }, []);

  const renderCard = useCallback(
    (task: Task, info: CardRenderInfo<KanbanColumn<Task>>) => (
      <TaskCard task={task} isDone={info.column.id === 'done'} />
    ),
    []
  );

  const renderCompactPreview = useCallback(
    (task: Task) => <CompactPreview task={task} />,
    []
  );
  const renderTintedPlaceholder = useCallback(() => <TintedPlaceholder />, []);

  const renderColumnFooter = useCallback(
    (column: KanbanColumn<Task>) => (
      <AddCardButton onPress={() => handleAddCard(column.id)} />
    ),
    [handleAddCard]
  );

  const chrome = chromeStyles(theme);

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { paddingTop: TOP_INSET }]}>
        <View style={styles.headerText}>
          <Text style={chrome.title}>react-native-kanban</Text>
          <Text style={chrome.subtitle}>v0.3 demo · {platformLabel}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showDragSettings }}
          testID="demo-drag-settings"
          onPress={() => setShowDragSettings((shown) => !shown)}
          style={[
            styles.settingsButton,
            {
              backgroundColor: showDragSettings
                ? theme.colors.accent
                : theme.colors.column,
            },
          ]}
        >
          <Text
            style={[
              chrome.segmentText,
              showDragSettings && { color: theme.colors.onAccent },
            ]}
          >
            Drag settings
          </Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.controlsScroll}
        contentContainerStyle={styles.controls}
      >
        <Segmented
          label="Theme"
          value={themeMode}
          options={['light', 'dark', 'auto']}
          onChange={setThemeMode}
          theme={theme}
        />
        <Segmented
          label="Density"
          value={density}
          options={['comfortable', 'compact']}
          onChange={setDensity}
          theme={theme}
        />
        <Segmented
          label="Columns"
          value={widthMode}
          options={['fixed', 'fullScreen']}
          onChange={setWidthMode}
          theme={theme}
        />
        <Segmented
          label="Height"
          value={heightMode}
          options={['content', 'fill']}
          onChange={setHeightMode}
          theme={theme}
        />
        <Segmented
          label="Drag"
          value={dragMode}
          options={['on', 'off']}
          onChange={setDragMode}
          theme={theme}
        />
        <Segmented
          label="Cards"
          value={cardMode}
          options={['custom', 'default']}
          onChange={setCardMode}
          theme={theme}
        />
      </ScrollView>

      {showDragSettings ? (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.controlsScroll, styles.dragControls]}
            contentContainerStyle={styles.controls}
            testID="demo-drag-panel"
          >
            <Segmented
              label="Lift"
              value={liftMode}
              options={['subtle', 'default', 'bold']}
              onChange={setLiftMode}
              theme={theme}
            />
            <Segmented
              label="Preview"
              value={previewMode}
              options={['card', 'compact']}
              onChange={setPreviewMode}
              theme={theme}
            />
            <Segmented
              label="Landing spot"
              value={landingMode}
              options={['dashed', 'tinted']}
              onChange={setLandingMode}
              theme={theme}
            />
            <Segmented
              label="Hold to drag"
              value={delayMode}
              options={['0ms', '150ms', '300ms', '600ms']}
              onChange={setDelayMode}
              theme={theme}
            />
            <Segmented
              label="Auto-scroll"
              value={scrollMode}
              options={['off', 'normal', 'fast']}
              onChange={setScrollMode}
              theme={theme}
            />
            <Segmented
              label="Rules"
              value={rulesMode}
              options={['off', 'on']}
              onChange={setRulesMode}
              theme={theme}
            />
          </ScrollView>
          {rulesMode === 'on' ? (
            <Text style={chrome.hint}>
              Cards in Done are locked. Review only takes cards from In
              progress.
            </Text>
          ) : null}
        </>
      ) : null}

      <Text style={chrome.hint} testID="demo-last-event" numberOfLines={1}>
        {lastEvent}
      </Text>

      <Board
        board={board}
        theme={themeMode}
        density={density}
        columnWidth={widthMode === 'fullScreen' ? 'fullScreen' : undefined}
        columnHeight={heightMode}
        renderCard={cardMode === 'custom' ? renderCard : undefined}
        renderColumnFooter={renderColumnFooter}
        onCardPress={handleCardPress}
        onCardDragStart={handleDragStart}
        onCardDragEnd={handleDragEnd}
        disableCardDrag={dragMode === 'off'}
        dragStyle={LIFT_STYLES[liftMode]}
        renderDragPreview={
          previewMode === 'compact' ? renderCompactPreview : undefined
        }
        renderPlaceholder={
          landingMode === 'tinted' ? renderTintedPlaceholder : undefined
        }
        dragActivationDelay={DELAYS[delayMode]}
        autoScroll={AUTO_SCROLL[scrollMode]}
        canDragCard={rulesMode === 'on' ? canDragTask : undefined}
        canDropCard={rulesMode === 'on' ? canDropTask : undefined}
      />
    </View>
  );
}

/** A custom card built with useKanbanTheme so it follows the board theme. */
function TaskCard({ task, isDone }: { task: Task; isDone: boolean }) {
  const theme = useKanbanTheme();
  const { colors, spacing, radius, typography, shadows } = theme;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderRadius: radius.card,
          padding: spacing.cardPadding,
        },
        shadows.card,
      ]}
    >
      <View style={styles.cardTitleRow}>
        <View
          style={[
            styles.priorityDot,
            { backgroundColor: PRIORITY_COLORS[task.priority] },
          ]}
        />
        <Text
          style={[
            typography.cardTitle,
            styles.cardTitle,
            { color: colors.cardTitle },
            isDone && styles.done,
          ]}
          numberOfLines={2}
        >
          {task.title}
        </Text>
      </View>
      {task.description ? (
        <Text
          style={[
            typography.cardDescription,
            { color: colors.cardDescription },
          ]}
          numberOfLines={2}
        >
          {task.description}
        </Text>
      ) : null}
      <View style={styles.cardFooter}>
        {task.tags?.map((tag) => (
          <View
            key={tag}
            style={[styles.tag, { backgroundColor: colors.countBadge }]}
          >
            <Text style={[styles.tagText, { color: colors.countBadgeText }]}>
              {tag}
            </Text>
          </View>
        ))}
        <View style={styles.spacer} />
        {task.assignee ? (
          <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
            <Text style={[styles.avatarText, { color: colors.onAccent }]}>
              {task.assignee}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** A small chip that follows the finger instead of the full card. */
function CompactPreview({ task }: { task: Task }) {
  const { colors, radius, shadows } = useKanbanTheme();
  return (
    <View
      testID="demo-compact-preview"
      style={[
        styles.compactPreview,
        {
          backgroundColor: colors.card,
          borderColor: colors.accent,
          borderRadius: radius.card,
        },
        shadows.cardDragging,
      ]}
    >
      <View
        style={[
          styles.priorityDot,
          { backgroundColor: PRIORITY_COLORS[task.priority] },
        ]}
      />
      <Text
        style={[styles.compactTitle, { color: colors.cardTitle }]}
        numberOfLines={1}
      >
        {task.title}
      </Text>
    </View>
  );
}

/** A tinted landing spot instead of the default dashed box. */
function TintedPlaceholder() {
  const { colors, radius } = useKanbanTheme();
  return (
    <View
      style={[
        styles.tintedPlaceholder,
        { backgroundColor: colors.placeholder, borderRadius: radius.card },
      ]}
    >
      <Text style={[styles.tintedText, { color: colors.accent }]}>
        Drop here
      </Text>
    </View>
  );
}

function AddCardButton({ onPress }: { onPress: () => void }) {
  const { colors, radius, spacing } = useKanbanTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.addCard,
        {
          borderRadius: radius.card,
          paddingVertical: spacing.cardPadding * 0.75,
          paddingHorizontal: spacing.cardPadding,
        },
        pressed && { backgroundColor: colors.placeholder },
      ]}
    >
      <Text style={[styles.addCardText, { color: colors.accent }]}>
        + Add card
      </Text>
    </Pressable>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  theme,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  theme: KanbanTheme;
}) {
  const chrome = chromeStyles(theme);
  return (
    <View style={styles.segmentGroup}>
      <Text style={chrome.segmentLabel}>{label}</Text>
      <View style={[styles.segment, { backgroundColor: theme.colors.column }]}>
        {options.map((option) => {
          const selected = option === value;
          return (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(option)}
              style={[
                styles.segmentOption,
                selected && { backgroundColor: theme.colors.accent },
              ]}
            >
              <Text
                style={[
                  chrome.segmentText,
                  selected && { color: theme.colors.onAccent },
                ]}
              >
                {option === 'fullScreen' ? 'full screen' : option}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const chromeStyles = (theme: KanbanTheme) => ({
  title: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: theme.colors.columnTitle,
  },
  subtitle: { marginTop: 2, color: theme.colors.cardDescription },
  hint: {
    paddingHorizontal: 16,
    paddingTop: 8,
    fontSize: 12,
    color: theme.colors.cardDescription,
  },
  segmentLabel: {
    marginBottom: 4,
    fontSize: 11,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    color: theme.colors.cardDescription,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: theme.colors.columnTitle,
  },
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerText: { flex: 1 },
  settingsButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  dragControls: { marginTop: 12 },
  compactPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1.5,
  },
  compactTitle: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  tintedPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tintedText: { fontSize: 13, fontWeight: '600' },
  controlsScroll: { flexGrow: 0 },
  controls: { paddingHorizontal: 16, gap: 16 },
  segmentGroup: {},
  segment: { flexDirection: 'row', borderRadius: 10, padding: 3 },
  segmentOption: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  card: { gap: 6 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1 },
  done: { textDecorationLine: 'line-through', opacity: 0.6 },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  tagText: { fontSize: 11, fontWeight: '600' },
  spacer: { flex: 1 },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 10, fontWeight: '700' },
  addCard: { alignItems: 'flex-start' },
  addCardText: { fontSize: 14, fontWeight: '600' },
});
