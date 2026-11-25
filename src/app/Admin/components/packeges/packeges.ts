import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminDataService } from '../../shared/services/admin-data.service';
import { AdminSidebar } from '../../shared/components/admin-sidebar/admin-sidebar';

@Component({
  imports: [FormsModule, RouterLink, AdminSidebar],
  selector: 'app-packeges',
  styleUrl: './packeges.css',
  templateUrl: './packeges.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Packeges {
  protected readonly data = inject(AdminDataService);
  protected readonly searchTerm = signal('');
  protected readonly selectedCustomerId = signal<number | null>(null);
  protected readonly shipmentLimit = signal(10);
  protected readonly showForm = signal(false);

  protected customerAccount(customerId: number): string {
    return this.data.customers().find((customer) => customer.id === customerId)?.accountNumber ?? '';
  }

  protected filteredPackages() {
    const term = this.searchTerm().trim().toLowerCase();
    return this.data.packages().filter((customerPackage) =>
      !term || this.customerAccount(customerPackage.customerId).toLowerCase().includes(term),
    );
  }

  protected addPackage(): void {
    const customerId = this.selectedCustomerId();
    const limit = Number(this.shipmentLimit());
    if (!customerId || !Number.isInteger(limit) || limit < 1) return;
    this.data.addPackage(customerId, limit);
    this.selectedCustomerId.set(null);
    this.shipmentLimit.set(10);
    this.showForm.set(false);
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

  protected formatDate(date: string): string {
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${date.slice(0, 10)}T00:00:00`));
  }
}
