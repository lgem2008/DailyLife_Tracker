// 人体正面示意图：用圆角方块拼出躯干四肢，各测量点直接显示最新围度。
// 不依赖 svg，纯 View + 绝对定位，深浅色都跟主题走。
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { createThemedStyles, withAlpha } from '../theme';
import { select } from '../haptics';
import { fmtMeasure } from '../fitness/measures';

export const CANVAS_W = 232;
export const CANVAS_H = 348;

// 身体块：key 与测量部位对应（对应上时选中会高亮该块）
const SHAPES = [
  { key: 'head', left: 95, top: 0, w: 42, h: 42, r: 21 },
  { key: 'neck', left: 108, top: 40, w: 16, h: 15 },
  { key: 'chest', left: 70, top: 52, w: 92, h: 58, r: 20 },
  { key: 'waist', left: 78, top: 110, w: 76, h: 46, r: 14 },
  { key: 'hip', left: 72, top: 156, w: 88, h: 44, r: 18 },
  { key: 'armL', left: 44, top: 58, w: 22, h: 62, r: 11 },
  { key: 'forearmL', left: 46, top: 120, w: 18, h: 58, r: 9 },
  { key: 'armR', left: 166, top: 58, w: 22, h: 62, r: 11 },
  { key: 'forearmR', left: 168, top: 120, w: 18, h: 58, r: 9 },
  { key: 'thighL', left: 76, top: 198, w: 32, h: 74, r: 15 },
  { key: 'calfL', left: 80, top: 272, w: 25, h: 68, r: 12 },
  { key: 'thighR', left: 124, top: 198, w: 32, h: 74, r: 15 },
  { key: 'calfR', left: 127, top: 272, w: 25, h: 68, r: 12 },
];

// 测量点圆心坐标（相对画布左上角）
const HOTSPOTS = [
  // 中线四点自上而下依次排开：颈 → 肩 → 胸 → 腰 → 臀，互不重叠
  { key: 'neck', x: 116, y: 47 },
  { key: 'shoulder', x: 116, y: 69 },
  { key: 'chest', x: 116, y: 95 },
  { key: 'waist', x: 116, y: 132 },
  { key: 'hip', x: 116, y: 177 },
  { key: 'armL', x: 55, y: 86 },
  { key: 'armR', x: 177, y: 86 },
  { key: 'forearmL', x: 55, y: 148 },
  { key: 'forearmR', x: 177, y: 148 },
  { key: 'thighL', x: 92, y: 230 },
  { key: 'thighR', x: 140, y: 230 },
  { key: 'calfL', x: 92, y: 303 },
  { key: 'calfR', x: 139, y: 303 },
];

const PILL_W = 42;
const PILL_H = 20;

export default function BodyDiagram({ latest = {}, selected, onSelect }) {
  const pick = (key) => {
    select();
    if (onSelect) onSelect(key);
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.canvas, { width: CANVAS_W, height: CANVAS_H }]}>
        {SHAPES.map((s) => {
          const on = selected && (s.key === selected
            || (selected === 'shoulder' && s.key === 'chest'));
          return (
            <View
              key={s.key}
              pointerEvents="none"
              style={[
                styles.shape,
                on && styles.shapeOn,
                {
                  left: s.left, top: s.top, width: s.w, height: s.h,
                  borderRadius: s.r != null ? s.r : Math.min(s.w, s.h) / 2,
                },
              ]}
            />
          );
        })}

        {HOTSPOTS.map((h) => {
          const on = selected === h.key;
          const rec = latest[h.key];
          const has = !!rec;
          return (
            <Pressable
              key={h.key}
              onPress={() => pick(h.key)}
              hitSlop={8}
              style={[
                styles.pill,
                has && styles.pillHas,
                on && styles.pillOn,
                { left: h.x - PILL_W / 2, top: h.y - PILL_H / 2, width: PILL_W, height: PILL_H },
              ]}
            >
              <Text
                style={[styles.pillText, has && styles.pillTextHas, on && styles.pillTextOn]}
                numberOfLines={1}
              >
                {has ? fmtMeasure(rec.value) : '＋'}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>点身上的位置填围度 · 图为正面视角</Text>
    </View>
  );
}

const styles = createThemedStyles((c) => ({
  wrap: { alignItems: 'center', marginBottom: 12 },
  canvas: { position: 'relative' },
  shape: {
    position: 'absolute',
    backgroundColor: withAlpha(c.primary, 0.26),
    borderWidth: 1.5,
    borderColor: withAlpha(c.primary, 0.45),
  },
  shapeOn: {
    backgroundColor: withAlpha(c.primary, 0.5),
    borderColor: c.primary,
  },
  pill: {
    position: 'absolute',
    borderRadius: PILL_H / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.card,
    borderWidth: 1.5,
    borderColor: c.line,
  },
  pillHas: { borderColor: c.primary },
  pillOn: { backgroundColor: c.primary, borderColor: c.primary },
  pillText: { fontSize: 10, fontWeight: '900', color: c.textSoft },
  pillTextHas: { color: c.text },
  pillTextOn: { color: c.white },
  hint: { fontSize: 11, fontWeight: '700', color: c.textSoft, marginTop: 10 },
}));
