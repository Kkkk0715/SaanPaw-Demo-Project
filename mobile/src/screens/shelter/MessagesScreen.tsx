import { useEffect, useState } from 'react';
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

/** Shelter Admin Module - Chat with owners about their reports. Threads are always shown open. */
export function MessagesScreen() {
  const { conversations, currentShelter, messagesIn, sendMessage, reportById, markConversationRead } = useApp();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const threads = conversations
    .filter((c) => c.shelterId === currentShelter.id)
    .sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt));

  const unreadTotal = threads.reduce((s, c) => s + c.unreadForShelter, 0);
  // Every thread renders open, so it counts as read the moment it is on screen.
  const unreadKey = threads.map((c) => `${c.id}:${c.unreadForShelter}`).join(',');
  useEffect(() => {
    threads.filter((c) => c.unreadForShelter).forEach((c) => markConversationRead(c.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadKey]);

  const send = (conversationId: string) => {
    const body = (drafts[conversationId] ?? '').trim();
    if (!body) return;
    sendMessage(conversationId, 'shelter_admin', body);
    setDrafts((d) => ({ ...d, [conversationId]: '' }));
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
                <Caption>{timeAgo(c.lastMessageAt)}</Caption>
              </View>
            </Row>

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
                value={drafts[c.id] ?? ''}
                onChangeText={(v) => setDrafts((d) => ({ ...d, [c.id]: v }))}
                placeholder="e.g. Pwede po kayong pumunta dito para ma-verify."
                multiline
              />
              <Button label="Send reply" icon="send" onPress={() => send(c.id)} />
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 14.5, fontWeight: '700', color: theme.colors.text },
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
