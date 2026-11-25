import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { PackageBillsDialog } from '../../../shared/components/package-bills-dialog/package-bills-dialog';
import { AdminDataService } from '../../shared/services/admin-data.service';
import { ShipmentAuditNotifications } from '../../shared/components/shipment-audit-notifications/shipment-audit-notifications';
import { ShipmentAuditService } from '../../shared/services/shipment-audit.service';
import { AccountUserStatusService } from '../../shared/services/account-user-status.service';

@Component({
  imports: [FormsModule, RouterLink, RouterLinkActive, PackageBillsDialog, ShipmentAuditNotifications],
  selector: 'app-dashboard',
  styleUrl: './dashboard.css',
  templateUrl: './dashboard.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly data = inject(AdminDataService);
  protected readonly accountUserStatus = inject(AccountUserStatusService);
  private readonly shipmentAudit = inject(ShipmentAuditService);
  protected readonly sidebarOpen = signal(false);
  protected readonly searchTerm = signal('');
  protected readonly selectedCustomerId = signal<number | null>(null);
  protected readonly shipmentLimit = signal(10);
  protected readonly selectedPackage = signal<{ id: number; title: string } | null>(null);
  protected readonly shipmentBills = computed(() => {
    const selected = this.selectedPackage();
    return selected ? this.data.getPackageBills(selected.id) : [];
  });

  protected readonly recentPackages = computed(() => this.data.packages()
    .slice()
    .sort((first, second) => second.id - first.id)
    .slice(0, 20)
    .map((customerPackage) => ({
      ...customerPackage,
      accountNumber: this.data.customers().find((customer) => customer.id === customerPackage.customerId)?.accountNumber ?? 'Unknown account',
    })));

  protected readonly filteredPackages = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return this.recentPackages();
    return this.recentPackages().filter((customerPackage) =>
      customerPackage.accountNumber.toLowerCase().includes(term),
    );
  });

  protected readonly totalCustomers = computed(() => this.data.customers().length);
  protected readonly activeCustomers = computed(() => this.data.customers().filter((customer) => customer.isActive).length);
  protected readonly inactiveCustomers = computed(() => this.data.customers().filter((customer) => !customer.isActive).length);
  protected readonly totalPackages = computed(() => this.data.packages().length);

  ngOnInit(): void {
    this.data.syncAllAccountUserStatuses();
    this.shipmentAudit.checkNow();
  }

  protected toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }

  protected logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/login');
  }

  protected progress(shipmentLimit: number, usedShipments: number): number {
    return Math.min(100, Math.round((usedShipments / shipmentLimit) * 100));
  }

  protected remaining(shipmentLimit: number, usedShipments: number): number {
    return Math.max(0, shipmentLimit - usedShipments);
  }

  protected isCompleted(shipmentLimit: number, usedShipments: number): boolean {
    return usedShipments >= shipmentLimit;
  }

  protected openPackageBills(packageId: number, accountNumber: string): void {
    this.selectedPackage.set({ id: packageId, title: 'Package for ' + accountNumber });
  }

  protected closePackageBills(): void {
    this.selectedPackage.set(null);
  }

  protected addPackage(): void {
    const customerId = this.selectedCustomerId();
    const limit = Number(this.shipmentLimit());
    if (!customerId || !Number.isInteger(limit) || limit < 1) return;
    this.data.addPackage(customerId, limit);
    this.selectedCustomerId.set(null);
    this.shipmentLimit.set(10);
  }

  protected formatDate(date: string): string {
    const datePart = date.slice(0, 10);
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${datePart}T00:00:00`));
  }

}
