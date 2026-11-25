export interface SearchQueryRequest {
  DataBase: string | null;
  DateFrom: string;
  DateTo: string;
  SqlString: string;
  UserID: string;
  UserPwd: string;
}

export interface SearchQuerySqlRequest {
  UserID: string;
  UserPwd: string;
  SqlString: string;
  DataBase: string;
}

export interface SearchQueryAwb {
  BookingRefNo: string;
  PickupReadyDate: string;
  ShipmentCreatedAt?: string;
  SendersName: string;
  CustCode: string;
  Origin: string;
  NoofPieces: number | string;
  ShipmentWeight: number | string;
  ShipperRef: string;
}

export interface SearchQueryResponse {
  Code: string;
  Description: string;
  JasonString: string;
}

export type ShipmentAuditIssue = 'api-awb-not-in-package' | 'package-awb-not-in-api';
export type ShipmentAuditStatus = 'pending' | 'added-to-package' | 'removed-from-package' | 'ignored' | 'resolved';

export interface ShipmentAuditNotification {
  id: string;
  accountNumber: string;
  issue: ShipmentAuditIssue;
  awbNumber: string;
  awbDate: string;
  shipmentCreatedAt?: string;
  senderName: string;
  origin: string;
  pieces: number;
  weight: number;
  shipperReference: string;
  sourcePackageId?: number;
  detectedAt: string;
  status: ShipmentAuditStatus;
  resolvedAt?: string;
  packageId?: number;
}

export interface ShipmentAuditAction {
  id: string;
  notificationId: string;
  accountNumber: string;
  awbNumber: string;
  action: 'added-to-package' | 'removed-from-package' | 'ignored' | 'matched-from-manifest' | 'external-awb-auto-assigned';
  issue?: ShipmentAuditIssue;
  packageId?: number;
  sourcePackageId?: number;
  awbDate?: string;
  shipmentCreatedAt?: string;
  senderName?: string;
  origin?: string;
  pieces?: number;
  weight?: number;
  shipperReference?: string;
  note?: string;
  actedAt: string;
}
