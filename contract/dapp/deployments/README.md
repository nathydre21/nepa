# Contract Deployments

This directory contains deployment information for NEPA smart contracts across different networks.

## Deployment Files

- `testnet-deployment.json` - Testnet deployment configuration
- `mainnet-deployment.json` - Mainnet deployment configuration (when deployed)

## Deployment Process

1. Ensure all environment variables are set in your `.env` file:
   ```
   STELLAR_NETWORK=testnet|mainnet
   STELLAR_SECRET_KEY=your-secret-key
   STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org|https://horizon.stellar.org
   ```

2. Run the deployment script:
   ```bash
   npm run deploy
   ```

3. The deployment script will:
   - Deploy the contract to the specified network
   - Initialize the contract with default parameters
   - Save deployment information to this directory

## Contract Configuration

### Testnet Default Parameters
- Fee Rate: 0.1% (1000 basis points)
- Minimum Payment: 0.1 XLM
- Maximum Payment: 1000 XLM
- Admin: Deployer account

### Mainnet Default Parameters
- Fee Rate: 0.05% (500 basis points)
- Minimum Payment: 1 XLM
- Maximum Payment: 10000 XLM
- Admin: Deployer account

## Verification

After deployment, verify the contract:
```bash
npm run verify-contract
```

## Event Monitoring

To start monitoring contract events:
```bash
npm run monitor-events
```
