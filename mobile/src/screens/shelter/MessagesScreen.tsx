import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/constants/theme';
import {
  Avatar,
  Banner,
  Card,
  Caption,
  EmptyState,
  Row,
  Screen,
  SectionHeader,
} from '@/components/ui';
import { timeAgo } from '@/components/domain';
import { ChatThread } from '@/components/domain/ChatThread';
import { useApp } from '@saanpaw/shared';

/** Shelter Admin Module - Chat with owners about their reports. Threads are always shown open. */
export function MessagesScreen() {
  const { conversations, currentShelter, messagesIn, sendMessage, reportById, markConversationRead } = useApp();

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
              <Avatar name={c.userName} uri={c.userPhotoUrl} color={theme.colors.info} size={44} />
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

            <ChatThread
              messages={thread}
              myRole="shelter_admin"
              other={{ name: c.userName, photoUrl: c.userPhotoUrl, color: theme.colors.info }}
              onSend={(body) => sendMessage(c.id, 'shelter_admin', body)}
              placeholder="e.g. Pwede po kayong pumunta dito para ma-verify."
            />
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
});
