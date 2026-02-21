import React from 'react';
import { TransactionStep } from '../types';

interface Props {
  currentStep: TransactionStep;
}

export const ProgressStepper: React.FC<Props> = ({ currentStep }) => {
  const steps = [
    { id: 1, name: 'Connect' },
    { id: 2, name: 'Sign' },
    { id: 3, name: 'Submit' },
    { id: 4, name: 'Finalize' }
  ];

  if (currentStep === TransactionStep.IDLE || currentStep === TransactionStep.COMPLETE) return null;

  return (
    <div className="w-full py-4">
      <div className="flex items-center justify-between relative">
        {steps.map((step) => (
          <div key={step.id} className="flex flex-col items-center z-10 flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              currentStep >= step.id ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              {currentStep > step.id ? '✓' : step.id}
            </div>
            <span className="text-[10px] mt-1 font-medium text-gray-500 uppercase tracking-tighter">{step.name}</span>
          </div>
        ))}
        <div className="absolute top-4 left-0 w-full h-0.5 bg-gray-200 -z-0">
            <div 
                className="h-full bg-blue-600 transition-all duration-500" 
                style={{ width: `${Math.max(0, (currentStep - 1) / 3) * 100}%` }}
            />
        </div>
      </div>
    </div>
  );
};
