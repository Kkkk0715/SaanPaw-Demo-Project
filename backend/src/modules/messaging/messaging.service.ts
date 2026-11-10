import { Conversation } from '../../models/Conversation';
import { Message } from '../../models/Message';
import { Shelter } from '../../models/Shelter';
import { User } from '../../models/User';
import { ApiError } from '../../utils/ApiError';
import { notify } from '../../services/pushNotification.service';
import { combineName, serializeConversation, serializeMessage } from '../../utils/geoHelpers';

type Side = 'user' | 'shelter';

const preview = (body: string) => (body.length > 120 ? `${body.slice(0, 117)}...` : body);

/**
 * Tells the other side a message arrived: an entry in their alerts list plus a push to their phone.
 * Messages used to be saved silently, so nobody knew a reply was waiting until they opened the chat.
 */
async function announce(conversation: { _id: unknown; userId: unknown; shelterId: unknown }, from: Side, body: string) {
  if (from === 'user') {
    const user = await User.findById(conversation.userId, 'firstName middleName lastName').lean();
    await notify({
      audienceType: 'shelter',
      audienceId: conversation.shelterId,
      type: 'message',
      refId: conversation._id,
      title: `New message from ${user ? combineName(user) : 'a pet owner'}`,
      body: preview(body),
    });
  } else {
    const shelter = await Shelter.findById(conversation.shelterId, 'name').lean();
    await notify({
      audienceType: 'user',
      audienceId: conversation.userId,
      type: 'message',
      refId: conversation._id,
      title: `${shelter?.name ?? 'A shelter'} replied`,
      body: preview(body),
    });
  }
}

/** The thread must belong to the caller, whichever side of it they are on. */
async function ownedConversation(side: Side, ownerId: string, conversationId: string) {
  const conversation = await Conversation.findOne({
    _id: conversationId,
    [side === 'user' ? 'userId' : 'shelterId']: ownerId,
  });
  if (!conversation) throw ApiError.notFound('Conversation not found');
  return conversation;
}

/** Names and profile pictures of both sides, so each app can show who it is talking to. */
async function names(userIds: unknown[], shelterIds: unknown[]) {
  const [users, shelters] = await Promise.all([
    User.find({ _id: { $in: userIds } }, 'firstName middleName lastName photoUrl').lean(),
    Shelter.find({ _id: { $in: shelterIds } }, 'name photoUrl').lean(),
  ]);
  return {
    userName: new Map(users.map((u) => [String(u._id), combineName(u)])),
    userPhoto: new Map(users.map((u) => [String(u._id), u.photoUrl ?? undefined])),
    shelterName: new Map(shelters.map((s) => [String(s._id), s.name])),
    shelterPhoto: new Map(shelters.map((s) => [String(s._id), s.photoUrl ?? undefined])),
  };
}

async function present(conversations: InstanceType<typeof Conversation>[]) {
  const ids = conversations.map((c) => c._id);
  const [messages, lookup] = await Promise.all([
    Message.find({ conversationId: { $in: ids } }).sort({ sentAt: 1 }).lean(),
    names(conversations.map((c) => c.userId), conversations.map((c) => c.shelterId)),
  ]);
  const conversationById = new Map(conversations.map((c) => [String(c._id), c]));
  return {
    conversations: conversations.map((c) =>
      serializeConversation(c, lookup.userName.get(String(c.userId)) ?? 'User', {
        userPhotoUrl: lookup.userPhoto.get(String(c.userId)),
        shelterName: lookup.shelterName.get(String(c.shelterId)),
        shelterPhotoUrl: lookup.shelterPhoto.get(String(c.shelterId)),
      }),
    ),
    messages: messages.map((m) => {
      const c = conversationById.get(String(m.conversationId));
      const senderName =
        m.senderType === 'shelter'
          ? lookup.shelterName.get(String(c?.shelterId)) ?? 'Shelter'
          : lookup.userName.get(String(c?.userId)) ?? 'User';
      return serializeMessage(m, senderName);
    }),
  };
}

export const messagingService = {
  async list(side: Side, ownerId: string) {
    const conversations = await Conversation.find({ [side === 'user' ? 'userId' : 'shelterId']: ownerId })
      .sort({ lastMessageAt: -1 })
      .limit(100);
    return present(conversations);
  },

  async start(userId: string, input: { id?: string; shelterId: string; subject: string; body: string; reportId?: string }) {
    const shelter = await Shelter.findOne({ _id: input.shelterId, approvalStatus: 'approved' }).lean();
    if (!shelter) throw ApiError.notFound('Shelter not found');
    const now = new Date();
    const conversation = await Conversation.create({
      ...(input.id ? { _id: input.id } : {}),
      userId,
      shelterId: input.shelterId,
      subject: input.subject,
      relatedReportId: input.reportId,
      lastMessageAt: now,
      unreadForShelter: 1,
    });
    await Message.create({ conversationId: conversation._id, senderType: 'user', senderId: userId, body: input.body });
    await announce(conversation, 'user', input.body);
    return present([conversation]);
  },

  async send(side: Side, ownerId: string, conversationId: string, body: string) {
    const conversation = await ownedConversation(side, ownerId, conversationId);
    await Message.create({ conversationId: conversation._id, senderType: side, senderId: ownerId, body });
    conversation.lastMessageAt = new Date();
    if (side === 'user') {
      conversation.unreadForUser = 0;
      conversation.unreadForShelter += 1;
    } else {
      conversation.unreadForShelter = 0;
      conversation.unreadForUser += 1;
    }
    await conversation.save();
    await announce(conversation, side, body);
    return present([conversation]);
  },

  async markRead(side: Side, ownerId: string, conversationId: string) {
    const conversation = await ownedConversation(side, ownerId, conversationId);
    if (side === 'user') conversation.unreadForUser = 0;
    else conversation.unreadForShelter = 0;
    await conversation.save();
    return present([conversation]);
  },
};
