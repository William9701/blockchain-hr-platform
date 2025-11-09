const mongoose = require('mongoose');

/**
 * User Model - Stores off-chain user data
 *
 * WEB3 CONCEPT: Hybrid Storage
 * - Wallet address is the PRIMARY identifier (not email)
 * - This is off-chain data (MongoDB) for UX/performance
 * - Blockchain holds the TRUTH (ownership, contracts)
 * - Database holds METADATA (profiles, preferences, analytics)
 */

const userSchema = new mongoose.Schema({
  // Primary identifier - Ethereum wallet address
  walletAddress: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    index: true,
    validate: {
      validator: function(v) {
        return /^0x[a-fA-F0-9]{40}$/.test(v);
      },
      message: 'Invalid Ethereum address format'
    }
  },

  // User role
  role: {
    type: String,
    enum: ['company', 'talent', 'both'],
    required: true
  },

  // Profile information
  profile: {
    name: { type: String, trim: true },
    bio: { type: String, maxlength: 500 },
    avatar: { type: String }, // IPFS hash or URL
    location: { type: String },
    website: { type: String },

    // Company-specific fields
    companyName: { type: String },
    companySize: { type: String, enum: ['1-10', '11-50', '51-200', '201-500', '500+'] },
    industry: { type: String },

    // Talent-specific fields
    title: { type: String }, // e.g., "Smart Contract Developer"
    skills: [{ type: String }],
    hourlyRate: { type: Number },
    experience: { type: String }
  },

  // Contact (private, not shared publicly)
  contact: {
    email: { type: String, sparse: true },
    telegram: { type: String },
    discord: { type: String }
  },

  // Verification status
  verification: {
    isVerified: { type: Boolean, default: false },
    kycCompleted: { type: Boolean, default: false },
    verifiedAt: { type: Date },
    verificationMethod: { type: String }
  },

  // Reputation metrics (calculated from blockchain data)
  reputation: {
    rating: { type: Number, default: 0, min: 0, max: 5 },
    totalContracts: { type: Number, default: 0 },
    completedContracts: { type: Number, default: 0 },
    disputedContracts: { type: Number, default: 0 },
    totalEarned: { type: String, default: '0' }, // In wei as string
    totalSpent: { type: String, default: '0' }
  },

  // Social proof
  social: {
    github: { type: String },
    linkedin: { type: String },
    twitter: { type: String }
  },

  // Credentials (NFT token IDs owned)
  credentials: [{
    tokenId: { type: Number },
    skillName: { type: String },
    issuer: { type: String },
    issuedAt: { type: Date }
  }],

  // Notification preferences
  notifications: {
    email: { type: Boolean, default: true },
    browser: { type: Boolean, default: true },
    contractUpdates: { type: Boolean, default: true },
    milestoneReminders: { type: Boolean, default: true }
  },

  // Account status
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date },

  // Nonce for wallet signature verification (anti-replay)
  nonce: { type: String },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Indexes for performance
userSchema.index({ 'profile.companyName': 'text', 'profile.name': 'text' });
userSchema.index({ role: 1, 'verification.isVerified': 1 });
userSchema.index({ 'reputation.rating': -1 });

// Virtual for total completion rate
userSchema.virtual('completionRate').get(function() {
  if (this.reputation.totalContracts === 0) return 0;
  return (this.reputation.completedContracts / this.reputation.totalContracts) * 100;
});

module.exports = mongoose.model('User', userSchema);
