/**
 * Test script to verify minimal server can start and respond to basic requests
 */

const http = require('http');

async function testServer() {
  console.log('Testing minimal server startup...');
  
  try {
    // Import and start the server
    const server = require('./dist/minimal-server.js');
    
    // Wait a moment for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test health endpoint
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/health',
      method: 'GET'
    };
    
    const req = http.request(options, (res) => {
      console.log(`Health check status: ${res.statusCode}`);
      
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log('Health check response:', data);
        console.log('✅ Server test completed successfully!');
        process.exit(0);
      });
    });
    
    req.on('error', (err) => {
      console.error('❌ Request failed:', err.message);
      console.log('Server compiled successfully but may not be running');
      process.exit(1);
    });
    
    req.end();
    
  } catch (error) {
    console.error('❌ Server test failed:', error.message);
    process.exit(1);
  }
}

testServer();
