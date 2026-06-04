import express from 'express';
import mongoService  from '../../../services/mongoService.js';
import redisService  from '../../../services/redisService.js';
import { getMongoDB } from '../../../db/mongodb.js';
import logger        from '../../../utils/logger.js';

const router = express.Router();

router.get('/proposals/:chainId/:daoAddress', async (req, res) => {
  try {
    const chainId    = parseInt(req.params.chainId);
    const daoAddress = req.params.daoAddress.toLowerCase();
    const { status, limit = 50, skip = 0 } = req.query;

    if (!status) {
      const cached = await redisService.getProposals(chainId, daoAddress);
      if (cached) return res.json({ success: true, source: 'cache', data: cached });
    }

    const proposals = await mongoService.getProposalsByDAO(daoAddress, chainId, {
      status, limit: parseInt(limit), skip: parseInt(skip),
    });

    if (!status) await redisService.setProposals(chainId, daoAddress, proposals);

    res.json({ success: true, source: 'db', count: proposals.length, data: proposals });
  } catch (err) {
    logger.error('GET /proposals error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/proposals/:chainId/:daoAddress/:proposalId', async (req, res) => {
  try {
    const chainId    = parseInt(req.params.chainId);
    const daoAddress = req.params.daoAddress.toLowerCase();
    const proposalId = parseInt(req.params.proposalId);
    const proposal   = await mongoService.getProposal(daoAddress, proposalId, chainId);
    if (!proposal) return res.status(404).json({ success: false, error: 'Proposal not found' });
    res.json({ success: true, data: proposal });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/proposals', async (req, res) => {
  try {
    const {
      proposalId, daoAddress, chainId, title, description, type,
      proposer, targetAddress, amount, callData, startTime, endTime, txHash,
    } = req.body;

    if (!proposalId || !daoAddress || !chainId) {
      return res.status(400).json({ success: false, error: 'proposalId, daoAddress, chainId required' });
    }

    const proposal = await mongoService.upsertProposal({
      proposalId: parseInt(proposalId), daoAddress, chainId: parseInt(chainId),
      title, description, type: type || 'generic', status: 'active',
      proposer, targetAddress, amount, callData,
      startTime: parseInt(startTime), endTime: parseInt(endTime), txHash,
    });

    await mongoService.recordActivity({
      daoAddress, chainId: parseInt(chainId), type: 'proposal_created',
      userAddress: proposer, proposalId: parseInt(proposalId), payload: { title, txHash },
    });

    await redisService.invalidateProposals(parseInt(chainId), daoAddress);

    res.status(201).json({ success: true, data: proposal });
  } catch (err) {
    logger.error('POST /proposals error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/proposals/:chainId/:daoAddress/:proposalId/vote', async (req, res) => {
  try {
    const chainId    = parseInt(req.params.chainId);
    const daoAddress = req.params.daoAddress.toLowerCase();
    const proposalId = parseInt(req.params.proposalId);
    const { userAddress, vote, weight, txHash, votesFor, votesAgainst, votesAbstain, totalVoters } = req.body;

    if (userAddress === undefined || vote === undefined) {
      return res.status(400).json({ success: false, error: 'userAddress and vote required' });
    }

    await mongoService.recordVote({ userAddress, daoAddress, proposalId, chainId, vote, weight, txHash });

    if (votesFor !== undefined) {
      await mongoService.updateProposalVotes(daoAddress, proposalId, chainId, {
        votesFor, votesAgainst, votesAbstain, totalVoters,
      });
    }

    const VOTE_LABELS = { 0: 'for', 1: 'against', 2: 'abstain' };
    await mongoService.recordActivity({
      daoAddress, chainId, type: 'vote_cast', userAddress, proposalId,
      payload: { vote: VOTE_LABELS[vote] || vote, weight, txHash },
    });

    await redisService.invalidateProposals(chainId, daoAddress);
    res.json({ success: true, message: 'Vote recorded' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/proposals/:chainId/:daoAddress/:proposalId/user/:userAddress', async (req, res) => {
  try {
    const chainId    = parseInt(req.params.chainId);
    const proposalId = parseInt(req.params.proposalId);
    const voteRecord = await mongoService.getUserVote(
      req.params.userAddress, req.params.daoAddress, proposalId, chainId,
    );
    res.json({ success: true, voted: !!voteRecord, data: voteRecord });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/activity/:chainId/:daoAddress', async (req, res) => {
  try {
    const chainId    = parseInt(req.params.chainId);
    const limit      = parseInt(req.query.limit) || 20;
    const feed = await mongoService.getDAOActivity(req.params.daoAddress, chainId, limit);
    res.json({ success: true, count: feed.length, data: feed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/proposals/:chainId/:daoAddress/:proposalId/status', async (req, res) => {
  try {
    const chainId    = parseInt(req.params.chainId);
    const daoAddress = req.params.daoAddress.toLowerCase();
    const proposalId = parseInt(req.params.proposalId);
    const { status, txHash, userAddress } = req.body;

    const VALID = ['active', 'passed', 'failed', 'executed', 'cancelled'];
    if (!VALID.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${VALID.join(', ')}` });
    }

    const db = getMongoDB();
    await db.collection('proposals').updateOne(
      { daoAddress, proposalId, chainId },
      { $set: { status, txHash: txHash || null, updatedAt: new Date() } },
    );

    await mongoService.recordActivity({
      daoAddress, chainId, type: `proposal_${status}`,
      userAddress: userAddress || '', proposalId, payload: { txHash },
    });

    await redisService.invalidateProposals(chainId, daoAddress);
    res.json({ success: true, message: `Proposal status updated to ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
