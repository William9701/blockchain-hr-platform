# ⚡ Quick Start Guide - 5 Minutes to Running Platform

## 🎯 Goal
Get the Blockchain HR Platform running locally in under 5 minutes.

---

## ✅ Prerequisites Checklist

- [ ] Node.js v18+ installed (`node --version`)
- [ ] MongoDB running (`mongod` or Atlas)
- [ ] MetaMask extension installed
- [ ] Testnet ETH in MetaMask (get from https://sepoliafaucet.com/)
- [ ] Alchemy account (free): https://www.alchemy.com/

---

## 🚀 Steps

### 1️⃣ **Setup Contracts** (2 minutes)

```bash
cd blockchain-hr-platform/contracts

# Install dependencies
npm install

# Create .env file
echo "SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
PRIVATE_KEY=your_metamask_private_key
ETHERSCAN_API_KEY=optional" > .env

# Compile contracts
npx hardhat compile

# Test (optional but recommended)
npx hardhat test
```

**Get your Alchemy API key**:
1. Go to https://dashboard.alchemy.com/
2. Create app → Select "Ethereum" → "Sepolia"
3. Copy the API key from the URL

**Get your MetaMask private key**:
1. MetaMask → Account details → Export Private Key
2. ⚠️ **NEVER share this or commit to git!**

---

### 2️⃣ **Deploy Contracts** (1 minute)

```bash
# Deploy to Sepolia testnet
npx hardhat run scripts/deploy.js --network sepolia
```

**Expected output:**
```
✅ EmploymentContract deployed to: 0xABC123...
✅ CredentialNFT deployed to: 0xDEF456...
```

**COPY THESE ADDRESSES!** You'll need them next.

---

### 3️⃣ **Setup Backend** (1 minute)

```bash
cd ../backend

# Install dependencies
npm install

# Create .env file
cat > .env << EOF
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/blockchain-hr
JWT_SECRET=$(openssl rand -base64 32)
ALCHEMY_API_KEY=your_alchemy_api_key
BLOCKCHAIN_NETWORK=sepolia
RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
EMPLOYMENT_CONTRACT_ADDRESS=0xABC123_from_step_2
CREDENTIAL_NFT_ADDRESS=0xDEF456_from_step_2
PLATFORM_PRIVATE_KEY=your_metamask_private_key
FRONTEND_URL=http://localhost:3000
EOF
```

**Update the placeholders** in `.env` with your actual values!

---

### 4️⃣ **Start Backend** (30 seconds)

```bash
npm run dev
```

**Expected output:**
```
🎉 SERVER READY
📍 API: http://localhost:5000/api
⛓️  Connected to blockchain: sepolia
👂 Event listeners active
```

---

### 5️⃣ **Test It Works** (30 seconds)

Open a new terminal:

```bash
# Health check
curl http://localhost:5000/api/health

# Should return: {"status":"ok","blockchain":true}
```

---

## ✅ You're Ready!

The backend is now:
- ✅ Connected to blockchain
- ✅ Listening to contract events
- ✅ Ready to serve API requests
- ✅ Real-time updates via Socket.io

---

## 🧪 Test the Authentication Flow

### **1. Get Nonce**

```bash
curl -X POST http://localhost:5000/api/auth/nonce \
  -H "Content-Type: application/json" \
  -d '{"walletAddress": "0xYOUR_METAMASK_ADDRESS"}'
```

**Response:**
```json
{
  "nonce": "abc123...",
  "message": "Welcome to Blockchain HR Platform!..."
}
```

### **2. Sign Message in MetaMask Console**

Open browser console (F12) on any page:

```javascript
const message = "YOUR_MESSAGE_FROM_STEP_1";
const signature = await ethereum.request({
  method: 'personal_sign',
  params: [message, ethereum.selectedAddress]
});
console.log('Signature:', signature);
```

### **3. Verify Signature**

```bash
curl -X POST http://localhost:5000/api/auth/verify \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "0xYOUR_ADDRESS",
    "signature": "0xYOUR_SIGNATURE_FROM_STEP_2"
  }'
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "walletAddress": "0x...", "role": "talent" }
}
```

---

## 🎯 Next: Build Frontend

You now have a fully functional Web3 backend!

Next steps:
1. **Build React frontend** with wallet connection
2. **Test contract creation** from UI
3. **Watch real-time events** update the dashboard

---

## 🐛 Troubleshooting

### **"Connection refused" on MongoDB**

```bash
# Start MongoDB
mongod

# Or use MongoDB Atlas (cloud)
# Update MONGODB_URI in .env to your Atlas connection string
```

### **"Insufficient funds" when deploying**

Get testnet ETH:
- https://sepoliafaucet.com/
- https://sepolia-faucet.pk910.de/

### **"Invalid API key" from Alchemy**

1. Double-check the API key from Alchemy dashboard
2. Make sure you selected "Sepolia" network when creating the app

### **Contracts don't copy to backend/contracts/**

```bash
# Manual copy
cd contracts
mkdir -p ../backend/contracts
# Copy ABIs manually from artifacts/
```

---

## 📖 What You Just Built

1. **Smart Contracts** on Ethereum testnet
   - Employment contract with escrow
   - Credential NFTs

2. **Node.js Backend**
   - JWT authentication with wallet signatures
   - Real-time blockchain event listening
   - MongoDB for analytics
   - Socket.io for live updates

3. **Complete Web3 Infrastructure**
   - Decentralized identity
   - Trustless payments
   - Immutable contracts

---

## 🚀 You're a Web3 Developer Now!

The concepts you just implemented:
- ✅ Smart contracts
- ✅ Wallet authentication
- ✅ Blockchain event listeners
- ✅ Hybrid architecture (on-chain + off-chain)
- ✅ IPFS integration (ready to add)

These are the **core building blocks** of ALL Web3 applications.

**Congrats!** 🎉

---

## 🤝 Need Help?

- Read the full [README.md](./README.md) for detailed explanations
- Check the inline code comments
- Explore the smart contract tests in `contracts/test/`

**Good luck building! 🚀**
