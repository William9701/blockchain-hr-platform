const jwt = require('jsonwebtoken');
const User = require('../models/User');
const blockchainService = require('../services/blockchainService');
const crypto = require('crypto');

/**
 * Authentication Middleware
 *
 * WEB3 AUTHENTICATION FLOW:
 * 1. Client requests a nonce (random number)
 * 2. Client signs: "Sign this message to authenticate: [nonce]"
 * 3. Server verifies signature matches wallet address
 * 4. Server issues JWT token
 * 5. Client uses JWT for subsequent requests
 *
 * KEY DIFFERENCE FROM WEB2:
 * - No passwords! Users prove ownership via cryptographic signature
 * - Nonce prevents replay attacks
 * - User controls their identity (wallet), not the platform
 */

/**
 * Generate authentication nonce for wallet
 */
exports.generateNonce = async (req, res) => {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress || !blockchainService.isValidAddress(walletAddress)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    const normalizedAddress = walletAddress.toLowerCase();

    // Generate random nonce
    const nonce = crypto.randomBytes(16).toString('hex');

    // Find or create user
    let user = await User.findOne({ walletAddress: normalizedAddress });

    if (!user) {
      // New user - create with pending status
      user = new User({
        walletAddress: normalizedAddress,
        role: 'talent', // Default, can be updated
        nonce
      });
    } else {
      user.nonce = nonce;
    }

    await user.save();

    res.json({
      nonce,
      message: `Welcome to Blockchain HR Platform!\n\nSign this message to authenticate with your wallet.\n\nNonce: ${nonce}\n\nThis request will not trigger a blockchain transaction or cost any gas fees.`
    });
  } catch (error) {
    console.error('Error generating nonce:', error);
    res.status(500).json({ error: 'Failed to generate nonce' });
  }
};

/**
 * Verify signature and issue JWT token
 */
exports.verifySignature = async (req, res) => {
  try {
    const { walletAddress, signature } = req.body;

    if (!walletAddress || !signature) {
      return res.status(400).json({ error: 'Missing wallet address or signature' });
    }

    const normalizedAddress = walletAddress.toLowerCase();

    // Get user and nonce
    const user = await User.findOne({ walletAddress: normalizedAddress });

    if (!user || !user.nonce) {
      return res.status(400).json({ error: 'Please request a nonce first' });
    }

    // Construct the message that was signed
    const message = `Welcome to Blockchain HR Platform!\n\nSign this message to authenticate with your wallet.\n\nNonce: ${user.nonce}\n\nThis request will not trigger a blockchain transaction or cost any gas fees.`;

    // Verify signature
    const isValid = blockchainService.verifySignature(message, signature, normalizedAddress);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Clear nonce (prevent replay)
    user.nonce = crypto.randomBytes(16).toString('hex');
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      {
        walletAddress: normalizedAddress,
        role: user.role,
        userId: user._id
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        walletAddress: user.walletAddress,
        role: user.role,
        profile: user.profile,
        reputation: user.reputation
      }
    });
  } catch (error) {
    console.error('Error verifying signature:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

/**
 * JWT authentication middleware
 */
exports.authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);

    // Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user
    const user = await User.findOne({ walletAddress: decoded.walletAddress });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Attach to request
    req.user = user;
    req.walletAddress = decoded.walletAddress;

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }

    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

/**
 * Role-based authorization
 */
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!roles.includes(req.user.role) && !roles.includes('both')) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

/**
 * Optional authentication (attach user if token present)
 */
exports.optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findOne({ walletAddress: decoded.walletAddress });

      if (user) {
        req.user = user;
        req.walletAddress = decoded.walletAddress;
      }
    }

    next();
  } catch (error) {
    // Ignore errors, just proceed without user
    next();
  }
};
