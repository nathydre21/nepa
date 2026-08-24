import React, { useState, useEffect, useCallback } from 'react';
import { RotateCcw } from 'lucide-react';
import { DataTable } from './DataTable';
import { ErrorEmptyState } from './EmptyState';
import StatusBadge from './StatusBadge';
import { useNotifications } from '../contexts/NotificationContext';
import { webhookAdminService, FailedWebhookDelivery } from '../services/webhookAdminService';

const WebhookFailedDeliveries: React.FC = () => {
  const [deliveries, setDeliveries] = useState<FailedWebhookDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryingEventId, setRetryingEventId] = useState<string | null>(null);
  const { showSuccess, showError } = useNotifications();

  const loadFailedDeliveries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await webhookAdminService.getFailedDeliveries();
      setDeliveries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load failed deliveries');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFailedDeliveries();
  }, [loadFailedDeliveries]);

  const handleRetry = async (delivery: FailedWebhookDelivery) => {
    setRetryingEventId(delivery.eventId);
    try {
      await webhookAdminService.retryEvent(delivery.webhookId, delivery.eventId);
      showSuccess('Retry initiated', `Event ${delivery.eventType} has been queued for redelivery.`);
      // The event won't be FAILED again until/unless the retry itself
      // fails, so drop it from this list now instead of waiting for a
      // manual refresh.
      setDeliveries((prev) => prev.filter((d) => d.eventId !== delivery.eventId));
    } catch (err) {
      showError('Retry failed', err instanceof Error ? err.message : 'Unable to retry this event');
    } finally {
      setRetryingEventId(null);
    }
  };

  if (error) {
    return (
      <ErrorEmptyState
        title={error}
        description="Please try again or contact support if the issue persists"
        actions={[{ label: 'Retry', onClick: loadFailedDeliveries, variant: 'primary' }]}
        size="large"
      />
    );
  }

  const columns = [
    { key: 'eventType', label: 'Event Type', sortable: true, filterable: true },
    {
      key: 'webhookId',
      label: 'Webhook',
      sortable: true,
      filterable: true,
      render: (value: string) => <span className="font-mono text-xs">{value}</span>,
    },
    {
      key: 'attempts',
      label: 'Attempts',
      sortable: true,
      render: (value: number) => (
        <StatusBadge status="error" label={`${value} attempt${value === 1 ? '' : 's'}`} />
      ),
    },
    {
      key: 'lastError',
      label: 'Last Error',
      render: (value: string | undefined) => (
        <span className="text-sm text-gray-600 line-clamp-2 max-w-xs block" title={value}>
          {value || '—'}
        </span>
      ),
    },
    { key: 'createdAt', label: 'First Failed', sortable: true, type: 'date' as const },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {deliveries.length} webhook {deliveries.length === 1 ? 'delivery has' : 'deliveries have'} permanently
        failed and need manual attention.
      </p>
      <DataTable
        data={deliveries}
        columns={columns}
        loading={loading}
        emptyMessage="No failed deliveries"
        searchPlaceholder="Search by event type or webhook..."
        actions={[
          {
            key: 'retry',
            label: 'Retry delivery',
            icon: <RotateCcw size={14} />,
            variant: 'primary',
            disabled: (row: FailedWebhookDelivery) => row.eventId === retryingEventId,
            onClick: (row: FailedWebhookDelivery) => handleRetry(row),
          },
        ]}
      />
    </div>
  );
};

export default WebhookFailedDeliveries;
