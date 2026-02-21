import { useState } from 'react';
import { isConnected, requestAccess, signTransaction } from "@stellar/freighter-api";
import * as NepaClient from './contracts';
import YieldDashboard from './components/YieldDashboard';

function App() {
  const [currentView, setCurrentView] = useState<'payment' | 'yield'>('payment');
  const [meterId, setMeterId] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('');

  const handlePayment = async () => {
    // 1. Check if the user has Freighter wallet installed
    if (!(await isConnected())) {
      setStatus("Please install Freighter Wallet extension in your browser!");
      return;
    }

    try {
      setStatus("Connecting to wallet...");
      // 2. Ask the user to connect their wallet and get their public key
      const publicKey = await requestAccess();

      // 3. Initialize the Nepa Smart Contract Client
      const client = new NepaClient.Client({
        ...NepaClient.networks.testnet,
        rpcUrl: 'https://soroban-testnet.stellar.org:443',
      });

      setStatus("Preparing transaction... Please approve in Freighter.");

      // Convert standard XLM input to stroops (7 decimal places)
      const amountBigInt = BigInt(parseFloat(amount) * 10_000_000);

      // 4. Call the pay_bill function on the contract
      const tx = await client.pay_bill({
        from: publicKey,
        token_address: "CAS3J7GYCCXG7M35I6K3SOW66FQHS6CJ5U7DECO3SSTH4XNMQ66S23P2", // Native XLM on Testnet
        meter_id: meterId,
        amount: amountBigInt
      });

      // 5. Send the transaction to the Freighter wallet for the user to sign
      const { result } = await tx.signAndSend({
        signTransaction: async (transactionXdr) => {
          const signedTx = await signTransaction(transactionXdr, { network: "TESTNET" });
          return signedTx as string; // Freighter returns the signed XDR string
        }
      });

      setStatus(`Success! Payment of ${amount} XLM confirmed for ${meterId}.`);
    } catch (err: any) {
      console.error(err);
      setStatus(`Payment failed: ${err.message || "Check console for details."}`);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '30px' }}>
        <button
          onClick={() => setCurrentView('payment')}
          style={{
            padding: '10px 20px',
            backgroundColor: currentView === 'payment' ? '#08c' : '#f0f0f0',
            color: currentView === 'payment' ? 'white' : '#333',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Bill Payment
        </button>
        <button
          onClick={() => setCurrentView('yield')}
          style={{
            padding: '10px 20px',
            backgroundColor: currentView === 'yield' ? '#08c' : '#f0f0f0',
            color: currentView === 'yield' ? 'white' : '#333',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Yield Generation
        </button>
      </div>

      {currentView === 'payment' ? (
        <div style={{ maxWidth: '400px', margin: '0 auto' }}>
          <h1 style={{ color: '#08c' }}>NEPA 💡</h1>
          <p>Decentralized Utility Payments</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
            <input
              style={{ padding: '10px', fontSize: '16px', borderRadius: '5px', border: '1px solid #ccc' }}
              placeholder="Meter Number (e.g. METER-123)"
              value={meterId}
              onChange={(e: any) => setMeterId(e.target.value)}
            />
            <input
              style={{ padding: '10px', fontSize: '16px', borderRadius: '5px', border: '1px solid #ccc' }}
              placeholder="Amount in XLM"
              type="number"
              value={amount}
              onChange={(e: any) => setAmount(e.target.value)}
            />
            <button
              onClick={handlePayment}
              style={{ backgroundColor: '#08c', color: 'white', padding: '12px', fontSize: '16px', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
              Pay Electricity Bill
            </button>
          </div>

          <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f0f0f0', borderRadius: '5px', minHeight: '20px' }}>
            <strong>Status:</strong> <span style={{ color: '#333' }}>{status}</span>
          </div>
        </div>
      ) : (
        <YieldDashboard />
      )}
    </div>
  );
}

export default App;
