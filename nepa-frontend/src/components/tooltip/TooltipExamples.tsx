import React, { useState } from 'react';
import {
  Tooltip,
  InfoTooltip,
  SuccessTooltip,
  WarningTooltip,
  ErrorTooltip,
  HelpTooltip,
  RichTooltip,
  IconTooltip,
} from './index';

export const TooltipExamples: React.FC = () => {
  const [controlledOpen, setControlledOpen] = useState(false);
  const [clickTooltipOpen, setClickTooltipOpen] = useState(false);

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Tooltip Examples</h1>

      {/* Basic Tooltip */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-800">Basic Tooltip</h2>
        <div className="flex flex-wrap gap-4">
          <Tooltip content="This is a basic tooltip">
            <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
              Hover me
            </button>
          </Tooltip>

          <Tooltip content="Tooltip on the right" position="right">
            <button className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">
              Right tooltip
            </button>
          </Tooltip>

          <Tooltip content="Tooltip on the bottom" position="bottom">
            <button className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600">
              Bottom tooltip
            </button>
          </Tooltip>
        </div>
      </section>

      {/* Trigger Types */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-800">Trigger Types</h2>
        <div className="flex flex-wrap gap-4">
          <Tooltip content="Hover trigger (default)" trigger="hover">
            <button className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600">
              Hover
            </button>
          </Tooltip>

          <Tooltip content="Click trigger" trigger="click">
            <button className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600">
              Click
            </button>
          </Tooltip>

          <Tooltip content="Focus trigger" trigger="focus">
            <button className="px-4 py-2 bg-teal-500 text-white rounded hover:bg-teal-600">
              Focus
            </button>
          </Tooltip>
        </div>
      </section>

      {/* Colored Tooltips */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-800">Colored Tooltips</h2>
        <div className="flex flex-wrap gap-4">
          <InfoTooltip content="This is an informational tooltip">
            <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
              Info
            </button>
          </InfoTooltip>

          <SuccessTooltip content="Operation completed successfully!">
            <button className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">
              Success
            </button>
          </SuccessTooltip>

          <WarningTooltip content="Please review this carefully">
            <button className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600">
              Warning
            </button>
          </WarningTooltip>

          <ErrorTooltip content="An error occurred">
            <button className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
              Error
            </button>
          </ErrorTooltip>

          <HelpTooltip content="This provides additional help information">
            <button className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600">
              Help
            </button>
          </HelpTooltip>
        </div>
      </section>

      {/* Rich Tooltip */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-800">Rich Tooltip</h2>
        <div className="flex flex-wrap gap-4">
          <RichTooltip
            title="Transaction Details"
            content="This transaction was processed on the Stellar network and has been confirmed."
            footer="Transaction ID: TX123456789"
          >
            <button className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-800">
              Rich Tooltip
            </button>
          </RichTooltip>
        </div>
      </section>

      {/* Icon Tooltip */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-800">Icon Tooltip</h2>
        <div className="flex items-center gap-4">
          <span className="text-gray-700">Balance:</span>
          <span className="font-semibold">$1,234.56</span>
          <IconTooltip content="Your current account balance including pending transactions" />
        </div>
      </section>

      {/* Controlled Tooltip */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-800">Controlled Tooltip</h2>
        <div className="flex flex-wrap gap-4">
          <Tooltip
            content="This tooltip is controlled programmatically"
            open={controlledOpen}
            onOpenChange={setControlledOpen}
          >
            <button className="px-4 py-2 bg-pink-500 text-white rounded hover:bg-pink-600">
              Controlled Tooltip
            </button>
          </Tooltip>
          <button
            onClick={() => setControlledOpen(!controlledOpen)}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            {controlledOpen ? 'Hide' : 'Show'} Tooltip
          </button>
        </div>
      </section>

      {/* Advanced Features */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-800">Advanced Features</h2>
        <div className="flex flex-wrap gap-4">
          <Tooltip
            content="This tooltip has a custom delay"
            delay={1000}
            hideDelay={500}
          >
            <button className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600">
              Custom Delay
            </button>
          </Tooltip>

          <Tooltip
            content="This tooltip has a maximum width and won't overflow"
            maxWidth={200}
          >
            <button className="px-4 py-2 bg-teal-500 text-white rounded hover:bg-teal-600">
              Max Width
            </button>
          </Tooltip>

          <Tooltip
            content="This tooltip has no arrow"
            showArrow={false}
          >
            <button className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600">
              No Arrow
            </button>
          </Tooltip>

          <Tooltip
            content="This tooltip is disabled"
            disabled
          >
            <button className="px-4 py-2 bg-gray-400 text-white rounded cursor-not-allowed">
              Disabled
            </button>
          </Tooltip>
        </div>
      </section>

      {/* Position Variants */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-800">Position Variants</h2>
        <div className="grid grid-cols-4 gap-4 p-8 bg-gray-100 rounded">
          <div className="text-center">
            <Tooltip content="Top Start" position="top-start">
              <button className="px-3 py-1 bg-blue-500 text-white rounded text-sm">
                Top Start
              </button>
            </Tooltip>
          </div>
          <div className="text-center">
            <Tooltip content="Top" position="top">
              <button className="px-3 py-1 bg-blue-500 text-white rounded text-sm">
                Top
              </button>
            </Tooltip>
          </div>
          <div className="text-center">
            <Tooltip content="Top End" position="top-end">
              <button className="px-3 py-1 bg-blue-500 text-white rounded text-sm">
                Top End
              </button>
            </Tooltip>
          </div>
          <div className="text-center">
            <Tooltip content="Right Start" position="right-start">
              <button className="px-3 py-1 bg-green-500 text-white rounded text-sm">
                Right Start
              </button>
            </Tooltip>
          </div>
          <div className="text-center">
            <Tooltip content="Left" position="left">
              <button className="px-3 py-1 bg-green-500 text-white rounded text-sm">
                Left
              </button>
            </Tooltip>
          </div>
          <div className="text-center">
            <Tooltip content="Right" position="right">
              <button className="px-3 py-1 bg-green-500 text-white rounded text-sm">
                Right
              </button>
            </Tooltip>
          </div>
          <div className="text-center">
            <Tooltip content="Left End" position="left-end">
              <button className="px-3 py-1 bg-green-500 text-white rounded text-sm">
                Left End
              </button>
            </Tooltip>
          </div>
          <div className="text-center">
            <Tooltip content="Bottom Start" position="bottom-start">
              <button className="px-3 py-1 bg-purple-500 text-white rounded text-sm">
                Bottom Start
              </button>
            </Tooltip>
          </div>
          <div className="text-center">
            <Tooltip content="Bottom" position="bottom">
              <button className="px-3 py-1 bg-purple-500 text-white rounded text-sm">
                Bottom
              </button>
            </Tooltip>
          </div>
          <div className="text-center">
            <Tooltip content="Bottom End" position="bottom-end">
              <button className="px-3 py-1 bg-purple-500 text-white rounded text-sm">
                Bottom End
              </button>
            </Tooltip>
          </div>
          <div className="text-center">
            <Tooltip content="Right End" position="right-end">
              <button className="px-3 py-1 bg-green-500 text-white rounded text-sm">
                Right End
              </button>
            </Tooltip>
          </div>
          <div className="text-center">
            <Tooltip content="Left Start" position="left-start">
              <button className="px-3 py-1 bg-green-500 text-white rounded text-sm">
                Left Start
              </button>
            </Tooltip>
          </div>
        </div>
      </section>

      {/* Accessibility Demo */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-800">Accessibility Features</h2>
        <div className="space-y-4">
          <p className="text-gray-600">
            These tooltips include proper ARIA attributes, keyboard navigation, and screen reader support.
            Try tabbing through the elements or using a screen reader.
          </p>
          <div className="flex flex-wrap gap-4">
            <Tooltip
              content="This tooltip has custom ARIA labels"
              ariaLabel="Custom accessible tooltip"
            >
              <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                Accessible Tooltip
              </button>
            </Tooltip>

            <Tooltip content="Focusable tooltip with keyboard support" trigger="focus">
              <input
                type="text"
                placeholder="Focus this input"
                className="px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Tooltip>
          </div>
        </div>
      </section>
    </div>
  );
};

export default TooltipExamples;
