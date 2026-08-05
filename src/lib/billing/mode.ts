export function isMockBillingMode(): boolean {
  const serverMode = process.env.BILLING_MODE?.trim().toLowerCase();
  const publicMode = process.env.NEXT_PUBLIC_BILLING_MODE?.trim().toLowerCase();

  if (serverMode === 'mock' || publicMode === 'mock') {
    return true;
  }

  if (serverMode === 'stripe' || publicMode === 'stripe') {
    return false;
  }

  return process.env.NODE_ENV !== 'production';
}
