const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying Blockchain HR Platform contracts...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString(), "\n");

  // Platform wallet for fees (in production, use a multisig wallet)
  const platformWallet = deployer.address; // Change this in production

  // ===== Deploy EmploymentContract =====
  console.log("📄 Deploying EmploymentContract...");
  const EmploymentContract = await hre.ethers.getContractFactory("EmploymentContract");
  const employmentContract = await EmploymentContract.deploy(platformWallet);
  await employmentContract.waitForDeployment();
  const employmentAddress = await employmentContract.getAddress();
  console.log("✅ EmploymentContract deployed to:", employmentAddress, "\n");

  // ===== Deploy CredentialNFT =====
  console.log("🎖️  Deploying CredentialNFT...");
  const CredentialNFT = await hre.ethers.getContractFactory("CredentialNFT");
  const credentialNFT = await CredentialNFT.deploy();
  await credentialNFT.waitForDeployment();
  const credentialAddress = await credentialNFT.getAddress();
  console.log("✅ CredentialNFT deployed to:", credentialAddress, "\n");

  // ===== Save deployment info =====
  const fs = require("fs");
  const deploymentInfo = {
    network: hre.network.name,
    deployer: deployer.address,
    contracts: {
      EmploymentContract: employmentAddress,
      CredentialNFT: credentialAddress
    },
    timestamp: new Date().toISOString()
  };

  const deploymentsDir = "./deployments";
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }

  fs.writeFileSync(
    `${deploymentsDir}/${hre.network.name}.json`,
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("📝 Deployment info saved to deployments/" + hre.network.name + ".json\n");

  // ===== Copy ABIs to backend =====
  console.log("📋 Copying ABIs for backend...");
  const artifactsDir = "./artifacts/contracts";
  const backendAbiDir = "../backend/contracts";

  if (!fs.existsSync(backendAbiDir)) {
    fs.mkdirSync(backendAbiDir, { recursive: true });
  }

  // Copy EmploymentContract ABI
  const employmentArtifact = JSON.parse(
    fs.readFileSync(`${artifactsDir}/EmploymentContract.sol/EmploymentContract.json`)
  );
  fs.writeFileSync(
    `${backendAbiDir}/EmploymentContract.json`,
    JSON.stringify({
      address: employmentAddress,
      abi: employmentArtifact.abi
    }, null, 2)
  );

  // Copy CredentialNFT ABI
  const credentialArtifact = JSON.parse(
    fs.readFileSync(`${artifactsDir}/CredentialNFT.sol/CredentialNFT.json`)
  );
  fs.writeFileSync(
    `${backendAbiDir}/CredentialNFT.json`,
    JSON.stringify({
      address: credentialAddress,
      abi: credentialArtifact.abi
    }, null, 2)
  );

  console.log("✅ ABIs copied to backend/contracts/\n");

  console.log("=" .repeat(60));
  console.log("🎉 Deployment Complete!");
  console.log("=" .repeat(60));
  console.log("\n📍 Contract Addresses:");
  console.log("   EmploymentContract:", employmentAddress);
  console.log("   CredentialNFT:", credentialAddress);
  console.log("\n🔗 Network:", hre.network.name);
  console.log("\n💡 Next Steps:");
  console.log("   1. Update backend .env with contract addresses");
  console.log("   2. Update frontend .env with contract addresses");
  console.log("   3. Verify contracts on Etherscan (optional):");
  console.log("      npx hardhat verify --network", hre.network.name, employmentAddress, platformWallet);
  console.log("      npx hardhat verify --network", hre.network.name, credentialAddress);
  console.log("\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
