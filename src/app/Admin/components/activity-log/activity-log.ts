import { ChangeDetectionStrategy, Component, computed, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CustomerPackageRecord } from '../../shared/models/package.model';
import { AdminSidebar } from '../../shared/components/admin-sidebar/admin-sidebar';
import { ShipmentAuditAction, ShipmentAuditNotification } from '../../shared/models/search-query.model';
import { AdminDataService } from '../../shared/services/admin-data.service';
import { ShipmentAuditService } from '../../shared/services/shipment-audit.service';

type ActivityTone = 'warning' | 'success' | 'neutral';

interface ActivityRow {
  id: string;
  accountNumber: string;
  awbNumber: string;
  eventAt: string;
  title: string;
  source: string;
  status: string;
  tone: ActivityTone;
  packageId?: number;
  sourcePackageId?: number;
  notificationId?: string;
  issue?: string;
  action?: ShipmentAuditAction['action'];
  awbDate?: string;
  shipmentCreatedAt?: string;
  senderName?: string;
  origin?: string;
  pieces?: number;
  weight?: number;
  shipperReference?: string;
  detectedAt?: string;
  resolvedAt?: string;
  note?: string;
  administratorNote?: string;
}

interface ActivityDetail {
  label: string;
  value: string;
}

@Component({
  selector: 'app-activity-log',
  imports: [AdminSidebar, FormsModule],
  templateUrl: './activity-log.html',
  styleUrl: './activity-log.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityLog {
  protected readonly audit = inject(ShipmentAuditService);
  private readonly adminData = inject(AdminDataService);
  protected readonly searchTerm = signal('');
  protected readonly selectedRow = signal<ActivityRow | null>(null);

  protected readonly activityRows = computed<ActivityRow[]>(() => {
    const notificationRows = this.audit.notifications().map((notification) => this.notificationRow(notification));
    const actionRows = this.audit.actions().map((action) => this.actionRow(action));
    return [...notificationRows, ...actionRows]
      .sort((first, second) => second.eventAt.localeCompare(first.eventAt));
  });

  protected readonly filteredRows = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return this.activityRows();
    return this.activityRows().filter((entry) =>
      entry.accountNumber.toLowerCase().includes(term)
      || entry.awbNumber.toLowerCase().includes(term)
      || entry.title.toLowerCase().includes(term)
      || entry.status.toLowerCase().includes(term),
    );
  });

  protected readonly automaticAssignmentCount = computed(() => this.audit.actions()
    .filter((action) => action.action === 'external-awb-auto-assigned').length);

  protected readonly selectedDetails = computed<ActivityDetail[]>(() => {
    const entry = this.selectedRow();
    if (!entry) return [];

    const details: ActivityDetail[] = [
      { label: 'Event', value: entry.title },
      { label: 'Result', value: entry.status },
      { label: 'How it was found', value: entry.source },
      { label: 'Account number', value: entry.accountNumber },
      { label: 'Shipment bill number', value: entry.awbNumber },
      { label: 'Package number', value: entry.packageId ? String(entry.packageId) : '' },
      { label: 'Package where it was first recorded', value: entry.sourcePackageId ? String(entry.sourcePackageId) : '' },
      { label: 'Why it was flagged', value: entry.issue ? this.issueLabel(entry.issue) : '' },
      { label: 'Action taken', value: entry.action ? this.actionTaken(entry) : '' },
      { label: 'Shipment creation date and time', value: entry.shipmentCreatedAt ? this.formatShipmentTimestamp(entry.shipmentCreatedAt) : '' },
      { label: 'Shipment date', value: entry.awbDate ? this.formatBusinessDate(entry.awbDate) : '' },
      { label: 'Name on shipment', value: entry.senderName ?? '' },
      { label: 'Shipment destination', value: entry.origin ?? '' },
      { label: 'Number of pieces', value: entry.pieces ? String(entry.pieces) : '' },
      { label: 'Shipment weight (kg)', value: entry.weight ? String(entry.weight) : '' },
      { label: 'Customer reference', value: entry.shipperReference ?? '' },
      { label: 'First noticed', value: entry.detectedAt ? this.formatTimestamp(entry.detectedAt) : '' },
      { label: 'Action date', value: this.formatTimestamp(entry.eventAt) },
      { label: 'Review completed on', value: entry.resolvedAt ? this.formatTimestamp(entry.resolvedAt) : '' },
      { label: 'What happened', value: entry.note ?? '' },
      { label: 'Administrator note', value: entry.administratorNote ?? '' },
    ];

    const packageRecord = entry.packageId
      ? this.adminData.packages().find((customerPackage) => customerPackage.id === entry.packageId)
      : undefined;
    if (packageRecord) details.splice(6, 0, ...this.packageDetails(packageRecord));

    return details.filter((detail) => detail.value.trim().length > 0);
  });

  protected runAudit(): void {
    this.audit.checkNow();
  }

  protected openDetails(entry: ActivityRow): void {
    this.selectedRow.set(entry);
  }

  protected closeDetails(): void {
    this.selectedRow.set(null);
  }

  @HostListener('document:keydown.escape')
  protected closeDetailsOnEscape(): void {
    this.closeDetails();
  }

  protected formatTimestamp(value: string): string {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return value || 'Time unavailable';
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(date);
  }

  protected formatShipmentTimestamp(value: string): string {
    const date = new Date(value.replace(' ', 'T'));
    if (!Number.isFinite(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(date);
  }

  private formatBusinessDate(value: string): string {
    const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const date = match
      ? new Date(match[3] + '-' + match[2] + '-' + match[1] + 'T00:00:00')
      : new Date(value);
    if (!Number.isFinite(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    }).format(date);
  }

  private notificationRow(notification: ShipmentAuditNotification): ActivityRow {
    const needsReview = notification.status === 'pending';
    return {
      id: 'notification:' + notification.id,
      accountNumber: notification.accountNumber,
      awbNumber: notification.awbNumber,
      eventAt: notification.detectedAt,
      title: notification.issue === 'api-awb-not-in-package'
        ? 'Shipment found outside the portal'
        : 'Package shipment missing from account records',
      source: 'Account shipment check',
      status: this.notificationStatus(notification.status),
      tone: needsReview ? 'warning' : notification.status === 'ignored' ? 'neutral' : 'success',
      packageId: notification.packageId ?? notification.sourcePackageId,
      sourcePackageId: notification.sourcePackageId,
      issue: notification.issue,
      awbDate: notification.awbDate,
      shipmentCreatedAt: notification.shipmentCreatedAt,
      senderName: notification.senderName,
      origin: notification.origin,
      pieces: notification.pieces,
      weight: notification.weight,
      shipperReference: notification.shipperReference,
      detectedAt: notification.detectedAt,
      resolvedAt: notification.resolvedAt,
    };
  }

  private actionRow(action: ShipmentAuditAction): ActivityRow {
    const details = this.actionDetails(action.action);
    const relatedNotification = this.audit.notifications()
      .find((notification) => notification.id === action.notificationId);
    return {
      id: 'action:' + action.id,
      accountNumber: action.accountNumber,
      awbNumber: action.awbNumber,
      eventAt: action.actedAt,
      title: details.title,
      source: details.source,
      status: details.status,
      tone: details.tone,
      packageId: action.packageId,
      sourcePackageId: action.sourcePackageId ?? relatedNotification?.sourcePackageId,
      notificationId: action.notificationId,
      issue: action.issue ?? relatedNotification?.issue,
      action: action.action,
      awbDate: action.awbDate ?? relatedNotification?.awbDate,
      shipmentCreatedAt: action.shipmentCreatedAt ?? relatedNotification?.shipmentCreatedAt,
      senderName: action.senderName ?? relatedNotification?.senderName,
      origin: action.origin ?? relatedNotification?.origin,
      pieces: action.pieces ?? relatedNotification?.pieces,
      weight: action.weight ?? relatedNotification?.weight,
      shipperReference: action.shipperReference ?? relatedNotification?.shipperReference,
      detectedAt: relatedNotification?.detectedAt,
      resolvedAt: relatedNotification?.resolvedAt,
      note: this.actionSummary(action, relatedNotification),
      administratorNote: action.action === 'external-awb-auto-assigned'
        || action.action === 'matched-from-manifest' ? undefined : action.note,
    };
  }

  private packageDetails(customerPackage: CustomerPackageRecord): ActivityDetail[] {
    const packageState = customerPackage.archived
      ? 'Renewed'
      : !customerPackage.isActive
        ? 'Inactive'
        : customerPackage.usedShipments >= customerPackage.shipmentLimit ? 'Closed' : 'Active';
    return [
      { label: 'Package started on', value: this.formatShipmentTimestamp(customerPackage.createdAt) },
      { label: 'Package shipment limit', value: String(customerPackage.shipmentLimit) },
      { label: 'Shipments used so far', value: customerPackage.usedShipments + ' of ' + customerPackage.shipmentLimit },
      { label: 'Package status', value: packageState },
    ];
  }

  private issueLabel(issue: string): string {
    return issue === 'api-awb-not-in-package'
      ? 'This shipment appeared on the account but was missing from its package here'
      : issue === 'package-awb-not-in-api'
        ? 'This shipment was listed in a package but was missing from the account shipment list'
        : issue;
  }

  private actionTaken(entry: ActivityRow): string {
    const packageLabel = entry.packageId ? 'package ' + entry.packageId : 'the package';
    switch (entry.action) {
      case 'external-awb-auto-assigned':
        return 'Counted as 1 shipment in ' + packageLabel;
      case 'matched-from-manifest':
        return 'Shipment number added to the saved entry in ' + packageLabel;
      case 'added-to-package':
        return 'Added to ' + packageLabel;
      case 'removed-from-package':
        return 'Removed from ' + packageLabel;
      case 'ignored':
        return 'Reviewed; package usage was left unchanged';
      default:
        return '';
    }
  }

  private actionSummary(
    action: ShipmentAuditAction,
    relatedNotification?: ShipmentAuditNotification,
  ): string {
    const shipmentCreatedAt = action.shipmentCreatedAt ?? relatedNotification?.shipmentCreatedAt;
    const packageRecord = action.packageId
      ? this.adminData.packages().find((customerPackage) => customerPackage.id === action.packageId)
      : undefined;
    const packageReference = action.packageId ? 'package ' + action.packageId : 'the package';

    switch (action.action) {
      case 'external-awb-auto-assigned': {
        const createdAt = shipmentCreatedAt
          ? this.formatShipmentTimestamp(shipmentCreatedAt)
          : this.extractLegacyCreationTime(action.note) || 'the recorded shipment time';
        const packageStart = packageRecord ? this.formatShipmentTimestamp(packageRecord.createdAt) : '';
        const currentUsage = packageRecord
          ? ' The package currently shows ' + packageRecord.usedShipments + ' of '
            + packageRecord.shipmentLimit + ' shipments used.'
          : '';
        return 'This shipment was found in the account shipment list and was created on ' + createdAt
          + '. The package had started'
          + (packageStart ? ' on ' + packageStart : '')
          + ' by then, so this shipment was counted automatically as 1 shipment in '
          + packageReference + '. When more than one package was eligible, the oldest active package with space was chosen.'
          + currentUsage;
      }
      case 'matched-from-manifest':
        return 'The shipment number was added to a blank shipment entry already saved in this package. The creation time was used to confirm the match.';
      case 'added-to-package':
        return 'The administrator added this shipment to ' + packageReference + ', increasing the package shipments used by 1.';
      case 'removed-from-package':
        return 'The administrator removed this shipment from ' + packageReference + ', decreasing the package shipments used by 1.';
      case 'ignored':
        return 'The administrator reviewed this item and chose to leave the package shipment count unchanged.';
    }
  }

  private extractLegacyCreationTime(note?: string): string {
    const match = note?.match(/CrDt\s+([\d-]+\s+[\d:.]+)/i);
    return match ? this.formatShipmentTimestamp(match[1]) : '';
  }

  private notificationStatus(status: ShipmentAuditNotification['status']): string {
    switch (status) {
      case 'pending': return 'Needs review';
      case 'added-to-package': return 'Added to package';
      case 'removed-from-package': return 'Removed from package';
      case 'ignored': return 'Ignored';
      case 'resolved': return 'Resolved after account check';
    }
  }

  private actionDetails(action: ShipmentAuditAction['action']): {
    title: string;
    source: string;
    status: string;
    tone: ActivityTone;
  } {
    switch (action) {
      case 'external-awb-auto-assigned':
        return { title: 'Shipment counted automatically', source: 'Automatic account check', status: 'Counted in package', tone: 'success' };
      case 'matched-from-manifest':
        return { title: 'Shipment number added to saved entry', source: 'Automatic account check', status: 'Matched to package', tone: 'success' };
      case 'added-to-package':
        return { title: 'Shipment added to package', source: 'Administrator update', status: 'Completed', tone: 'success' };
      case 'removed-from-package':
        return { title: 'Shipment removed from package', source: 'Administrator update', status: 'Updated', tone: 'warning' };
      case 'ignored':
        return { title: 'Review closed without changes', source: 'Administrator update', status: 'No change', tone: 'neutral' };
    }
  }
}
