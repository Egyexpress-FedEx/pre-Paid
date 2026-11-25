import { ChangeDetectionStrategy, Component, HostListener, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Headerbar } from '../header/headerbar/headerbar';
import { Sidebarworks } from '../sidbar/sidebarworks/sidebarworks';

@Component({
  imports: [Headerbar, Sidebarworks, RouterOutlet],
  selector: 'app-customer-layout',
  styleUrl: './customer-layout.css',
  templateUrl: './customer-layout.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerLayout {
  protected readonly sidebarOpen = signal(false);

  protected toggleSidebar(): void {
    this.sidebarOpen.update((isOpen) => !isOpen);
  }

  protected closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  protected closeSidebarOnEscape(): void {
    this.closeSidebar();
  }
}