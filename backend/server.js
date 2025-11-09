require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { createServer } = require('http');
const { Server } = require('socket.io');

const blockchainService = require('./src/services/blockchainService');
const EventListenerService = require('./src/services/eventListenerService');
const routes = require('./src/routes');

/**
 * Blockchain HR Platform - Main Server
 *
 * WEB3 ARCHITECTURE:
 * 1. Express API - REST endpoints for traditional operations
 * 2. Socket.io - Real-time blockchain event notifications
 * 3. Ethers.js - Blockchain interaction layer
 * 4. MongoDB - Off-chain data (analytics, caching, UX)
 * 5. Event Listeners - Sync blockchain state to database
 */

// Initialize Express
const app = express();
const httpServer = createServer(app);

// Initialize Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api', routes);

// Socket.io Connection Handling
io.on('connection', (socket) => {
  console.log('👤 Client connected:', socket.id);

  // Client joins room with their wallet address
  socket.on('join', (walletAddress) => {
    if (walletAddress) {
      socket.join(walletAddress.toLowerCase());
      console.log(`👤 ${walletAddress} joined their room`);
    }
  });

  socket.on('disconnect', () => {
    console.log('👤 Client disconnected:', socket.id);
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start Server
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    console.log('🚀 Starting Blockchain HR Platform Backend...\n');

    // 1. Connect to MongoDB
    console.log('📊 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ MongoDB connected\n');

    // 2. Initialize Blockchain Service
    console.log('⛓️  Initializing blockchain connection...');
    await blockchainService.initialize();
    console.log('✅ Blockchain service ready\n');

    // 3. Start Event Listeners
    console.log('👂 Starting blockchain event listeners...');
    const eventListener = new EventListenerService(io);
    await eventListener.startListening();
    console.log('✅ Event listeners active\n');

    // 4. Start HTTP Server
    httpServer.listen(PORT, () => {
      console.log('=' . repeat(60));
      console.log('🎉 SERVER READY');
      console.log('=' . repeat(60));
      console.log(`📍 API: http://localhost:${PORT}/api`);
      console.log(`🔌 WebSocket: http://localhost:${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`⛓️  Network: ${process.env.BLOCKCHAIN_NETWORK}`);
      console.log('=' . repeat(60));
      console.log('\n📖 API Endpoints:');
      console.log('   POST /api/auth/nonce - Get authentication nonce');
      console.log('   POST /api/auth/verify - Verify wallet signature');
      console.log('   GET  /api/contracts - Get user contracts');
      console.log('   GET  /api/contracts/:id - Get contract details');
      console.log('   POST /api/contracts/create - Create new contract');
      console.log('   GET  /api/stats - Platform statistics');
      console.log('   GET  /api/health - Health check\n');
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('\n👋 SIGTERM received, shutting down gracefully...');
      eventListener.stop();
      await mongoose.connection.close();
      httpServer.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  process.exit(1);
});

// Start the server
startServer();
