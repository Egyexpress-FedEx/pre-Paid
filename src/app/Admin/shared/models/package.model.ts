export interface CustomerPackageRecord {
  id: number;
  customerId: number;
  shipmentLimit: number;
  usedShipments: number;
  isActive: boolean;
  archived?: boolean;
  createdAt: string;
}

export interface CustomerPackageSummary {
  shipmentLimit: number;
  usedShipments: number;
  remainingShipments: number;
}

export interface ShipmentBillRecord {
  awbNumber: string;
  createdAt: string;
}
