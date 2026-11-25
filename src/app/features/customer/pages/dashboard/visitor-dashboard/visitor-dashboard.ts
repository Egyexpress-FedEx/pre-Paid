import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, HostListener, inject, PLATFORM_ID, signal } from '@angular/core';
import { AuthService } from '../../../../../core/auth/auth.service';

@Component({
  selector: 'app-visitor-dashboard',
  templateUrl: './visitor-dashboard.html',
  styleUrl: './visitor-dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VisitorDashboard {
  private readonly authService = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly visitorName = computed(() =>
    this.authService.currentUser()?.displayName?.trim() || 'there',
  );
  protected readonly inquiryOpen = signal(false);
  protected readonly selectedPackage = signal('');

  protected explorePackages(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected openInquiry(packageName = 'General enquiry'): void {
    this.selectedPackage.set(packageName);
    this.inquiryOpen.set(true);
  }

  protected closeInquiry(): void {
    this.inquiryOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  protected closeInquiryOnEscape(): void {
    this.closeInquiry();
  }
}
