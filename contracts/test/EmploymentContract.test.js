const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("EmploymentContract", function () {
  let employmentContract;
  let owner, company, talent, platformWallet;

  beforeEach(async function () {
    [owner, company, talent, platformWallet] = await ethers.getSigners();

    const EmploymentContract = await ethers.getContractFactory("EmploymentContract");
    employmentContract = await EmploymentContract.deploy(platformWallet.address);
  });

  describe("Contract Creation", function () {
    it("Should create a contract with escrow", async function () {
      const milestoneDescriptions = ["Design mockups", "Develop MVP"];
      const milestoneAmounts = [
        ethers.parseEther("1"),
        ethers.parseEther("2")
      ];
      const totalAmount = ethers.parseEther("3");
      const milestoneDeadlines = [
        Math.floor(Date.now() / 1000) + 86400 * 7,  // 1 week
        Math.floor(Date.now() / 1000) + 86400 * 14  // 2 weeks
      ];

      const tx = await employmentContract.connect(company).createContract(
        talent.address,
        "Full Stack Developer",
        "ipfs://Qm...",
        Math.floor(Date.now() / 1000),
        Math.floor(Date.now() / 1000) + 86400 * 30,
        milestoneDescriptions,
        milestoneAmounts,
        milestoneDeadlines,
        { value: totalAmount }
      );

      await expect(tx)
        .to.emit(employmentContract, "ContractCreated")
        .withArgs(1, company.address, talent.address, totalAmount);

      const contract = await employmentContract.getContract(1);
      expect(contract.company).to.equal(company.address);
      expect(contract.talent).to.equal(talent.address);
      expect(contract.totalAmount).to.equal(totalAmount);
      expect(contract.status).to.equal(0); // PENDING
    });

    it("Should fail if escrow amount doesn't match", async function () {
      const milestoneAmounts = [ethers.parseEther("1")];
      const wrongAmount = ethers.parseEther("0.5");

      await expect(
        employmentContract.connect(company).createContract(
          talent.address,
          "Developer",
          "ipfs://",
          Math.floor(Date.now() / 1000),
          Math.floor(Date.now() / 1000) + 86400,
          ["Milestone 1"],
          milestoneAmounts,
          [Math.floor(Date.now() / 1000) + 86400],
          { value: wrongAmount }
        )
      ).to.be.revertedWith("Must send exact total amount to escrow");
    });
  });

  describe("Contract Lifecycle", function () {
    let contractId;

    beforeEach(async function () {
      const tx = await employmentContract.connect(company).createContract(
        talent.address,
        "Smart Contract Developer",
        "ipfs://contract-details",
        Math.floor(Date.now() / 1000),
        Math.floor(Date.now() / 1000) + 86400 * 30,
        ["Audit code", "Fix bugs"],
        [ethers.parseEther("1"), ethers.parseEther("1")],
        [Math.floor(Date.now() / 1000) + 86400 * 7, Math.floor(Date.now() / 1000) + 86400 * 14],
        { value: ethers.parseEther("2") }
      );

      const receipt = await tx.wait();
      contractId = 1;
    });

    it("Should allow talent to accept contract", async function () {
      await expect(employmentContract.connect(talent).acceptContract(contractId))
        .to.emit(employmentContract, "ContractAccepted")
        .withArgs(contractId, talent.address);

      const contract = await employmentContract.getContract(contractId);
      expect(contract.status).to.equal(1); // ACTIVE
    });

    it("Should process milestone submission and approval", async function () {
      // Accept contract
      await employmentContract.connect(talent).acceptContract(contractId);

      // Submit milestone
      await expect(
        employmentContract.connect(talent).submitMilestone(contractId, 0, "ipfs://deliverable")
      ).to.emit(employmentContract, "MilestoneSubmitted");

      // Approve and pay
      const talentBalanceBefore = await ethers.provider.getBalance(talent.address);

      await expect(
        employmentContract.connect(company).approveMilestone(contractId, 0)
      ).to.emit(employmentContract, "MilestoneApproved");

      const talentBalanceAfter = await ethers.provider.getBalance(talent.address);
      expect(talentBalanceAfter).to.be.gt(talentBalanceBefore);
    });

    it("Should allow dispute", async function () {
      await employmentContract.connect(talent).acceptContract(contractId);

      await expect(employmentContract.connect(talent).raiseDispute(contractId))
        .to.emit(employmentContract, "ContractDisputed")
        .withArgs(contractId, talent.address);

      const contract = await employmentContract.getContract(contractId);
      expect(contract.status).to.equal(3); // DISPUTED
    });

    it("Should allow cancellation before acceptance", async function () {
      const companyBalanceBefore = await ethers.provider.getBalance(company.address);

      await employmentContract.connect(company).cancelContract(contractId);

      const contract = await employmentContract.getContract(contractId);
      expect(contract.status).to.equal(4); // CANCELLED
    });
  });

  describe("Platform Fees", function () {
    it("Should deduct platform fee on milestone payment", async function () {
      const milestoneAmount = ethers.parseEther("1");

      await employmentContract.connect(company).createContract(
        talent.address,
        "Developer",
        "ipfs://",
        Math.floor(Date.now() / 1000),
        Math.floor(Date.now() / 1000) + 86400,
        ["Complete task"],
        [milestoneAmount],
        [Math.floor(Date.now() / 1000) + 86400],
        { value: milestoneAmount }
      );

      await employmentContract.connect(talent).acceptContract(1);
      await employmentContract.connect(talent).submitMilestone(1, 0, "ipfs://done");

      const platformBalanceBefore = await ethers.provider.getBalance(platformWallet.address);

      await employmentContract.connect(company).approveMilestone(1, 0);

      const platformBalanceAfter = await ethers.provider.getBalance(platformWallet.address);
      const expectedFee = (milestoneAmount * 2n) / 100n; // 2% fee

      expect(platformBalanceAfter - platformBalanceBefore).to.equal(expectedFee);
    });
  });
});
