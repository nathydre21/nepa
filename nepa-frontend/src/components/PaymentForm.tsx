import React, { useState } from 'react';
import { PaymentFormData } from '../types';
import { Loading } from './Loading';

interface Props {
  onSubmit: (data: PaymentFormData) => void;
  isLoading: boolean;
}

export const PaymentForm: React.FC<Props> = ({ onSubmit, isLoading }) => {
  const [form, setForm] = useState<PaymentFormData>({ destination: '', amount: '' });

  return (
    <div className="w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl mx-auto px-3 sm:px-4 lg:px-6">
      <form 
        onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}
        className="space-y-4 sm:space-y-6 bg-white shadow-lg rounded-xl p-4 sm:p-6 md:p-8 lg:p-10"
      >
        {/* Header */}
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            Make Payment
          </h2>
          <p className="text-sm sm:text-base text-gray-600">
            Enter your meter details and payment amount
          </p>
        </div>

        {/* Form Fields */}
        <div className="space-y-5">
          {/* Meter Number Field */}
          <div>
            <label 
              htmlFor="meter-number"
              className="block text-sm font-medium text-gray-700 mb-1 sm:mb-2"
            >
              Meter Number
            </label>
            <input 
              id="meter-number"
              type="text"
              placeholder="Enter your meter number"
              value={form.destination}
              onChange={e => setForm({...form, destination: e.target.value})}
              required
              className="w-full px-3 sm:px-4 py-3 sm:py-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-base sm:text-lg placeholder-gray-400 min-h-[48px] sm:min-h-[52px]"
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck="false"
            />
          </div>

          {/* Amount Field */}
          <div>
            <label 
              htmlFor="amount"
              className="block text-sm font-medium text-gray-700 mb-1 sm:mb-2"
            >
              Amount (NGN)
            </label>
            <div className="relative">
              <span className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 text-gray-500 text-lg sm:text-xl">
                ₦
              </span>
              <input 
                id="amount"
                type="number"
                placeholder="0.00"
                value={form.amount}
                onChange={e => setForm({...form, amount: e.target.value})}
                required
                min="0"
                step="0.01"
                className="w-full pl-10 sm:pl-12 pr-3 sm:pr-4 py-3 sm:py-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-base sm:text-lg placeholder-gray-400 min-h-[48px] sm:min-h-[52px]"
                autoComplete="off"
              />
            </div>
          </div>

          {/* Quick Amount Buttons */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Quick Amounts</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
              {['1000', '2000', '5000', '10000', '15000', '20000'].map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setForm({...form, amount})}
                  className="px-3 py-2 sm:px-4 sm:py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm sm:text-base font-medium transition-colors duration-200 min-h-[44px] sm:min-h-[48px] touch-manipulation"
                >
                  ₦{amount}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <button 
          type="submit" 
          disabled={isLoading || !form.destination || !form.amount}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-3 sm:py-4 px-4 sm:px-6 rounded-lg transition-all duration-200 text-base sm:text-lg min-h-[48px] sm:min-h-[52px] touch-manipulation transform active:scale-95"
        >
          {isLoading ? (
            <span className="flex items-center justify-center">
              <Loading size="sm" />
              <span className="ml-2">Processing...</span>
            </span>
          ) : (
            'Pay Now'
          )}
        </button>

        {/* Security Notice */}
        <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-start space-x-2">
            <svg 
              className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 mt-0.5 flex-shrink-0" 
              fill="currentColor" 
              viewBox="0 0 20 20"
            >
              <path 
                fillRule="evenodd" 
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" 
                clipRule="evenodd" 
              />
            </svg>
            <div className="text-xs sm:text-sm text-blue-800">
              <p className="font-medium mb-1">Secure Payment</p>
              <p>Your payment information is encrypted and secure. We never store your card details.</p>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
