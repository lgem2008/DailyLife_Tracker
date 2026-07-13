import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { colors, createThemedStyles } from '../theme';
import { monthGrid, monthLabel, WEEK_SHORT } from '../date';
import { select } from '../haptics';

// 共用小日历：点某天回调 YYYY-MM-DD；可选 minKey / maxKey 禁用范围外日期
export default function MiniCalendar({
  selected,
  onPick,
  minKey,
  maxKey,
  withHaptics = false,
}) {
  const initY = Number((selected || '').slice(0, 4)) || new Date().getFullYear();
  const initM = (Number((selected || '').slice(5, 7)) || (new Date().getMonth() + 1)) - 1;
  const [y, setY] = useState(initY);
  const [m, setM] = useState(initM);

  // 外部 selected 跨月时，跟着跳到对应月份
  useEffect(() => {
    if (!selected || selected.length < 7) return;
    const nextY = Number(selected.slice(0, 4));
    const nextM = Number(selected.slice(5, 7)) - 1;
    if (!Number.isFinite(nextY) || !Number.isFinite(nextM)) return;
    if (nextY !== y || nextM !== m) {
      setY(nextY);
      setM(nextM);
    }
    // 仅响应 selected 变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const cells = monthGrid(y, m);
  const prev = () => {
    if (m === 0) { setY(y - 1); setM(11); }
    else setM(m - 1);
  };
  const next = () => {
    if (m === 11) { setY(y + 1); setM(0); }
    else setM(m + 1);
  };

  return (
    <View style={styles.calBox}>
      <View style={styles.calHead}>
        <Pressable onPress={prev} hitSlop={8} style={styles.calNav}>
          <Text style={styles.calNavText}>‹</Text>
        </Pressable>
        <Text style={styles.calMonth}>{monthLabel(y, m)}</Text>
        <Pressable onPress={next} hitSlop={8} style={styles.calNav}>
          <Text style={styles.calNavText}>›</Text>
        </Pressable>
      </View>
      <View style={styles.calWeekRow}>
        {WEEK_SHORT.map((w, i) => (
          <Text
            key={w}
            style={[styles.calWeekCell, (i === 0 || i === 6) && { color: colors.primary }]}
          >
            {w}
          </Text>
        ))}
      </View>
      <View style={styles.calGrid}>
        {cells.map((c, i) => {
          if (!c.inMonth) return <View key={i} style={styles.calCell} />;
          const sel = c.key === selected;
          const disabled = (minKey && c.key < minKey) || (maxKey && c.key > maxKey);
          return (
            <Pressable
              key={i}
              style={styles.calCell}
              disabled={disabled}
              onPress={() => {
                if (withHaptics) select();
                onPick(c.key);
              }}
            >
              <View style={[styles.calDay, sel && styles.calDaySel, disabled && styles.calDayDisabled]}>
                <Text style={[
                  styles.calDayText,
                  sel && styles.calDayTextSel,
                  disabled && styles.calDayTextDisabled,
                ]}
                >
                  {c.day}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = createThemedStyles((colors) => ({
  // 用 card 保证在页面底色 / 弹层底色上都有对比
  calBox: { backgroundColor: colors.card, borderRadius: 16, padding: 12 },
  calHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  calNav: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  calNavText: { fontSize: 18, color: colors.primary, fontWeight: '800' },
  calMonth: { fontSize: 15, fontWeight: '800', color: colors.text },
  calWeekRow: { flexDirection: 'row', marginBottom: 6 },
  calWeekCell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    color: colors.textSoft,
    fontWeight: '700',
  },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calDay: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calDaySel: { backgroundColor: colors.primary },
  calDayDisabled: { opacity: 0.35 },
  calDayText: { fontSize: 13, color: colors.text, fontWeight: '700' },
  calDayTextSel: { color: colors.white },
  calDayTextDisabled: { color: colors.textSoft },
}));
