import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/constants/theme';
import {
  Avatar,
  Banner,
  Button,
  Card,
  Caption,
  EmptyState,
  Field,
  Row,
  Screen,
  SectionHeader,
} from '@/components/ui';
import { timeAgo } from '@/components/domain';
import { useApp } from '@saanpaw/shared';

/** Shelter Admin Module - Chat with owners about their reports. */
export function MessagesScreen() {
  const { conversations, currentShelter, messagesIn, sendMessage, reportById, markConversationRead } = useApp();
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const threads = conversations
    .filter((c) => c.shelterId === currentShelter.id)
    .sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt));

  const unreadTotal = threads.reduce((s, c) => s + c.unreadForShelter, 0);

  const send = (conversationId: string) => {
    if (!draft.trim()) return;
    sendMessage(conversationId, 'shelter_admin', draft.trim());
    setDraft('');
  };

  if (!threads.length) {
    return (
      <Screen>
        <EmptyState
          icon="chatbubbles-outline"
          title="No conversations yet"
          message="When a pet owner contacts your shelter about a report or a recovered animal, the thread appears here."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Banner
        tone={unreadTotal ? 'warning' : 'info'}
        icon="chatbubbles"
        title={unreadTotal ? `${unreadTotal} unread ${unreadTotal === 1 ? 'message' : 'messages'}` : 'All messages read'}
        message="Coordinate verification and pickup with owners here. Every thread is linked to the report that started it."
      />

      <SectionHeader title={`Conversations (${threads.length})`} />

      {threads.map((c) => {
        const thread = messagesIn(c.id);
        const last = thread[thread.length - 1];
        const isOpen = openId === c.id;
        const report = c.reportId ? reportById(c.reportId) : undefined;

        return (
          <Card key={c.id}>
            <Row gap={1.25} align="flex-start">
              <Avatar name={c.userName} color={theme.colors.info} />
              <View style={{ flex: 1, gap: 3 }}>
                <Row gap={0.75}>
                  <Text style={styles.name}>{c.userName}</Text>
                  {c.unreadForShelter ? (
                    <View style={styles.unread}>
                      <Text style={styles.unreadText}>{c.unreadForShelter}</Text>
                    </View>
                  ) : null}
                </Row>
                <Caption>{c.subject}</Caption>
                {report ? (
                  <Caption>
                    Linked report: {report.name ?? report.animalType} · {report.barangay}
                  </Caption>
                ) : null}
                {!isOpen && last ? (
                  <Text style={styles.preview} numberOfLines={1}>
                    {last.senderRole === 'shelter_admin' ? 'You: ' : ''}
                    {last.body}
                  </Text>
                ) : null}
                <Caption>{timeAgo(c.lastMessageAt)}</Caption>
              </View>
              <Button
                label={isOpen ? 'Close' : 'Open'}
                variant="ghost"
                full={false}
                onPress={() => {
                  setOpenId(isOpen ? null : c.id);
                  setDraft('');
                  if (!isOpen) markConversationRead(c.id);
                }}
              />
            </Row>

            {isOpen ? (
              <View style={{ gap: theme.spacing(1) }}>
                <ScrollView style={{ maxHeight: 300 }}>
                  <View style={{ gap: 8 }}>
                    {thread.map((m) => {
                      const mine = m.senderRole === 'shelter_admin';
                      return (
                        <View key={m.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                          <Text style={[styles.bubbleText, mine && { color: theme.colors.onPrimary }]}>
                            {m.body}
                          </Text>
                          <Text style={[styles.time, mine && { color: 'rgba(255,255,255,0.7)' }]}>
                            {m.senderName.split(' ')[0]} · {timeAgo(m.sentAt)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>

                <Field
                  label="Reply"
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="e.g. Pwede po kayong pumunta dito para ma-verify."
                  multiline
                />
                <Button label="Send reply" icon="send" onPress={() => send(c.id)} />
              </View>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 14.5, fontWeight: '700', color: theme.colors.text },
  preview: { fontSize: 12.5, color: theme.colors.textSoft },
  unread: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  bubble: { maxWidth: '85%', padding: theme.spacing(1.25), borderRadius: theme.radius.md, gap: 3 },
  mine: { alignSelf: 'flex-end', backgroundColor: theme.colors.primary, borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: theme.colors.surfaceAlt, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 13, lineHeight: 19, color: theme.colors.text },
  time: { fontSize: 10, color: theme.colors.muted },
});
