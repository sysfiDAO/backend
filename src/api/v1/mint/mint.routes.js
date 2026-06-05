import express from 'express';
import crypto from 'crypto';
import { ethers } from 'ethers';
import { requireFirebaseAuth } from '../../../middleware/auth/firebase.js';
import {
  resolveEffectiveBalance,
  getUserBalanceDoc,
  getUserWalletAddress,
  deductUserBalance,
} from '../../../services/userBalanceService.js';
import logger from '../../../utils/logger.js';

const router = express.Router();

const WSYN_ADDRESSES = {
  84532: '0x3c181eaaB64052c726194Da6797EA06DD15e8E6B',
  8453:  process.env.WSYN_CONTRACT_ADDRESS_MAINNET ?? '0x0000000000000000000000000000000000000000',
};

const MINT_FEE_WEI = '400000000000000';

router.post('/mint/voucher', requireFirebaseAuth, async (req, res) => {
  const { uid } = req;
  try {
    const requestedChainId = parseInt(
      req.headers['x-chain-id'] ?? process.env.CHAIN_ID ?? '84532', 10,
    );
    const contractAddress = WSYN_ADDRESSES[requestedChainId];
    if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
      return res.status(400).json({ success: false, error: `WSYN contract is not deployed on chain ${requestedChainId}` });
    }

    const userDoc = await getUserBalanceDoc(uid);
    const { amount: rawAmount, source } = resolveEffectiveBalance(userDoc);
    if (rawAmount === 0) {
      return res.status(400).json({ success: false, error: 'No mintable balance available' });
    }

    const storedAddress = await getUserWalletAddress(uid);
    if (!storedAddress) {
      return res.status(400).json({ success: false, error: 'No wallet address linked to this account. Create a wallet first.' });
    }

    let recipient;
    try {
      recipient = ethers.getAddress(storedAddress);
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid wallet address linked to account' });
    }

    if (!process.env.VOUCHER_SIGNER_KEY) {
      logger.error('[mint/voucher] VOUCHER_SIGNER_KEY is not set');
      return res.status(500).json({ success: false, error: 'Signing service unavailable' });
    }

    const nonce      = '0x' + crypto.randomBytes(32).toString('hex');
    const validFrom  = Math.floor(Date.now() / 1000);
    const validUntil = validFrom + 900;
    const amount     = ethers.parseUnits(rawAmount.toString(), 18);

    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'address', 'uint256', 'bytes32', 'uint256', 'uint256'],
      [requestedChainId, contractAddress, recipient, amount, nonce, validFrom, validUntil],
    );

    const hash         = ethers.keccak256(encoded);
    const signerWallet = new ethers.Wallet(process.env.VOUCHER_SIGNER_KEY);
    const signature    = await signerWallet.signMessage(ethers.getBytes(hash));

    await deductUserBalance(uid, source);

    logger.info(`[mint/voucher] Issued for uid=${uid} chain=${requestedChainId} amount=${rawAmount} source=${source}`);

    return res.status(200).json({
      success: true,
      voucher: { recipient, amount: amount.toString(), nonce, validFrom, validUntil, signature },
      mintFee: MINT_FEE_WEI,
      contractAddress,
      chainId: requestedChainId,
      resolvedFrom: source,
    });
  } catch (err) {
    logger.error('[mint/voucher] Unhandled error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
