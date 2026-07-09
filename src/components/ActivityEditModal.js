import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, Modal, Alert,
} from 'react-native';
import { colors, palette, emojiChoices, createThemedStyles } from '../theme';
import { useKeyboardHeight } from '../useKeyboard';
import { newId } from '../storage';

export default function ActivityEditModal({
  visible, initial, onClose, onSave,
}) {
  const [emoji, setEmoji] = useState(initial?.emoji || '⭐');
  const [label, setLabel] = useState(initial?.label || '');
  const [color, setColor] = useState(initial?.color || palette[0]);

  useEffect(() => {
    if (!visible) return;
    setEmoji(initial?.emoji || '⭐');
    setLabel(initial?.label || '');
    setColor(initial?.color || palette[Math.floor(Math.random() * palette.length)]);
  }, [visible, initial]);

  const kbHeight = useKeyboardHeight();

  const save = () => {
    const nextLabel = label.trim();
    if (!nextLabel) {
      Alert.alert('提示', '给这个按钮起个名字吧');
      return;
    }
    onSave({
      id: initial?.id || newId(),
      emoji,
      label: nextLabel,
      color,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, kbHeight > 0 && styles.sheetLifted, kbHeight > 0 && { paddingBottom: kbHeight + 20 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{initial ? '编辑按钮' : '新建按钮'}</Text>

          <View style={[styles.preview, { backgroundColor: color }]}>
            <Text style={styles.previewEmoji}>{emoji}</Text>
            <Text style={styles.previewLabel}>{label || '名字'}</Text>
          </View>

          <Text style={styles.fieldLabel}>名字</Text>
          <TextInput
            style={styles.input}
            value={label}
            onChangeText={setLabel}
            placeholder="例如：喝水、运动、读书"
            placeholderTextColor={colors.textSoft}
            maxLength={8}
          />

          <Text style={styles.fieldLabel}>选个 Emoji</Text>
          <ScrollView style={styles.emojiBox} contentContainerStyle={styles.emojiWrap}>
            {emojiChoices.map((item) => (
              <Pressable
                key={item}
                onPress={() => setEmoji(item)}
                style={[styles.emojiCell, emoji === item && styles.emojiCellOn]}
              >
                <Text style={styles.emojiCellText}>{item}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={styles.fieldLabel}>颜色</Text>
          <View style={styles.colorRow}>
            {palette.map((item) => (
              <Pressable
                key={item}
                onPress={() => setColor(item)}
                style={[
                  styles.colorDot,
                  { backgroundColor: item },
                  color === item && styles.colorDotOn,
                ]}
              />
            ))}
          </View>

          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.btnGhost]} onPress={onClose}>
              <Text style={styles.btnGhostText}>取消</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnPrimary]} onPress={save}>
              <Text style={styles.btnPrimaryText}>保存</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = createThemedStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 34,
    maxHeight: '90%',
  },
  sheetLifted: { maxHeight: '100%' },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.line,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 16 },
  preview: {
    alignSelf: 'center',
    width: 110,
    height: 110,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  previewEmoji: { fontSize: 40 },
  previewLabel: { marginTop: 6, fontSize: 14, fontWeight: '700', color: colors.text },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: colors.textSoft, marginBottom: 8, marginTop: 4 },
  input: {
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    marginBottom: 14,
  },
  emojiBox: { maxHeight: 150, marginBottom: 14 },
  emojiWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  emojiCell: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  emojiCellOn: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  emojiCellText: { fontSize: 24 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  colorDot: { width: 34, height: 34, borderRadius: 17 },
  colorDotOn: { borderWidth: 3, borderColor: colors.text },
  actions: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  btnGhost: { backgroundColor: colors.card },
  btnGhostText: { fontSize: 16, fontWeight: '700', color: colors.textSoft },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { fontSize: 16, fontWeight: '800', color: colors.white },
}));
