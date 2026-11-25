import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminSidebar } from '../../shared/components/admin-sidebar/admin-sidebar';
import { AccountUserStatusAlert, AccountUserStatusService } from '../../shared/services/account-user-status.service';

@Component({
  selector: 'app-admin-alerts',
  imports: [AdminSidebar, FormsModule],
  templateUrl: './alerts.html',
  styleUrl: './alerts.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Alerts {
  protected readonly accountStatus = inject(AccountUserStatusService);
  protected readonly math = Math;
  protected readonly searchTerm = signal('');
  protected readonly currentPage = signal(1);
  protected readonly pageSize = 20;

  protected readonly filteredAlerts = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    return this.accountStatus.alerts().filter((alert) =>
      !term || alert.accountNumber.toLowerCase().includes(term) || alert.message.toLowerCase().includes(term),
    );
  });

  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filteredAlerts().length / this.pageSize)));
  protected readonly visibleAlerts = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredAlerts().slice(start, start + this.pageSize);
  });

  constructor() {
    this.accountStatus.verifyAllAlerts();
    effect(() => {
      if (this.currentPage() > this.pageCount()) this.currentPage.set(this.pageCount());
    });
  }

  protected setSearchTerm(value: string): void {
    this.searchTerm.set(value);
    this.currentPage.set(1);
  }

  protected verify(alert: AccountUserStatusAlert): void {
    this.accountStatus.verifyAccount(alert.accountNumber, alert.requestedStatus === 'active');
  }

  protected retry(alert: AccountUserStatusAlert): void {
    this.accountStatus.retryAlert(alert.accountNumber);
  }

  protected checkAll(): void {
    this.accountStatus.verifyAllAlerts();
  }

  protected retryAll(): void {
    this.accountStatus.retryAllAlerts();
  }

  protected anyBusy(): boolean {
    return this.accountStatus.busyAccounts().length > 0;
  }

  protected formatTimestamp(value: string): string {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(date);
  }

  protected goToPage(page: number): void {
    this.currentPage.set(Math.max(1, Math.min(this.pageCount(), page)));
  }
}
