import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import {
  Avatar,
  Banner,
  Card,
  Caption,
  EmptyState,
  Row,
  Pager,
  Screen,
  SectionHeader,
  usePagination,
} from '@/components/ui';
import { timeAgo } from '@/components/domain';
import { ChatThread } from '@/components/domain/ChatThread';
import { useApp } from '@saanpaw/shared';

/**
 * Shelter Admin Module - Chat with owners about their reports.
 *
 * Each conversation is a row showing who wrote, the latest message and how many messages are
 * unread. A thread only counts as read once it is opened. (Every thread used to render open, which
 * marked everything read the moment the screen appeared - so the unread count never got past 1.)
 */
export function MessagesScreen() {
  const { conversations, currentShelter, messagesIn, sendMessage, reportById, markConversationRead } = useApp();
  const [openId, setOpenId] = useState<string | null>(null);

  const threads = conversations
    .filter((c) => c.shelterId === currentShelter.id)
    .sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt));

  const unreadTotal = threads.reduce((s, c) => s + c.unreadForShelter, 0);
  const unreadThreads = threads.filter((c) => c.unreadForShelter).length;
  const page = usePagination(threads, 8);

  // The open thread is on screen, so what arrives in it while open is read straight away.
  const open = threads.find((c) => c.id === openId);
  const openUnread = open?.unreadForShelter ?? 0;
  useEffect(() => {
    if (open && openUnread) markConversationRead(open.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.id, openUnread]);

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
        title={
          unreadTotal
            ? `${unreadTotal} unread ${unreadTotal === 1 ? 'message' : 'messages'}${
                unreadThreads > 1 ? ` in ${unreadThreads} conversations` : ''
              }`
            : 'All messages read'
        }
        message="Tap a conversation to read and reply. Every thread is linked to the report that started it."
      />

      <SectionHeader title={`Conversations (${threads.length})`} />

      {page.items.map((c) => {
        const thread = messagesIn(c.id);
        const last = thread[thread.length - 1];
        const report = c.reportId ? reportById(c.reportId) : undefined;
        const isOpen = c.id === openId;

        return (
          <Card key={c.id}>
            <Pressable onPress={() => setOpenId(isOpen ? null : c.id)} hitSlop={4}>
              <Row gap={1.25} align="flex-start">
                <Avatar name={c.userName} uri={c.userPhotoUrl} color={theme.colors.info} size={44} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Row gap={0.75}>
                    <Text style={[styles.name, c.unreadForShelter ? styles.nameUnread : null]} numberOfLines={1}>
                      {c.userName}
                    </Text>
                    {c.unreadForShelter ? (
                      <View style={styles.unread}>
                        <Text style={styles.unreadText}>{c.unreadForShelter}</Text>
                      </View>
                    ) : null}
                  </Row>
                  <Caption>{c.subject}</Caption>
                  {last ? (
                    <Text style={[styles.preview, c.unreadForShelter ? styles.previewUnread : null]} numberOfLines={isOpen ? undefined : 1}>
                      {last.senderRole === 'shelter_admin' ? 'You: ' : ''}
                      {last.body}
                    </Text>
                  ) : null}
                  {report ? (
                    <Caption>
                      Linked report: {report.name ?? report.animalType} · {report.barangay}
                    </Caption>
                  ) : null}
                  <Caption>{timeAgo(c.lastMessageAt)}</Caption>
                </View>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.muted} />
              </Row>
            </Pressable>

            {isOpen ? (
              <ChatThread
                messages={thread}
                myRole="shelter_admin"
                other={{ name: c.userName, photoUrl: c.userPhotoUrl, color: theme.colors.info }}
                onSend={(body) => sendMessage(c.id, 'shelter_admin', body)}
                placeholder="e.g. Pwede po kayong pumunta dito para ma-verify."
              />
            ) : null}
          </Card>
        );
      })}
      <Pager {...page} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { flexShrink: 1, fontSize: 14.5, fontWeight: '700', color: theme.colors.text },
  nameUnread: { fontWeight: '800' },
  preview: { fontSize: 13, lineHeight: 18, color: theme.colors.textSoft },
  previewUnread: { color: theme.colors.text, fontWeight: '600' },
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
