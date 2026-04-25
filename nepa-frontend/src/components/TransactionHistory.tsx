import React, { useState, useEffect, useMemo } from 'react';
import { Transaction, TransactionHistory, TransactionFilters, PaymentStatus } from '../types';
import TransactionService from '../services/transactionService';
import { ListEmptyState } from './EmptyStateVariants';
import { LoadingSpinner, SkeletonTable, LoadingButton } from './loading/index';
import { useLoading } from '../contexts/LoadingContext';
import { IconTooltip, InfoTooltip, WarningTooltip } from './tooltip';

interface Props {
  className?: string;
}

export const TransactionHistoryComponent: React.FC<Props> = ({ className = '' }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<TransactionFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    hasNextPage: false,
  });

  // Load transactions on component mount and filter changes
  useEffect(() => {
    loadTransactions();
  }, [filters]);

  const loadTransactions = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result: TransactionHistory = await TransactionService.getTransactionHistory(filters);
      
      setTransactions(result.transactions);
      setPagination({
        currentPage: result.currentPage,
        totalPages: result.totalPages,
        totalCount: result.totalCount,
        hasNextPage: result.hasNextPage,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions');
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: keyof TransactionFilters, value: string | number | undefined) => {
    setFilters(prev => ({
      ...prev,
      [key]: value || undefined,
      page: key === 'page' ? value : 1, // Reset to page 1 when filters change
    }));
  };

  const handleSearch = (searchTerm: string) => {
    if (searchTerm.trim()) {
      TransactionService.searchTransactions(searchTerm, filters)
        .then(result => {
          setTransactions(result.transactions);
          setPagination({
            currentPage: result.currentPage,
            totalPages: result.totalPages,
            totalCount: result.totalCount,
            hasNextPage: result.hasNextPage,
          });
        })
        .catch(err => setError(err instanceof Error ? err.message : 'Search failed'));
    } else {
      loadTransactions();
    }
  };

  const handleDownloadReceipt = async (transactionId: string) => {
    try {
      await TransactionService.downloadReceiptPDF(transactionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download receipt');
    }
  };

  const handleExportCSV = async () => {
    try {
      await TransactionService.exportToCSV(filters);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export transactions');
    }
  };

  const handleViewReceipt = async (transaction: Transaction) => {
    try {
      const receipt = await TransactionService.generateReceipt(transaction.id);
      setSelectedTransaction(transaction);
      setShowReceiptModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate receipt');
    }
  };

  const clearFilters = () => {
    setFilters({});
  };

  const hasActiveFilters = () => {
    return Object.keys(filters).some(key => {
      const value = filters[key as keyof TransactionFilters];
      return value !== undefined && value !== '' && value !== 1; // page 1 is default
    });
  };

  const filteredTransactions = useMemo(() => transactions, [transactions]);

  if (loading && transactions.length === 0) {
    return (
      <div className={className}>
        <ListEmptyState
          listType="transactions"
          state="loading"
        />
      </div>
    );
  }

  return (
    <div className={`max-w-6xl mx-auto p-6 ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Transaction History</h2>
          <p className="text-gray-600 mt-1">
            {pagination.totalCount} transaction{pagination.totalCount !== 1 ? 's' : ''} found
          </p>
        </div>
        
        <div className="flex gap-3">
          <InfoTooltip content="Toggle transaction filters to narrow down your search results">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </button>
          </InfoTooltip>
          
          <InfoTooltip content="Export your transaction history as a CSV file for offline analysis">
            <button
              onClick={handleExportCSV}
              disabled={loading || transactions.length === 0}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors"
            >
              Export CSV
            </button>
          </InfoTooltip>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center">
            <span className="text-red-600 mr-2">⚠️</span>
            <span className="text-red-800">{error}</span>
          </div>
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <div className="mb-6 p-6 bg-gray-50 rounded-lg border border-gray-200">
          <h3 className="text-lg font-semibold mb-4">Filter Transactions</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Date Range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">From Date</label>
              <input
                type="date"
                value={filters.dateFrom || ''}
                onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">To Date</label>
              <input
                type="date"
                value={filters.dateTo || ''}
                onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Meter ID */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Meter ID</label>
              <input
                type="text"
                placeholder="METER-123"
                value={filters.meterId || ''}
                onChange={(e) => handleFilterChange('meterId', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                value={filters.status || ''}
                onChange={(e) => handleFilterChange('status', e.target.value as PaymentStatus)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Statuses</option>
                <option value="PENDING">Pending</option>
                <option value="SUCCESS">Success</option>
                <option value="FAILED">Failed</option>
                <option value="PROCESSING">Processing</option>
              </select>
            </div>

            {/* Amount Range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Min Amount (₦)</label>
              <input
                type="number"
                placeholder="0.00"
                value={filters.minAmount || ''}
                onChange={(e) => handleFilterChange('minAmount', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Max Amount (₦)</label>
              <input
                type="number"
                placeholder="0.00"
                value={filters.maxAmount || ''}
                onChange={(e) => handleFilterChange('maxAmount', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Filter Actions */}
          <div className="flex gap-3 mt-6">
            <button
              onClick={loadTransactions}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              {loading ? 'Applying...' : 'Apply Filters'}
            </button>
            
            <button
              onClick={clearFilters}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            placeholder="Search by transaction ID, meter ID, or amount..."
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
          <span className="absolute left-3 top-3.5 text-gray-400">🔍</span>
        </div>
      </div>

      {/* Transactions List */}
      {filteredTransactions.length === 0 && !loading ? (
        <ListEmptyState
          listType="transactions"
          state={hasActiveFilters() ? 'no-results' : 'no-data'}
          hasFilters={hasActiveFilters()}
          onClear={clearFilters}
          primaryAction={{
            label: 'Make a Payment',
            onClick: () => {
              // Navigate to payment form or open payment modal
              window.location.href = '/payment';
            }
          }}
        />
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date & Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Transaction ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Meter ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTransactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {TransactionService.formatDate(transaction.date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className="font-mono text-xs">{transaction.id}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {transaction.meterId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {TransactionService.formatAmount(transaction.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${TransactionService.getStatusColor(transaction.status)}`}>
                        <span className="mr-1">{TransactionService.getStatusIcon(transaction.status)}</span>
                        {transaction.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleViewReceipt(transaction)}
                          className="text-blue-600 hover:text-blue-900 font-medium"
                        >
                          View Receipt
                        </button>
                        <button
                          onClick={() => handleDownloadReceipt(transaction.id)}
                          className="text-green-600 hover:text-green-900 font-medium"
                        >
                          Download PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="mt-6 flex justify-center items-center space-x-2">
          <button
            onClick={() => handleFilterChange('page', Math.max(1, pagination.currentPage - 1))}
            disabled={pagination.currentPage <= 1}
            className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Previous
          </button>
          
          <span className="px-4 py-2">
            Page {pagination.currentPage} of {pagination.totalPages}
          </span>
          
          <button
            onClick={() => handleFilterChange('page', Math.min(pagination.totalPages, pagination.currentPage + 1))}
            disabled={pagination.currentPage >= pagination.totalPages}
            className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      {/* Receipt Modal */}
      {showReceiptModal && selectedTransaction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-2xl w-full mx-4 max-h-screen overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <h3 className="text-xl font-bold text-gray-900">Payment Receipt</h3>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Receipt Header */}
              <div className="text-center border-b pb-4">
                <h4 className="text-lg font-semibold text-gray-900">NEPA Payment Receipt</h4>
                <p className="text-gray-600">Receipt #: {selectedTransaction.id}</p>
              </div>
              
              {/* Transaction Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Transaction ID</p>
                  <p className="font-mono text-sm">{selectedTransaction.id}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Date & Time</p>
                  <p className="text-sm">{TransactionService.formatDate(selectedTransaction.date)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Meter ID</p>
                  <p className="text-sm">{selectedTransaction.meterId}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Amount Paid</p>
                  <p className="text-lg font-bold text-green-600">
                    {TransactionService.formatAmount(selectedTransaction.amount)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${TransactionService.getStatusColor(selectedTransaction.status)}`}>
                    <span className="mr-1">{TransactionService.getStatusIcon(selectedTransaction.status)}</span>
                    {selectedTransaction.status}
                  </span>
                </div>
                {selectedTransaction.transactionHash && (
                  <div className="col-span-2">
                    <p className="text-sm text-gray-600">Transaction Hash</p>
                    <p className="font-mono text-xs break-all">{selectedTransaction.transactionHash}</p>
                  </div>
                )}
              </div>
              
              {/* Actions */}
              <div className="flex justify-center space-x-4 pt-6 border-t">
                <button
                  onClick={() => handleDownloadReceipt(selectedTransaction.id)}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Download PDF Receipt
                </button>
                <button
                  onClick={() => setShowReceiptModal(false)}
                  className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
