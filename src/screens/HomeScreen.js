import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Animated, PanResponder, Easing,
} from 'react-native';
import { tapLight, tapMedium } from '../haptics';
import { confirmAction } from '../confirm';
import ActivityEditModal from '../components/ActivityEditModal';
import { colors, getShadow, getTileColor, createThemedStyles } from '../theme';
import { greeting, todayKey, dayKey, friendlyDay } from '../date';

const GAP = 14;
const COLS = 3;
const MAX_W = 460;

function homeOf(index, cellW) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const pitch = cellW + GAP;
  return { x: col * pitch, y: row * pitch };
}

function syncOrderWithActivities(currentOrder, activities) {
  const ids = activities.map((item) => item.id);
  return [
    ...currentOrder.filter((id) => ids.includes(id)),
    ...ids.filter((id) => !currentOrder.includes(id)),
  ];
}

function ActivityButton({ activity, count, onPress, onLongPress }) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.spring(scale, { toValue: 0.9, useNativeDriver: true, speed: 40 }).start();
  };

  const pressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4 }).start();
  };

  return (
    <Pressable
      style={styles.cell}
      onPressIn={pressIn}
      onPressOut={pressOut}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
    >
      <Animated.View
        style={[styles.cardSquare, { backgroundColor: getTileColor(activity.color), transform: [{ scale }] }, getShadow()]}
      >
        {count > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{count}</Text>
          </View>
        )}
        <Text style={styles.emoji}>{activity.emoji}</Text>
        <Text style={styles.label} numberOfLines={1}>{activity.label}</Text>
      </Animated.View>
    </Pressable>
  );
}

function EditTile({ activity, cellW, wiggle, dragHandlers, isDragging, onEdit, onDelete }) {
  const wiggleRot = wiggle.interpolate({ inputRange: [-1, 1], outputRange: ['-2deg', '2deg'] });

  return (
    <Animated.View
      style={[
        styles.editTile,
        {
          width: cellW,
          height: cellW,
          zIndex: isDragging ? 10 : 1,
          transform: [{ rotate: wiggleRot }],
        },
      ]}
    >
      <Pressable style={[styles.cardFill, { backgroundColor: getTileColor(activity.color) }, getShadow()]} onPress={onEdit}>
        <Pressable style={styles.deleteBadge} onPress={onDelete} hitSlop={8}>
          <Text style={styles.deleteBadgeText}>✕</Text>
        </Pressable>
        <View style={styles.editGrip} {...dragHandlers}>
          <Text style={styles.editGripText}>☰</Text>
        </View>
        <Text style={styles.emoji}>{activity.emoji}</Text>
        <Text style={styles.label} numberOfLines={1}>{activity.label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function EditDragGrid({
  activities, cellW, wiggle, onReorder, onEdit, onDelete,
}) {
  const [order, setOrder] = useState(() => activities.map((item) => item.id));
  const actById = useRef({});
  const anims = useRef({}).current;
  const responders = useRef({}).current;
  const draggingId = useRef(null);
  const orderRef = useRef(order);
  const cellWRef = useRef(cellW);

  actById.current = {};
  for (const activity of activities) actById.current[activity.id] = activity;
  orderRef.current = order;
  cellWRef.current = cellW;

  useEffect(() => {
    setOrder((prev) => syncOrderWithActivities(prev, activities));
  }, [activities]);

  order.forEach((id, index) => {
    if (!anims[id]) anims[id] = new Animated.ValueXY(homeOf(index, cellW));
  });

  useEffect(() => {
    order.forEach((id, index) => {
      if (id === draggingId.current) return;
      Animated.spring(anims[id], {
        toValue: homeOf(index, cellW),
        useNativeDriver: false,
        friction: 9,
        tension: 90,
      }).start();
    });
  }, [order, cellW, anims]);

  const makeResponder = (id) => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      draggingId.current = id;
      tapMedium();
      const startIndex = orderRef.current.indexOf(id);
      anims[id].setOffset(homeOf(startIndex, cellWRef.current));
      anims[id].setValue({ x: 0, y: 0 });
    },
    onPanResponderMove: (_, gesture) => {
      anims[id].setValue({ x: gesture.dx, y: gesture.dy });
      const cw = cellWRef.current;
      const pitch = cw + GAP;
      const startIndex = orderRef.current.indexOf(id);
      const home = homeOf(startIndex, cw);
      const cx = home.x + gesture.dx + cw / 2;
      const cy = home.y + gesture.dy + cw / 2;
      let col = Math.floor(cx / pitch);
      let row = Math.floor(cy / pitch);
      if (col < 0) col = 0;
      if (col >= COLS) col = COLS - 1;
      if (row < 0) row = 0;
      let target = row * COLS + col;
      const total = orderRef.current.length;
      if (target < 0) target = 0;
      if (target > total - 1) target = total - 1;
      const current = orderRef.current.indexOf(id);
      if (target !== current) {
        const next = orderRef.current.slice();
        next.splice(current, 1);
        next.splice(target, 0, id);
        setOrder(next);
      }
    },
    onPanResponderRelease: () => {
      anims[id].flattenOffset();
      const finalIndex = orderRef.current.indexOf(id);
      Animated.spring(anims[id], {
        toValue: homeOf(finalIndex, cellWRef.current),
        useNativeDriver: false,
        friction: 8,
        tension: 90,
      }).start(() => {
        draggingId.current = null;
        onReorder(orderRef.current.slice());
      });
    },
    onPanResponderTerminate: () => {
      anims[id].flattenOffset();
      const finalIndex = orderRef.current.indexOf(id);
      Animated.spring(anims[id], {
        toValue: homeOf(finalIndex, cellWRef.current),
        useNativeDriver: false,
        friction: 8,
        tension: 90,
      }).start(() => {
        draggingId.current = null;
      });
    },
  });

  order.forEach((id) => {
    if (!responders[id]) responders[id] = makeResponder(id);
  });

  const rows = Math.ceil(order.length / COLS);
  const gridH = rows > 0 ? rows * (cellW + GAP) - GAP : 0;

  return (
    <View style={{ height: gridH }}>
      {order.map((id) => {
        const activity = actById.current[id];
        if (!activity) return null;
        const isDragging = draggingId.current === id;
        return (
          <Animated.View
            key={id}
            style={[
              styles.dragCell,
              {
                transform: [
                  { translateX: anims[id].x },
                  { translateY: anims[id].y },
                ],
              },
            ]}
          >
            <EditTile
              activity={activity}
              cellW={cellW}
              wiggle={wiggle}
              dragHandlers={responders[id].panHandlers}
              isDragging={isDragging}
              onEdit={() => onEdit(activity)}
              onDelete={() => onDelete(activity)}
            />
          </Animated.View>
        );
      })}
    </View>
  );
}

export default function HomeScreen({
  activities,
  logs,
  onRecord,
  onReorder,
  onAdd,
  onUpdate,
  onDelete,
  registerBack,
}) {
  const today = todayKey();
  const [editMode, setEditMode] = useState(false);
  const [cellW, setCellW] = useState(0);
  const [editing, setEditing] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    if (!registerBack) return;
    registerBack(() => {
      if (modalVisible) {
        setModalVisible(false);
        return true;
      }
      if (editMode) {
        setEditMode(false);
        return true;
      }
      return false;
    });
    return () => registerBack(null);
  }, [registerBack, editMode, modalVisible]);

  const wiggle = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!editMode) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wiggle, { toValue: 1, duration: 120, easing: Easing.linear, useNativeDriver: false }),
        Animated.timing(wiggle, { toValue: -1, duration: 240, easing: Easing.linear, useNativeDriver: false }),
        Animated.timing(wiggle, { toValue: 0, duration: 120, easing: Easing.linear, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      wiggle.setValue(0);
    };
  }, [editMode, wiggle]);

  const countMap = {};
  let todayTotal = 0;
  for (const log of logs) {
    if (dayKey(log.ts) === today) {
      countMap[log.activityId] = (countMap[log.activityId] || 0) + 1;
      todayTotal += 1;
    }
  }

  const onGridLayout = useCallback((e) => {
    const width = e.nativeEvent.layout.width;
    setCellW((width - GAP * (COLS - 1)) / COLS);
  }, []);

  const openCreate = () => {
    tapMedium();
    setEditing(null);
    setModalVisible(true);
  };

  const openEdit = (activity) => {
    tapLight();
    setEditing(activity);
    setModalVisible(true);
  };

  const handleDelete = (activity) => {
    confirmAction({
      title: '删除按钮',
      message: `删除「${activity.emoji} ${activity.label}」？已有的历史记录会保留。`,
      confirmText: '删除',
      destructive: true,
      onConfirm: () => onDelete(activity.id),
    });
  };

  const handleSave = (activity) => {
    if (activities.some((item) => item.id === activity.id)) onUpdate(activity);
    else onAdd(activity);
    setModalVisible(false);
  };

  const handleRecord = (activity) => {
    tapLight();
    onRecord(activity);
  };

  const rows = [];
  for (let i = 0; i < activities.length; i += COLS) rows.push(activities.slice(i, i + COLS));

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!editMode}
      >
        <Text style={styles.hello}>{greeting()}</Text>
        <View style={styles.subRow}>
          <Text style={styles.date}>{friendlyDay(today)} · 已记录 {todayTotal} 件事</Text>
          <Pressable onPress={() => setEditMode((prev) => !prev)} hitSlop={8}>
            <Text style={styles.sortBtn}>{editMode ? '完成' : '编辑'}</Text>
          </Pressable>
        </View>

        {activities.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🌱</Text>
            <Text style={styles.emptyText}>还没有按钮，点下面先加一个吧</Text>
          </View>
        ) : editMode ? (
          <>
            <Text style={styles.sortTip}>点卡片编辑 · 右上角删除 · 拖住 ☰ 排序</Text>
            <View onLayout={onGridLayout}>
              {cellW > 0 && (
                <EditDragGrid
                  activities={activities}
                  cellW={cellW}
                  wiggle={wiggle}
                  onReorder={onReorder}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                />
              )}
            </View>
          </>
        ) : (
          <View style={styles.grid}>
            {rows.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.row}>
                {row.map((activity) => (
                  <ActivityButton
                    key={activity.id}
                    activity={activity}
                    count={countMap[activity.id] || 0}
                    onPress={() => handleRecord(activity)}
                    onLongPress={() => setEditMode(true)}
                  />
                ))}
                {row.length < COLS && Array.from({ length: COLS - row.length }).map((_, index) => (
                  <View key={`sp-${index}`} style={styles.cell} />
                ))}
              </View>
            ))}
          </View>
        )}

        {editMode ? (
          <Pressable style={styles.addBtn} onPress={openCreate}>
            <Text style={styles.addBtnText}>＋ 新建按钮</Text>
          </Pressable>
        ) : (
          <Text style={styles.tip}>轻点按钮即可记录 · 长按或右上角可进入编辑</Text>
        )}
      </ScrollView>

      <ActivityEditModal
        visible={modalVisible}
        initial={editing}
        onClose={() => setModalVisible(false)}
        onSave={handleSave}
      />
    </View>
  );
}

const styles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: {
    padding: GAP,
    paddingTop: 8,
    paddingBottom: 40,
    width: '100%',
    maxWidth: MAX_W,
    alignSelf: 'center',
  },
  hello: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 4 },
  subRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  date: { fontSize: 14, color: colors.textSoft },
  sortBtn: { fontSize: 14, fontWeight: '800', color: colors.primary },
  sortTip: { fontSize: 13, color: colors.textSoft, marginBottom: 12 },
  grid: { gap: GAP },
  row: { flexDirection: 'row', gap: GAP },
  cell: { flex: 1 },
  dragCell: { position: 'absolute', top: 0, left: 0 },
  editTile: { position: 'absolute', top: 0, left: 0 },
  cardSquare: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardFill: {
    width: '100%',
    height: '100%',
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 40 },
  label: { marginTop: 8, fontSize: 14, fontWeight: '700', color: colors.text },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { fontSize: 12, fontWeight: '800', color: colors.text },
  deleteBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBadgeText: { fontSize: 12, fontWeight: '800', color: colors.danger },
  editGrip: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editGripText: { fontSize: 15, fontWeight: '800', color: colors.textSoft },
  addBtn: {
    marginTop: 18,
    backgroundColor: colors.primarySoft,
    borderRadius: 22,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  addBtnText: { fontSize: 16, fontWeight: '800', color: colors.primary },
  tip: { textAlign: 'center', color: colors.textSoft, fontSize: 12, marginTop: 26 },
  empty: { alignItems: 'center', marginTop: 60, marginBottom: 24 },
  emptyEmoji: { fontSize: 54, marginBottom: 12 },
  emptyText: { color: colors.textSoft, fontSize: 15 },
}));
