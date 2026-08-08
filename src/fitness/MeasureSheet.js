// 身体维度记录面板：人体图选位置 → 填围度 → 看历史对比
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { colors, getShadow } from '../theme';
import { dayKey, todayKey, friendlyDay } from '../date';
import { useKeyboardHeight } from '../useKeyboard';
import { MEASURE_SITES } from '../storage';
import MiniCalendar from '../components/MiniCalendar';
import BodyDiagram from '../components/BodyDiagram';
import { StepperField } from './fields';
import { TrendChart } from './charts';
import {
  MEASURE_UNIT,
  SITE_MAP,
  fmtMeasure,
  latestBySite,
  siteSummary,
  siteSeries,
  deltaLabel,
  deltaTone,
} from './measures';
import styles from './styles';

export default function MeasureSheet({
  measures = [],
  site,
  onChangeSite,
  value,
  onChangeValue,
  dateKey: dKey,
  onChangeDate,
  onSave,
  onDelete,
  onClose,
}) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const kbHeight = useKeyboardHeight();
  const maxDate = todayKey();

  const latest = useMemo(() => latestBySite(measures), [measures]);
  const summary = useMemo(() => (site ? siteSummary(measures, site) : null), [measures, site]);
  const series = useMemo(() => (site ? siteSeries(measures, site) : []), [measures, site]);
  const meta = site ? SITE_MAP[site] : null;
  const canSave = !!site && String(value || '').trim().length > 0 && Number(value) > 0;

  return (
    <View style={styles.sheetOverlay}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={styles.sheetKeyboard}>
        <View style={[
          styles.sheetCard, styles.bwSheetCard,
          kbHeight > 0 && styles.sheetCardLifted,
          kbHeight > 0 && { paddingBottom: kbHeight + 12 },
          getShadow(),
        ]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>身体维度</Text>
              <Text style={styles.sheetSub}>点人体图上的位置，记一圈围度</Text>
            </View>
            <Pressable style={styles.sheetClose} onPress={onClose} hitSlop={8}>
              <Text style={styles.sheetCloseText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.bwSheetScroll}
            contentContainerStyle={styles.sheetScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <BodyDiagram latest={latest} selected={site} onSelect={onChangeSite} />

            <Pressable style={styles.datePickBtn} onPress={() => setShowDatePicker((v) => !v)}>
              <Text style={styles.datePickLabel}>日期</Text>
              <Text style={styles.datePickText}>{friendlyDay(dKey)}</Text>
              <Text style={styles.datePickArrow}>{showDatePicker ? '▲' : '▼'}</Text>
            </Pressable>
            {showDatePicker && (
              <View style={styles.sheetCalendarWrap}>
                <MiniCalendar
                  selected={dKey}
                  maxKey={maxDate}
                  withHaptics
                  onPick={(key) => {
                    onChangeDate(key);
                    setShowDatePicker(false);
                  }}
                />
              </View>
            )}

            {site ? (
              <View style={styles.measureInputBox}>
                <Text style={styles.quickLabel}>{meta?.label} {MEASURE_UNIT}</Text>
                <StepperField
                  value={value}
                  step={meta?.step || 0.5}
                  decimals={1}
                  keyboardType="decimal-pad"
                  placeholder={meta?.label}
                  onChange={(v) => onChangeValue(v.replace(/[^0-9.]/g, ''))}
                />
                {summary && (
                  <View style={styles.bwStatsRow}>
                    <Text style={styles.bwLast}>
                      最新 {fmtMeasure(summary.last.value)}{MEASURE_UNIT}
                    </Text>
                    {summary.delta != null && (
                      <Text style={[styles.bwDelta, { color: deltaTone(summary.delta, summary.goal, colors) }]}>
                        近次 {deltaLabel(summary.delta)}
                      </Text>
                    )}
                    {summary.total != null && (
                      <Text style={[styles.bwDelta, { color: deltaTone(summary.total, summary.goal, colors) }]}>
                        累计 {deltaLabel(summary.total)}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            ) : (
              <Text style={styles.recordSimpleHint}>先点上面的人体图选一个位置</Text>
            )}

            <Text style={styles.measureListTitle}>各处围度</Text>
            <View style={styles.measureList}>
              {MEASURE_SITES.map((s) => {
                const sum = siteSummary(measures, s.key);
                const on = site === s.key;
                const dl = sum ? deltaLabel(sum.delta) : null;
                return (
                  <Pressable
                    key={s.key}
                    style={[styles.measureRow, on && styles.measureRowOn]}
                    onPress={() => onChangeSite(s.key)}
                  >
                    <Text style={styles.measureRowName} numberOfLines={1}>{s.label}</Text>
                    <Text style={styles.measureRowVal}>
                      {sum ? `${fmtMeasure(sum.last.value)}${MEASURE_UNIT}` : '—'}
                    </Text>
                    {!!dl && (
                      <Text style={[styles.measureRowDelta, { color: deltaTone(sum.delta, s.goal, colors) }]}>
                        {dl}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>

            {summary && (
              <View style={styles.bwSheetHistory}>
                <TrendChart
                  data={series}
                  label={`${meta?.label} 趋势`}
                  unit={MEASURE_UNIT}
                />
                <Text style={styles.bwHistTitle}>{meta?.label} 历史</Text>
                {summary.all.slice().reverse().map((m) => (
                  <View key={m.id} style={styles.bwItem}>
                    <Text style={styles.bwItemDay}>{friendlyDay(dayKey(m.ts))}</Text>
                    <Text style={styles.bwItemVal}>{fmtMeasure(m.value)}{MEASURE_UNIT}</Text>
                    <Pressable onPress={() => onDelete(m.id)} hitSlop={6}>
                      <Text style={styles.bwItemDel}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          <Pressable
            style={[styles.sheetSave, canSave && styles.sheetSaveActive]}
            disabled={!canSave}
            onPress={onSave}
          >
            <Text style={[styles.sheetSaveText, !canSave && styles.saveBtnTextDisabled]}>
              {site ? `保存${meta?.label}` : '选个位置'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
