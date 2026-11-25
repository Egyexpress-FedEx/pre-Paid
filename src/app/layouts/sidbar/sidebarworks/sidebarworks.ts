import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CustomerState } from '../../../shared/state/customer.state';

interface CustomerNavigationItem {
  label: string;
  icon: string;
  route: string;
  exact?: boolean;
}

@Component({
  imports: [RouterLink, RouterLinkActive],
  selector: 'app-sidebarworks',
  styleUrl: './sidebarworks.css',
  templateUrl: './sidebarworks.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sidebarworks {
  protected readonly customerState = inject(CustomerState);
  readonly navigationSelected = output<void>();

  protected readonly navigationItems = computed<CustomerNavigationItem[]>(() => {
    const root = this.customerState.isVisitor() ? '/visitor' : '/customer';
    return [
      { label: 'Dashboard', icon: 'fa-house', route: root, exact: true },
      ...(this.customerState.isVisitor()
        ? []
        : [{ label: 'Create Shipment', icon: 'fa-circle-plus', route: `${root}/create-shipment` }]),
      { label: 'Print AWB', icon: 'fa-print', route: `${root}/print-awb` },
      { label: 'My Shipments', icon: 'fa-boxes-stacked', route: `${root}/my-shipments` },
      { label: 'Pickup', icon: 'fa-truck', route: `${root}/pickup` },
      { label: 'Pickup Requested', icon: 'fa-clipboard-list', route: `${root}/pickup-requested` },
      { label: 'Track Shipment', icon: 'fa-binoculars', route: `${root}/track-shipment` },
      { label: 'Complaint', icon: 'fa-headset', route: `${root}/complaint` },
    ];
  });
}
