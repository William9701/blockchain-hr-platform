const mongoose = require('mongoose');

/**
 * Job Posting Model
 *
 * WEB3 CONCEPT: Off-chain Discovery, On-chain Execution
 * - Job postings live in traditional DB (fast queries, search)
 * - When talent accepts, contract goes ON-CHAIN
 * - This is a common pattern: off-chain for discovery, on-chain for value
 */

const jobPostingSchema = new mongoose.Schema({
  // Company who posted
  company: {
    type: String,
    required: true,
    ref: 'User',
    index: true
  },

  // Job details
  title: {
    type: String,
    required: true,
    trim: true
  },

  description: {
    type: String,
    required: true,
    maxlength: 5000
  },

  // Job metadata
  category: {
    type: String,
    enum: ['development', 'design', 'marketing', 'writing', 'other'],
    required: true
  },

  skillsRequired: [{
    type: String
  }],

  // Payment info
  paymentType: {
    type: String,
    enum: ['fixed', 'hourly', 'milestone'],
    required: true
  },

  budget: {
    min: { type: Number }, // In USD for display
    max: { type: Number },
    currency: { type: String, default: 'ETH' }
  },

  // Duration
  duration: {
    type: String,
    enum: ['less-than-1-month', '1-3-months', '3-6-months', '6-months-plus'],
    required: true
  },

  // Milestones (if applicable)
  proposedMilestones: [{
    description: { type: String },
    amount: { type: Number },
    deadline: { type: Number } // Days from start
  }],

  // Applications
  applicants: [{
    talent: { type: String, ref: 'User' },
    appliedAt: { type: Date, default: Date.now },
    proposal: { type: String },
    proposedRate: { type: Number },
    status: {
      type: String,
      enum: ['pending', 'reviewed', 'accepted', 'rejected'],
      default: 'pending'
    }
  }],

  // Status
  status: {
    type: String,
    enum: ['open', 'in-progress', 'closed', 'cancelled'],
    default: 'open'
  },

  // Contract ID (once accepted and created on-chain)
  contractId: {
    type: Number,
    sparse: true
  },

  // Selected talent
  selectedTalent: {
    type: String,
    ref: 'User'
  },

  // Metadata
  ipfsHash: { type: String }, // Full job details on IPFS
  tags: [{ type: String }],
  experienceLevel: {
    type: String,
    enum: ['beginner', 'intermediate', 'expert']
  },

  // Analytics
  views: { type: Number, default: 0 },
  applicationsCount: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  closedAt: { type: Date }
}, {
  timestamps: true
});

// Indexes
jobPostingSchema.index({ company: 1, status: 1 });
jobPostingSchema.index({ status: 1, createdAt: -1 });
jobPostingSchema.index({ category: 1, status: 1 });
jobPostingSchema.index({ skillsRequired: 1 });

module.exports = mongoose.model('JobPosting', jobPostingSchema);
