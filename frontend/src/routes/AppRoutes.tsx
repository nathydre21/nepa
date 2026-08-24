import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';
import ErrorBoundary from '../components/ErrorBoundary';
import LoadingSpinner from '../components/LoadingSpinner';

// Lazy load components for code splitting
const HomePage = lazy(() => import('../pages/HomePage'));
const DashboardPage = lazy(() => import('../pages/DashboardPage'));
const AnalyticsPage = lazy(() => import('../pages/AnalyticsPage'));
const TreeViewPage = lazy(() => import('../pages/TreeViewPage'));
const AuthPage = lazy(() => import('../pages/AuthPage'));
const ProfilePage = lazy(() => import('../pages/ProfilePage'));
const TransactionHistoryPage = lazy(() => import('../pages/TransactionHistoryPage'));
const WebhookAdminPage = lazy(() => import('../pages/WebhookAdminPage'));
const FAQPage = lazy(() => import('../pages/FAQpage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));

// Loading fallback component
const RouteLoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <LoadingSpinner size="large" />
  </div>
);

const AppRoutes: React.FC = () => {
  return (
    <ErrorBoundary>
      <Routes>
        {/* Public routes */}
        <Route 
          path="/" 
          element={
            <Suspense fallback={<RouteLoadingFallback />}>
              <HomePage />
            </Suspense>
          } 
        />
        <Route 
          path="/auth" 
          element={
            <Suspense fallback={<RouteLoadingFallback />}>
              <AuthPage />
            </Suspense>
          } 
        />
        <Route 
          path="/faq" 
          element={
            <Suspense fallback={<RouteLoadingFallback />}>
              <FAQPage />
            </Suspense>
          } 
        />
        
        {/* Protected routes */}
        <Route 
          path="/dashboard" 
          element={
            <Suspense fallback={<RouteLoadingFallback />}>
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            </Suspense>
          } 
        />
        <Route 
          path="/analytics" 
          element={
            <Suspense fallback={<RouteLoadingFallback />}>
              <ProtectedRoute>
                <AnalyticsPage />
              </ProtectedRoute>
            </Suspense>
          } 
        />
        <Route 
          path="/tree" 
          element={
            <Suspense fallback={<RouteLoadingFallback />}>
              <ProtectedRoute>
                <TreeViewPage />
              </ProtectedRoute>
            </Suspense>
          } 
        />
        <Route 
          path="/profile" 
          element={
            <Suspense fallback={<RouteLoadingFallback />}>
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            </Suspense>
          } 
        />
        <Route
          path="/transactions"
          element={
            <Suspense fallback={<RouteLoadingFallback />}>
              <ProtectedRoute>
                <TransactionHistoryPage />
              </ProtectedRoute>
            </Suspense>
          }
        />
        <Route
          path="/admin/webhooks"
          element={
            <Suspense fallback={<RouteLoadingFallback />}>
              <ProtectedRoute requiredRole="ADMIN">
                <WebhookAdminPage />
              </ProtectedRoute>
            </Suspense>
          }
        />

        {/* 404 catch-all route */}
        <Route 
          path="*" 
          element={
            <Suspense fallback={<RouteLoadingFallback />}>
              <NotFoundPage />
            </Suspense>
          } 
        />
      </Routes>
    </ErrorBoundary>
  );
};

export default AppRoutes;
