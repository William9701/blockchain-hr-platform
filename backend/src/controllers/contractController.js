const blockchainService = require('../services/blockchainService');
const ContractActivity = require('../models/ContractActivity');
const JobPosting = require('../models/JobPosting');
const User = require('../models/User');

/**
 * Contract Controller
 *
 * WEB3 PATTERN: Hybrid Architecture
 * - Frontend -> Backend API -> Blockchain
 * - Backend acts as a "helper" layer
 * - Can also do direct Frontend -> Blockchain (for wallet interactions)
 */

/**
 * Get user's contracts (from blockchain)
 */
exports.getUserContracts = async (req, res) => {
  try {
    const { walletAddress } = req;
    const { role } = req.query;

    let contractIds;

    if (role === 'company') {
      contractIds = await blockchainService.getCompanyContracts(walletAddress);
    } else if (role === 'talent') {
      contractIds = await blockchainService.getTalentContracts(walletAddress);
    } else {
      // Both
      const companyIds = await blockchainService.getCompanyContracts(walletAddress);
      const talentIds = await blockchainService.getTalentContracts(walletAddress);
      contractIds = [...companyIds, ...talentIds];
    }

    // Fetch full details for each contract
    const contracts = await Promise.all(
      contractIds.map(async (id) => {
        const contract = await blockchainService.getContract(id);

        // Get milestones
        const milestones = [];
        for (let i = 0; i < contract.milestoneCount; i++) {
          const milestone = await blockchainService.getMilestone(id, i);
          milestones.push(milestone);
        }

        return {
          ...contract,
          milestones
        };
      })
    );

    res.json({ contracts });
  } catch (error) {
    console.error('Error fetching contracts:', error);
    res.status(500).json({ error: 'Failed to fetch contracts' });
  }
};

/**
 * Get contract details
 */
exports.getContract = async (req, res) => {
  try {
    const { contractId } = req.params;

    const contract = await blockchainService.getContract(Number(contractId));

    // Get milestones
    const milestones = [];
    for (let i = 0; i < contract.milestoneCount; i++) {
      const milestone = await blockchainService.getMilestone(Number(contractId), i);
      milestones.push(milestone);
    }

    // Get activity history
    const activities = await ContractActivity.find({ contractId: Number(contractId) })
      .sort({ timestamp: -1 })
      .limit(50);

    res.json({
      contract: {
        ...contract,
        milestones
      },
      activities
    });
  } catch (error) {
    console.error('Error fetching contract:', error);
    res.status(500).json({ error: 'Failed to fetch contract' });
  }
};

/**
 * Create contract (helper endpoint - could also be done directly from frontend)
 */
exports.createContract = async (req, res) => {
  try {
    const {
      talent,
      jobTitle,
      ipfsMetadata,
      startDate,
      endDate,
      milestones,
      totalAmount,
      signerPrivateKey // In production, use more secure key management
    } = req.body;

    // Validate
    if (!talent || !jobTitle || !milestones || !totalAmount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Prepare milestone data
    const milestoneDescriptions = milestones.map(m => m.description);
    const milestoneAmounts = milestones.map(m => blockchainService.parseEther(m.amount));
    const milestoneDeadlines = milestones.map(m => Math.floor(new Date(m.deadline).getTime() / 1000));

    const params = {
      talent,
      jobTitle,
      ipfsMetadata: ipfsMetadata || '',
      startDate: Math.floor(new Date(startDate).getTime() / 1000),
      endDate: Math.floor(new Date(endDate).getTime() / 1000),
      milestoneDescriptions,
      milestoneAmounts,
      milestoneDeadlines,
      totalAmount: blockchainService.parseEther(totalAmount)
    };

    // Create on blockchain
    const result = await blockchainService.createEmploymentContract(params, signerPrivateKey);

    res.json({
      success: true,
      contractId: result.contractId,
      transactionHash: result.transactionHash,
      blockNumber: result.blockNumber
    });
  } catch (error) {
    console.error('Error creating contract:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get contract activity/history
 */
exports.getContractActivity = async (req, res) => {
  try {
    const { contractId } = req.params;

    const activities = await ContractActivity.find({ contractId: Number(contractId) })
      .sort({ timestamp: -1 });

    res.json({ activities });
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
};

/**
 * Get platform analytics
 */
exports.getPlatformStats = async (req, res) => {
  try {
    // Total contracts created
    const totalContracts = await ContractActivity.countDocuments({ eventType: 'ContractCreated' });

    // Active contracts
    const activeContracts = await ContractActivity.distinct('contractId', {
      eventType: { $in: ['ContractAccepted', 'ContractActivated'] }
    });

    // Completed contracts
    const completedContracts = await ContractActivity.countDocuments({ eventType: 'ContractCompleted' });

    // Total users
    const totalUsers = await User.countDocuments();
    const companies = await User.countDocuments({ role: { $in: ['company', 'both'] } });
    const talents = await User.countDocuments({ role: { $in: ['talent', 'both'] } });

    // Total volume (from MilestonePaid events)
    const paymentEvents = await ContractActivity.find({ eventType: 'MilestonePaid' });
    const totalVolume = paymentEvents.reduce((sum, event) => {
      return sum + BigInt(event.eventData.amount || '0');
    }, BigInt(0));

    res.json({
      totalContracts,
      activeContracts: activeContracts.length,
      completedContracts,
      totalUsers,
      companies,
      talents,
      totalVolume: totalVolume.toString(),
      totalVolumeEth: blockchainService.formatEther(totalVolume)
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
};
