#!/usr/bin/env ts-node

import { Keypair, Networks, TransactionBuilder, SorobanDataBuilder, BASE_FEE } from '@stellar/stellar-sdk';
import { Contract, deployContract } from '../src/deploy';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Contract Deployment Script
 */
async function main() {
  console.log('🚀 Starting NEPA Smart Contract Deployment...\n');

  try {
    // Network configuration
    const network = process.env.STELLAR_NETWORK || 'testnet';
    const rpcUrl = network === 'mainnet' 
      ? 'https://soroban-rpc.stellar.org:443' 
      : 'https://soroban-testnet.stellar.org:443';
    
    console.log(`📡 Deploying to ${network} network`);
    console.log(`🔗 RPC URL: ${rpcUrl}`);

    // Load deployer keypair
    const secretKey = process.env.STELLAR_SECRET_KEY;
    if (!secretKey) {
      throw new Error('STELLAR_SECRET_KEY environment variable is not set');
    }

    const deployerKeypair = Keypair.fromSecret(secretKey);
    const deployerPublicKey = deployerKeypair.publicKey();
    
    console.log(`👤 Deployer: ${deployerPublicKey}`);

    // Initialize contract deployment
    const contract = new Contract({
      network,
      rpcUrl,
      secretKey
    });

    // Deploy the NEPA billing contract
    console.log('\n📦 Deploying NEPA Billing Contract...');
    const contractAddress = await contract.deploy();
    
    console.log(`✅ Contract deployed successfully!`);
    console.log(`📍 Contract Address: ${contractAddress}`);

    // Initialize contract with admin settings
    console.log('\n⚙️ Initializing contract...');
    await contract.initialize({
      admin: deployerPublicKey,
      feeRate: 1000, // 0.1% fee
      minPayment: BigInt(1000000), // 0.1 XLM minimum
      maxPayment: BigInt(10000000000) // 1000 XLM maximum
    });

    console.log('✅ Contract initialized successfully!');

    // Save deployment info
    const deploymentInfo = {
      network,
      contractAddress,
      deployer: deployerPublicKey,
      deployedAt: new Date().toISOString(),
      rpcUrl,
      horizonUrl: network === 'mainnet' 
        ? 'https://horizon.stellar.org' 
        : 'https://horizon-testnet.stellar.org'
    };

    // Write deployment info to file
    const fs = require('fs');
    fs.writeFileSync(
      `./deployments/${network}-deployment.json`, 
      JSON.stringify(deploymentInfo, null, 2)
    );

    console.log('\n📄 Deployment info saved to:', `./deployments/${network}-deployment.json`);
    console.log('\n🎉 Deployment completed successfully!');

  } catch (error) {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  }
}

// Run deployment
if (require.main === module) {
  main().catch(console.error);
}

export { main as deployContracts };
