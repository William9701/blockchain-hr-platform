const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const contractController = require('../controllers/contractController');

// ===== Authentication Routes =====
router.post('/auth/nonce', auth.generateNonce);
router.post('/auth/verify', auth.verifySignature);

// ===== Contract Routes =====
router.get('/contracts', auth.authenticate, contractController.getUserContracts);
router.get('/contracts/:contractId', auth.authenticate, contractController.getContract);
router.post('/contracts/create', auth.authenticate, contractController.createContract);
router.get('/contracts/:contractId/activity', auth.authenticate, contractController.getContractActivity);

// ===== Platform Stats (Public) =====
router.get('/stats', contractController.getPlatformStats);

// ===== Health Check =====
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    blockchain: blockchainService.isInitialized,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
