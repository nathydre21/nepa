// Fixed path: added ../ to go up one level from 'src' to find 'packages'
import * as NepaClient from '../packages/nepa_client_v2'; 
import { Keypair, Transaction } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function main() {
    const client = new NepaClient.Client({
        ...NepaClient.networks.testnet,
        rpcUrl: 'https://soroban-testnet.stellar.org:443',
    });

    // Load secret key from environment variables
    const adminSecret = process.env.STELLAR_SECRET_KEY;
    if (!adminSecret) {
        throw new Error("STELLAR_SECRET_KEY environment variable is not set");
    }
    const adminKeypair = Keypair.fromSecret(adminSecret);
    const adminPublicKey = adminKeypair.publicKey();

    const XLM_ADDRESS = "CAS3J7GYCCXG7M35I6K3SOW66FQHS6CJ5U7DECO3SSTH4XNMQ66S23P2";
    const meterId = "METER-001";

    console.log("Processing payment of 10 XLM...");

    // 10 XLM (Stellar uses 7 decimal places)
    const amount = BigInt(100_000_000); 

    const tx = await client.pay_bill({ 
        from: adminPublicKey,
        token_address: XLM_ADDRESS,
        meter_id: meterId, 
        amount: amount
    });

    // Added ': any' to fix the TypeScript compilation error
    await tx.signAndSend({
        signTransaction: async (transaction: any) => {
            transaction.sign(adminKeypair);
            return transaction.toXDR();
        }
    });

    const total = await client.get_total_paid({ meter_id: meterId });
    
    // Convert back from stroops to XLM for the log
    const formattedTotal = Number(total.result) / 10_000_000;
    console.log(`Payment successful! Total recorded for ${meterId}: ${formattedTotal} XLM`);
}

main().catch(console.error);