import { HttpErrorResponse } from '@angular/common/http';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { computed, effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { EMPTY, Subject, catchError, exhaustMap, finalize, map, of, tap } from 'rxjs';
import { CustomerApiCredentialsStore } from '../../../core/auth/customer-api-credentials.store';
import { AdminDataService } from './admin-data.service';
import { SearchQueryService } from './search-query.service';
import {
  SearchQueryAwb,
  SearchQueryResponse,
  ShipmentAuditAction,
  ShipmentAuditIssue,
  ShipmentAuditNotification,
} from '../models/search-query.model';

const NOTIFICATIONS_KEY = 'admin-shipment-audit-notifications';
const ACTIONS_KEY = 'admin-shipment-audit-actions';
const LOCAL_BILL_GRACE_MS = 24 * 60 * 60 * 1000;
const MANIFEST_MATCH_WINDOW_MS = 5 * 60 * 1000;

interface AccountScanResult {
  accountNumber: string;
  success: boolean;
  notifications: ShipmentAuditNotification[];
  error?: string;
}

type ShipmentAuditRequest = { scope: 'all' } | { scope: 'account'; accountNumber: string };

@Injectable({ providedIn: 'root' })
export class ShipmentAuditService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);
  private readonly adminData = inject(AdminDataService);
  private readonly credentialsStore = inject(CustomerApiCredentialsStore);
  private readonly searchQuery = inject(SearchQueryService);
  private readonly checkRequests = new Subject<ShipmentAuditRequest>();

  readonly notifications = signal<ShipmentAuditNotification[]>(this.readStorage(NOTIFICATIONS_KEY, []));
  readonly actions = signal<ShipmentAuditAction[]>(this.readStorage(ACTIONS_KEY, []));
  readonly pendingNotifications = computed(() => this.notifications()
    .filter((notification) => notification.status === 'pending')
    .sort((first, second) => second.detectedAt.localeCompare(first.detectedAt)));
  readonly pendingCount = computed(() => this.pendingNotifications().length);
  readonly isChecking = signal(false);
  readonly lastCheckedAt = signal('');
  readonly checkErrors = signal<string[]>([]);

  constructor() {
    effect(() => this.writeStorage(NOTIFICATIONS_KEY, this.notifications()));
    effect(() => this.writeStorage(ACTIONS_KEY, this.actions()));

    this.checkRequests.pipe(
      exhaustMap((request) => request.scope === 'all'
        ? this.runAudit()
        : this.runAccountAudit(request.accountNumber)),
    ).subscribe();
  }

  checkNow(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.checkRequests.next({ scope: 'all' });
  }

  checkAccountNow(accountNumber: string): void {
    if (!isPlatformBrowser(this.platformId) || !accountNumber.trim()) return;
    this.checkRequests.next({ scope: 'account', accountNumber });
  }

  getPackagesForAccount(accountNumber: string) {
    return this.adminData.getPackagesForAccount(accountNumber);
  }

  addAwbToPackage(notificationId: string, packageId: number, note = ''): boolean {
    const notification = this.findPending(notificationId, 'api-awb-not-in-package');
    if (!notification) return false;

    const added = this.adminData.assignAuditedShipmentToPackage(
      notification.accountNumber,
      packageId,
      notification.awbNumber,
      this.billTimestamp(notification.shipmentCreatedAt || notification.awbDate),
    );
    if (!added) return false;

    this.resolveNotification(notification, 'added-to-package', packageId, note);
    return true;
  }

  removeAwbFromPackage(notificationId: string, note = ''): boolean {
    const notification = this.findPending(notificationId, 'package-awb-not-in-api');
    if (!notification?.sourcePackageId) return false;

    const removed = this.adminData.removeAuditedShipmentFromPackage(
      notification.accountNumber,
      notification.sourcePackageId,
      notification.awbNumber,
    );
    if (!removed) return false;

    this.resolveNotification(notification, 'removed-from-package', notification.sourcePackageId, note);
    return true;
  }

  ignoreNotification(notificationId: string, note = ''): void {
    const notification = this.notifications().find((entry) => entry.id === notificationId && entry.status === 'pending');
    if (notification) this.resolveNotification(notification, 'ignored', undefined, note);
  }

  private runAudit() {
    this.isChecking.set(true);
    this.checkErrors.set([]);
    const accounts = this.adminData.customers().filter((customer) =>
      this.adminData.getPackagesForAccount(customer.accountNumber).length > 0,
    );

    if (accounts.length === 0) {
      this.isChecking.set(false);
      this.lastCheckedAt.set(this.localTimestamp());
      return EMPTY;
    }

    const packageStarts = accounts.flatMap((customer) => this.adminData
      .getPackagesForAccount(customer.accountNumber)
      .map((customerPackage) => this.parseTimestamp(customerPackage.createdAt))
      .filter((timestamp) => Number.isFinite(timestamp)));
    const earliestPackageStart = Math.min(...packageStarts);
    if (!Number.isFinite(earliestPackageStart)) {
      this.isChecking.set(false);
      this.lastCheckedAt.set(this.localTimestamp());
      this.checkErrors.set(['Could not determine when the account packages started.']);
      return EMPTY;
    }

    const from = new Date(earliestPackageStart);
    const to = new Date();
    const dateToExclusive = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
    return this.searchQuery.searchAllAccountShipments(
      accounts.map((customer) => customer.accountNumber),
      this.sqlTimestamp(from),
      this.sqlTimestamp(dateToExclusive),
    ).pipe(
      map((response) => this.buildAccountScans(accounts.map((customer) => customer.accountNumber), response)),
      catchError((error: unknown) => of<AccountScanResult[]>(accounts.map((customer) => ({
        accountNumber: customer.accountNumber,
        success: false,
        notifications: [],
        error: this.errorMessage(error),
      })))),
      tap((results) => this.applyScanResults(results)),
      finalize(() => this.isChecking.set(false)),
    );
  }

  private runAccountAudit(accountNumber: string) {
    this.isChecking.set(true);
    this.checkErrors.set([]);
    return this.scanAccount(accountNumber).pipe(
      catchError((error: unknown) => of<AccountScanResult>({
        accountNumber,
        success: false,
        notifications: [],
        error: this.errorMessage(error),
      })),
      tap((result) => this.applyScanResults([result])),
      finalize(() => this.isChecking.set(false)),
    );
  }

  private scanAccount(accountNumber: string) {
    const credentials = this.credentialsStore.get(accountNumber);
    if (!credentials?.userId || !credentials.userPwd) {
      return of<AccountScanResult>({
        accountNumber,
        success: false,
        notifications: [],
        error: 'No saved API credentials for this account. Sign in to the customer portal in this browser first.',
      });
    }

    const customerPackages = this.adminData.getPackagesForAccount(accountNumber);
    const packageStart = customerPackages
      .map((customerPackage) => this.parseTimestamp(customerPackage.createdAt))
      .filter((timestamp) => Number.isFinite(timestamp))
      .sort((first, second) => first - second)[0];
    if (packageStart === undefined) {
      return of<AccountScanResult>({
        accountNumber,
        success: false,
        notifications: [],
        error: 'Could not determine when the account package started.',
      });
    }

    const from = new Date(packageStart);
    const to = new Date();
    const dateToExclusive = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
    return this.searchQuery.searchAccountShipments(
      credentials.userId,
      credentials.userPwd,
      accountNumber,
      this.sqlTimestamp(from),
      this.sqlTimestamp(dateToExclusive),
    ).pipe(
      map((response) => this.buildAccountScan(accountNumber, response)),
    );
  }

  private buildAccountScan(accountNumber: string, response: SearchQueryResponse): AccountScanResult {
    if (String(response.Code) !== '1' || response.Description?.toUpperCase() !== 'SUCCESS') {
      throw new Error(response.Description || 'SearchQuery did not return a successful response.');
    }

    let apiShipments: SearchQueryAwb[];
    try {
      const parsed = JSON.parse(response.JasonString || '[]') as unknown;
      if (!Array.isArray(parsed)) throw new Error('Shipment results were not a JSON array.');
      apiShipments = parsed
        .filter((shipment): shipment is Record<string, unknown> =>
          typeof shipment === 'object' && shipment !== null && !Array.isArray(shipment),
        )
        .map((shipment) => this.normalizeManifestShipment(shipment))
        .filter((shipment) => shipment.BookingRefNo.length > 0);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Could not read SearchQuery results.');
    }

    const customerPackages = this.adminData.getPackagesForAccount(accountNumber);
    const storedPackageBills = customerPackages.flatMap((customerPackage) =>
      this.adminData.getPackageBillRecords(customerPackage.id)
        .flatMap((bill, billIndex) => bill && typeof bill === 'object'
          ? [{ bill, billIndex, packageId: customerPackage.id }]
          : []),
    );
    this.fillUnambiguousManifestMatches(accountNumber, apiShipments, storedPackageBills);

    const packageBills = customerPackages.flatMap((customerPackage) =>
      this.adminData.getPackageBills(customerPackage.id).map((bill) => ({
        bill,
        packageId: customerPackage.id,
      })),
    );
    const localAwbs = new Set(packageBills.map(({ bill }) => this.normalizeAwb(bill.awbNumber)));
    const apiAwbs = new Set(apiShipments.map((shipment) => this.normalizeAwb(shipment.BookingRefNo)));
    const detectedAt = this.localTimestamp();
    const notifications: ShipmentAuditNotification[] = [];
    const chronologicalShipments = [...apiShipments].sort((first, second) =>
      this.parseTimestamp(first.ShipmentCreatedAt ?? '') - this.parseTimestamp(second.ShipmentCreatedAt ?? ''),
    );

    for (const shipment of chronologicalShipments) {
      const awbNumber = String(shipment.BookingRefNo ?? '').trim();
      if (!awbNumber || localAwbs.has(this.normalizeAwb(awbNumber))) continue;
      if (this.hasExplicitAuditDecision(accountNumber, awbNumber)) continue;

      const shipmentCreatedAt = shipment.ShipmentCreatedAt ?? '';
      const hasCreationTimestamp = Number.isFinite(this.parseTimestamp(shipmentCreatedAt));
      const packageId = hasCreationTimestamp
        ? this.adminData.assignExternalShipmentToEligiblePackage(
          accountNumber,
          awbNumber,
          this.billTimestamp(shipmentCreatedAt),
        )
        : null;
      if (packageId !== null) {
        localAwbs.add(this.normalizeAwb(awbNumber));
        this.recordExternalAutoAssignment(accountNumber, awbNumber, packageId, shipment);
        continue;
      }

      notifications.push({
        id: this.notificationId(accountNumber, 'api-awb-not-in-package', awbNumber),
        accountNumber,
        issue: 'api-awb-not-in-package',
        awbNumber,
        awbDate: shipment.PickupReadyDate ?? '',
        shipmentCreatedAt: shipment.ShipmentCreatedAt ?? '',
        senderName: shipment.SendersName ?? '',
        origin: shipment.Origin ?? '',
        pieces: Number(shipment.NoofPieces) || 0,
        weight: Number(shipment.ShipmentWeight) || 0,
        shipperReference: shipment.ShipperRef ?? '',
        detectedAt,
        status: 'pending',
      });
    }

    const staleLocalCutoff = Date.now() - LOCAL_BILL_GRACE_MS;
    for (const { bill, packageId } of packageBills) {
      const awbNumber = bill.awbNumber.trim();
      if (!awbNumber || apiAwbs.has(this.normalizeAwb(awbNumber))) continue;
      const timestamp = this.parseTimestamp(bill.createdAt);
      if (!Number.isFinite(timestamp) || timestamp > staleLocalCutoff) continue;

      notifications.push({
        id: this.notificationId(accountNumber, 'package-awb-not-in-api', awbNumber),
        accountNumber,
        issue: 'package-awb-not-in-api',
        awbNumber,
        awbDate: this.dateForDisplay(bill.createdAt),
        senderName: '',
        origin: '',
        pieces: 0,
        weight: 0,
        shipperReference: '',
        sourcePackageId: packageId,
        detectedAt,
        status: 'pending',
      });
    }

    return { accountNumber, success: true, notifications };
  }

  private buildAccountScans(accountNumbers: string[], response: SearchQueryResponse): AccountScanResult[] {
    if (String(response.Code) !== '1' || response.Description?.toUpperCase() !== 'SUCCESS') {
      throw new Error(response.Description || 'SearchQuery did not return a successful response.');
    }

    const parsed = JSON.parse(response.JasonString || '[]') as unknown;
    if (!Array.isArray(parsed)) throw new Error('Shipment results were not a JSON array.');
    const shipments = parsed
      .filter((shipment): shipment is Record<string, unknown> =>
        typeof shipment === 'object' && shipment !== null && !Array.isArray(shipment),
      )
      .map((shipment) => this.normalizeManifestShipment(shipment));

    return accountNumbers.map((accountNumber) => {
      try {
        const accountShipments = shipments.filter((shipment) =>
          this.normalizeAccount(shipment.CustCode) === this.normalizeAccount(accountNumber),
        );
        return this.buildAccountScan(accountNumber, {
          ...response,
          JasonString: JSON.stringify(accountShipments),
        });
      } catch (error) {
        return {
          accountNumber,
          success: false,
          notifications: [],
          error: this.errorMessage(error),
        };
      }
    });
  }

  private fillUnambiguousManifestMatches(
    accountNumber: string,
    apiShipments: SearchQueryAwb[],
    storedPackageBills: Array<{ bill: { awbNumber: string; createdAt: string }; billIndex: number; packageId: number }>,
  ): void {
    const recordedAwbs = new Set(storedPackageBills
      .map(({ bill }) => this.normalizeAwb(bill.awbNumber))
      .filter(Boolean));
    const unmatchedShipments = apiShipments.filter((shipment) =>
      !recordedAwbs.has(this.normalizeAwb(shipment.BookingRefNo)),
    );
    const blankSlots = storedPackageBills.filter(({ bill }) => !this.normalizeAwb(bill.awbNumber));
    const slotCandidates = blankSlots.map((slot) => {
      const localCreatedAt = this.parseTimestamp(slot.bill.createdAt);
      const shipments = Number.isFinite(localCreatedAt)
        ? unmatchedShipments.filter((shipment) => {
          const manifestCreatedAt = this.parseTimestamp(shipment.ShipmentCreatedAt ?? '');
          return Number.isFinite(manifestCreatedAt)
            && Math.abs(manifestCreatedAt - localCreatedAt) <= MANIFEST_MATCH_WINDOW_MS;
        })
        : [];
      return { slot, shipments };
    });

    for (const candidate of slotCandidates) {
      if (candidate.shipments.length !== 1) continue;
      const [shipment] = candidate.shipments;
      const matchingSlots = slotCandidates.filter((other) =>
        other.shipments.some((match) => this.normalizeAwb(match.BookingRefNo) === this.normalizeAwb(shipment.BookingRefNo)),
      );
      if (matchingSlots.length !== 1) continue;

      const awbNumber = shipment.BookingRefNo.trim();
      const matched = this.adminData.fillBlankAuditedShipmentToPackage(
        accountNumber,
        candidate.slot.packageId,
        awbNumber,
        this.billTimestamp(shipment.ShipmentCreatedAt ?? shipment.PickupReadyDate ?? ''),
        candidate.slot.billIndex,
      );
      if (matched) this.recordManifestMatch(accountNumber, awbNumber, candidate.slot.packageId, shipment);
    }
  }

  private recordManifestMatch(
    accountNumber: string,
    awbNumber: string,
    packageId: number,
    shipment: SearchQueryAwb,
  ): void {
    const actedAt = this.localTimestamp();
    const notificationId = this.notificationId(accountNumber, 'api-awb-not-in-package', awbNumber);
    this.actions.update((actions) => [{
      id: `${notificationId}:matched:${actedAt}`,
      notificationId,
      accountNumber,
      awbNumber,
      action: 'matched-from-manifest',
      issue: 'api-awb-not-in-package',
      packageId,
      awbDate: shipment.PickupReadyDate,
      shipmentCreatedAt: shipment.ShipmentCreatedAt,
      senderName: shipment.SendersName,
      origin: shipment.Origin,
      pieces: Number(shipment.NoofPieces) || 0,
      weight: Number(shipment.ShipmentWeight) || 0,
      shipperReference: shipment.ShipperRef,
      note: 'This shipment was matched with its saved package entry using the shipment creation time.',
      actedAt,
    }, ...actions]);
  }

  private recordExternalAutoAssignment(
    accountNumber: string,
    awbNumber: string,
    packageId: number,
    shipment: SearchQueryAwb,
  ): void {
    const actedAt = this.localTimestamp();
    const notificationId = this.notificationId(accountNumber, 'api-awb-not-in-package', awbNumber);
    if (this.actions().some((action) => action.notificationId === notificationId
      && action.action === 'external-awb-auto-assigned')) return;

    this.actions.update((actions) => [{
      id: `${notificationId}:external-auto:${actedAt}`,
      notificationId,
      accountNumber,
      awbNumber,
      action: 'external-awb-auto-assigned',
      issue: 'api-awb-not-in-package',
      packageId,
      awbDate: shipment.PickupReadyDate,
      shipmentCreatedAt: shipment.ShipmentCreatedAt,
      senderName: shipment.SendersName,
      origin: shipment.Origin,
      pieces: Number(shipment.NoofPieces) || 0,
      weight: Number(shipment.ShipmentWeight) || 0,
      shipperReference: shipment.ShipperRef,
      note: 'This shipment was created outside the portal after the package started, so it was added to the oldest active package with shipments available.',
      actedAt,
    }, ...actions]);
  }

  private hasExplicitAuditDecision(accountNumber: string, awbNumber: string): boolean {
    const normalizedAccount = this.normalizeAccount(accountNumber);
    const normalizedAwb = this.normalizeAwb(awbNumber);
    const latestAction = this.actions()
      .filter((action) => this.normalizeAccount(action.accountNumber) === normalizedAccount
        && this.normalizeAwb(action.awbNumber) === normalizedAwb)
      .sort((first, second) => second.actedAt.localeCompare(first.actedAt))[0];
    return latestAction?.action === 'removed-from-package' || latestAction?.action === 'ignored';
  }

  private normalizeManifestShipment(shipment: Record<string, unknown>): SearchQueryAwb {
    const field = (...names: string[]): string => {
      const wantedNames = new Set(names.map((name) => name.toLowerCase()));
      const value = Object.entries(shipment).find(([name]) => wantedNames.has(name.trim().toLowerCase()))?.[1];
      return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
    };

    return {
      BookingRefNo: field('BookingRefNo', 'AWBNo', 'AwbNo', 'AWBNO'),
      PickupReadyDate: field('PickupReadyDate', 'BillDate'),
      ShipmentCreatedAt: field('ShipmentCreatedAt', 'CrDt', 'CreatedAt'),
      SendersName: field('SendersName', 'Consignee'),
      CustCode: field('CustCode', 'AccountNo'),
      Origin: field('Origin', 'Destination'),
      NoofPieces: field('NoofPieces'),
      ShipmentWeight: field('ShipmentWeight', 'Weight'),
      ShipperRef: field('ShipperRef'),
    };
  }

  private applyScanResults(results: AccountScanResult[]): void {
    const successfulAccounts = new Set(results.filter((result) => result.success)
      .map((result) => this.normalizeAccount(result.accountNumber)));
    const byId = new Map(this.notifications().map((notification) => [notification.id, notification]));
    const currentIds = new Set<string>();

    for (const result of results) {
      if (!result.success) continue;
      for (const notification of result.notifications) {
        currentIds.add(notification.id);
        if (!byId.has(notification.id)) byId.set(notification.id, notification);
      }
    }

    const now = this.localTimestamp();
    const reconciled = Array.from(byId.values()).map((notification) => {
      if (notification.status !== 'pending'
        || !successfulAccounts.has(this.normalizeAccount(notification.accountNumber))
        || currentIds.has(notification.id)) return notification;
      return { ...notification, status: 'resolved' as const, resolvedAt: now };
    });

    this.notifications.set(reconciled);
    this.checkErrors.set(results.filter((result) => !result.success)
      .map((result) => `${result.accountNumber}: ${result.error || 'Could not check this account.'}`));
    this.lastCheckedAt.set(now);
  }

  private findPending(notificationId: string, issue: ShipmentAuditIssue): ShipmentAuditNotification | null {
    return this.notifications().find((notification) =>
      notification.id === notificationId && notification.status === 'pending' && notification.issue === issue,
    ) ?? null;
  }

  private resolveNotification(
    notification: ShipmentAuditNotification,
    action: Exclude<ShipmentAuditAction['action'], 'matched-from-manifest' | 'external-awb-auto-assigned'>,
    packageId?: number,
    note = '',
  ): void {
    const actedAt = this.localTimestamp();
    this.notifications.update((notifications) => notifications.map((entry) => entry.id === notification.id
      ? { ...entry, status: action, resolvedAt: actedAt, packageId: packageId ?? entry.packageId }
      : entry));
    this.actions.update((actions) => [{
      id: `${notification.id}:${actedAt}`,
      notificationId: notification.id,
      accountNumber: notification.accountNumber,
      awbNumber: notification.awbNumber,
      action,
      issue: notification.issue,
      packageId,
      sourcePackageId: notification.sourcePackageId,
      awbDate: notification.awbDate,
      shipmentCreatedAt: notification.shipmentCreatedAt,
      senderName: notification.senderName,
      origin: notification.origin,
      pieces: notification.pieces,
      weight: notification.weight,
      shipperReference: notification.shipperReference,
      note: note.trim(),
      actedAt,
    }, ...actions]);
  }

  private normalizeAwb(awbNumber: string | number | null | undefined): string {
    return String(awbNumber ?? '').trim().toUpperCase();
  }

  private normalizeAccount(accountNumber: string): string {
    return accountNumber.trim().toUpperCase();
  }

  private notificationId(accountNumber: string, issue: ShipmentAuditIssue, awbNumber: string): string {
    return `${this.normalizeAccount(accountNumber)}:${issue}:${this.normalizeAwb(awbNumber)}`;
  }

  private billTimestamp(value: string): string {
    const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}T00:00:00`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00`;
    const date = new Date(value.replace(' ', 'T'));
    return Number.isFinite(date.getTime()) ? this.formatLocalTimestamp(date) : this.localTimestamp();
  }

  private dateForDisplay(value: string): string {
    const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return match ? `${match[3]}-${match[2]}-${match[1]}` : value.slice(0, 10);
  }

  private parseTimestamp(value: string | null | undefined): number {
    if (typeof value !== 'string' || !value.trim()) return Number.NaN;
    const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const normalized = match
      ? `${match[3]}-${match[2]}-${match[1]}T00:00:00`
      : /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value.replace(' ', 'T');
    return new Date(normalized).getTime();
  }

  private sqlTimestamp(date: Date): string {
    const timestamp = this.formatLocalTimestamp(date).replace('T', ' ');
    return `${timestamp}.${String(date.getMilliseconds()).padStart(3, '0')}`;
  }

  private localTimestamp(): string {
    return this.formatLocalTimestamp(new Date());
  }

  private formatLocalTimestamp(date: Date): string {
    const datePart = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    const timePart = [date.getHours(), date.getMinutes(), date.getSeconds()].map((part) => String(part).padStart(2, '0')).join(':');
    return `${datePart}T${timePart}`;
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const body = error.error as { Description?: string } | null;
      return body?.Description || error.message || 'SearchQuery request failed.';
    }
    if (error instanceof Error && error.message) return error.message;
    return 'SearchQuery failed for this account.';
  }

  private readStorage<T>(key: string, fallback: T): T {
    if (!isPlatformBrowser(this.platformId)) return fallback;
    const rawValue = this.document.defaultView?.localStorage.getItem(key);
    if (!rawValue) return fallback;
    try {
      return JSON.parse(rawValue) as T;
    } catch {
      return fallback;
    }
  }

  private writeStorage<T>(key: string, value: T): void {
    if (isPlatformBrowser(this.platformId)) {
      this.document.defaultView?.localStorage.setItem(key, JSON.stringify(value));
    }
  }
}
