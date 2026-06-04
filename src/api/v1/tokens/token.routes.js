import express from 'express';
import tokenController from '../../../controllers/tokenControllers.js';

const router = express.Router();

router.get('/',                               tokenController.getAllTokens);
router.get('/chains',                         tokenController.getChains);
router.get('/search',                         tokenController.searchTokens);
router.get('/chain/:chainId',                 tokenController.getTokensByChain);
router.get('/chain/name/:chainName',          tokenController.getTokensByChainName);
router.get('/chain/:chainId/address/:address', tokenController.getTokenByAddress);
router.get('/chain/:chainId/symbol/:symbol',  tokenController.getTokenBySymbol);
router.post('/reload',                        tokenController.reloadTokens);

export default router;
