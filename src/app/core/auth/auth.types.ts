export type UserRole = 'admin' | 'customer' | 'visitor';

export interface AuthUser {
  role: UserRole;
  email?: string;
  accountNumber?: string;
  displayName?: string;
  shipmentLimit?: number;
  usedShipments?: number;
  apiUserId?: string;
  apiUserPassword?: string;
}
