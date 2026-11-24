import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { timeAgo } from '@saanpaw/shared';
import { theme } from '@/constants/theme';
import { Badge, Banner, Button, Caption, Card, Choice, EmptyState, ErrorText, Field, Row, Screen, SectionHeader, Sheet } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/services/api';

type Status = 'open' | 'in_progress' | 'resolved' | 'closed';
type Category = 'account' | 'report' | 'shelter' | 'app_problem' | 'suggestion' | 'other';

interface TicketMessage {
  id: string;
  authorType: 'user' | 'shelter' | 'admin';
  authorName: string;
  body: string;
  at: string;
}
interface Ticket {
  id: string;
  ref: string;
  subject: string;
  category: Category;
  status: Status;
  messages: TicketMessage[];
  unread: number;
  createdAt?: string;
  lastActivityAt?: string;
}

const STATUS: Record<Status, { label: string; color: string; soft: string }> = {
  open: { label: 'Open', color: theme.colors.info, soft: theme.colors.infoSoft },
  in_progress: { label: 'In progress', color: theme.colors.accent, soft: theme.colors.accentSoft },
  resolved: { label: 'Resolved', color: theme.colors.primaryDark, soft: theme.colors.primarySoft },
  closed: { label: 'Closed', color: theme.colors.muted, soft: theme.colors.border },
};

const CATEGORIES: { label: string; value: Category }[] = [
  { label: 'My account', value: 'account' },
  { label: 'A report', value: 'report' },
  { label: 'A shelter', value: 'shelter' },
  { label: 'App problem', value: 'app_problem' },
  { label: 'Suggestion', value: 'suggestion' },
  { label: 'Other', value: 'other' },
];

/**
 * Help & support: questions and problems sent to the SaanPaw team, who answer from the Developer
 * Console. Each ticket is a short conversation; a reply from the team also arrives as a notification.
 */
export function SupportScreen({ route }: NativeStackScreenProps<any>) {
  const { role, token } = useAuth();
  const base = role === 'shelter_admin' ? '/shelter/tickets' : '/user/tickets';
  const openId = (route.params as { ticketId?: string } | undefined)?.ticketId;

  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [viewing, setViewing] = useState<Ticket | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setTickets(await apiRequest<Ticket[]>(base, {}, token));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [base, token]);

  const open = useCallback(
    async (id: string) => {
      if (!token) return;
      try {
        const t = await apiRequest<Ticket>(`${base}/${id}`, {}, token);
        setViewing(t);
        setTickets((list) => list?.map((x) => (x.id === t.id ? t : x)) ?? list);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
      }
    },
    [base, token],
  );

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (openId) void open(openId);
  }, [openId, open]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <Screen scroll={false} padded={false}>
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      >
        <Banner
          title="Ask the SaanPaw team"
          message="Report a problem with the app or an account, question a report, or send a suggestion. The team usually replies within a day."
        />
        <Button label="New request" icon="add-circle-outline" onPress={() => setComposeOpen(true)} />
        <ErrorText error={loadError} />

        <SectionHeader title="Your requests" />
        {tickets === null && !loadError ? (
          <ActivityIndicator color={theme.colors.primary} style={{ marginTop: theme.spacing(3) }} />
        ) : tickets && tickets.length === 0 ? (
          <Card>
            <EmptyState icon="chatbubbles-outline" title="No requests yet" message="Anything you send the team shows up here, with their replies." />
          </Card>
        ) : (
          tickets?.map((t) => (
            <Card key={t.id} onPress={() => void open(t.id)}>
              <Row gap={1} style={{ justifyContent: 'space-between' }}>
                <Text style={styles.subject} numberOfLines={1}>
                  {t.subject}
                </Text>
                {t.unread ? <Badge label={`${t.unread} new`} color={theme.colors.danger} soft={theme.colors.dangerSoft} /> : null}
              </Row>
              <Row gap={0.75} style={{ marginTop: 6 }}>
                <Badge label={STATUS[t.status].label} color={STATUS[t.status].color} soft={STATUS[t.status].soft} />
                <Caption>
                  {t.ref} · {t.lastActivityAt ? timeAgo(t.lastActivityAt) : ''}
                </Caption>
              </Row>
              <Caption style={{ marginTop: 6 }} >
                {t.messages[t.messages.length - 1]?.body.slice(0, 120)}
              </Caption>
            </Card>
          ))
        )}
      </ScrollView>

      <ComposeSheet
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSend={async (input) => {
          const t = await apiRequest<Ticket>(base, { method: 'POST', body: JSON.stringify(input) }, token ?? undefined);
          setTickets((list) => [t, ...(list ?? [])]);
          setComposeOpen(false);
          setViewing(t);
        }}
      />
      <ThreadSheet
        ticket={viewing}
        onClose={() => setViewing(null)}
        onReply={async (message) => {
          if (!viewing) return;
          const t = await apiRequest<Ticket>(`${base}/${viewing.id}/messages`, { method: 'POST', body: JSON.stringify({ message }) }, token ?? undefined);
          setViewing(t);
          setTickets((list) => list?.map((x) => (x.id === t.id ? t : x)) ?? list);
        }}
      />
    </Screen>
  );
}

function ComposeSheet({
  open,
  onClose,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  onSend: (input: { subject: string; category: Category; message: string }) => Promise<void>;
}) {
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<Category>('app_problem');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSubject('');
      setMessage('');
      setCategory('app_problem');
      setError(null);
    }
  }, [open]);

  const send = async () => {
    if (subject.trim().length < 3) return setError('Add a short subject (at least 3 characters).');
    if (message.trim().length < 5) return setError('Describe the problem (at least 5 characters).');
    setBusy(true);
    setError(null);
    try {
      await onSend({ subject: subject.trim(), category, message: message.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="New request">
      <Choice label="What is it about?" options={CATEGORIES} value={category} onChange={setCategory} />
      <Field label="Subject" value={subject} onChangeText={setSubject} placeholder="e.g. I can't upload a photo" maxLength={120} />
      <Field
        label="Details"
        value={message}
        onChangeText={setMessage}
        multiline
        maxLength={3000}
        placeholder="What happened, and what did you expect? Include the report or animal if it's about one."
      />
      <ErrorText error={error} />
      <Button label="Send to the SaanPaw team" icon="send" loading={busy} onPress={() => void send()} />
    </Sheet>
  );
}

function ThreadSheet({
  ticket,
  onClose,
  onReply,
}: {
  ticket: Ticket | null;
  onClose: () => void;
  onReply: (message: string) => Promise<void>;
}) {
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setReply('');
    setError(null);
  }, [ticket?.id]);

  const send = async () => {
    if (!reply.trim()) return setError('Write a reply first.');
    setBusy(true);
    setError(null);
    try {
      await onReply(reply.trim());
      setReply('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const closed = ticket?.status === 'closed';
  return (
    <Sheet open={Boolean(ticket)} onClose={onClose} title={ticket ? `${ticket.ref} · ${ticket.subject}` : ''}>
      {ticket ? (
        <>
          <Row gap={0.75}>
            <Badge label={STATUS[ticket.status].label} color={STATUS[ticket.status].color} soft={STATUS[ticket.status].soft} />
            <Caption>{CATEGORIES.find((c) => c.value === ticket.category)?.label}</Caption>
          </Row>
          <View style={{ gap: theme.spacing(1) }}>
            {ticket.messages.map((m) => {
              const team = m.authorType === 'admin';
              return (
                <View key={m.id} style={[styles.bubble, team ? styles.bubbleTeam : styles.bubbleMine]}>
                  <Text style={styles.bubbleAuthor}>{team ? `SaanPaw team · ${m.authorName}` : 'You'}</Text>
                  <Text style={styles.bubbleBody}>{m.body}</Text>
                  <Caption style={{ fontSize: 11 }}>{timeAgo(m.at)}</Caption>
                </View>
              );
            })}
          </View>
          {closed ? (
            <Caption>This request is closed. Send a new request if you still need help.</Caption>
          ) : (
            <>
              <Field label="Reply" value={reply} onChangeText={setReply} multiline maxLength={3000} placeholder="Add more details or answer the team" />
              <ErrorText error={error} />
              <Button label="Send reply" icon="send" loading={busy} onPress={() => void send()} />
              {ticket.status === 'resolved' ? <Caption>Replying opens this request again.</Caption> : null}
            </>
          )}
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: theme.spacing(2), gap: theme.spacing(1.5), paddingBottom: theme.spacing(6), width: '100%', maxWidth: 520, alignSelf: 'center' },
  subject: { ...theme.type.h3, color: theme.colors.text, flex: 1 },
  bubble: { padding: theme.spacing(1.25), borderRadius: theme.radius.lg, gap: 4, maxWidth: '92%' },
  bubbleMine: { backgroundColor: theme.colors.primarySoft, alignSelf: 'flex-end' },
  bubbleTeam: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, alignSelf: 'flex-start' },
  bubbleAuthor: { ...theme.type.tiny, color: theme.colors.muted },
  bubbleBody: { ...theme.type.body, color: theme.colors.text },
});
