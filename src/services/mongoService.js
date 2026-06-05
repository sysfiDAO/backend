// services/mongoService.js
// MongoDB service — proposals, user votes, DAO activity feed.
import { getMongoDB } from '../db/mongodb.js';
import logger from '../utils/logger.js';

// ─── Collections ─────────────────────────────────────────────────────────────
const col = {
  proposals: () => getMongoDB().collection('proposals'),
  votes:     () => getMongoDB().collection('user_votes'),
  activity:  () => getMongoDB().collection('dao_activity'),
};

// ─── Proposals ────────────────────────────────────────────────────────────────

/**
 * Upsert a proposal (from blockchain sync or creation).
 * proposalId + daoAddress + chainId form the unique key.
 */
export async function upsertProposal(data) {
  try {
    const filter = {
      proposalId: data.proposalId,
      daoAddress: data.daoAddress.toLowerCase(),
      chainId:    data.chainId,
    };
    const doc = {
      ...filter,
      title:               data.title       || '',
      description:         data.description || '',
      type:                data.type        || 'generic',
      status:              data.status      || 'active',
      proposer:            (data.proposer || '').toLowerCase(),
      targetAddress:       data.targetAddress || null,
      amount:              data.amount     || '0',
      callData:            data.callData   || '0x',
      votesFor:            data.votesFor   || '0',
      votesAgainst:        data.votesAgainst || '0',
      votesAbstain:        data.votesAbstain || '0',
      totalVoters:         data.totalVoters  || 0,
      startTime:           data.startTime,
      endTime:             data.endTime,
      executionTime:       data.executionTime || null,
      txHash:              data.txHash || null,
      updatedAt:           new Date(),
    };

    const result = await col.proposals().findOneAndUpdate(
      filter,
      { $set: doc, $setOnInsert: { createdAt: new Date() } },
      { upsert: true, returnDocument: 'after' }
    );

    logger.debug(`Proposal upserted: DAO ${data.daoAddress} #${data.proposalId}`);
    return result;
  } catch (err) {
    logger.error('mongoService.upsertProposal:', err.message);
    throw err;
  }
}

/**
 * Get all proposals for a DAO, sorted newest first.
 */
export async function getProposalsByDAO(daoAddress, chainId, { status, limit = 50, skip = 0 } = {}) {
  try {
    const filter = { daoAddress: daoAddress.toLowerCase(), chainId };
    if (status) filter.status = status;

    const results = await col.proposals()
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    return results;
  } catch (err) {
    logger.error('mongoService.getProposalsByDAO:', err.message);
    return [];
  }
}

/**
 * Get a single proposal.
 */
export async function getProposal(daoAddress, proposalId, chainId) {
  try {
    return col.proposals().findOne({
      daoAddress: daoAddress.toLowerCase(),
      proposalId: Number(proposalId),
      chainId,
    });
  } catch (err) {
    logger.error('mongoService.getProposal:', err.message);
    return null;
  }
}

/**
 * Update proposal status and vote counts after a blockchain event.
 */
export async function updateProposalVotes(daoAddress, proposalId, chainId, voteData) {
  try {
    await col.proposals().updateOne(
      { daoAddress: daoAddress.toLowerCase(), proposalId, chainId },
      {
        $set: {
          votesFor:     voteData.votesFor,
          votesAgainst: voteData.votesAgainst,
          votesAbstain: voteData.votesAbstain,
          totalVoters:  voteData.totalVoters,
          status:       voteData.status || 'active',
          updatedAt:    new Date(),
        },
      }
    );
  } catch (err) {
    logger.error('mongoService.updateProposalVotes:', err.message);
  }
}

// ─── User votes ───────────────────────────────────────────────────────────────

/**
 * Record a user vote (idempotent — one vote per user per proposal).
 */
export async function recordVote(data) {
  try {
    const filter = {
      userAddress: data.userAddress.toLowerCase(),
      daoAddress:  data.daoAddress.toLowerCase(),
      proposalId:  data.proposalId,
      chainId:     data.chainId,
    };
    await col.votes().updateOne(
      filter,
      {
        $set: {
          ...filter,
          vote:      data.vote,   // 0=for 1=against 2=abstain
          weight:    data.weight || '0',
          txHash:    data.txHash || null,
          timestamp: new Date(),
        },
      },
      { upsert: true }
    );
    logger.debug(`Vote recorded: ${data.userAddress} on proposal #${data.proposalId}`);
  } catch (err) {
    logger.error('mongoService.recordVote:', err.message);
    throw err;
  }
}

/**
 * Get the vote a specific user cast on a proposal (null if not voted).
 */
export async function getUserVote(userAddress, daoAddress, proposalId, chainId) {
  try {
    return col.votes().findOne({
      userAddress: userAddress.toLowerCase(),
      daoAddress:  daoAddress.toLowerCase(),
      proposalId,
      chainId,
    });
  } catch (err) {
    logger.error('mongoService.getUserVote:', err.message);
    return null;
  }
}

/**
 * Get all votes cast by a user across all DAOs.
 */
export async function getUserVotes(userAddress, { chainId, limit = 100 } = {}) {
  try {
    const filter = { userAddress: userAddress.toLowerCase() };
    if (chainId) filter.chainId = chainId;
    return col.votes().find(filter).sort({ timestamp: -1 }).limit(limit).toArray();
  } catch (err) {
    logger.error('mongoService.getUserVotes:', err.message);
    return [];
  }
}

// ─── Activity feed ────────────────────────────────────────────────────────────

/**
 * Append an event to the DAO activity feed.
 * type: 'proposal_created' | 'vote_cast' | 'proposal_executed' | 'member_joined'
 */
export async function recordActivity(data) {
  try {
    await col.activity().insertOne({
      daoAddress:  data.daoAddress.toLowerCase(),
      chainId:     data.chainId,
      type:        data.type,
      userAddress: (data.userAddress || '').toLowerCase(),
      proposalId:  data.proposalId ?? null,
      payload:     data.payload || {},
      timestamp:   new Date(),
    });
  } catch (err) {
    logger.warn('mongoService.recordActivity:', err.message);
    // non-critical — don't rethrow
  }
}

/**
 * Get the recent activity feed for a DAO.
 */
export async function getDAOActivity(daoAddress, chainId, limit = 20) {
  try {
    return col.activity()
      .find({ daoAddress: daoAddress.toLowerCase(), chainId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  } catch (err) {
    logger.error('mongoService.getDAOActivity:', err.message);
    return [];
  }
}

// ─── DAO off-chain metadata ───────────────────────────────────────────────────

/**
 * Save or update off-chain DAO metadata (description, links, creator, txHash, etc.)
 * Keyed on (daoAddress, chainId) — mirrors the PostgreSQL unique constraint.
 */
export async function saveDAOMetadata(data) {
  try {
    const filter = {
      daoAddress: data.daoAddress.toLowerCase(),
      chainId:    data.chainId,
    };
    const doc = {
      ...filter,
      txHash:      data.txHash      || null,
      creator:     (data.creator || '').toLowerCase(),
      description: data.description || '',
      website:     data.website     || null,
      twitter:     data.twitter     || null,
      discord:     data.discord     || null,
      telegram:    data.telegram    || null,
      extra:       data.extra       || {},
      updatedAt:   new Date(),
    };

    await getMongoDB().collection('dao_metadata').updateOne(
      filter,
      { $set: doc, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );

    logger.debug(`DAO metadata saved: ${data.daoAddress}`);
    return doc;
  } catch (err) {
    logger.error('mongoService.saveDAOMetadata:', err.message);
    throw err;
  }
}

/**
 * Get off-chain metadata for a single DAO.
 */
export async function getDAOMetadata(daoAddress, chainId) {
  try {
    return getMongoDB().collection('dao_metadata').findOne({
      daoAddress: daoAddress.toLowerCase(),
      chainId,
    });
  } catch (err) {
    logger.error('mongoService.getDAOMetadata:', err.message);
    return null;
  }
}

// ─── Proposal chat messages ───────────────────────────────────────────────────

const chatCol = () => getMongoDB().collection('proposal_chats');

/**
 * Send a chat message for a proposal.
 * Returns the inserted document with its generated _id as `id`.
 */
export async function sendChatMessage(data) {
  try {
    const doc = {
      daoAddress:    data.daoAddress.toLowerCase(),
      chainId:       data.chainId,
      proposalId:    Number(data.proposalId),
      sender:        data.sender.toLowerCase(),
      senderName:    data.senderName    || null,
      senderAvatar:  data.senderAvatar  || null,
      message:       data.message.trim(),
      authSignature: data.authSignature || null,
      replyToId:     data.replyToId     || null,
      isEdited:      false,
      editedAt:      null,
      isDeleted:     false,
      timestamp:     Date.now(),
      createdAt:     new Date(),
    };

    const result = await chatCol().insertOne(doc);
    logger.debug(`Chat message sent in proposal ${data.proposalId} of DAO ${data.daoAddress}`);
    return { id: result.insertedId.toString(), ...doc };
  } catch (err) {
    logger.error('mongoService.sendChatMessage:', err.message);
    throw err;
  }
}

/**
 * Fetch the latest N messages for a proposal, sorted oldest-first.
 */
export async function getChatMessages(daoAddress, chainId, proposalId, { limit = 50, skip = 0 } = {}) {
  try {
    const docs = await chatCol()
      .find({
        daoAddress: daoAddress.toLowerCase(),
        chainId,
        proposalId: Number(proposalId),
      })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    return docs
      .reverse()
      .map(d => ({ ...d, id: d._id.toString() }));
  } catch (err) {
    logger.error('mongoService.getChatMessages:', err.message);
    return [];
  }
}

/**
 * Poll for messages newer than a given timestamp (ms epoch).
 * Used by the client to simulate real-time updates.
 */
export async function getChatMessagesSince(daoAddress, chainId, proposalId, sinceTimestamp) {
  try {
    const docs = await chatCol()
      .find({
        daoAddress: daoAddress.toLowerCase(),
        chainId,
        proposalId: Number(proposalId),
        timestamp:  { $gt: Number(sinceTimestamp) },
      })
      .sort({ timestamp: 1 })
      .toArray();

    return docs.map(d => ({ ...d, id: d._id.toString() }));
  } catch (err) {
    logger.error('mongoService.getChatMessagesSince:', err.message);
    return [];
  }
}

/**
 * Edit a message — only the original sender within 5 minutes.
 */
export async function editChatMessage(messageId, senderAddress, newText) {
  try {
    const { ObjectId } = await import('mongodb');
    const filter = {
      _id:       new ObjectId(messageId),
      sender:    senderAddress.toLowerCase(),
      isDeleted: false,
    };

    const doc = await chatCol().findOne(filter);
    if (!doc) throw new Error('Message not found or not authorized');
    if (Date.now() - doc.timestamp > 5 * 60 * 1000) throw new Error('Edit window expired (5 min)');

    await chatCol().updateOne(filter, {
      $set: { message: newText.trim(), isEdited: true, editedAt: new Date() },
    });

    return true;
  } catch (err) {
    logger.error('mongoService.editChatMessage:', err.message);
    throw err;
  }
}

/**
 * Soft-delete a message — only the original sender within 5 minutes.
 */
export async function deleteChatMessage(messageId, senderAddress) {
  try {
    const { ObjectId } = await import('mongodb');
    const filter = {
      _id:       new ObjectId(messageId),
      sender:    senderAddress.toLowerCase(),
      isDeleted: false,
    };

    const doc = await chatCol().findOne(filter);
    if (!doc) throw new Error('Message not found or not authorized');
    if (Date.now() - doc.timestamp > 5 * 60 * 1000) throw new Error('Delete window expired (5 min)');

    await chatCol().updateOne(filter, {
      $set: { message: '[deleted]', isDeleted: true, isEdited: true, editedAt: new Date() },
    });

    return true;
  } catch (err) {
    logger.error('mongoService.deleteChatMessage:', err.message);
    throw err;
  }
}

export default {
  upsertProposal, getProposalsByDAO, getProposal, updateProposalVotes,
  recordVote, getUserVote, getUserVotes,
  recordActivity, getDAOActivity,
  saveDAOMetadata, getDAOMetadata,
  sendChatMessage, getChatMessages, getChatMessagesSince, editChatMessage, deleteChatMessage,
};
