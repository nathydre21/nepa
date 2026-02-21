import React from 'react';
import { useStellar } from './hooks/useStellar';
import { WalletConnector } from './components/WalletConnector';
import { PaymentForm } from './components/PaymentForm';
import './App.css';

const App: React.FC = () => {
  const { address, status, error, connectWallet, sendPayment } = useStellar();

  return (
    <div className="app-container">
      <header>
        <h1>NEPA Stellar Payments</h1>
        <WalletConnector address={address} onConnect={connectWallet} />
      </header>

      <main>
        {status === 'success' && <div className="alert success">Payment Successful!</div>}
        {error && <div className="alert error">{error}</div>}

        <section className="card">
          <h2>Send Payment</h2>
          <PaymentForm 
            onSubmit={sendPayment} 
            isLoading={status === 'loading'} 
          />
        </section>
      </main>
    </div>
  );
};

export default App;
