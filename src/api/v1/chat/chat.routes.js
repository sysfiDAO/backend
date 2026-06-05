import express from 'express';
import { verifyMessage } from 'viem';
import {
  sendChatMessage, getChatMessages, getChatMessagesSince,
  editChatMessage, deleteChatMessage,
} from '../../../services/mongoService.js';
import logger from '../../../utils/logger.js';

const router = express.Router();

async function verifySignature(message, signature, expectedAddress) {
  try {
    return await verifyMessage({ address: expectedAddress, message, signature });
  } catch {
    return false;
  }
}

router.get('/chat/:chainId/:daoAddress/:proposalId', async (req, res) => {
  try {
    const chainId    = parseInt(req.params.chainId);
    const { daoAddress, proposalId } = req.params;
    const limit      = parseInt(req.query.limit) || 50;
    const skip       = parseInt(req.query.skip)  || 0;
    const messages   = await getChatMessages(daoAddress, chainId, proposalId, { limit, skip });
    res.json({ success: true, data: messages, count: messages.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/chat/:chainId/:daoAddress/:proposalId/poll', async (req, res) => {
  try {
    const chainId  = parseInt(req.params.chainId);
    const { daoAddress, proposalId } = req.params;
    const since    = parseInt(req.query.since) || 0;
    const messages = await getChatMessagesSince(daoAddress, chainId, proposalId, since);
    res.json({ success: true, data: messages, count: messages.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/chat/:chainId/:daoAddress/:proposalId', async (req, res) => {
  try {
    const chainId    = parseInt(req.params.chainId);
    const { daoAddress, proposalId } = req.params;
    const { sender, senderName, senderAvatar, message, authSignature, authMessage, replyToId } = req.body;

    if (!sender || !message?.trim()) {
      return res.status(400).json({ success: false, error: 'sender and message are required' });
    }
    if (!authSignature || !authMessage) {
      return res.status(401).json({ success: false, error: 'authSignature and authMessage are required' });
    }

    const isValid = await verifySignature(authMessage, authSignature, sender);
    if (!isValid) return res.status(401).json({ success: false, error: 'Invalid signature' });

    const saved = await sendChatMessage({
      daoAddress, chainId, proposalId, sender,
      senderName: senderName || null, senderAvatar: senderAvatar || null,
      message, authSignature, replyToId: replyToId || null,
    });

    res.status(201).json({ success: true, data: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/chat/:chainId/:daoAddress/:proposalId/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { sender, authSignature, authMessage, newText } = req.body;
    if (!sender || !newText?.trim()) {
      return res.status(400).json({ success: false, error: 'sender and newText are required' });
    }
    if (!authSignature || !authMessage) {
      return res.status(401).json({ success: false, error: 'authSignature and authMessage are required' });
    }
    const isValid = await verifySignature(authMessage, authSignature, sender);
    if (!isValid) return res.status(401).json({ success: false, error: 'Invalid signature' });
    await editChatMessage(messageId, sender, newText);
    res.json({ success: true });
  } catch (err) {
    const status = err.message.includes('not found') || err.message.includes('not authorized') ? 403 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

router.delete('/chat/:chainId/:daoAddress/:proposalId/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { sender, authSignature, authMessage } = req.body;
    if (!sender) return res.status(400).json({ success: false, error: 'sender is required' });
    if (!authSignature || !authMessage) {
      return res.status(401).json({ success: false, error: 'authSignature and authMessage are required' });
    }
    const isValid = await verifySignature(authMessage, authSignature, sender);
    if (!isValid) return res.status(401).json({ success: false, error: 'Invalid signature' });
    await deleteChatMessage(messageId, sender);
    res.json({ success: true });
  } catch (err) {
    const status = err.message.includes('not found') || err.message.includes('not authorized') ? 403 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

export default router;
