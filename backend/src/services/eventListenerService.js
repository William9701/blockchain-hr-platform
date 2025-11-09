const blockchainService = require('./blockchainService');
const ContractActivity = require('../models/ContractActivity');
const User = require('../models/User');
const { ethers } = require('ethers');

/**
 * Event Listener Service
 *
 * WEB3 CONCEPT: Blockchain Event Listening
 * - Smart contracts emit "events" when things happen
 * - Events are LOGS stored in blockchain (permanent, searchable)
 * - Backend listens to these events in REAL-TIME
 * - This is how we sync blockchain state with our database
 *
 * KEY DIFFERENCE FROM WEB2:
 * - Web2: Your server knows everything (it's in your DB)
 * - Web3: Truth is on blockchain, you LISTEN to learn about changes
 * - Events can arrive out of order during chain reorgs!
 */

class EventListenerService {
  constructor(io) {
    this.io = io; // Socket.io instance for real-time frontend updates
    this.isListening = false;
  }

  /**
   * Start listening to all contract events
   */
  async startListening() {
    if (this.isListening) {
      console.log('⚠️  Event listener already running');
      return;
    }

    try {
      console.log('👂 Starting blockchain event listeners...');

      // Listen to Employment Contract events
      this.listenToEmploymentEvents();

      // Listen to Credential NFT events
      this.listenToCredentialEvents();

      // Handle missed events (from last processed block)
      await this.syncPastEvents();

      this.isListening = true;
      console.log('✅ Event listeners active\n');
    } catch (error) {
      console.error('❌ Failed to start event listeners:', error.message);
      throw error;
    }
  }

  /**
   * Listen to Employment Contract events
   */
  listenToEmploymentEvents() {
    const contract = blockchainService.employmentContract;

    // ContractCreated event
    contract.on('ContractCreated', async (contractId, company, talent, totalAmount, event) => {
      console.log('📝 New contract created:', Number(contractId));
      await this.handleContractCreated(contractId, company, talent, totalAmount, event);
    });

    // ContractAccepted event
    contract.on('ContractAccepted', async (contractId, talent, event) => {
      console.log('✅ Contract accepted:', Number(contractId));
      await this.handleContractAccepted(contractId, talent, event);
    });

    // MilestoneSubmitted event
    contract.on('MilestoneSubmitted', async (contractId, milestoneIndex, event) => {
      console.log('📤 Milestone submitted:', Number(contractId), 'index:', Number(milestoneIndex));
      await this.handleMilestoneSubmitted(contractId, milestoneIndex, event);
    });

    // MilestoneApproved event
    contract.on('MilestoneApproved', async (contractId, milestoneIndex, event) => {
      console.log('👍 Milestone approved:', Number(contractId));
      await this.handleMilestoneApproved(contractId, milestoneIndex, event);
    });

    // MilestonePaid event
    contract.on('MilestonePaid', async (contractId, milestoneIndex, amount, event) => {
      console.log('💰 Milestone paid:', Number(contractId), ethers.formatEther(amount), 'ETH');
      await this.handleMilestonePaid(contractId, milestoneIndex, amount, event);
    });

    // ContractCompleted event
    contract.on('ContractCompleted', async (contractId, event) => {
      console.log('🎉 Contract completed:', Number(contractId));
      await this.handleContractCompleted(contractId, event);
    });

    // ContractDisputed event
    contract.on('ContractDisputed', async (contractId, initiator, event) => {
      console.log('⚠️  Contract disputed:', Number(contractId), 'by:', initiator);
      await this.handleContractDisputed(contractId, initiator, event);
    });

    console.log('✅ Employment contract listeners registered');
  }

  /**
   * Listen to Credential NFT events
   */
  listenToCredentialEvents() {
    const contract = blockchainService.credentialContract;

    contract.on('CredentialIssued', async (tokenId, issuer, recipient, skillName, event) => {
      console.log('🎖️  Credential issued:', Number(tokenId), skillName);
      await this.handleCredentialIssued(tokenId, issuer, recipient, skillName, event);
    });

    console.log('✅ Credential contract listeners registered');
  }

  // ===== EVENT HANDLERS =====

  async handleContractCreated(contractId, company, talent, totalAmount, event) {
    try {
      const block = await event.getBlock();

      // Save to database
      await ContractActivity.create({
        contractId: Number(contractId),
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
        eventType: 'ContractCreated',
        company: company.toLowerCase(),
        talent: talent.toLowerCase(),
        initiator: company.toLowerCase(),
        eventData: {
          amount: totalAmount.toString()
        },
        timestamp: new Date(block.timestamp * 1000)
      });

      // Update user stats
      await User.findOneAndUpdate(
        { walletAddress: company.toLowerCase() },
        {
          $inc: { 'reputation.totalContracts': 1, 'reputation.totalSpent': totalAmount.toString() }
        }
      );

      await User.findOneAndUpdate(
        { walletAddress: talent.toLowerCase() },
        {
          $inc: { 'reputation.totalContracts': 1 }
        }
      );

      // Emit real-time notification via Socket.io
      this.io.to(company.toLowerCase()).emit('contract-created', {
        contractId: Number(contractId),
        talent: talent.toLowerCase(),
        amount: ethers.formatEther(totalAmount)
      });

      this.io.to(talent.toLowerCase()).emit('contract-received', {
        contractId: Number(contractId),
        company: company.toLowerCase(),
        amount: ethers.formatEther(totalAmount)
      });
    } catch (error) {
      console.error('Error handling ContractCreated:', error.message);
    }
  }

  async handleContractAccepted(contractId, talent, event) {
    try {
      const block = await event.getBlock();
      const contractData = await blockchainService.getContract(Number(contractId));

      await ContractActivity.create({
        contractId: Number(contractId),
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
        eventType: 'ContractAccepted',
        company: contractData.company.toLowerCase(),
        talent: talent.toLowerCase(),
        initiator: talent.toLowerCase(),
        timestamp: new Date(block.timestamp * 1000)
      });

      // Notify company
      this.io.to(contractData.company.toLowerCase()).emit('contract-accepted', {
        contractId: Number(contractId),
        talent: talent.toLowerCase()
      });
    } catch (error) {
      console.error('Error handling ContractAccepted:', error.message);
    }
  }

  async handleMilestoneSubmitted(contractId, milestoneIndex, event) {
    try {
      const block = await event.getBlock();
      const contractData = await blockchainService.getContract(Number(contractId));

      await ContractActivity.create({
        contractId: Number(contractId),
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
        eventType: 'MilestoneSubmitted',
        company: contractData.company.toLowerCase(),
        talent: contractData.talent.toLowerCase(),
        initiator: contractData.talent.toLowerCase(),
        eventData: {
          milestoneIndex: Number(milestoneIndex)
        },
        timestamp: new Date(block.timestamp * 1000)
      });

      // Notify company to review
      this.io.to(contractData.company.toLowerCase()).emit('milestone-submitted', {
        contractId: Number(contractId),
        milestoneIndex: Number(milestoneIndex)
      });
    } catch (error) {
      console.error('Error handling MilestoneSubmitted:', error.message);
    }
  }

  async handleMilestoneApproved(contractId, milestoneIndex, event) {
    try {
      const block = await event.getBlock();
      const contractData = await blockchainService.getContract(Number(contractId));

      await ContractActivity.create({
        contractId: Number(contractId),
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
        eventType: 'MilestoneApproved',
        company: contractData.company.toLowerCase(),
        talent: contractData.talent.toLowerCase(),
        initiator: contractData.company.toLowerCase(),
        eventData: {
          milestoneIndex: Number(milestoneIndex)
        },
        timestamp: new Date(block.timestamp * 1000)
      });

      this.io.to(contractData.talent.toLowerCase()).emit('milestone-approved', {
        contractId: Number(contractId),
        milestoneIndex: Number(milestoneIndex)
      });
    } catch (error) {
      console.error('Error handling MilestoneApproved:', error.message);
    }
  }

  async handleMilestonePaid(contractId, milestoneIndex, amount, event) {
    try {
      const block = await event.getBlock();
      const contractData = await blockchainService.getContract(Number(contractId));

      await ContractActivity.create({
        contractId: Number(contractId),
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
        eventType: 'MilestonePaid',
        company: contractData.company.toLowerCase(),
        talent: contractData.talent.toLowerCase(),
        initiator: contractData.company.toLowerCase(),
        eventData: {
          milestoneIndex: Number(milestoneIndex),
          amount: amount.toString()
        },
        timestamp: new Date(block.timestamp * 1000)
      });

      // Update talent earnings
      await User.findOneAndUpdate(
        { walletAddress: contractData.talent.toLowerCase() },
        {
          $inc: { 'reputation.totalEarned': amount.toString() }
        }
      );

      this.io.to(contractData.talent.toLowerCase()).emit('milestone-paid', {
        contractId: Number(contractId),
        milestoneIndex: Number(milestoneIndex),
        amount: ethers.formatEther(amount)
      });
    } catch (error) {
      console.error('Error handling MilestonePaid:', error.message);
    }
  }

  async handleContractCompleted(contractId, event) {
    try {
      const block = await event.getBlock();
      const contractData = await blockchainService.getContract(Number(contractId));

      await ContractActivity.create({
        contractId: Number(contractId),
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
        eventType: 'ContractCompleted',
        company: contractData.company.toLowerCase(),
        talent: contractData.talent.toLowerCase(),
        timestamp: new Date(block.timestamp * 1000)
      });

      // Update completion stats
      await User.findOneAndUpdate(
        { walletAddress: contractData.company.toLowerCase() },
        { $inc: { 'reputation.completedContracts': 1 } }
      );

      await User.findOneAndUpdate(
        { walletAddress: contractData.talent.toLowerCase() },
        { $inc: { 'reputation.completedContracts': 1 } }
      );

      this.io.to(contractData.company.toLowerCase()).emit('contract-completed', {
        contractId: Number(contractId)
      });

      this.io.to(contractData.talent.toLowerCase()).emit('contract-completed', {
        contractId: Number(contractId)
      });
    } catch (error) {
      console.error('Error handling ContractCompleted:', error.message);
    }
  }

  async handleContractDisputed(contractId, initiator, event) {
    try {
      const block = await event.getBlock();
      const contractData = await blockchainService.getContract(Number(contractId));

      await ContractActivity.create({
        contractId: Number(contractId),
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
        eventType: 'ContractDisputed',
        company: contractData.company.toLowerCase(),
        talent: contractData.talent.toLowerCase(),
        initiator: initiator.toLowerCase(),
        timestamp: new Date(block.timestamp * 1000)
      });

      // Update dispute stats
      await User.findOneAndUpdate(
        { walletAddress: contractData.company.toLowerCase() },
        { $inc: { 'reputation.disputedContracts': 1 } }
      );

      await User.findOneAndUpdate(
        { walletAddress: contractData.talent.toLowerCase() },
        { $inc: { 'reputation.disputedContracts': 1 } }
      );

      // Notify both parties
      this.io.to(contractData.company.toLowerCase()).emit('contract-disputed', {
        contractId: Number(contractId),
        initiator: initiator.toLowerCase()
      });

      this.io.to(contractData.talent.toLowerCase()).emit('contract-disputed', {
        contractId: Number(contractId),
        initiator: initiator.toLowerCase()
      });
    } catch (error) {
      console.error('Error handling ContractDisputed:', error.message);
    }
  }

  async handleCredentialIssued(tokenId, issuer, recipient, skillName, event) {
    try {
      const block = await event.getBlock();

      // Update talent's credentials
      await User.findOneAndUpdate(
        { walletAddress: recipient.toLowerCase() },
        {
          $push: {
            credentials: {
              tokenId: Number(tokenId),
              skillName,
              issuer: issuer.toLowerCase(),
              issuedAt: new Date(block.timestamp * 1000)
            }
          }
        }
      );

      this.io.to(recipient.toLowerCase()).emit('credential-received', {
        tokenId: Number(tokenId),
        skillName,
        issuer: issuer.toLowerCase()
      });
    } catch (error) {
      console.error('Error handling CredentialIssued:', error.message);
    }
  }

  /**
   * Sync past events that we might have missed
   */
  async syncPastEvents() {
    try {
      // Get last processed block
      const lastActivity = await ContractActivity.findOne().sort({ blockNumber: -1 });
      const fromBlock = lastActivity ? lastActivity.blockNumber + 1 : 0;

      console.log(`🔄 Syncing past events from block ${fromBlock}...`);

      // Query past events (limit to avoid timeouts)
      const currentBlock = await blockchainService.provider.getBlockNumber();
      const toBlock = Math.min(fromBlock + 1000, currentBlock);

      if (fromBlock < toBlock) {
        const events = await blockchainService.employmentContract.queryFilter(
          '*',
          fromBlock,
          toBlock
        );

        console.log(`📦 Found ${events.length} past events`);

        for (const event of events) {
          // Process each event based on its name
          // (Implementation similar to real-time handlers)
        }
      }

      console.log('✅ Past events synced');
    } catch (error) {
      console.error('Error syncing past events:', error.message);
    }
  }

  /**
   * Stop listening
   */
  stop() {
    if (this.isListening) {
      blockchainService.employmentContract.removeAllListeners();
      blockchainService.credentialContract.removeAllListeners();
      this.isListening = false;
      console.log('👋 Event listeners stopped');
    }
  }
}

module.exports = EventListenerService;
