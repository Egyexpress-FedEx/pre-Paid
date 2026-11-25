import { computed, inject, Injectable } from '@angular/core';
import { CustomerPackageRecord } from '../../Admin/shared/models/package.model';
import { AdminDataService } from '../../Admin/shared/services/admin-data.service';
import { AuthService } from '../../core/auth/auth.service';

export interface CustomerPackageView extends CustomerPackageRecord {
  progress: number;
  remainingShipments: number;
  status: 'Active' | 'Closed' | 'Inactive';
}

@Injectable({ providedIn: 'root' })
export class CustomerState {
  private readonly authService = inject(AuthService);
  private readonly adminData = inject(AdminDataService);

  readonly customerName = computed(() => {
    const user = this.authService.currentUser();
    return user?.displayName?.trim() || user?.accountNumber || 'Customer';
  });

  readonly isVisitor = computed(() => this.authService.currentUser()?.role === 'visitor');

  readonly customerPackages = computed<CustomerPackageView[]>(() => {
    const accountNumber = this.authService.currentUser()?.accountNumber;
    if (!accountNumber) return [];

    const customer = this.adminData.findCustomerByAccountNumber(accountNumber);
    if (!customer) return [];

    return this.adminData.getCustomerPackages(customer.id).map((customerPackage) => {
      const isClosed = customerPackage.usedShipments >= customerPackage.shipmentLimit;
      return {
        ...customerPackage,
        progress: customerPackage.shipmentLimit > 0
          ? Math.min(100, Math.round((customerPackage.usedShipments / customerPackage.shipmentLimit) * 100))
          : 0,
        remainingShipments: Math.max(0, customerPackage.shipmentLimit - customerPackage.usedShipments),
        status: isClosed ? 'Closed' : !customerPackage.isActive ? 'Inactive' : 'Active',
      };
    });
  });

  private readonly registeredCustomer = computed(() => {
    const accountNumber = this.authService.currentUser()?.accountNumber;
    return accountNumber ? this.adminData.findCustomerByAccountNumber(accountNumber) : null;
  });

  readonly usedShipments = computed(() => {
    const customer = this.registeredCustomer();
    return customer
      ? this.adminData.getCustomerPackageSummary(customer.id).usedShipments
      : this.authService.currentUser()?.usedShipments ?? 0;
  });
  readonly shipmentLimit = computed(() => {
    const customer = this.registeredCustomer();
    return customer
      ? this.adminData.getCustomerPackageSummary(customer.id).shipmentLimit
      : this.authService.currentUser()?.shipmentLimit ?? 0;
  });
  readonly shipmentRemaining = computed(() => Math.max(0, this.shipmentLimit() - this.usedShipments()));
  readonly shipmentUsage = computed(() => this.usedShipments() + ' / ' + this.shipmentLimit());
  readonly shipmentProgress = computed(() => {
    const limit = this.shipmentLimit();
    return limit > 0 ? Math.min(100, Math.round((this.usedShipments() / limit) * 100)) : 0;
  });
}
