import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { effect, Injectable, computed, inject, PLATFORM_ID, signal } from '@angular/core';
import { Customer } from '../models/customer.model';
import { CustomerPackageRecord, CustomerPackageSummary, ShipmentBillRecord } from '../models/package.model';
import { CustomerApiCredentialsStore } from '../../../core/auth/customer-api-credentials.store';
import { AccountUserStatusService } from './account-user-status.service';

@Injectable({ providedIn: 'root' })
export class AdminDataService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);
  private readonly apiCredentials = inject(CustomerApiCredentialsStore);
  private readonly accountUserStatus = inject(AccountUserStatusService);

  readonly customers = signal<Customer[]>(this.readStorage('admin-customers-real', []));
  readonly packages = signal<CustomerPackageRecord[]>(this.readStorage('admin-packages-real', []));
  readonly shipmentBills = signal<Record<number, ShipmentBillRecord[]>>(this.readStorage('admin-shipment-bills-real', {}));

  readonly activeCustomers = computed(() => this.customers().filter((customer) => customer.isActive).length);

  constructor() {
    this.repairLegacyRenewals();
    effect(() => this.writeStorage('admin-customers-real', this.customers()));
    effect(() => this.writeStorage('admin-packages-real', this.packages()));
    effect(() => this.writeStorage('admin-shipment-bills-real', this.shipmentBills()));
  }

  addCustomer(accountNumber: string): void {
    this.customers.update((customers) => [{
      id: Date.now(),
      accountNumber: accountNumber.trim(),
      isActive: true,
      createdAt: this.localTimestamp().slice(0, 10),
    }, ...customers]);
  }

  findCustomerByAccountNumber(accountNumber: string): Customer | null {
    const normalizedAccountNumber = accountNumber.trim().toLowerCase();
    return this.customers().find((customer) =>
      customer.accountNumber.trim().toLowerCase() === normalizedAccountNumber,
    ) ?? null;
  }

  getCustomerPackages(customerId: number): CustomerPackageRecord[] {
    return this.packages()
      .filter((customerPackage) => customerPackage.customerId === customerId)
      .sort((first, second) => first.createdAt.localeCompare(second.createdAt) || first.id - second.id);
  }

  syncAccountUserStatus(accountNumber: string, force = false): void {
    const customer = this.findCustomerByAccountNumber(accountNumber);
    if (!customer) return;
    this.accountUserStatus.syncAccount(
      customer.accountNumber,
      this.hasOpenPackageForCustomer(customer.id),
      force,
    );
  }

  syncAllAccountUserStatuses(): void {
    this.accountUserStatus.syncAccounts(this.customers().map((customer) => ({
      accountNumber: customer.accountNumber,
      isActive: this.hasOpenPackageForCustomer(customer.id),
    })));
  }

  getPackagesForAccount(accountNumber: string): CustomerPackageRecord[] {
    const customer = this.findCustomerByAccountNumber(accountNumber);
    return customer ? this.getCustomerPackages(customer.id) : [];
  }

  getCustomerPackageSummary(customerId: number): CustomerPackageSummary {
    const openSummary = this.summarizePackages(this.getCustomerPackages(customerId).filter((customerPackage) =>
      customerPackage.isActive
      && !customerPackage.archived
      && customerPackage.usedShipments < customerPackage.shipmentLimit,
    ));
    if (openSummary.shipmentLimit > 0) return openSummary;

    const customer = this.customers().find((entry) => entry.id === customerId);
    const packages = this.getCustomerPackages(customerId).filter((customerPackage) => !customerPackage.archived);
    const latestPackage = packages[packages.length - 1];

    if (latestPackage && !latestPackage.isActive && latestPackage.usedShipments < latestPackage.shipmentLimit) {
      return this.summarizePackages([latestPackage], false);
    }

    const completedSummary = customer?.lastCompletedPackageSummary;
    if (completedSummary?.shipmentLimit) {
      return {
        shipmentLimit: completedSummary.shipmentLimit,
        usedShipments: Math.min(completedSummary.usedShipments, completedSummary.shipmentLimit),
        remainingShipments: 0,
      };
    }

    if (latestPackage && latestPackage.usedShipments >= latestPackage.shipmentLimit) {
      return this.summarizePackages([latestPackage], false);
    }

    return { shipmentLimit: 0, usedShipments: 0, remainingShipments: 0 };
  }

  getPackageBills(packageId: number): ShipmentBillRecord[] {
    return (this.shipmentBills()[packageId] ?? []).filter((bill) =>
      typeof bill?.awbNumber === 'string' && bill.awbNumber.trim().length > 0,
    );
  }

  getPackageBillRecords(packageId: number): ShipmentBillRecord[] {
    return this.shipmentBills()[packageId] ?? [];
  }

  fillBlankAuditedShipmentToPackage(
    accountNumber: string,
    packageId: number,
    awbNumber: string,
    createdAt: string,
    expectedBlankIndex: number,
  ): boolean {
    const customer = this.findCustomerByAccountNumber(accountNumber);
    const customerPackage = this.packages().find((entry) =>
      entry.id === packageId && entry.customerId === customer?.id,
    );
    const normalizedAwb = awbNumber.trim().toUpperCase();
    const packageBills = this.shipmentBills()[packageId] ?? [];
    const hasExistingAwb = Object.values(this.shipmentBills()).some((bills) =>
      bills.some((bill) => String(bill?.awbNumber ?? '').trim().toUpperCase() === normalizedAwb),
    );
    const targetIsBlank = Number.isInteger(expectedBlankIndex)
      && expectedBlankIndex >= 0
      && expectedBlankIndex < packageBills.length
      && !String(packageBills[expectedBlankIndex]?.awbNumber ?? '').trim();
    if (!customerPackage || !normalizedAwb || hasExistingAwb || !targetIsBlank) return false;

    this.shipmentBills.update((bills) => ({
      ...bills,
      [packageId]: packageBills.map((bill, index) => index === expectedBlankIndex
        ? { ...bill, awbNumber: awbNumber.trim(), createdAt }
        : bill),
    }));
    return true;
  }

  assignAuditedShipmentToPackage(
    accountNumber: string,
    packageId: number,
    awbNumber: string,
    createdAt: string,
  ): boolean {
    const customer = this.findCustomerByAccountNumber(accountNumber);
    const customerPackage = this.packages().find((entry) =>
      entry.id === packageId && entry.customerId === customer?.id,
    );
    const normalizedAwb = awbNumber.trim().toUpperCase();
    const isAlreadyAssigned = Object.values(this.shipmentBills()).some((bills) =>
      bills.some((bill) => bill?.awbNumber?.trim().toUpperCase() === normalizedAwb),
    );
    if (!customer || !customerPackage || !normalizedAwb || isAlreadyAssigned) return false;

    const packageBills = this.shipmentBills()[packageId] ?? [];
    const emptySlotIndex = packageBills.findIndex((bill) => !bill?.awbNumber?.trim());
    if (emptySlotIndex >= 0) {
      this.shipmentBills.update((bills) => ({
        ...bills,
        [packageId]: packageBills.map((bill, index) => index === emptySlotIndex
          ? { ...bill, awbNumber: awbNumber.trim(), createdAt: createdAt || bill.createdAt }
          : bill),
      }));
      return true;
    }

    const summaryBeforeShipment = this.getOpenPackageSummary(customer.id);
    this.packages.update((packages) => packages.map((entry) => entry.id === packageId
      ? { ...entry, usedShipments: entry.usedShipments + 1 }
      : entry));
    this.shipmentBills.update((bills) => ({
      ...bills,
      [packageId]: [...(bills[packageId] ?? []), { awbNumber: awbNumber.trim(), createdAt }],
    }));
    this.rememberCompletedSummaryIfLastShipment(customer.id, summaryBeforeShipment);
    this.syncAccountUserStatus(customer.accountNumber);
    return true;
  }

  assignExternalShipmentToEligiblePackage(
    accountNumber: string,
    awbNumber: string,
    createdAt: string,
  ): number | null {
    const shipmentTimestamp = this.parseAuditTimestamp(createdAt);
    if (!Number.isFinite(shipmentTimestamp)) return null;

    const nextPackage = this.getPackagesForAccount(accountNumber).find((customerPackage) => {
      const packageStart = this.parseAuditTimestamp(customerPackage.createdAt);
      if (!customerPackage.isActive || customerPackage.archived || !Number.isFinite(packageStart)
        || packageStart > shipmentTimestamp) return false;

      const hasReservedSlot = (this.shipmentBills()[customerPackage.id] ?? [])
        .some((bill) => !String(bill?.awbNumber ?? '').trim());
      return hasReservedSlot || customerPackage.usedShipments < customerPackage.shipmentLimit;
    });

    if (!nextPackage) return null;
    return this.assignAuditedShipmentToPackage(accountNumber, nextPackage.id, awbNumber, createdAt)
      ? nextPackage.id
      : null;
  }

  removeAuditedShipmentFromPackage(accountNumber: string, packageId: number, awbNumber: string): boolean {
    const customer = this.findCustomerByAccountNumber(accountNumber);
    const customerPackage = this.packages().find((entry) =>
      entry.id === packageId && entry.customerId === customer?.id,
    );
    const normalizedAwb = awbNumber.trim().toUpperCase();
    const packageBills = this.shipmentBills()[packageId] ?? [];
    const billIndex = packageBills.findIndex((bill) => bill.awbNumber.trim().toUpperCase() === normalizedAwb);
    if (!customer || !customerPackage || billIndex < 0) return false;

    const updatedBills = packageBills.filter((_, index) => index !== billIndex);
    this.packages.update((packages) => packages.map((entry) => entry.id === packageId
      ? { ...entry, usedShipments: Math.max(0, entry.usedShipments - 1) }
      : entry));
    this.shipmentBills.update((bills) => ({ ...bills, [packageId]: updatedBills }));
    this.syncAccountUserStatus(customer.accountNumber);
    return true;
  }

  hasAvailablePackage(accountNumber: string): boolean {
    const customer = this.findCustomerByAccountNumber(accountNumber);
    if (!customer) return false;

    return this.getCustomerPackages(customer.id).some((customerPackage) =>
      customerPackage.isActive && !customerPackage.archived
      && customerPackage.usedShipments < customerPackage.shipmentLimit,
    );
  }

  recordShipmentForAccount(accountNumber: string, awbNumber: string, createdAt?: string): boolean {
    const customer = this.findCustomerByAccountNumber(accountNumber);
    const normalizedAwb = awbNumber?.trim();
    if (!customer || !normalizedAwb) return false;

    const nextPackage = this.getCustomerPackages(customer.id).find((customerPackage) =>
      customerPackage.isActive && !customerPackage.archived
      && customerPackage.usedShipments < customerPackage.shipmentLimit,
    );
    if (!nextPackage) return false;

    const summaryBeforeShipment = this.getOpenPackageSummary(customer.id);
    this.packages.update((packages) => packages.map((customerPackage) =>
      customerPackage.id === nextPackage.id
        ? { ...customerPackage, usedShipments: customerPackage.usedShipments + 1 }
        : customerPackage,
    ));
    this.shipmentBills.update((bills) => ({
      ...bills,
      [nextPackage.id]: [...(bills[nextPackage.id] ?? []), { awbNumber: normalizedAwb, createdAt: createdAt ?? this.localTimestamp() }],
    }));
    this.rememberCompletedSummaryIfLastShipment(customer.id, summaryBeforeShipment);
    this.syncAccountUserStatus(customer.accountNumber);
    return true;
  }

  toggleCustomer(customerId: number): void {
    this.customers.update((customers) => customers.map((customer) =>
      customer.id === customerId ? { ...customer, isActive: !customer.isActive } : customer,
    ));
  }

  deleteCustomer(customerId: number): void {
    const deletedCustomer = this.customers().find((customer) => customer.id === customerId);
    if (deletedCustomer) this.apiCredentials.remove(deletedCustomer.accountNumber);
    const deletedPackageIds = new Set(this.packages().filter((customerPackage) => customerPackage.customerId === customerId).map((customerPackage) => customerPackage.id));
    this.customers.update((customers) => customers.filter((customer) => customer.id !== customerId));
    this.packages.update((packages) => packages.filter((customerPackage) => customerPackage.customerId !== customerId));
    this.shipmentBills.update((bills) => Object.fromEntries(Object.entries(bills).filter(([packageId]) => !deletedPackageIds.has(Number(packageId)))));
  }

  addPackage(customerId: number, shipmentLimit: number): void {
    if (!Number.isInteger(shipmentLimit) || shipmentLimit < 1) return;

    const openPackage = this.getCustomerPackages(customerId).find((customerPackage) =>
      customerPackage.isActive
      && !customerPackage.archived
      && customerPackage.usedShipments < customerPackage.shipmentLimit,
    );

    if (openPackage) {
      this.packages.update((packages) => packages.map((customerPackage) =>
        customerPackage.id === openPackage.id
          ? { ...customerPackage, shipmentLimit: customerPackage.shipmentLimit + shipmentLimit }
          : customerPackage,
      ));
      this.syncAccountUserStatusForCustomer(customerId);
      return;
    }

    this.packages.update((packages) => [{
      id: this.nextPackageId(), customerId, shipmentLimit, usedShipments: 0, isActive: true, archived: false,
      createdAt: this.localTimestamp(),
    }, ...packages]);
    this.syncAccountUserStatusForCustomer(customerId);
  }

  togglePackage(packageId: number): void {
    const customerPackage = this.packages().find((entry) => entry.id === packageId);
    if (!customerPackage || customerPackage.archived) return;
    this.packages.update((packages) => packages.map((customerPackage) =>
      customerPackage.id === packageId && !customerPackage.archived
        ? { ...customerPackage, isActive: !customerPackage.isActive }
        : customerPackage,
    ));
    this.syncAccountUserStatusForCustomer(customerPackage.customerId);
  }

  renewPackage(packageId: number): void {
    const previousPackage = this.packages().find((customerPackage) => customerPackage.id === packageId);
    if (!previousPackage || previousPackage.archived || !previousPackage.isActive
      || previousPackage.usedShipments < previousPackage.shipmentLimit) return;

    const reservedIds = new Set(this.packages().map((customerPackage) => customerPackage.id));
    const renewedPackage: CustomerPackageRecord = {
      id: this.nextPackageId(reservedIds),
      customerId: previousPackage.customerId,
      shipmentLimit: previousPackage.shipmentLimit,
      usedShipments: 0,
      isActive: true,
      archived: false,
      createdAt: this.localTimestamp(),
    };

    this.packages.update((packages) => [
      renewedPackage,
      ...packages.map((customerPackage) => customerPackage.id === packageId
        ? { ...customerPackage, isActive: false, archived: true }
        : customerPackage),
    ]);
    this.syncAccountUserStatusForCustomer(previousPackage.customerId);
  }

  private syncAccountUserStatusForCustomer(customerId: number): void {
    const customer = this.customers().find((entry) => entry.id === customerId);
    if (customer) this.syncAccountUserStatus(customer.accountNumber);
  }

  private hasOpenPackageForCustomer(customerId: number): boolean {
    return this.getCustomerPackages(customerId).some((customerPackage) =>
      customerPackage.isActive
      && !customerPackage.archived
      && customerPackage.usedShipments < customerPackage.shipmentLimit,
    );
  }

  private getOpenPackageSummary(customerId: number): CustomerPackageSummary {
    return this.summarizePackages(this.getCustomerPackages(customerId).filter((customerPackage) =>
      customerPackage.isActive
      && !customerPackage.archived
      && customerPackage.usedShipments < customerPackage.shipmentLimit,
    ));
  }

  private summarizePackages(
    packages: CustomerPackageRecord[],
    calculateRemaining = true,
  ): CustomerPackageSummary {
    const shipmentLimit = packages.reduce((total, customerPackage) => total + customerPackage.shipmentLimit, 0);
    const usedShipments = packages.reduce((total, customerPackage) =>
      total + Math.min(customerPackage.usedShipments, customerPackage.shipmentLimit), 0,
    );
    return {
      shipmentLimit,
      usedShipments,
      remainingShipments: calculateRemaining ? Math.max(0, shipmentLimit - usedShipments) : 0,
    };
  }

  private rememberCompletedSummaryIfLastShipment(
    customerId: number,
    summaryBeforeShipment: CustomerPackageSummary,
  ): void {
    if (summaryBeforeShipment.remainingShipments !== 1 || this.hasOpenPackageForCustomer(customerId)) return;

    this.customers.update((customers) => customers.map((customer) => customer.id === customerId
      ? {
        ...customer,
        lastCompletedPackageSummary: {
          shipmentLimit: summaryBeforeShipment.shipmentLimit,
          usedShipments: summaryBeforeShipment.usedShipments + 1,
        },
      }
      : customer,
    ));
  }

  private repairLegacyRenewals(): void {
    const existingPackages = this.packages();
    const reservedIds = new Set(existingPackages.map((customerPackage) => customerPackage.id));
    const repairedPackages: CustomerPackageRecord[] = [];
    const repairedBills = { ...this.shipmentBills() };
    let didRepair = false;

    for (const customerPackage of existingPackages) {
      const bills = repairedBills[customerPackage.id] ?? [];
      const limit = customerPackage.shipmentLimit;
      const currentUsage = Math.min(Math.max(customerPackage.usedShipments, 0), limit);
      const historyCount = bills.length - currentUsage;
      if (limit <= 0 || historyCount <= 0) {
        repairedPackages.push(customerPackage);
        continue;
      }

      const historicalGroups: ShipmentBillRecord[][] = [];
      for (let index = 0; index < historyCount; index += limit) {
        historicalGroups.push(bills.slice(index, Math.min(index + limit, historyCount)));
      }
      const currentBills = bills.slice(historyCount);
      delete repairedBills[customerPackage.id];

      const archivedPackages = historicalGroups.map((group, index) => {
        const id = index === 0 ? customerPackage.id : this.nextPackageId(reservedIds);
        repairedBills[id] = group;
        return {
          ...customerPackage,
          id,
          usedShipments: group.length,
          isActive: false,
          archived: true,
          createdAt: group[0]?.createdAt || customerPackage.createdAt,
        };
      });

      const currentCycleId = this.nextPackageId(reservedIds);
      repairedBills[currentCycleId] = currentBills;
      repairedPackages.push(
        {
          ...customerPackage,
          id: currentCycleId,
          usedShipments: currentUsage,
          archived: false,
          createdAt: currentBills[0]?.createdAt || customerPackage.createdAt,
        },
        ...archivedPackages.reverse(),
      );
      didRepair = true;
    }

    if (didRepair) {
      this.packages.set(repairedPackages);
      this.shipmentBills.set(repairedBills);
    }
  }

  private nextPackageId(reservedIds = new Set(this.packages().map((customerPackage) => customerPackage.id))): number {
    let id = Date.now();
    while (reservedIds.has(id)) id += 1;
    reservedIds.add(id);
    return id;
  }

  private localTimestamp(): string {
    const now = new Date();
    const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
    const time = [now.getHours(), now.getMinutes(), now.getSeconds()].map((part) => String(part).padStart(2, '0')).join(':');
    return `${date}T${time}`;
  }

  private parseAuditTimestamp(value: string): number {
    if (!value.trim()) return Number.NaN;
    return new Date(value.replace(' ', 'T')).getTime();
  }

  private readStorage<T>(key: string, fallback: T): T {
    if (!isPlatformBrowser(this.platformId)) return fallback;
    const storedValue = this.document.defaultView?.localStorage.getItem(key);
    if (!storedValue) return fallback;

    try {
      return JSON.parse(storedValue) as T;
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
