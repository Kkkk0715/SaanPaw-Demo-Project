import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/constants/theme';
import { distanceMeters, formatDistance, useApp } from '@saanpaw/shared';
import type { AnimalType, Shelter, ShelterAnimal } from '@saanpaw/shared';

const INTAKE_LABEL: Record<ShelterAnimal['intakeType'], string> = {
  recovered: 'Recovered',
  rescued: 'Rescued',
  surrendered: 'Surrendered',
};
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
  Choice,
  Pager,
  usePagination,
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
  // Opening this screen again with a tab (a message notification, "Message shelter") switches to it.
  const requestedTab = route?.params?.tab;
  useEffect(() => {
    if (requestedTab) setTab(requestedTab);
  }, [requestedTab]);
  const [composeFor, setComposeFor] = useState<Shelter | null>(null);
  const [draft, setDraft] = useState('');
  const [viewShelter, setViewShelter] = useState<(Shelter & { distance: number }) | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'care' | 'reunited'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | AnimalType>('all');

  const approved = shelters
    .filter((s) => s.approvalStatus === 'approved')
    .map((s) => ({ ...s, distance: distanceMeters(currentUser.location, s.location) }))
    .sort((a, b) => a.distance - b.distance);

  /** Only animals a shelter has explicitly posted are visible to users. */
  const publicAnimals = shelterAnimals.filter((a) => a.postedPublicly);
  const myThreads = conversations.filter((c) => c.userId === currentUser.id);

  const inCare = (a: ShelterAnimal) => a.caseStatus === 'under_rescue' || a.caseStatus === 'inconclusive';
  const statusCount = {
    care: publicAnimals.filter(inCare).length,
    reunited: publicAnimals.filter((a) => a.caseStatus === 'reunited').length,
  };
  const filteredAnimals = publicAnimals
    .filter((a) => statusFilter === 'all' || (statusFilter === 'care' ? inCare(a) : a.caseStatus === 'reunited'))
    .filter((a) => typeFilter === 'all' || a.animalType === typeFilter)
    // Still waiting for an owner first, then newest intake.
    .sort((x, y) => Number(inCare(y)) - Number(inCare(x)) || +new Date(y.intakeDate) - +new Date(x.intakeDate));
  const distanceTo = (shelterId: string) => {
    const s = shelters.find((x) => x.id === shelterId);
    return s ? distanceMeters(currentUser.location, s.location) : Infinity;
  };
  /** One section per shelter (nearest first); pages turn by shelter, never splitting one. */
  const animalGroups = [...new Set(filteredAnimals.map((a) => a.shelterId))]
    .sort((x, y) => distanceTo(x) - distanceTo(y))
    .map((id) => ({
      shelter: shelters.find((s) => s.id === id),
      animals: filteredAnimals.filter((a) => a.shelterId === id),
    }));
  const groupPage = usePagination(animalGroups, 3, `${statusFilter}|${typeFilter}`);
  const [viewAnimal, setViewAnimal] = useState<ShelterAnimal | null>(null);
  const viewAnimalShelter = viewAnimal ? shelters.find((s) => s.id === viewAnimal.shelterId) : undefined;
  const shelterPage = usePagination(approved, 8);
  const shelterCount = animalGroups.length;
  // Threads render open (chat included), so fewer per page.
  const threadPage = usePagination(myThreads, 5);

  // Threads render open on this tab, so they count as read the moment they are on screen.
  const unreadKey = threadPage.items.map((c) => `${c.id}:${c.unreadForUser}`).join(',');
  useEffect(() => {
    if (tab !== 'messages') return;
    threadPage.items.filter((c) => c.unreadForUser).forEach((c) => markConversationRead(c.id));
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
          {shelterPage.items.map((s) => (
            <ShelterCard
              key={s.id}
              shelter={s}
              distance={s.distance}
              onPress={() => setViewShelter(s)}
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
          <Pager {...shelterPage} />
        </>
      ) : null}

      {tab === 'animals' ? (
        <>
          <SectionHeader title={`Recovered animals (${publicAnimals.length})`} />
          <Caption>
            Animals shelters have recovered and posted publicly, grouped by shelter. If one looks like
            your pet, message the shelter to arrange verification.
          </Caption>

          <Row gap={1} style={styles.statRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{statusCount.care}</Text>
              <Caption>In shelter care</Caption>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{statusCount.reunited}</Text>
              <Caption>Reunited</Caption>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{shelterCount}</Text>
              <Caption>{shelterCount === 1 ? 'Shelter' : 'Shelters'}</Caption>
            </View>
          </Row>

          <Segmented
            options={[
              { label: 'All', value: 'all' },
              { label: 'In shelter care', value: 'care' },
              { label: 'Reunited', value: 'reunited' },
            ]}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as typeof statusFilter)}
          />
          <Choice
            options={[
              { label: 'All animals', value: 'all', icon: 'paw-outline' },
              { label: 'Dogs', value: 'dog' },
              { label: 'Cats', value: 'cat' },
              { label: 'Others', value: 'other' },
            ]}
            value={typeFilter}
            onChange={(v) => setTypeFilter(v as typeof typeFilter)}
          />

          {groupPage.items.length ? (
            groupPage.items.map(({ shelter, animals }) => {
              const care = animals.filter(inCare).length;
              const reunited = animals.filter((x) => x.caseStatus === 'reunited').length;
              return (
                <Card key={shelter?.id ?? animals[0].shelterId}>
                  {/* Each shelter gets its own section, so its animals read as one showcase. */}
                  <Row gap={1} style={styles.groupHeader}>
                    <Avatar
                      name={shelter?.name ?? 'Shelter'}
                      uri={shelter?.photoUrl}
                      color={shelter?.logoColor ?? theme.colors.primary}
                      icon="home"
                      size={44}
                    />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.groupTitle} numberOfLines={1}>
                        {shelter?.name ?? 'Shelter'}
                      </Text>
                      <Caption>
                        {shelter
                          ? `Brgy. ${shelter.barangay} · ${formatDistance(distanceMeters(currentUser.location, shelter.location))} away`
                          : 'Shelter'}
                      </Caption>
                    </View>
                    {shelter ? (
                      <Button
                        label="Message"
                        variant="secondary"
                        icon="chatbubble-ellipses-outline"
                        full={false}
                        onPress={() => setComposeFor(shelter)}
                      />
                    ) : null}
                  </Row>
                  <Row gap={0.75} style={{ flexWrap: 'wrap' }}>
                    <Badge label={`${animals.length} ${animals.length === 1 ? 'animal' : 'animals'}`} icon="paw" />
                    {care ? (
                      <Badge label={`${care} in shelter care`} color={theme.colors.found} soft={theme.colors.foundSoft} />
                    ) : null}
                    {reunited ? (
                      <Badge label={`${reunited} reunited`} color={theme.colors.primary} soft={theme.colors.primarySoft} />
                    ) : null}
                  </Row>

                  <ScrollView
                    horizontal
                    nestedScrollEnabled
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.shelf}
                  >
                    {animals.map((x) => (
                      <Pressable key={x.id} style={styles.tile} onPress={() => setViewAnimal(x)}>
                        <AnimalPhoto uri={x.imageUrls[0]} size={132} />
                        <Text style={styles.tileName} numberOfLines={1}>
                          {x.name}
                        </Text>
                        <Text style={styles.tileMeta} numberOfLines={1}>
                          {[x.breed, x.color].filter(Boolean).join(' · ') || x.animalType}
                        </Text>
                        {inCare(x) ? (
                          <Badge label="In shelter care" color={theme.colors.found} soft={theme.colors.foundSoft} />
                        ) : (
                          <CaseStatusPill status={x.caseStatus} />
                        )}
                      </Pressable>
                    ))}
                  </ScrollView>
                  {animals.length > 2 ? <Caption>Swipe to see all {animals.length}. Tap an animal for details.</Caption> : (
                    <Caption>Tap an animal for details.</Caption>
                  )}
                </Card>
              );
            })
          ) : (
            <Card>
              <EmptyState
                icon="paw-outline"
                title={publicAnimals.length ? 'No animals match these filters' : 'No animals posted right now'}
                message={
                  publicAnimals.length
                    ? 'Try another status or animal type.'
                    : 'Shelters post recovered animals here once they are ready to be claimed or adopted.'
                }
              />
            </Card>
          )}
          <Pager {...groupPage} />
        </>
      ) : null}

      {tab === 'messages' ? (
        <>
          <SectionHeader title={`My conversations (${myThreads.length})`} />
          {myThreads.length ? (
            threadPage.items.map((c) => {
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
          <Pager {...threadPage} />
        </>
      ) : null}

      <Sheet open={Boolean(viewAnimal)} onClose={() => setViewAnimal(null)} title={viewAnimal?.name ?? 'Animal'}>
        {viewAnimal ? (
          <View style={{ gap: theme.spacing(1.25) }}>
            <AnimalPhoto uri={viewAnimal.imageUrls[0]} size="full" />
            <Text style={styles.animalName}>{viewAnimal.name}</Text>
            <Caption>
              {[viewAnimal.animalType, viewAnimal.breed, viewAnimal.color, viewAnimal.size].filter(Boolean).join(' · ')}
            </Caption>
            <Row gap={0.75} style={{ flexWrap: 'wrap' }}>
              {inCare(viewAnimal) ? (
                <Badge label="In shelter care" color={theme.colors.found} soft={theme.colors.foundSoft} icon="shield-checkmark" />
              ) : (
                <CaseStatusPill status={viewAnimal.caseStatus} />
              )}
              <Badge
                label={INTAKE_LABEL[viewAnimal.intakeType] ?? viewAnimal.intakeType}
                color={theme.colors.info}
                soft={theme.colors.infoSoft}
              />
            </Row>
            <Caption>
              {viewAnimalShelter ? `At ${viewAnimalShelter.name} · ` : ''}intake {timeAgo(viewAnimal.intakeDate)}
            </Caption>
            {viewAnimal.notes ? <Caption>{viewAnimal.notes}</Caption> : null}
            {viewAnimalShelter ? (
              <Button
                label="Message this shelter"
                icon="chatbubble-ellipses-outline"
                onPress={() => {
                  const s = viewAnimalShelter;
                  setViewAnimal(null);
                  setComposeFor(s);
                }}
              />
            ) : null}
          </View>
        ) : null}
      </Sheet>

      <Sheet open={Boolean(viewShelter)} onClose={() => setViewShelter(null)} title={viewShelter?.name ?? 'Shelter'}>
        {viewShelter ? (
          <>
            <View style={styles.profileHead}>
              <Avatar
                name={viewShelter.name}
                uri={viewShelter.photoUrl}
                color={viewShelter.logoColor}
                icon="home"
                size={88}
              />
              <Text style={styles.profileName}>{viewShelter.name}</Text>
              <Caption style={{ textAlign: 'center' }}>{viewShelter.address}</Caption>
            </View>
            <Row gap={1} style={styles.statRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>
                  {viewShelter.currentOccupancy}/{viewShelter.capacity}
                </Text>
                <Caption>Animals</Caption>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{formatDistance(viewShelter.distance)}</Text>
                <Caption>Away</Caption>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>
                  {publicAnimals.filter((a) => a.shelterId === viewShelter.id).length}
                </Text>
                <Caption>Posted</Caption>
              </View>
            </Row>
            {viewShelter.contactNumber ? <Caption>Contact: {viewShelter.contactNumber}</Caption> : null}
            <Row gap={1}>
              <Button
                label="See animals"
                variant="secondary"
                icon="paw-outline"
                full={false}
                style={{ flex: 1 }}
                onPress={() => {
                  setViewShelter(null);
                  setTab('animals');
                }}
              />
              <Button
                label="Message"
                icon="chatbubble-ellipses-outline"
                full={false}
                style={{ flex: 1 }}
                onPress={() => {
                  const s = viewShelter;
                  setViewShelter(null);
                  setComposeFor(s);
                }}
              />
            </Row>
          </>
        ) : null}
      </Sheet>

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
  statRow: { alignItems: 'stretch' },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: theme.spacing(1),
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceAlt,
  },
  statValue: { fontSize: 17, fontWeight: '800', color: theme.colors.text },
  group: { gap: theme.spacing(1) },
  shelf: { gap: theme.spacing(1.25), paddingVertical: theme.spacing(0.5) },
  tile: { width: 132, gap: 4 },
  tileName: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  tileMeta: { fontSize: 12, color: theme.colors.textSoft },
  groupHeader: { marginTop: theme.spacing(1), alignItems: 'center' },
  groupTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  profileHead: { alignItems: 'center', gap: 6, paddingVertical: theme.spacing(1) },
  profileName: { fontSize: 18, fontWeight: '800', color: theme.colors.text, textAlign: 'center' },

});
