import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { timeAgo, type Message, type Role } from '@saanpaw/shared';
import { theme } from '@/constants/theme';
import { Avatar } from '@/components/ui';

export interface ChatParty {
  name: string;
  photoUrl?: string;
  color?: string;
  /** Icon shown when there is no picture (e.g. "home" for a shelter); initials otherwise. */
  icon?: keyof typeof Ionicons.glyphMap;
}

/**
 * One conversation, laid out like a chat: the other side's messages on the left with their
 * profile picture, yours on the right, newest at the bottom (scrolled into view), and a reply box
 * with a send button. Used by both the user's and the shelter's message screens.
 */
export function ChatThread({
  messages,
  myRole,
  other,
  onSend,
  placeholder = 'Type a message…',
}: {
  messages: Message[];
  myRole: Role;
  other: ChatParty;
  onSend: (body: string) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const scroll = useRef<ScrollView>(null);

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    onSend(body);
    setDraft('');
  };

  return (
    <View style={{ gap: theme.spacing(1) }}>
      <ScrollView
        ref={scroll}
        style={styles.list}
        contentContainerStyle={{ gap: 6, paddingVertical: 4 }}
        nestedScrollEnabled
        // Open on the newest message, and follow new ones as they arrive.
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
      >
        {messages.map((m, i) => {
          const mine = m.senderRole === myRole;
          // The picture marks the start of a run of their messages, not every bubble.
          const firstOfRun = i === 0 || messages[i - 1].senderRole !== m.senderRole;
          return (
            <View key={m.id} style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
              {!mine ? (
                <View style={styles.avatarSlot}>
                  {firstOfRun ? (
                    <Avatar name={other.name} uri={other.photoUrl} color={other.color} icon={other.icon} size={30} />
                  ) : null}
                </View>
              ) : null}
              <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                {!mine && firstOfRun ? <Text style={styles.sender}>{m.senderName}</Text> : null}
                <Text style={[styles.body, mine && { color: theme.colors.onPrimary }]}>{m.body}</Text>
                <Text style={[styles.time, mine && { color: 'rgba(255,255,255,0.75)' }]}>{timeAgo(m.sentAt)}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
          multiline
        />
        <Pressable
          onPress={send}
          disabled={!draft.trim()}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          style={({ pressed }) => [styles.sendButton, !draft.trim() && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="send" size={18} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { maxHeight: 340 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  avatarSlot: { width: 30 },
  bubble: { maxWidth: '78%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, gap: 2 },
  mine: { backgroundColor: theme.colors.primary, borderBottomRightRadius: 4 },
  theirs: { backgroundColor: theme.colors.surfaceAlt, borderBottomLeftRadius: 4 },
  sender: { ...theme.type.tiny, color: theme.colors.textSoft },
  body: { ...theme.type.body, color: theme.colors.text },
  time: { fontSize: 10, color: theme.colors.muted },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 22,
    paddingLeft: 14,
    paddingRight: 5,
    paddingVertical: 5,
    backgroundColor: theme.colors.surface,
  },
  input: { flex: 1, ...theme.type.body, color: theme.colors.text, maxHeight: 110, paddingVertical: 6 },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
