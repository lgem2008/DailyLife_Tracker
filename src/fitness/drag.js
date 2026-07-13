import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, Easing, PanResponder } from 'react-native';
import { select } from '../haptics';
import { getShadow, getTileColor, getTileBadgeColor } from '../theme';
import {
  ROW_STRIDE,
  PART_ROW_STRIDE,
} from './utils';
import { Sparkline } from './charts';
import styles from './styles';

function DraggableRow({
  name, index, editMode, isActive, dragIdx, listLen,
  onGripStart, onGripSwap, onGripEnd, onPress, onDelete, count, progress,
  onEnterEditMode,
}) {
  const translateY = useRef(new Animated.Value(0)).current;
  const startY = useRef(0);
  const currentIndex = useRef(index);
  const prevIndex = useRef(index);
  const timer = useRef(null);
  const dragging = useRef(false);
  const moved = useRef(false);

  // 被顶开的行：从旧位置 spring 平滑滑到新位置（和网格一致的让位动画）
  useEffect(() => {
    if (isActive) {
      prevIndex.current = index;
      currentIndex.current = index;
      return;
    }
    const delta = prevIndex.current - index;
    prevIndex.current = index;
    currentIndex.current = index;
    if (delta !== 0) {
      translateY.setValue(delta * ROW_STRIDE);
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 9, tension: 90 }).start();
    }
  }, [index, isActive, translateY]);

  // 拖动结束后归位
  useEffect(() => {
    if (isActive) return;
    if (dragIdx === null || dragIdx === undefined) {
      Animated.timing(translateY, { toValue: 0, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }
  }, [dragIdx, isActive, translateY]);

  const clearHold = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const beginDrag = () => {
    // 非编辑模式：长按进入编辑模式（不拖动）；编辑模式：长按开始拖动排序
    if (!editMode) {
      moved.current = true; // 阻止松手后触发点击
      select();
      onEnterEditMode();
      return;
    }
    if (listLen <= 1) return;
    dragging.current = true;
    select();
    onGripStart(index);
  };

  const handleResponderGrant = (e) => {
    startY.current = e.nativeEvent.pageY;
    moved.current = false;
    dragging.current = false;
    translateY.setValue(0);
    clearHold();
    timer.current = setTimeout(beginDrag, 260);
  };

  const handleResponderMove = (e) => {
    const dy = e.nativeEvent.pageY - startY.current;
    if (!dragging.current) {
      if (Math.abs(dy) > 8) {
        moved.current = true;
        clearHold();
      }
      return;
    }

    translateY.setValue(dy);
    const half = ROW_STRIDE / 2;
    if (dy > half && currentIndex.current < listLen - 1) {
      onGripSwap(currentIndex.current, currentIndex.current + 1);
      currentIndex.current += 1;
      startY.current += ROW_STRIDE;
      translateY.setValue(dy - ROW_STRIDE);
    } else if (dy < -half && currentIndex.current > 0) {
      onGripSwap(currentIndex.current, currentIndex.current - 1);
      currentIndex.current -= 1;
      startY.current -= ROW_STRIDE;
      translateY.setValue(dy + ROW_STRIDE);
    }
  };

  const springHome = () => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      friction: 8,
      tension: 90,
    }).start();
  };

  const handleResponderEnd = () => {
    clearHold();
    if (dragging.current) {
      springHome();
      dragging.current = false;
      onGripEnd();
      return;
    }
    if (!moved.current) onPress();
  };

  // 被 ScrollView 抢走手势时：只做清理，不触发点击，避免误触
  const handleResponderTerminate = () => {
    clearHold();
    if (dragging.current) {
      springHome();
      dragging.current = false;
      onGripEnd();
    }
  };

  return (
    <Animated.View
      style={[
        styles.exRow,
        getShadow(),
        isActive && styles.exRowMoving,
        { transform: [{ translateY }], zIndex: isActive ? 10 : 1 },
      ]}
    >
      <View
        style={styles.exTap}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => dragging.current}
        onResponderGrant={handleResponderGrant}
        onResponderMove={handleResponderMove}
        onResponderRelease={handleResponderEnd}
        onResponderTerminate={handleResponderTerminate}
      >
        <View style={styles.exMain}>
          <Text style={styles.exName} numberOfLines={1}>{name}</Text>
          {progress?.detail && !editMode && <Text style={styles.exProgressDetail} numberOfLines={1}>{progress.detail}</Text>}
        </View>
        {!editMode && (
          progress ? (
            <View style={styles.exProgress}>
              {Array.isArray(progress.spark) && progress.spark.length >= 2 && (
                <Sparkline values={progress.spark} width={52} height={20} />
              )}
              <Text style={styles.exProgressMain} numberOfLines={1}>{progress.main}</Text>
              <Text style={styles.exProgressSub} numberOfLines={1}>{progress.sub}</Text>
            </View>
          ) : (
            count > 0 && <Text style={styles.exCnt}>{count} 次</Text>
          )
        )}
      </View>
      {editMode && (
        <Pressable style={styles.exDel} onPress={onDelete} hitSlop={8}>
          <Text style={styles.exDelText}>✕</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

function ExerciseGridTile({ name, width, count, progress, part, dragging }) {
  return (
    <View
      style={[styles.exerciseTile, getShadow(), { width }, dragging && styles.tileDragging]}
    >
      <Text style={styles.exerciseTileEmoji}>{part.emoji}</Text>
      <Text style={styles.exerciseTileName} numberOfLines={2}>{name}</Text>
      {progress ? (
        <View style={styles.exerciseTileMeta}>
          <Text style={styles.exerciseTileMain} numberOfLines={1}>{progress.main}</Text>
          <Text style={styles.exerciseTileSub} numberOfLines={1}>{progress.sub}</Text>
        </View>
      ) : (
        <Text style={styles.exerciseTileSub}>{count > 0 ? `${count} 次` : '未记录'}</Text>
      )}
    </View>
  );
}

function PartGridTile({ part, width, dragging }) {
  return (
    <View
      style={[styles.partTile, getShadow(), { width, backgroundColor: getTileColor(part.color) }, dragging && styles.tileDragging]}
    >
      <Text style={styles.partTileEmoji}>{part.emoji}</Text>
      <Text style={styles.partTileLabel} numberOfLines={1}>{part.label}</Text>
    </View>
  );
}

// 通用网格：长按触发二维拖动排序，未触发时轻点即 onPress
function DragGrid({ items, keyOf, cols, tileWidth, gap, onReorder, onPressItem, renderTile, onDragStateChange }) {
  const [order, setOrder] = useState(() => items.map(keyOf));
  const [draggingKey, setDraggingKey] = useState(null);
  const itemByKey = useRef({});
  const anims = useRef({}).current;
  const orderRef = useRef(order);
  const draggingKeyRef = useRef(null);
  const geomRef = useRef({ cols, tileWidth, gap });

  itemByKey.current = {};
  for (const it of items) itemByKey.current[keyOf(it)] = it;
  orderRef.current = order;
  geomRef.current = { cols, tileWidth, gap };

  const stride = tileWidth + gap;
  const homeOf = useCallback((index, geom) => {
    const g = geom || geomRef.current;
    const col = index % g.cols;
    const row = Math.floor(index / g.cols);
    const pitch = g.tileWidth + g.gap;
    return { x: col * pitch, y: row * pitch };
  }, []);

  // 同步外部 items 的增删（保持已有顺序，新增追加、删除移除）
  useEffect(() => {
    setOrder((prev) => {
      const keys = items.map(keyOf);
      const kept = prev.filter((k) => keys.includes(k));
      const added = keys.filter((k) => !prev.includes(k));
      return [...kept, ...added];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  order.forEach((k, index) => {
    if (!anims[k]) anims[k] = new Animated.ValueXY(homeOf(index));
  });

  useEffect(() => {
    order.forEach((k, index) => {
      if (k === draggingKeyRef.current) return;
      Animated.spring(anims[k], {
        toValue: homeOf(index),
        useNativeDriver: false,
        friction: 9,
        tension: 90,
      }).start();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, cols, tileWidth, gap]);

  const respondersRef = useRef({});
  const holdTimer = useRef(null);

  const makeResponder = (k) => {
    const clearHold = () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      holdTimer.current = null;
    };
    let didDrag = false;
    let moved = false;
    let startHome = { x: 0, y: 0 };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => didDrag,
      onPanResponderGrant: () => {
        didDrag = false;
        moved = false;
        clearHold();
        holdTimer.current = setTimeout(() => {
          didDrag = true;
          select();
          draggingKeyRef.current = k;
          setDraggingKey(k);
          if (onDragStateChange) onDragStateChange(true);
          const startIndex = orderRef.current.indexOf(k);
          startHome = homeOf(startIndex);
          anims[k].setOffset(startHome);
          anims[k].setValue({ x: 0, y: 0 });
        }, 240);
      },
      onPanResponderMove: (_, gesture) => {
        if (!didDrag) {
          if (Math.abs(gesture.dx) > 8 || Math.abs(gesture.dy) > 8) {
            moved = true;
            clearHold();
          }
          return;
        }
        anims[k].setValue({ x: gesture.dx, y: gesture.dy });
        const geom = geomRef.current;
        const pitch = geom.tileWidth + geom.gap;
        // 用拖动起始位置（offset 固定为它）+ 手指位移算屏幕中心，
        // 不能用当前索引重算 home，否则重排后 home 跳格会跨过中间列
        const cx = startHome.x + gesture.dx + geom.tileWidth / 2;
        const cy = startHome.y + gesture.dy + geom.tileWidth / 2;
        let col = Math.floor(cx / pitch);
        let row = Math.floor(cy / pitch);
        if (col < 0) col = 0;
        if (col >= geom.cols) col = geom.cols - 1;
        if (row < 0) row = 0;
        let target = row * geom.cols + col;
        const total = orderRef.current.length;
        if (target < 0) target = 0;
        if (target > total - 1) target = total - 1;
        const current = orderRef.current.indexOf(k);
        if (target !== current) {
          const next = orderRef.current.slice();
          next.splice(current, 1);
          next.splice(target, 0, k);
          setOrder(next);
        }
      },
      onPanResponderRelease: () => {
        clearHold();
        if (!didDrag) {
          if (!moved) onPressItem(itemByKey.current[k]);
          return;
        }
        anims[k].flattenOffset();
        const finalIndex = orderRef.current.indexOf(k);
        Animated.spring(anims[k], {
          toValue: homeOf(finalIndex),
          useNativeDriver: false,
          friction: 8,
          tension: 90,
        }).start(() => {
          draggingKeyRef.current = null;
          setDraggingKey(null);
          if (onDragStateChange) onDragStateChange(false);
          onReorder(orderRef.current.slice());
        });
      },
      onPanResponderTerminate: () => {
        clearHold();
        if (!didDrag) return;
        anims[k].flattenOffset();
        const finalIndex = orderRef.current.indexOf(k);
        Animated.spring(anims[k], {
          toValue: homeOf(finalIndex),
          useNativeDriver: false,
          friction: 8,
          tension: 90,
        }).start(() => {
          draggingKeyRef.current = null;
          setDraggingKey(null);
          if (onDragStateChange) onDragStateChange(false);
        });
      },
    });
  };

  order.forEach((k) => {
    if (!respondersRef.current[k]) respondersRef.current[k] = makeResponder(k);
  });

  const rows = Math.ceil(order.length / cols);
  const gridH = rows > 0 ? rows * stride - gap : 0;

  return (
    <View style={{ height: gridH, marginBottom: 6 }}>
      {order.map((k) => {
        const item = itemByKey.current[k];
        if (!item) return null;
        const isDragging = draggingKey === k;
        return (
          <Animated.View
            key={k}
            style={{
              position: 'absolute',
              width: tileWidth,
              transform: [{ translateX: anims[k].x }, { translateY: anims[k].y }],
              zIndex: isDragging ? 10 : 1,
            }}
            {...respondersRef.current[k].panHandlers}
          >
            {renderTile(item, isDragging)}
          </Animated.View>
        );
      })}
    </View>
  );
}

function DraggablePartRow({ part, index, listLen, isActive, dragIdx, onPress, onDragStart, onDragSwap, onDragEnd }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const startY = useRef(0);
  const currentIndex = useRef(index);
  const prevIndex = useRef(index);
  const timer = useRef(null);
  const dragging = useRef(false);
  const moved = useRef(false);

  // 被顶开的行：从旧位置 spring 平滑滑到新位置（和网格一致的让位动画）
  useEffect(() => {
    if (isActive) {
      prevIndex.current = index;
      currentIndex.current = index;
      return;
    }
    const delta = prevIndex.current - index;
    prevIndex.current = index;
    currentIndex.current = index;
    if (delta !== 0) {
      translateY.setValue(delta * PART_ROW_STRIDE);
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 9, tension: 90 }).start();
    }
  }, [index, isActive, translateY]);

  // 拖动结束后归位
  useEffect(() => {
    if (isActive) return;
    if (dragIdx === null || dragIdx === undefined) {
      Animated.timing(translateY, { toValue: 0, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }
  }, [dragIdx, isActive, translateY]);

  const clearHold = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const beginDrag = () => {
    dragging.current = true;
    select();
    onDragStart(index);
  };

  const handleGrant = (e) => {
    startY.current = e.nativeEvent.pageY;
    moved.current = false;
    dragging.current = false;
    translateY.setValue(0);
    clearHold();
    timer.current = setTimeout(beginDrag, 260);
  };

  const handleMove = (e) => {
    const dy = e.nativeEvent.pageY - startY.current;
    if (!dragging.current) {
      if (Math.abs(dy) > 8) {
        moved.current = true;
        clearHold();
      }
      return;
    }

    translateY.setValue(dy);
    const half = PART_ROW_STRIDE / 2;
    if (dy > half && currentIndex.current < listLen - 1) {
      onDragSwap(currentIndex.current, currentIndex.current + 1);
      currentIndex.current += 1;
      startY.current += PART_ROW_STRIDE;
      translateY.setValue(dy - PART_ROW_STRIDE);
    } else if (dy < -half && currentIndex.current > 0) {
      onDragSwap(currentIndex.current, currentIndex.current - 1);
      currentIndex.current -= 1;
      startY.current -= PART_ROW_STRIDE;
      translateY.setValue(dy + PART_ROW_STRIDE);
    }
  };

  const springHome = () => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      friction: 8,
      tension: 90,
    }).start();
  };

  const handleEnd = () => {
    clearHold();
    if (dragging.current) {
      springHome();
      dragging.current = false;
      onDragEnd();
      return;
    }
    if (!moved.current) onPress();
  };

  // 被 ScrollView 抢走手势时：只做清理，不触发点击，避免误触
  const handleTerminate = () => {
    clearHold();
    if (dragging.current) {
      springHome();
      dragging.current = false;
      onDragEnd();
    }
  };

  return (
    <Animated.View
      style={[
        styles.partRow,
        { backgroundColor: getTileColor(part.color) },
        getShadow(),
        isActive && styles.partRowMoving,
        { transform: [{ translateY }], zIndex: isActive ? 10 : 1 },
      ]}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => dragging.current}
      onResponderGrant={handleGrant}
      onResponderMove={handleMove}
      onResponderRelease={handleEnd}
      onResponderTerminate={handleTerminate}
    >
      <Text style={styles.partEmoji}>{part.emoji}</Text>
      <Text style={styles.partLabel}>{part.label}</Text>
    </Animated.View>
  );
}

export {
  DraggableRow,
  ExerciseGridTile,
  PartGridTile,
  DragGrid,
  DraggablePartRow,
};
