import React from 'react';

interface Props {
  address: string | null;
  onConnect: () => void;
}

export const WalletConnector: React.FC<Props> = ({ address, onConnect }) => {
  return (
    <div className="wallet-section">
      {address ? (
        <p>Connected: <strong>{address.substring(0, 4)}...{address.substring(52)}</strong></p>
      ) : (
        <button onClick={onConnect} className="btn-connect">Connect Wallet</button>
      )}
    </div>
  );
};
