import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CustomerPackageRecord } from '../../models/package.model';
import { ShipmentAuditNotification } from '../../models/search-query.model';
import { ShipmentAuditService } from '../../services/shipment-audit.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  selector: 'app-shipment-audit-notifications',
  styleUrl: './shipment-audit-notifications.css',
  templateUrl: './shipment-audit-notifications.html',
})
export class ShipmentAuditNotifications {
  protected readonly audit = inject(ShipmentAuditService);
  protected readonly isOpen = signal(false);
  protected readonly selectedPackageIds = signal<Record<string, number | null>>({});
  protected readonly actionNotes = signal<Record<string, string>>({});

  protected togglePanel(): void {
    this.isOpen.update((open) => !open);
  }

  protected packagesFor(notification: ShipmentAuditNotification): CustomerPackageRecord[] {
    return this.audit.getPackagesForAccount(notification.accountNumber);
  }

  protected selectedPackage(notificationId: string): number | null {
    return this.selectedPackageIds()[notificationId] ?? null;
  }

  protected selectPackage(notificationId: string, value: unknown): void {
    const packageId = Number(value);
    this.selectedPackageIds.update((selected) => ({
      ...selected,
      [notificationId]: Number.isInteger(packageId) && packageId > 0 ? packageId : null,
    }));
  }

  protected setNote(notificationId: string, value: string): void {
    this.actionNotes.update((notes) => ({ ...notes, [notificationId]: value }));
  }

  protected addToPackage(notification: ShipmentAuditNotification): void {
    const packageId = this.selectedPackage(notification.id);
    if (packageId === null) return;
    if (this.audit.addAwbToPackage(notification.id, packageId, this.actionNotes()[notification.id] ?? '')) {
      this.clearActionFields(notification.id);
    }
  }

  protected removeFromPackage(notification: ShipmentAuditNotification): void {
    if (this.audit.removeAwbFromPackage(notification.id, this.actionNotes()[notification.id] ?? '')) {
      this.clearActionFields(notification.id);
    }
  }

  protected ignore(notification: ShipmentAuditNotification): void {
    this.audit.ignoreNotification(notification.id, this.actionNotes()[notification.id] ?? '');
    this.clearActionFields(notification.id);
  }

  protected statusLabel(notification: ShipmentAuditNotification): string {
    return notification.issue === 'api-awb-not-in-package'
      ? 'Found in carrier account, missing from package records'
      : 'Saved in package records, missing from carrier results';
  }

  protected packageLabel(customerPackage: CustomerPackageRecord, index: number): string {
    const current = Math.min(customerPackage.usedShipments, customerPackage.shipmentLimit);
    const state = customerPackage.archived
      ? 'Renewed'
      : customerPackage.isActive
        ? customerPackage.usedShipments >= customerPackage.shipmentLimit ? 'Full' : 'Active'
        : 'Inactive';
    return `Package ${index + 1} · ${current}/${customerPackage.shipmentLimit} · ${state}`;
  }

  protected formatDate(value: string): string {
    if (!value) return 'Date unavailable';
    const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const normalized = match ? `${match[3]}-${match[2]}-${match[1]}` : value.slice(0, 10);
    const date = new Date(`${normalized}T00:00:00`);
    if (!Number.isFinite(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
  }

  protected formatTimestamp(value: string): string {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return this.formatDate(value);
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(date);
  }

  protected closePanel(): void {
    this.isOpen.set(false);
  }

  private clearActionFields(notificationId: string): void {
    this.actionNotes.update((notes) => this.withoutKey(notes, notificationId));
    this.selectedPackageIds.update((selected) => this.withoutKey(selected, notificationId));
  }

  private withoutKey<T>(source: Record<string, T>, key: string): Record<string, T> {
    const copy = { ...source };
    delete copy[key];
    return copy;
  }
}
