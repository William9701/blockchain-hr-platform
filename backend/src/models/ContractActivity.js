const mongoose = require('mongoose');

/**
 * Contract Activity Model
 *
 * WEB3 CONCEPT: Event Indexing
 * - Blockchain events are permanent but slow to query
 * - We index them in MongoDB for FAST queries
 * - Backend listens to blockchain events and stores them here
 * - This is what services like Etherscan do
 */

const contractActivitySchema = new mongoose.Schema({
  // Blockchain data
  contractId: {
    type: Number,
    required: true,
    index: true
  },

  transactionHash: {
    type: String,
    required: true,
    unique: true
  },

  blockNumber: {
    type: Number,
    required: true
  },

  eventType: {
    type: String,
    required: true,
    enum: [
      'ContractCreated',
      'ContractAccepted',
      'ContractActivated',
      'MilestoneSubmitted',
      'MilestoneApproved',
      'MilestonePaid',
      'ContractDisputed',
      'ContractCompleted',
      'ContractFinalized',
      'ContractCancelled'
    ]
  },

  // Parties involved
  company: { type: String, index: true },
  talent: { type: String, index: true },
  initiator: { type: String }, // Who triggered this event

  // Event-specific data
  eventData: {
    milestoneIndex: { type: Number },
    amount: { type: String }, // In wei as string
    ipfsHash: { type: String },
    reason: { type: String }
  },

  // Metadata
  timestamp: {
    type: Date,
    required: true,
    index: true
  },

  processed: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for querying
contractActivitySchema.index({ contractId: 1, timestamp: -1 });
contractActivitySchema.index({ company: 1, timestamp: -1 });
contractActivitySchema.index({ talent: 1, timestamp: -1 });
contractActivitySchema.index({ eventType: 1, timestamp: -1 });

module.exports = mongoose.model('ContractActivity', contractActivitySchema);
