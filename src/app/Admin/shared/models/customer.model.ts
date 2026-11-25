import type { CustomerPackageSummary } from './package.model';

export interface Customer {
  id: number;
  accountNumber: string;
  isActive: boolean;
  createdAt: string;
  lastCompletedPackageSummary?: Pick<CustomerPackageSummary, 'shipmentLimit' | 'usedShipments'>;
}
