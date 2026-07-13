import React from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { select } from '../haptics';
import { colors } from '../theme';
import {
  DEFAULT_EXERCISE_MODE,
  clampNumber,
  formatStepValue,
} from './utils';
import styles from './styles';

function StageView({ children }) {
  return (
    <View style={{ flex: 1 }}>
      {children}
    </View>
  );
}

function SetRow({ index, set, onChange, onRemove, mode = DEFAULT_EXERCISE_MODE }) {
  const simpleOnly = !mode.weight && !mode.reps;
  return (
    <View style={styles.setRow}>
      {mode.sets && <Text style={styles.setNo}>{index + 1}</Text>}
      {mode.weight && (
        <>
          <TextInput
            style={styles.setInput}
            value={set.weight}
            onChangeText={(v) => onChange({ ...set, weight: v.replace(/[^0-9.]/g, '') })}
            placeholder="重量"
            placeholderTextColor={colors.textSoft}
            keyboardType="decimal-pad"
          />
          <Text style={styles.setUnit}>kg ×</Text>
        </>
      )}
      {mode.reps && (
        <>
          <TextInput
            style={styles.setInput}
            value={set.reps}
            onChangeText={(v) => onChange({ ...set, reps: v.replace(/[^0-9]/g, '') })}
            placeholder={mode.weight ? '次数' : '个数'}
            placeholderTextColor={colors.textSoft}
            keyboardType="number-pad"
          />
          {!mode.weight && <Text style={styles.setUnit}>个</Text>}
        </>
      )}
      {simpleOnly && <Text style={styles.setSimpleText}>{mode.sets ? '完成一组' : '完成'}</Text>}
      {mode.sets && (
        <Pressable style={styles.setDel} onPress={onRemove} hitSlop={8}>
          <Text style={styles.setDelText}>✕</Text>
        </Pressable>
      )}
    </View>
  );
}

function StepperField({ value, onChange, step, min = 0, placeholder, keyboardType, decimals = 0 }) {
  const bump = (dir) => {
    select();
    const next = clampNumber(value, min) + dir * step;
    onChange(formatStepValue(Math.max(min, next), decimals));
  };

  return (
    <View style={styles.stepper}>
      <Pressable style={styles.stepperBtn} onPress={() => bump(-1)} hitSlop={6}>
        <Text style={styles.stepperBtnText}>-</Text>
      </Pressable>
      <TextInput
        style={styles.stepperInput}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textSoft}
        keyboardType={keyboardType}
      />
      <Pressable style={styles.stepperBtn} onPress={() => bump(1)} hitSlop={6}>
        <Text style={styles.stepperBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

function QuickSetRow({ index, set, onChange, onRemove, mode = DEFAULT_EXERCISE_MODE }) {
  const simpleOnly = !mode.weight && !mode.reps;
  return (
    <View style={styles.quickSetRow}>
      {mode.sets && <Text style={styles.quickSetNo}>{index + 1}</Text>}
      {mode.weight && (
        <View style={styles.quickField}>
          <Text style={styles.quickLabel}>kg</Text>
          <StepperField
            value={set.weight}
            step={2.5}
            decimals={1}
            keyboardType="decimal-pad"
            placeholder="重量"
            onChange={(v) => onChange({ ...set, weight: v.replace(/[^0-9.]/g, '') })}
          />
        </View>
      )}
      {mode.reps && (
      <View style={styles.quickField}>
        <Text style={styles.quickLabel}>{mode.weight ? '次数' : '个数'}</Text>
        <StepperField
          value={set.reps}
          step={1}
          keyboardType="number-pad"
          placeholder={mode.weight ? '次数' : '个数'}
          onChange={(v) => onChange({ ...set, reps: v.replace(/[^0-9]/g, '') })}
        />
      </View>
      )}
      {simpleOnly && <Text style={styles.quickSimpleText}>{mode.sets ? '完成一组' : '完成'}</Text>}
      {mode.sets && (
        <Pressable style={styles.quickDel} onPress={onRemove} hitSlop={8}>
          <Text style={styles.quickDelText}>✕</Text>
        </Pressable>
      )}
    </View>
  );
}

export { StageView, SetRow, StepperField, QuickSetRow };
