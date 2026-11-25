import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { AccountUserStatusService } from '../../services/account-user-status.service';

@Component({
  selector: 'app-admin-sidebar',
  imports: [RouterLink, RouterLinkActive],
  template: `<aside class="shared-admin-sidebar">
    <div class="shared-brand"><div><i class="fa-solid fa-boxes-stacked"></i></div><span>Egypt <strong>Express</strong></span></div>
    <span class="shared-label">Main menu</span>
    <nav class="shared-nav">
      <a routerLink="/adminDashboard" routerLinkActive="shared-active" [routerLinkActiveOptions]="{ exact: true }"><i class="fa-solid fa-gauge-high"></i><span>Overview</span></a>
      <a routerLink="/admCustomer" routerLinkActive="shared-active"><i class="fa-solid fa-users"></i><span>Customers</span></a>
      <a routerLink="/admpackages" routerLinkActive="shared-active"><i class="fa-solid fa-box-open"></i><span>Packages</span></a>
      <a routerLink="/adminActivity" routerLinkActive="shared-active"><i class="fa-solid fa-clock-rotate-left"></i><span>Activity log</span></a>
      <a routerLink="/adminAlerts" routerLinkActive="shared-active"><i class="fa-solid fa-bell"></i><span>Alerts</span>@if (accountUserStatus.alertCount() > 0) {<span class="badge rounded-pill text-bg-danger ms-auto">{{ accountUserStatus.alertCount() > 99 ? '99+' : accountUserStatus.alertCount() }}</span>}</a>
    </nav>
    <div class="shared-help"><i class="fa-regular fa-circle-question"></i><strong>Need help?</strong><span>Contact the support team</span><a href="mailto:support@egypt-express.com">Get support <i class="fa-solid fa-arrow-right"></i></a></div>
    <div class="shared-user"><span>S</span><div><strong>Sami Developer</strong><small>Administrator</small></div><button type="button" aria-label="Logout" title="Logout" (click)="logout()"><i class="fa-solid fa-right-from-bracket"></i><em>Logout</em></button></div>
  </aside>`,
  styles: [`:host{display:block}.shared-admin-sidebar{position:fixed;inset:0 auto 0 0;z-index:20;width:258px;display:flex;flex-direction:column;padding:1.7rem 1.15rem 1.2rem;border-inline-end:1px solid #e8edf3;background:#fff;color:#173047}.shared-brand{display:flex;align-items:center;gap:.65rem;padding:.15rem .8rem 2.7rem;font-size:1.02rem}.shared-brand strong{color:var(--color-primary)}.shared-brand>div{display:grid;width:2.2rem;height:2.2rem;place-items:center;border-radius:.65rem;color:#fff;background:var(--color-primary)}.shared-label{padding:0 .8rem .8rem;color:#a0adba;font-size:.65rem;font-weight:var(--font-weight-bold);letter-spacing:.12em;text-transform:uppercase}.shared-nav{display:grid;gap:.3rem}.shared-nav a{display:flex;align-items:center;gap:.8rem;padding:.78rem .8rem;border-radius:.65rem;color:#8392a3;font-size:.82rem;text-decoration:none}.shared-nav a i{width:1.15rem;text-align:center}.shared-nav a:hover,.shared-nav .shared-active{color:var(--color-primary);background:#fff3eb}.shared-help{display:grid;gap:.35rem;margin-top:auto;margin-bottom:1.5rem;padding:1rem;border-radius:.8rem;background:#fff7f1}.shared-help>i{color:var(--color-primary)}.shared-help strong{font-size:.78rem}.shared-help span{color:#9aa7b5;font-size:.68rem}.shared-help a{color:var(--color-primary);font-size:.7rem;font-weight:var(--font-weight-bold);text-decoration:none}.shared-user{display:flex;align-items:center;gap:.6rem;padding:.85rem .45rem 0;border-top:1px solid #eef1f5}.shared-user>span{display:grid;width:2rem;height:2rem;place-items:center;border-radius:50%;color:#fff;background:#173047;font-size:.72rem;font-weight:var(--font-weight-bold)}.shared-user div{display:grid;gap:.05rem;flex:1}.shared-user strong{font-size:.7rem}.shared-user small{color:#9aa7b5;font-size:.62rem}.shared-user button{display:inline-flex;align-items:center;gap:.3rem;padding:.3rem;border:0;color:#adb8c3;background:transparent;font-size:.65rem}.shared-user button:hover{color:var(--color-primary)}.shared-user em{font-style:normal}@media(max-width:800px){.shared-admin-sidebar{transform:translateX(-100%);transition:transform 200ms ease}.shared-admin-sidebar:focus-within,.shared-admin-sidebar:hover{transform:translateX(0)}}`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSidebar {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly accountUserStatus = inject(AccountUserStatusService);
  protected logout(): void { this.auth.logout(); void this.router.navigateByUrl('/login'); }
}
