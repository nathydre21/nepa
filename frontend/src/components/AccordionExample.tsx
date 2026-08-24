import React, { useState } from 'react';
import {
  Accordion,
  AccordionTrigger,
  AccordionContent,
  AccordionItemWrapper,
} from './Accordion';
import { HelpCircle, Settings, User, CreditCard, Bell, Shield } from 'lucide-react';

/**
 * AccordionExample - Demonstrates various accordion configurations and use cases
 */
const AccordionExample: React.FC = () => {
  const [controlledItems, setControlledItems] = useState<string[]>(['faq-1']);

  return (
    <div className="space-y-8 p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Accordion Component Examples</h1>

      {/* Basic Accordion */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Basic Accordion</h2>
        <Accordion>
          <AccordionItemWrapper
            id="basic-1"
            trigger={<AccordionTrigger>What is NEPA?</AccordionTrigger>}
            content={
              <AccordionContent>
                NEPA is a decentralized platform built on the Stellar blockchain that
                enables secure and efficient digital transactions.
              </AccordionContent>
            }
          />
          <AccordionItemWrapper
            id="basic-2"
            trigger={<AccordionTrigger>How do I get started?</AccordionTrigger>}
            content={
              <AccordionContent>
                To get started, connect your wallet, complete the verification process,
                and you'll be ready to make transactions on the platform.
              </AccordionContent>
            }
          />
          <AccordionItemWrapper
            id="basic-3"
            trigger={<AccordionTrigger>Is it secure?</AccordionTrigger>}
            content={
              <AccordionContent>
                Yes, NEPA uses industry-standard encryption and blockchain technology
                to ensure the security of your transactions and data.
              </AccordionContent>
            }
          />
        </Accordion>
      </section>

      {/* Bordered Variant */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Bordered Variant</h2>
        <Accordion variant="bordered">
          <AccordionItemWrapper
            id="bordered-1"
            trigger={<AccordionTrigger>Account Settings</AccordionTrigger>}
            content={
              <AccordionContent>
                <div className="space-y-2">
                  <p>Manage your account preferences and settings.</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Update profile information</li>
                    <li>Change password</li>
                    <li>Manage notifications</li>
                  </ul>
                </div>
              </AccordionContent>
            }
          />
          <AccordionItemWrapper
            id="bordered-2"
            trigger={<AccordionTrigger>Privacy Settings</AccordionTrigger>}
            content={
              <AccordionContent>
                Control who can see your information and how your data is used.
              </AccordionContent>
            }
          />
        </Accordion>
      </section>

      {/* Separated Variant with Icons */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Separated Variant with Icons</h2>
        <Accordion variant="separated" size="lg">
          <AccordionItemWrapper
            id="icon-1"
            trigger={
              <AccordionTrigger>
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-blue-600" />
                  <span>Profile Information</span>
                </div>
              </AccordionTrigger>
            }
            content={
              <AccordionContent>
                <div className="space-y-3">
                  <p className="font-medium">Personal Details</p>
                  <p>Update your name, email, and other personal information.</p>
                </div>
              </AccordionContent>
            }
          />
          <AccordionItemWrapper
            id="icon-2"
            trigger={
              <AccordionTrigger>
                <div className="flex items-center gap-3">
                  <CreditCard className="w-5 h-5 text-green-600" />
                  <span>Payment Methods</span>
                </div>
              </AccordionTrigger>
            }
            content={
              <AccordionContent>
                <div className="space-y-3">
                  <p className="font-medium">Manage Payment Options</p>
                  <p>Add, remove, or update your payment methods.</p>
                </div>
              </AccordionContent>
            }
          />
          <AccordionItemWrapper
            id="icon-3"
            trigger={
              <AccordionTrigger>
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-purple-600" />
                  <span>Security Settings</span>
                </div>
              </AccordionTrigger>
            }
            content={
              <AccordionContent>
                <div className="space-y-3">
                  <p className="font-medium">Two-Factor Authentication</p>
                  <p>Enable 2FA for enhanced account security.</p>
                </div>
              </AccordionContent>
            }
          />
        </Accordion>
      </section>

      {/* Multiple Items Open */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Multiple Items Open</h2>
        <Accordion allowMultiple variant="bordered">
          <AccordionItemWrapper
            id="multi-1"
            trigger={<AccordionTrigger>General Settings</AccordionTrigger>}
            content={
              <AccordionContent>
                Configure general application settings and preferences.
              </AccordionContent>
            }
          />
          <AccordionItemWrapper
            id="multi-2"
            trigger={<AccordionTrigger>Notification Preferences</AccordionTrigger>}
            content={
              <AccordionContent>
                Choose which notifications you want to receive.
              </AccordionContent>
            }
          />
          <AccordionItemWrapper
            id="multi-3"
            trigger={<AccordionTrigger>Display Options</AccordionTrigger>}
            content={
              <AccordionContent>
                Customize the appearance and layout of the application.
              </AccordionContent>
            }
          />
        </Accordion>
      </section>

      {/* Controlled Accordion */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Controlled Accordion</h2>
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setControlledItems(['faq-1'])}
            className="btn btn-sm btn-outline"
          >
            Open First
          </button>
          <button
            onClick={() => setControlledItems(['faq-2'])}
            className="btn btn-sm btn-outline"
          >
            Open Second
          </button>
          <button
            onClick={() => setControlledItems([])}
            className="btn btn-sm btn-outline"
          >
            Close All
          </button>
        </div>
        <Accordion
          openItems={controlledItems}
          onOpenChange={setControlledItems}
          variant="bordered"
        >
          <AccordionItemWrapper
            id="faq-1"
            trigger={<AccordionTrigger>How do I reset my password?</AccordionTrigger>}
            content={
              <AccordionContent>
                Click on "Forgot Password" on the login page and follow the instructions
                sent to your email.
              </AccordionContent>
            }
          />
          <AccordionItemWrapper
            id="faq-2"
            trigger={<AccordionTrigger>Can I change my username?</AccordionTrigger>}
            content={
              <AccordionContent>
                Yes, you can change your username in the account settings section.
              </AccordionContent>
            }
          />
        </Accordion>
      </section>

      {/* Small Size */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Small Size</h2>
        <Accordion size="sm" variant="ghost">
          <AccordionItemWrapper
            id="small-1"
            trigger={<AccordionTrigger>Compact Item 1</AccordionTrigger>}
            content={<AccordionContent>This is a small accordion item.</AccordionContent>}
          />
          <AccordionItemWrapper
            id="small-2"
            trigger={<AccordionTrigger>Compact Item 2</AccordionTrigger>}
            content={<AccordionContent>Perfect for tight spaces.</AccordionContent>}
          />
        </Accordion>
      </section>

      {/* With Default Open Items */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Default Open Items</h2>
        <Accordion defaultOpenItems={['default-2']} variant="separated">
          <AccordionItemWrapper
            id="default-1"
            trigger={<AccordionTrigger>Closed by Default</AccordionTrigger>}
            content={<AccordionContent>This item starts closed.</AccordionContent>}
          />
          <AccordionItemWrapper
            id="default-2"
            trigger={<AccordionTrigger>Open by Default</AccordionTrigger>}
            content={<AccordionContent>This item starts open!</AccordionContent>}
          />
          <AccordionItemWrapper
            id="default-3"
            trigger={<AccordionTrigger>Also Closed</AccordionTrigger>}
            content={<AccordionContent>This item also starts closed.</AccordionContent>}
          />
        </Accordion>
      </section>

      {/* Disabled Items */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Disabled Items</h2>
        <Accordion variant="bordered">
          <AccordionItemWrapper
            id="disabled-1"
            trigger={<AccordionTrigger>Active Item</AccordionTrigger>}
            content={<AccordionContent>This item is active and clickable.</AccordionContent>}
          />
          <AccordionItemWrapper
            id="disabled-2"
            disabled
            trigger={<AccordionTrigger>Disabled Item</AccordionTrigger>}
            content={<AccordionContent>This content cannot be accessed.</AccordionContent>}
          />
          <AccordionItemWrapper
            id="disabled-3"
            trigger={<AccordionTrigger>Another Active Item</AccordionTrigger>}
            content={<AccordionContent>This item is also active.</AccordionContent>}
          />
        </Accordion>
      </section>

      {/* Non-Collapsible */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Non-Collapsible (Always One Open)</h2>
        <Accordion collapsible={false} defaultOpenItems={['nc-1']} variant="bordered">
          <AccordionItemWrapper
            id="nc-1"
            trigger={<AccordionTrigger>Section 1</AccordionTrigger>}
            content={
              <AccordionContent>
                At least one section must always be open in this accordion.
              </AccordionContent>
            }
          />
          <AccordionItemWrapper
            id="nc-2"
            trigger={<AccordionTrigger>Section 2</AccordionTrigger>}
            content={
              <AccordionContent>
                Try clicking on an open section - it won't close!
              </AccordionContent>
            }
          />
          <AccordionItemWrapper
            id="nc-3"
            trigger={<AccordionTrigger>Section 3</AccordionTrigger>}
            content={
              <AccordionContent>
                This ensures important information is always visible.
              </AccordionContent>
            }
          />
        </Accordion>
      </section>

      {/* FAQ Example */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">FAQ Example</h2>
        <Accordion variant="separated">
          <AccordionItemWrapper
            id="faq-fees"
            trigger={
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <HelpCircle className="w-4 h-4" />
                  <span>What are the transaction fees?</span>
                </div>
              </AccordionTrigger>
            }
            content={
              <AccordionContent>
                <div className="space-y-2">
                  <p>Transaction fees on NEPA are minimal and transparent:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Standard transactions: 0.1%</li>
                    <li>Cross-border transfers: 0.5%</li>
                    <li>Instant settlements: 0.2%</li>
                  </ul>
                  <p className="text-sm mt-2">
                    All fees are clearly displayed before you confirm any transaction.
                  </p>
                </div>
              </AccordionContent>
            }
          />
          <AccordionItemWrapper
            id="faq-time"
            trigger={
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <HelpCircle className="w-4 h-4" />
                  <span>How long do transactions take?</span>
                </div>
              </AccordionTrigger>
            }
            content={
              <AccordionContent>
                Most transactions are completed within 3-5 seconds thanks to the Stellar
                blockchain's fast consensus mechanism. Cross-border transactions may take
                slightly longer depending on network conditions.
              </AccordionContent>
            }
          />
          <AccordionItemWrapper
            id="faq-support"
            trigger={
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <HelpCircle className="w-4 h-4" />
                  <span>How can I contact support?</span>
                </div>
              </AccordionTrigger>
            }
            content={
              <AccordionContent>
                <div className="space-y-2">
                  <p>We offer multiple support channels:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Email: support@nepa.io</li>
                    <li>Live chat: Available 24/7 in the app</li>
                    <li>Community forum: community.nepa.io</li>
                    <li>Phone: +1 (555) 123-4567</li>
                  </ul>
                </div>
              </AccordionContent>
            }
          />
        </Accordion>
      </section>
    </div>
  );
};

export default AccordionExample;
