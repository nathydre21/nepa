import React from 'react';

interface Props {
  address: string | null;
  onConnect: () => void;
}

export const WalletConnector: React.FC<Props> = ({ address, onConnect }) => (
  <div className="wallet-connector">
    {address ? (
      <p>Connected: {address.slice(0, 6)}...</p>
    ) : (
      <button onClick={onConnect}>Connect Wallet</button>
    )}
  </div>
);
