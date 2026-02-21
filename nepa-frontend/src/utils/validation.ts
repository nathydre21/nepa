export const validateMeterNumber = (meter: string): string | null => {
  if (!meter) return null;
  const pattern = /^[A-Z0-9]{11,13}$/;
  return pattern.test(meter) ? null : "Invalid Meter ID (11-13 chars)";
};

export const validateAmount = (amount: string): string | null => {
  if (!amount) return null;
  const num = parseFloat(amount);
  if (isNaN(num) || num <= 0) return "Must be greater than 0";
  if (num > 10000) return "Limit: 10,000 XLM";
  const decimals = amount.split('.')[1];
  if (decimals && decimals.length > 7) return "Max 7 decimal places";
  return null;
};
