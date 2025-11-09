const { ethers } = require('ethers');
const EventEmitter = require('events');

/**
 * Blockchain Service
 *
 * WEB3 CONCEPT: Provider Pattern
 * - Provider = Connection to blockchain (like DB connection in Web2)
 * - Signer = Wallet that can send transactions (needs private key)
 * - Contract = JavaScript interface to smart contract
 *
 * KEY DIFFERENCE FROM WEB2:
 * - In Web2: You write to DB directly
 * - In Web3: You SUBMIT transactions and WAIT for mining
 * - Transactions can FAIL even after submission
 */

class BlockchainService extends EventEmitter {
  constructor() {
    super();
    this.provider = null;
    this.signer = null;
    this.employmentContract = null;
    this.credentialContract = null;
    this.isInitialized = false;
  }

  /**
   * Initialize blockchain connection
   */
  async initialize() {
    try {
      // Create provider (read-only connection)
      this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

      // Create signer (can write transactions)
      if (process.env.PLATFORM_PRIVATE_KEY) {
        this.signer = new ethers.Wallet(
          process.env.PLATFORM_PRIVATE_KEY,
          this.provider
        );
        console.log('🔑 Platform wallet:', this.signer.address);
      }

      // Load contract ABIs
      const employmentABI = require('../../contracts/EmploymentContract.json');
      const credentialABI = require('../../contracts/CredentialNFT.json');

      // Create contract instances
      this.employmentContract = new ethers.Contract(
        process.env.EMPLOYMENT_CONTRACT_ADDRESS,
        employmentABI.abi,
        this.provider
      );

      this.credentialContract = new ethers.Contract(
        process.env.CREDENTIAL_NFT_ADDRESS,
        credentialABI.abi,
        this.provider
      );

      // Verify connection
      const network = await this.provider.getNetwork();
      console.log('⛓️  Connected to blockchain:', network.name);
      console.log('📄 Employment Contract:', process.env.EMPLOYMENT_CONTRACT_ADDRESS);
      console.log('🎖️  Credential Contract:', process.env.CREDENTIAL_NFT_ADDRESS);

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('❌ Blockchain initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Get contract instance with signer (for writing)
   */
  getEmploymentContractWithSigner(signerOrProvider) {
    return this.employmentContract.connect(signerOrProvider || this.signer);
  }

  getCredentialContractWithSigner(signerOrProvider) {
    return this.credentialContract.connect(signerOrProvider || this.signer);
  }

  // ===== READ FUNCTIONS (Free - No Gas) =====

  /**
   * Get contract details from blockchain
   */
  async getContract(contractId) {
    try {
      const contract = await this.employmentContract.getContract(contractId);
      return {
        id: Number(contract.id),
        company: contract.company,
        talent: contract.talent,
        jobTitle: contract.jobTitle,
        totalAmount: contract.totalAmount.toString(),
        status: Number(contract.status),
        milestoneCount: Number(contract.milestoneCount)
      };
    } catch (error) {
      console.error('Error fetching contract:', error.message);
      throw error;
    }
  }

  /**
   * Get milestone details
   */
  async getMilestone(contractId, milestoneIndex) {
    try {
      const milestone = await this.employmentContract.getMilestone(contractId, milestoneIndex);
      return {
        description: milestone.description,
        amount: milestone.amount.toString(),
        deadline: Number(milestone.deadline),
        status: Number(milestone.status),
        ipfsHash: milestone.ipfsHash
      };
    } catch (error) {
      console.error('Error fetching milestone:', error.message);
      throw error;
    }
  }

  /**
   * Get all contracts for an address
   */
  async getCompanyContracts(companyAddress) {
    try {
      const contractIds = await this.employmentContract.getCompanyContracts(companyAddress);
      return contractIds.map(id => Number(id));
    } catch (error) {
      console.error('Error fetching company contracts:', error.message);
      throw error;
    }
  }

  async getTalentContracts(talentAddress) {
    try {
      const contractIds = await this.employmentContract.getTalentContracts(talentAddress);
      return contractIds.map(id => Number(id));
    } catch (error) {
      console.error('Error fetching talent contracts:', error.message);
      throw error;
    }
  }

  /**
   * Get talent's credentials
   */
  async getTalentCredentials(talentAddress) {
    try {
      const tokenIds = await this.credentialContract.getTalentCredentials(talentAddress);
      return tokenIds.map(id => Number(id));
    } catch (error) {
      console.error('Error fetching credentials:', error.message);
      throw error;
    }
  }

  async getCredential(tokenId) {
    try {
      const cred = await this.credentialContract.getCredential(tokenId);
      return {
        issuer: cred.issuer,
        recipient: cred.recipient,
        skillName: cred.skillName,
        credentialType: cred.credentialType,
        issuedDate: Number(cred.issuedDate),
        revoked: cred.revoked
      };
    } catch (error) {
      console.error('Error fetching credential:', error.message);
      throw error;
    }
  }

  // ===== WRITE FUNCTIONS (Cost Gas - Need Signer) =====

  /**
   * Create employment contract on-chain
   * NOTE: This returns transaction, caller must wait for mining
   */
  async createEmploymentContract(params, signerPrivateKey) {
    try {
      // Create wallet from private key
      const wallet = new ethers.Wallet(signerPrivateKey, this.provider);
      const contract = this.getEmploymentContractWithSigner(wallet);

      // Estimate gas
      const gasEstimate = await contract.createContract.estimateGas(
        params.talent,
        params.jobTitle,
        params.ipfsMetadata,
        params.startDate,
        params.endDate,
        params.milestoneDescriptions,
        params.milestoneAmounts,
        params.milestoneDeadlines,
        { value: params.totalAmount }
      );

      console.log('⛽ Estimated gas:', gasEstimate.toString());

      // Send transaction
      const tx = await contract.createContract(
        params.talent,
        params.jobTitle,
        params.ipfsMetadata,
        params.startDate,
        params.endDate,
        params.milestoneDescriptions,
        params.milestoneAmounts,
        params.milestoneDeadlines,
        {
          value: params.totalAmount,
          gasLimit: gasEstimate * 120n / 100n // 20% buffer
        }
      );

      console.log('📤 Transaction sent:', tx.hash);

      // Wait for mining
      const receipt = await tx.wait();
      console.log('✅ Transaction mined in block:', receipt.blockNumber);

      // Extract contract ID from event
      const event = receipt.logs.find(
        log => log.topics[0] === ethers.id('ContractCreated(uint256,address,address,uint256)')
      );

      if (event) {
        const contractId = Number(ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], event.topics[1])[0]);
        return {
          contractId,
          transactionHash: receipt.hash,
          blockNumber: receipt.blockNumber
        };
      }

      throw new Error('ContractCreated event not found');
    } catch (error) {
      console.error('Error creating contract:', error.message);
      throw error;
    }
  }

  /**
   * Issue a credential NFT
   */
  async issueCredential(params, signerPrivateKey) {
    try {
      const wallet = new ethers.Wallet(signerPrivateKey, this.provider);
      const contract = this.getCredentialContractWithSigner(wallet);

      const tx = await contract.issueCredential(
        params.recipient,
        params.skillName,
        params.credentialType,
        params.tokenURI
      );

      console.log('📤 Credential issuance tx:', tx.hash);

      const receipt = await tx.wait();

      // Extract token ID from event
      const event = receipt.logs.find(
        log => log.topics[0] === ethers.id('CredentialIssued(uint256,address,address,string)')
      );

      if (event) {
        const tokenId = Number(ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], event.topics[1])[0]);
        return {
          tokenId,
          transactionHash: receipt.hash,
          blockNumber: receipt.blockNumber
        };
      }

      throw new Error('CredentialIssued event not found');
    } catch (error) {
      console.error('Error issuing credential:', error.message);
      throw error;
    }
  }

  // ===== UTILITY FUNCTIONS =====

  /**
   * Verify a wallet signature (for authentication)
   * WEB3 AUTHENTICATION CONCEPT:
   * - User signs a message with their private key
   * - Server verifies signature matches claimed address
   * - No password needed!
   */
  verifySignature(message, signature, expectedAddress) {
    try {
      const recoveredAddress = ethers.verifyMessage(message, signature);
      return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
    } catch (error) {
      console.error('Signature verification failed:', error.message);
      return false;
    }
  }

  /**
   * Format ether amounts
   */
  formatEther(wei) {
    return ethers.formatEther(wei);
  }

  parseEther(ether) {
    return ethers.parseEther(ether.toString());
  }

  /**
   * Check if address is valid
   */
  isValidAddress(address) {
    return ethers.isAddress(address);
  }
}

// Singleton instance
const blockchainService = new BlockchainService();

module.exports = blockchainService;
