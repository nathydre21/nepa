import React from 'react';
import WebhookFailedDeliveries from '../components/WebhookFailedDeliveries';

const WebhookAdminPage: React.FC = () => {
  return (
    <div className="space-y-8">
      <section aria-labelledby="webhook-admin-heading">
        <h2 id="webhook-admin-heading" className="text-3xl font-semibold text-foreground">
          Webhook Deliveries
        </h2>
        <p className="text-muted-foreground text-lg">
          Review and retry webhook events that failed to deliver after exhausting all retry attempts.
        </p>
      </section>

      <WebhookFailedDeliveries />
    </div>
  );
};

export default WebhookAdminPage;
