import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { CustomerState } from '../../../shared/state/customer.state';

@Component({
  imports: [RouterLink],
  selector: 'app-headerbar',
  styleUrl: './headerbar.css',
  templateUrl: './headerbar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Headerbar {
  protected readonly customerState = inject(CustomerState);
  readonly sidebarOpen = input(false);
  readonly menuToggle = output<void>();

  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly portalHomeRoute = computed(() =>
    this.authService.currentUser()?.role === 'visitor' ? '/visitor' : '/customer',
  );

  protected signOut(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/login');
  }
}
