import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ShipmentBillRecord } from '../../../Admin/shared/models/package.model';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-package-bills-dialog',
  styleUrl: './package-bills-dialog.css',
  templateUrl: './package-bills-dialog.html',
})
export class PackageBillsDialog {
  readonly isOpen = input(false);
  readonly packageTitle = input('Package');
  readonly bills = input<ShipmentBillRecord[]>([]);
  readonly closed = output<void>();

  protected formatDate(date: string): string {
    const normalized = date.includes('T') ? date : date.replace(' ', 'T');
    const parsedDate = new Date(normalized);
    if (!Number.isFinite(parsedDate.getTime())) return date.slice(0, 10);

    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(parsedDate);
  }
}
