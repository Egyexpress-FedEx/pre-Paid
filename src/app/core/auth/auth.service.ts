import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { AuthUser } from './auth.types';
import { CustomerApiCredentialsStore } from './customer-api-credentials.store';

const SESSION_KEY = 'ten-shipments-auth-user';
const ADMIN_EMAIL = 'developer.sami@egyxpress.eg';
const ADMIN_PASSWORD = 'dev12345';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);
  private readonly customerCredentials = inject(CustomerApiCredentialsStore);
  readonly currentUser = signal<AuthUser | null>(this.readSession());

  loginAdmin(email: string, password: string, rememberMe: boolean): boolean {
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) return false;

    this.saveSession({ email: normalizedEmail, role: 'admin' }, rememberMe);
    return true;
  }

  loginCustomer(
    customer: Pick<AuthUser, 'accountNumber' | 'displayName' | 'shipmentLimit' | 'usedShipments' | 'apiUserId' | 'apiUserPassword'>,
    rememberMe: boolean,
  ): void {
    if (customer.accountNumber && customer.apiUserId && customer.apiUserPassword) {
      this.customerCredentials.save(customer.accountNumber, {
        userId: customer.apiUserId,
        userPwd: customer.apiUserPassword,
      });
    }
    this.saveSession({ ...customer, role: 'customer' }, rememberMe);
  }

  loginVisitor(displayName: string, apiUserId: string, apiUserPassword: string, rememberMe: boolean): void {
    this.saveSession({
      role: 'visitor',
      displayName: displayName.trim() || 'Visitor',
      apiUserId,
      apiUserPassword,
    }, rememberMe);
  }

  logout(): void {
    this.currentUser.set(null);
    if (isPlatformBrowser(this.platformId)) {
      this.document.defaultView?.localStorage.removeItem(SESSION_KEY);
      this.document.defaultView?.sessionStorage.removeItem(SESSION_KEY);
    }
  }

  hasRole(role: AuthUser['role']): boolean {
    return this.currentUser()?.role === role;
  }

  private readSession(): AuthUser | null {
    if (!isPlatformBrowser(this.platformId)) return null;

    const browserWindow = this.document.defaultView;
    const rawUser = browserWindow?.localStorage.getItem(SESSION_KEY)
      ?? browserWindow?.sessionStorage.getItem(SESSION_KEY);
    if (!rawUser) return null;

    try {
      const user = JSON.parse(rawUser) as AuthUser;
      return user && (user.role === 'admin' || user.role === 'customer' || user.role === 'visitor')
        ? user
        : null;
    } catch {
      return null;
    }
  }

  private saveSession(user: AuthUser, rememberMe: boolean): void {
    if (isPlatformBrowser(this.platformId)) {
      const browserWindow = this.document.defaultView;
      browserWindow?.localStorage.removeItem(SESSION_KEY);
      browserWindow?.sessionStorage.removeItem(SESSION_KEY);
      const storage = rememberMe ? browserWindow?.localStorage : browserWindow?.sessionStorage;
      storage?.setItem(SESSION_KEY, JSON.stringify(user));
    }
    this.currentUser.set(user);
  }
}
