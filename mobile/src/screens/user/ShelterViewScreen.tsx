import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/constants/theme';
import { distanceMeters, formatDistance, useApp } from '@saanpaw/shared';
import type { Shelter } from '@saanpaw/shared';
import {
  AnimalPhoto,
  Avatar,
  Badge,
  Button,
  Card,
  Caption,
  EmptyState,
  Field,
  Row,
  Screen,
  SectionHeader,
  Segmented,
  Sheet,
} from '@/components/ui';
import { CaseStatusPill, ShelterCard, timeAgo } from '@/components/domain';
import { ChatThread } from '@/components/domain/ChatThread';

/** User Module - Browse shelters, see the animals they hold, and message them. */
export function ShelterViewScreen({ route }: { route?: { params?: { tab?: 'shelters' | 'animals' | 'messages' } } }) {
  const {
    shelters,
    shelterAnimals,
    currentUser,
    conversations,
    messagesIn,
    sendMessage,
    startConversation,
    markConversationRead,
  } = useApp();

  // A message notification opens straight onto the messages tab.
  const [tab, setTab] = useState<'shelters' | 'animals' | 'messages'>(route?.params?.tab ?? 'shelters');
  const [composeFor, setComposeFor] = useState<Shelter | null>(null);
  const [draft, setDraft] = useState('');

  const approved = shelters
    .filter((s) => s.approvalStatus === 'approved')
    .map((s) => ({ ...s, distance: distanceMeters(currentUser.location, s.location) }))
    .sort((a, b) => a.distance - b.distance);

  /** Only animals a shelter has explicitly posted are visible to users. */
  const publicAnimals = shelterAnimals.filter((a) => a.postedPublicly);
  const myThreads = conversations.filter((c) => c.userId === currentUser.id);

  // Threads render open on this tab, so they count as read the moment they are on screen.
  const unreadKey = myThreads.map((c) => `${c.id}:${c.unreadForUser}`).join(',');
  useEffect(() => {
    if (tab !== 'messages') return;
    myThreads.filter((c) => c.unreadForUser).forEach((c) => markConversationRead(c.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, unreadKey]);

  const send = () => {
    if (!composeFor || !draft.trim()) return;
    startConversation(composeFor.id, `Enquiry for ${composeFor.name}`, draft.trim());
    setDraft('');
    setComposeFor(null);
    setTab('messages');
  };

  return (
    <Screen>
      <Segmented
        options={[
          { label: 'Shelters', value: 'shelters' },
          { label: 'Recovered animals', value: 'animals' },
          { label: `Messages${myThreads.length ? ` (${myThreads.length})` : ''}`, value: 'messages' },
        ]}
        value={tab}
        onChange={(v) => setTab(v as typeof tab)}
      />

      {tab === 'shelters' ? (
        <>
          <SectionHeader title={`Approved shelters (${approved.length})`} />
          <Caption>
            Only shelters verified by the Developer with the SJDM local government appear here.
          </Caption>
          {approved.map((s) => (
            <ShelterCard
              key={s.id}
              shelter={s}
              distance={s.distance}
              right={
                <Button
                  label="Message"
                  variant="secondary"
                  icon="chatbubble-ellipses-outline"
                  full={false}
                  onPress={() => setComposeFor(s)}
                />
              }
            />
          ))}
        </>
      ) : null}

      {tab === 'animals' ? (
        <>
          <SectionHeader title={`Animals in shelter care (${publicAnimals.length})`} />
          <Caption>
            Animals shelters have recovered and posted publicly. If one looks like your pet, message
            the shelter to arrange verification.
          </Caption>
          {publicAnimals.length ? (
            publicAnimals.map((a) => {
              const shelter = shelters.find((s) => s.id === a.shelterId);
              return (
                <Card key={a.id}>
                  <Row gap={1.5} align="flex-start">
                    <AnimalPhoto uri={a.imageUrls[0]} size={80} />
                    <View style={{ flex: 1, gap: 5 }}>
                      <Text style={styles.animalName}>{a.name}</Text>
                      <Caption>{[a.breed, a.color, a.size].filter(Boolean).join(' · ')}</Caption>
                      <Row gap={0.75}>
                        <CaseStatusPill status={a.caseStatus} />
                        <Badge
                          label={a.intakeType}
                          color={theme.colors.info}
                          soft={theme.colors.infoSoft}
                        />
                      </Row>
                      <Caption>
                        {shelter?.name} · intake {timeAgo(a.intakeDate)}
                      </Caption>
                    </View>
                  </Row>
                  {a.notes ? <Caption>{a.notes}</Caption> : null}
                  {shelter ? (
                    <Button
                      label={`Message ${shelter.name}`}
                      variant="secondary"
                      icon="chatbubble-ellipses-outline"
                      onPress={() => setComposeFor(shelter)}
                    />
                  ) : null}
                </Card>
              );
            })
          ) : (
            <Card>
              <EmptyState
                icon="paw-outline"
                title="No animals posted right now"
                message="Shelters post recovered animals here once they are ready to be claimed or adopted."
              />
            </Card>
          )}
        </>
      ) : null}

      {tab === 'messages' ? (
        <>
          <SectionHeader title={`My conversations (${myThreads.length})`} />
          {myThreads.length ? (
            myThreads.map((c) => {
              const shelter = shelters.find((s) => s.id === c.shelterId);
              const thread = messagesIn(c.id);
              const shelterName = shelter?.name ?? c.shelterName ?? 'Shelter';
              const shelterPhoto = shelter?.photoUrl ?? c.shelterPhotoUrl;
              return (
                <Card key={c.id}>
                  <Row gap={1} align="flex-start">
                    <Avatar
                      name={shelterName}
                      uri={shelterPhoto}
                      color={shelter?.logoColor ?? theme.colors.primary}
                      icon="home"
                      size={44}
                    />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={styles.threadTitle}>{shelterName}</Text>
                      <Caption>{c.subject}</Caption>
                      <Caption>{timeAgo(c.lastMessageAt)}</Caption>
                    </View>
                  </Row>

                  <ChatThread
                    messages={thread}
                    myRole="user"
                    other={{
                      name: shelterName,
                      photoUrl: shelterPhoto,
                      color: shelter?.logoColor ?? theme.colors.primary,
                      icon: 'home',
                    }}
                    onSend={(body) => sendMessage(c.id, 'user', body)}
                  />
                </Card>
              );
            })
          ) : (
            <Card>
              <EmptyState
                icon="chatbubbles-outline"
                title="No conversations yet"
                message="Message a shelter from the Shelters tab when you think they may have your pet."
                action="Browse shelters"
                onAction={() => setTab('shelters')}
              />
            </Card>
          )}
        </>
      ) : null}

      <Sheet
        open={Boolean(composeFor)}
        onClose={() => setComposeFor(null)}
        title={composeFor ? `Message ${composeFor.name}` : 'Message'}
      >
        <Caption>
          {composeFor
            ? `${composeFor.address} · ${composeFor.contactNumber} · ${formatDistance(
                distanceMeters(currentUser.location, composeFor.location),
              )} away`
            : ''}
        </Caption>
        <Field
          label="Your message"
          value={draft}
          onChangeText={setDraft}
          placeholder="e.g. Good day po, nawawala ang aso ko. May na-recover ba kayo na kamukha nito?"
          multiline
        />
        <Button label="Send message" icon="send" onPress={send} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  animalName: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  threadTitle: { fontSize: 14.5, fontWeight: '700', color: theme.colors.text },

});
