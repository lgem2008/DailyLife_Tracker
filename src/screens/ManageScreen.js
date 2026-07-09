import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
} from 'react-native';
import { confirmAction } from '../confirm';
import ActivityEditModal from '../components/ActivityEditModal';
import { colors, getShadow, createThemedStyles, getTileColor } from '../theme';

export default function ManageScreen({ activities, onAdd, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(null);
  const [visible, setVisible] = useState(false);

  const openNew = () => {
    setEditing(null);
    setVisible(true);
  };

  const openEdit = (activity) => {
    setEditing(activity);
    setVisible(true);
  };

  const handleSave = (activity) => {
    if (activities.some((item) => item.id === activity.id)) onUpdate(activity);
    else onAdd(activity);
    setVisible(false);
  };

  const confirmDelete = (activity) => {
    confirmAction({
      title: '删除按钮',
      message: `删除「${activity.emoji} ${activity.label}」？已有的历史记录会保留。`,
      confirmText: '删除',
      destructive: true,
      onConfirm: () => onDelete(activity.id),
    });
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>管理按钮</Text>
        <Text style={styles.sub}>这些按钮会显示在「记录」首页</Text>

        {activities.map((activity) => (
          <View key={activity.id} style={[styles.row, getShadow()]}>
            <View style={[styles.rowIcon, { backgroundColor: getTileColor(activity.color) }]}>
              <Text style={styles.rowEmoji}>{activity.emoji}</Text>
            </View>
            <Text style={styles.rowLabel}>{activity.label}</Text>
            <Pressable style={styles.rowBtn} onPress={() => openEdit(activity)}>
              <Text style={styles.rowBtnText}>编辑</Text>
            </Pressable>
            <Pressable style={styles.rowBtn} onPress={() => confirmDelete(activity)}>
              <Text style={[styles.rowBtnText, styles.rowBtnDanger]}>删除</Text>
            </Pressable>
          </View>
        ))}

        <Pressable style={styles.addBtn} onPress={openNew}>
          <Text style={styles.addBtnText}>＋ 新建按钮</Text>
        </Pressable>
      </ScrollView>

      <ActivityEditModal
        visible={visible}
        initial={editing}
        onClose={() => setVisible(false)}
        onSave={handleSave}
      />
    </View>
  );
}

const styles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 14, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 4 },
  sub: { fontSize: 14, color: colors.textSoft, marginBottom: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 12,
    marginBottom: 12,
  },
  rowIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowEmoji: { fontSize: 24 },
  rowLabel: { flex: 1, marginLeft: 14, fontSize: 16, fontWeight: '700', color: colors.text },
  rowBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  rowBtnText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  rowBtnDanger: { color: colors.danger },
  addBtn: {
    marginTop: 8,
    backgroundColor: colors.primarySoft,
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  addBtnText: { fontSize: 16, fontWeight: '800', color: colors.primary },
}));
