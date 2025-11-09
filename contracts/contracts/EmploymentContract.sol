// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title EmploymentContract
 * @dev Manages employment agreements between companies and talents with escrow and milestones
 *
 * KEY WEB3 CONCEPTS:
 * - Escrow: Funds locked in contract until conditions met
 * - Multi-sig: Both parties must approve actions
 * - Events: Blockchain logs that backend listens to
 * - State machine: Contract moves through defined states
 */
contract EmploymentContract is ReentrancyGuard, Ownable {

    // ===== ENUMS: Define possible states =====
    enum ContractStatus {
        PENDING,      // Created, awaiting talent acceptance
        ACTIVE,       // Both parties agreed, work in progress
        COMPLETED,    // All milestones done, awaiting final approval
        DISPUTED,     // Conflict raised by either party
        CANCELLED,    // Cancelled before activation
        FINALIZED     // Payment released, contract closed
    }

    enum MilestoneStatus {
        PENDING,      // Not started
        IN_PROGRESS,  // Talent working on it
        SUBMITTED,    // Talent submitted for review
        APPROVED,     // Company approved
        PAID          // Funds released
    }

    // ===== STRUCTS: Complex data types =====
    struct Milestone {
        string description;
        uint256 amount;           // Payment in wei (1 ETH = 10^18 wei)
        uint256 deadline;         // Unix timestamp
        MilestoneStatus status;
        string ipfsHash;          // Deliverable stored on IPFS
    }

    struct Contract {
        uint256 id;
        address company;          // Company wallet address
        address talent;           // Talent wallet address
        string jobTitle;
        string ipfsMetadata;      // Full contract details on IPFS
        uint256 totalAmount;      // Total escrow amount
        uint256 startDate;
        uint256 endDate;
        ContractStatus status;
        Milestone[] milestones;
        uint256 createdAt;
        bool companyApproved;     // Multi-sig approval flags
        bool talentApproved;
    }

    // ===== STATE VARIABLES =====
    uint256 private contractCounter;
    mapping(uint256 => Contract) public contracts;
    mapping(address => uint256[]) public companyContracts;  // Company's contract IDs
    mapping(address => uint256[]) public talentContracts;   // Talent's contract IDs

    // Platform fee (2%)
    uint256 public platformFeePercent = 2;
    address public platformWallet;

    // ===== EVENTS: Blockchain logs for backend listeners =====
    event ContractCreated(
        uint256 indexed contractId,
        address indexed company,
        address indexed talent,
        uint256 totalAmount
    );

    event ContractAccepted(uint256 indexed contractId, address indexed talent);
    event ContractActivated(uint256 indexed contractId);
    event MilestoneSubmitted(uint256 indexed contractId, uint256 milestoneIndex);
    event MilestoneApproved(uint256 indexed contractId, uint256 milestoneIndex);
    event MilestonePaid(uint256 indexed contractId, uint256 milestoneIndex, uint256 amount);
    event ContractDisputed(uint256 indexed contractId, address indexed initiator);
    event ContractCompleted(uint256 indexed contractId);
    event ContractFinalized(uint256 indexed contractId);
    event ContractCancelled(uint256 indexed contractId);

    // ===== MODIFIERS: Access control =====
    modifier onlyCompany(uint256 _contractId) {
        require(contracts[_contractId].company == msg.sender, "Only company can perform this action");
        _;
    }

    modifier onlyTalent(uint256 _contractId) {
        require(contracts[_contractId].talent == msg.sender, "Only talent can perform this action");
        _;
    }

    modifier onlyParties(uint256 _contractId) {
        require(
            contracts[_contractId].company == msg.sender ||
            contracts[_contractId].talent == msg.sender,
            "Only contract parties can perform this action"
        );
        _;
    }

    modifier inStatus(uint256 _contractId, ContractStatus _status) {
        require(contracts[_contractId].status == _status, "Invalid contract status");
        _;
    }

    // ===== CONSTRUCTOR =====
    constructor(address _platformWallet) Ownable(msg.sender) {
        platformWallet = _platformWallet;
    }

    // ===== MAIN FUNCTIONS =====

    /**
     * @dev Create employment contract with escrow payment
     * @notice Company creates contract and sends total payment to escrow
     */
    function createContract(
        address _talent,
        string memory _jobTitle,
        string memory _ipfsMetadata,
        uint256 _startDate,
        uint256 _endDate,
        string[] memory _milestoneDescriptions,
        uint256[] memory _milestoneAmounts,
        uint256[] memory _milestoneDeadlines
    ) external payable returns (uint256) {
        require(_talent != address(0), "Invalid talent address");
        require(_talent != msg.sender, "Cannot create contract with yourself");
        require(_milestoneDescriptions.length == _milestoneAmounts.length, "Milestone arrays mismatch");
        require(_milestoneDescriptions.length == _milestoneDeadlines.length, "Deadline arrays mismatch");
        require(_milestoneDescriptions.length > 0, "Must have at least one milestone");

        // Calculate total amount from milestones
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < _milestoneAmounts.length; i++) {
            totalAmount += _milestoneAmounts[i];
        }

        require(msg.value == totalAmount, "Must send exact total amount to escrow");

        contractCounter++;
        Contract storage newContract = contracts[contractCounter];

        newContract.id = contractCounter;
        newContract.company = msg.sender;
        newContract.talent = _talent;
        newContract.jobTitle = _jobTitle;
        newContract.ipfsMetadata = _ipfsMetadata;
        newContract.totalAmount = totalAmount;
        newContract.startDate = _startDate;
        newContract.endDate = _endDate;
        newContract.status = ContractStatus.PENDING;
        newContract.createdAt = block.timestamp;

        // Add milestones
        for (uint256 i = 0; i < _milestoneDescriptions.length; i++) {
            newContract.milestones.push(Milestone({
                description: _milestoneDescriptions[i],
                amount: _milestoneAmounts[i],
                deadline: _milestoneDeadlines[i],
                status: MilestoneStatus.PENDING,
                ipfsHash: ""
            }));
        }

        companyContracts[msg.sender].push(contractCounter);
        talentContracts[_talent].push(contractCounter);

        emit ContractCreated(contractCounter, msg.sender, _talent, totalAmount);

        return contractCounter;
    }

    /**
     * @dev Talent accepts the contract
     */
    function acceptContract(uint256 _contractId)
        external
        onlyTalent(_contractId)
        inStatus(_contractId, ContractStatus.PENDING)
    {
        Contract storage _contract = contracts[_contractId];
        _contract.status = ContractStatus.ACTIVE;

        emit ContractAccepted(_contractId, msg.sender);
        emit ContractActivated(_contractId);
    }

    /**
     * @dev Talent submits milestone deliverable
     */
    function submitMilestone(uint256 _contractId, uint256 _milestoneIndex, string memory _ipfsHash)
        external
        onlyTalent(_contractId)
        inStatus(_contractId, ContractStatus.ACTIVE)
    {
        Contract storage _contract = contracts[_contractId];
        require(_milestoneIndex < _contract.milestones.length, "Invalid milestone index");

        Milestone storage milestone = _contract.milestones[_milestoneIndex];
        require(
            milestone.status == MilestoneStatus.PENDING ||
            milestone.status == MilestoneStatus.IN_PROGRESS,
            "Milestone already submitted"
        );

        milestone.status = MilestoneStatus.SUBMITTED;
        milestone.ipfsHash = _ipfsHash;

        emit MilestoneSubmitted(_contractId, _milestoneIndex);
    }

    /**
     * @dev Company approves milestone and releases payment
     */
    function approveMilestone(uint256 _contractId, uint256 _milestoneIndex)
        external
        onlyCompany(_contractId)
        inStatus(_contractId, ContractStatus.ACTIVE)
        nonReentrant
    {
        Contract storage _contract = contracts[_contractId];
        require(_milestoneIndex < _contract.milestones.length, "Invalid milestone index");

        Milestone storage milestone = _contract.milestones[_milestoneIndex];
        require(milestone.status == MilestoneStatus.SUBMITTED, "Milestone not submitted");

        milestone.status = MilestoneStatus.APPROVED;

        emit MilestoneApproved(_contractId, _milestoneIndex);

        // Auto-release payment
        _releaseMilestonePayment(_contractId, _milestoneIndex);
    }

    /**
     * @dev Internal function to release milestone payment
     */
    function _releaseMilestonePayment(uint256 _contractId, uint256 _milestoneIndex) private {
        Contract storage _contract = contracts[_contractId];
        Milestone storage milestone = _contract.milestones[_milestoneIndex];

        require(milestone.status == MilestoneStatus.APPROVED, "Milestone not approved");

        uint256 amount = milestone.amount;
        uint256 platformFee = (amount * platformFeePercent) / 100;
        uint256 talentPayment = amount - platformFee;

        milestone.status = MilestoneStatus.PAID;

        // Transfer funds
        (bool successTalent, ) = _contract.talent.call{value: talentPayment}("");
        require(successTalent, "Payment to talent failed");

        (bool successPlatform, ) = platformWallet.call{value: platformFee}("");
        require(successPlatform, "Platform fee transfer failed");

        emit MilestonePaid(_contractId, _milestoneIndex, talentPayment);

        // Check if all milestones are paid
        if (_allMilestonesPaid(_contractId)) {
            _contract.status = ContractStatus.COMPLETED;
            emit ContractCompleted(_contractId);
        }
    }

    /**
     * @dev Check if all milestones are paid
     */
    function _allMilestonesPaid(uint256 _contractId) private view returns (bool) {
        Contract storage _contract = contracts[_contractId];
        for (uint256 i = 0; i < _contract.milestones.length; i++) {
            if (_contract.milestones[i].status != MilestoneStatus.PAID) {
                return false;
            }
        }
        return true;
    }

    /**
     * @dev Either party can raise a dispute
     */
    function raiseDispute(uint256 _contractId)
        external
        onlyParties(_contractId)
    {
        Contract storage _contract = contracts[_contractId];
        require(
            _contract.status == ContractStatus.ACTIVE ||
            _contract.status == ContractStatus.COMPLETED,
            "Cannot dispute in current status"
        );

        _contract.status = ContractStatus.DISPUTED;

        emit ContractDisputed(_contractId, msg.sender);
    }

    /**
     * @dev Finalize completed contract (both parties approve)
     */
    function finalizeContract(uint256 _contractId)
        external
        onlyParties(_contractId)
        inStatus(_contractId, ContractStatus.COMPLETED)
    {
        Contract storage _contract = contracts[_contractId];

        if (msg.sender == _contract.company) {
            _contract.companyApproved = true;
        } else {
            _contract.talentApproved = true;
        }

        // If both approved, finalize
        if (_contract.companyApproved && _contract.talentApproved) {
            _contract.status = ContractStatus.FINALIZED;
            emit ContractFinalized(_contractId);
        }
    }

    /**
     * @dev Cancel contract before activation
     */
    function cancelContract(uint256 _contractId)
        external
        onlyCompany(_contractId)
        inStatus(_contractId, ContractStatus.PENDING)
        nonReentrant
    {
        Contract storage _contract = contracts[_contractId];
        _contract.status = ContractStatus.CANCELLED;

        // Refund company
        (bool success, ) = _contract.company.call{value: _contract.totalAmount}("");
        require(success, "Refund failed");

        emit ContractCancelled(_contractId);
    }

    // ===== VIEW FUNCTIONS =====

    function getContract(uint256 _contractId) external view returns (
        uint256 id,
        address company,
        address talent,
        string memory jobTitle,
        uint256 totalAmount,
        ContractStatus status,
        uint256 milestoneCount
    ) {
        Contract storage _contract = contracts[_contractId];
        return (
            _contract.id,
            _contract.company,
            _contract.talent,
            _contract.jobTitle,
            _contract.totalAmount,
            _contract.status,
            _contract.milestones.length
        );
    }

    function getMilestone(uint256 _contractId, uint256 _milestoneIndex)
        external
        view
        returns (
            string memory description,
            uint256 amount,
            uint256 deadline,
            MilestoneStatus status,
            string memory ipfsHash
        )
    {
        Contract storage _contract = contracts[_contractId];
        require(_milestoneIndex < _contract.milestones.length, "Invalid milestone");

        Milestone storage milestone = _contract.milestones[_milestoneIndex];
        return (
            milestone.description,
            milestone.amount,
            milestone.deadline,
            milestone.status,
            milestone.ipfsHash
        );
    }

    function getCompanyContracts(address _company) external view returns (uint256[] memory) {
        return companyContracts[_company];
    }

    function getTalentContracts(address _talent) external view returns (uint256[] memory) {
        return talentContracts[_talent];
    }

    // ===== ADMIN FUNCTIONS =====

    function setPlatformFee(uint256 _newFeePercent) external onlyOwner {
        require(_newFeePercent <= 10, "Fee too high"); // Max 10%
        platformFeePercent = _newFeePercent;
    }

    function setPlatformWallet(address _newWallet) external onlyOwner {
        require(_newWallet != address(0), "Invalid address");
        platformWallet = _newWallet;
    }
}
