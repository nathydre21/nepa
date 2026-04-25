import React, { useState, useEffect } from 'react';
import { 
  LoadingSpinner, 
  Skeleton, 
  SkeletonCard, 
  SkeletonTable, 
  SkeletonList,
  ProgressBar,
  CircularProgress,
  StepProgress,
  LoadingOverlay,
  LoadingButton,
  LoadingCard
} from './index';
import { useLoading } from '../../contexts/LoadingContext';

export const LoadingExamples: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const { globalLoading, startLoading, stopLoading, updateProgress } = useLoading();

  const simulateLoading = () => {
    setIsLoading(true);
    setProgress(0);
    
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsLoading(false);
          return 100;
        }
        return prev + 10;
      });
    }, 500);
  };

  const simulateAsyncOperation = async () => {
    startLoading('Processing data...');
    
    for (let i = 0; i <= 100; i += 20) {
      updateProgress(i, 100);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    stopLoading();
  };

  const steps = [
    { label: 'Initialize', completed: true },
    { label: 'Load Data', completed: progress >= 33 },
    { label: 'Process', completed: progress >= 66 },
    { label: 'Complete', completed: progress >= 100 }
  ];

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Loading Components Examples</h1>

      {/* Loading Spinners */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-gray-800">Loading Spinners</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-4 border border-gray-200 rounded-lg">
            <h3 className="text-lg font-medium mb-4">Primary Spinner</h3>
            <LoadingSpinner size="md" variant="primary" label="Loading..." />
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <h3 className="text-lg font-medium mb-4">Success Spinner</h3>
            <LoadingSpinner size="lg" variant="success" label="Success!" />
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <h3 className="text-lg font-medium mb-4">Small Spinner</h3>
            <LoadingSpinner size="sm" variant="secondary" />
          </div>
        </div>
      </section>

      {/* Skeleton Screens */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-gray-800">Skeleton Screens</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-4 border border-gray-200 rounded-lg">
            <h3 className="text-lg font-medium mb-4">Skeleton Card</h3>
            <SkeletonCard showAvatar showButton />
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <h3 className="text-lg font-medium mb-4">Skeleton List</h3>
            <SkeletonList items={3} showAvatar />
          </div>
        </div>
        <div className="p-4 border border-gray-200 rounded-lg">
          <h3 className="text-lg font-medium mb-4">Skeleton Table</h3>
          <SkeletonTable rows={4} columns={3} />
        </div>
      </section>

      {/* Progress Bars */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-gray-800">Progress Bars</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="p-4 border border-gray-200 rounded-lg">
              <h3 className="text-lg font-medium mb-4">Linear Progress</h3>
              <ProgressBar 
                value={progress} 
                max={100} 
                showLabel 
                label="Upload Progress"
                showPercentage
              />
              <button 
                onClick={simulateLoading}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Simulate Progress
              </button>
            </div>
          </div>
          <div className="space-y-4">
            <div className="p-4 border border-gray-200 rounded-lg">
              <h3 className="text-lg font-medium mb-4">Circular Progress</h3>
              <div className="flex justify-center">
                <CircularProgress 
                  value={progress} 
                  max={100} 
                  size={120}
                  showPercentage
                  label="Complete"
                />
              </div>
            </div>
          </div>
        </div>
        <div className="p-4 border border-gray-200 rounded-lg">
          <h3 className="text-lg font-medium mb-4">Step Progress</h3>
          <StepProgress steps={steps} />
        </div>
      </section>

      {/* Loading Overlay */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-gray-800">Loading Overlay</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-4 border border-gray-200 rounded-lg">
            <h3 className="text-lg font-medium mb-4">With Progress</h3>
            <LoadingOverlay
              isLoading={isLoading}
              message="Uploading files..."
              progress={progress}
              showProgress
              backdrop={false}
            >
              <div className="p-8 text-center">
                <p className="text-gray-600">Content that will be covered by overlay</p>
              </div>
            </LoadingOverlay>
            <button 
              onClick={simulateLoading}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Toggle Overlay
            </button>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <h3 className="text-lg font-medium mb-4">Different Variants</h3>
            <LoadingOverlay
              isLoading={isLoading}
              message="Loading with dots..."
              variant="dots"
              backdrop={false}
            >
              <div className="p-8 text-center">
                <p className="text-gray-600">Content with dots loading</p>
              </div>
            </LoadingOverlay>
          </div>
        </div>
      </section>

      {/* Loading Buttons */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-gray-800">Loading Buttons</h2>
        <div className="flex flex-wrap gap-4">
          <LoadingButton
            isLoading={isLoading}
            onClick={simulateAsyncOperation}
            loadingText="Processing..."
          >
            Process Data
          </LoadingButton>
          <LoadingButton
            isLoading={isLoading}
            variant="secondary"
            onClick={simulateAsyncOperation}
            loadingText="Saving..."
          >
            Save Changes
          </LoadingButton>
          <LoadingButton
            isLoading={isLoading}
            variant="outline"
            onClick={simulateAsyncOperation}
            loadingText="Uploading..."
          >
            Upload File
          </LoadingButton>
        </div>
      </section>

      {/* Loading Cards */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-gray-800">Loading Cards</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LoadingCard isLoading={isLoading} skeletonLines={4} showAvatar>
            <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center space-x-4 mb-4">
                <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                  JD
                </div>
                <div>
                  <h3 className="text-lg font-semibold">John Doe</h3>
                  <p className="text-gray-600">Software Engineer</p>
                </div>
              </div>
              <p className="text-gray-700">
                This is the actual content that will be shown when loading is complete. 
                The skeleton provides a placeholder during loading states.
              </p>
            </div>
          </LoadingCard>
          <LoadingCard isLoading={isLoading} skeletonLines={2}>
            <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold mb-2">Simple Card</h3>
              <p className="text-gray-700">
                Minimal content with just a title and description.
              </p>
            </div>
          </LoadingCard>
        </div>
      </section>

      {/* Global Loading Context */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-gray-800">Global Loading Context</h2>
        <div className="p-4 border border-gray-200 rounded-lg">
          <p className="mb-4 text-gray-600">
            Global loading state: {globalLoading.isLoading ? 'Loading' : 'Idle'}
          </p>
          {globalLoading.message && (
            <p className="mb-4 text-gray-600">Message: {globalLoading.message}</p>
          )}
          {globalLoading.progress !== undefined && (
            <p className="mb-4 text-gray-600">
              Progress: {globalLoading.progress}/{globalLoading.max || 100}
            </p>
          )}
          <button 
            onClick={simulateAsyncOperation}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Trigger Global Loading
          </button>
        </div>
      </section>
    </div>
  );
};

export default LoadingExamples;
