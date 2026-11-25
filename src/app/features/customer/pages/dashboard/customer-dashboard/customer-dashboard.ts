import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { PackageBillsDialog } from '../../../../../shared/components/package-bills-dialog/package-bills-dialog';
import { CustomerState } from '../../../../../shared/state/customer.state';
import { AdminDataService } from '../../../../../Admin/shared/services/admin-data.service';
import { computed } from '@angular/core';
import { AuthService } from '../../../../../core/auth/auth.service';
import { ShipmentAuditService } from '../../../../../Admin/shared/services/shipment-audit.service';

@Component({
  imports: [PackageBillsDialog],
  selector: 'app-customer-dashboard',
  styleUrl: './customer-dashboard.css',
  templateUrl: './customer-dashboard.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerDashboard implements OnInit {
  protected readonly customerState = inject(CustomerState);
  private readonly data = inject(AdminDataService);
  private readonly authService = inject(AuthService);
  private readonly shipmentAudit = inject(ShipmentAuditService);
  protected readonly selectedPackage = signal<{ id: number; title: string } | null>(null);
  protected readonly shipmentBills = computed(() => {
    const selected = this.selectedPackage();
    return selected ? this.data.getPackageBills(selected.id) : [];
  });

  ngOnInit(): void {
    const accountNumber = this.authService.currentUser()?.accountNumber;
    if (accountNumber) {
      this.data.syncAccountUserStatus(accountNumber, true);
      this.shipmentAudit.checkAccountNow(accountNumber);
    }
  }

  protected openPackage(packageId: number, title: string): void {
    this.selectedPackage.set({ id: packageId, title });
  }

  protected closePackage(): void {
    this.selectedPackage.set(null);
  }

  protected formatDate(date: string): string {
    const datePart = date.slice(0, 10);
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(datePart + 'T00:00:00'));
  }
}
