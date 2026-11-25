import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';

const CREDENTIALS_KEY = 'customer-api-credentials-by-account';

export interface CustomerApiCredentials {
  userId: string;
  userPwd: string;
}

@Injectable({ providedIn: 'root' })
export class CustomerApiCredentialsStore {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);

  save(accountNumber: string, credentials: CustomerApiCredentials): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const accountKey = this.normalizeAccount(accountNumber);
    if (!accountKey) return;

    const storedCredentials = this.readAll();
    storedCredentials[accountKey] = credentials;
    this.document.defaultView?.localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(storedCredentials));
  }

  get(accountNumber: string): CustomerApiCredentials | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    return this.readAll()[this.normalizeAccount(accountNumber)] ?? null;
  }

  remove(accountNumber: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const accountKey = this.normalizeAccount(accountNumber);
    const storedCredentials = this.readAll();
    delete storedCredentials[accountKey];
    this.document.defaultView?.localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(storedCredentials));
  }

  private readAll(): Record<string, CustomerApiCredentials> {
    const storedValue = this.document.defaultView?.localStorage.getItem(CREDENTIALS_KEY);
    if (!storedValue) return {};

    try {
      return JSON.parse(storedValue) as Record<string, CustomerApiCredentials>;
    } catch {
      return {};
    }
  }

  private normalizeAccount(accountNumber: string): string {
    return accountNumber.trim().toUpperCase();
  }
}
