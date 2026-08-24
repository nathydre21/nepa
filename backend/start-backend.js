#!/usr/bin/env node

/**
 * Backend startup script
 * Usage: node start-backend.js [options]
 * Options:
 *   --port <number>   Port to run the server on (default: 3001)
 *   --env <string>    Environment (development, production, test)
 *   --minimal         Use minimal server (default: false)
 */

const { spawn } = require('child_process');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  port: '3001',
  env: process.env.NODE_ENV || 'development',
  minimal: false
};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--port':
      options.port = args[++i];
      break;
    case '--env':
      options.env = args[++i];
      break;
    case '--minimal':
      options.minimal = true;
      break;
    case '--help':
    case '-h':
      console.log(`
Backend Startup Script

Usage: node start-backend.js [options]

Options:
  --port <number>   Port to run the server on (default: 3001)
  --env <string>    Environment (development, production, test)
  --minimal         Use minimal server (default: false)
  --help, -h        Show this help message

Examples:
  node start-backend.js                    # Start full server on port 3001
  node start-backend.js --port 8080       # Start on port 8080
  node start-backend.js --minimal         # Start minimal server
  node start-backend.js --env production   # Start in production mode
      `);
      process.exit(0);
  }
}

// Set environment variables
process.env.PORT = options.port;
process.env.NODE_ENV = options.env;

console.log(`🚀 Starting NEPA Backend Server...`);
console.log(`📍 Port: ${options.port}`);
console.log(`🌍 Environment: ${options.env}`);
console.log(`📦 Server Type: ${options.minimal ? 'Minimal' : 'Full'}`);
console.log('');

// Choose which server to start
const serverFile = options.minimal ? 'minimal-server.js' : 'server.js';
const serverPath = path.join(__dirname, 'dist', serverFile);

// Start the server
const serverProcess = spawn('node', [serverPath], {
  stdio: 'inherit',
  env: { ...process.env }
});

// Handle process events
serverProcess.on('error', (error) => {
  console.error('❌ Failed to start server:', error.message);
  process.exit(1);
});

serverProcess.on('close', (code) => {
  console.log(`Server process exited with code ${code}`);
  process.exit(code);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  serverProcess.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  serverProcess.kill('SIGINT');
});

console.log(`✅ Backend server starting...`);
console.log(`📊 Health check: http://localhost:${options.port}/health`);
console.log(`🔗 API status: http://localhost:${options.port}/api/v1/status`);
console.log('');
console.log('Press Ctrl+C to stop the server');
