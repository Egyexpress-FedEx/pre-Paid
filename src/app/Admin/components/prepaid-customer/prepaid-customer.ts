import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminDataService } from '../../shared/services/admin-data.service';
import { AdminSidebar } from '../../shared/components/admin-sidebar/admin-sidebar';
import { CustomerExcelExportService } from '../../shared/services/customer-excel-export.service';

@Component({
  imports: [FormsModule, RouterLink, AdminSidebar],
  selector: 'app-prepaid-customer',
  styleUrl: './prepaid-customer.css',
  templateUrl: './prepaid-customer.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrepaidCustomer {
  protected readonly data = inject(AdminDataService);
  protected readonly searchTerm = signal('');
  protected readonly accountNumber = signal('');
  protected readonly showForm = signal(false);
  protected readonly pendingDelete = signal<{ id: number; accountNumber: string } | null>(null);
  protected readonly dateFrom = signal('');
  protected readonly dateTo = signal('');
  protected readonly isDateRangeInvalid = computed(() =>
    !!this.dateFrom() && !!this.dateTo() && this.dateFrom() > this.dateTo(),
  );
  private readonly customerExcelExport = inject(CustomerExcelExportService);

  protected filteredCustomers() {
    const term = this.searchTerm().trim().toLowerCase();
    const from = this.dateFrom();
    const to = this.dateTo();
    return this.data.customers().filter((customer) =>
      (!term || customer.accountNumber.toLowerCase().includes(term))
      && (!from || customer.createdAt.slice(0, 10) >= from)
      && (!to || customer.createdAt.slice(0, 10) <= to),
    );
  }

  protected clearDateFilter(): void {
    this.dateFrom.set('');
    this.dateTo.set('');
  }

  protected exportCustomers(): void {
    if (this.isDateRangeInvalid()) return;
    this.customerExcelExport.download(this.filteredCustomers(), this.dateFrom(), this.dateTo());
  }

  protected addCustomer(): void {
    if (!this.accountNumber().trim()) return;
    this.data.addCustomer(this.accountNumber());
    this.accountNumber.set('');
    this.showForm.set(false);
  }

  protected requestDelete(customerId: number, accountNumber: string): void {
    this.pendingDelete.set({ id: customerId, accountNumber });
  }

  protected confirmDelete(): void {
    const account = this.pendingDelete();
    if (!account) return;
    this.data.deleteCustomer(account.id);
    this.pendingDelete.set(null);
  }

  protected formatDate(date: string): string {
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${date}T00:00:00`));
  }
}
