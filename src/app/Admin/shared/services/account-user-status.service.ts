import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { computed, effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { EMPTY, Observable, catchError, concatMap, finalize, of } from 'rxjs';
import { SearchQueryResponse } from '../models/search-query.model';
import { SearchQueryService } from './search-query.service';

const ALERTS_STORAGE_KEY = 'admin-account-user-status-alerts';

export interface AccountUserStatusAlert {
  accountNumber: string;
  requestedStatus: 'active' | 'inactive';
  activeUserCount: number | null;
  totalUserCount: number | null;
  message: string;
  lastCheckedAt: string;
}

export interface AccountUserStatusTarget {
  accountNumber: string;
  isActive: boolean;
}

type AccountUserRow = Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class AccountUserStatusService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);
  private readonly searchQuery = inject(SearchQueryService);
  private readonly desiredStatus = new Map<string, boolean>();
  private readonly confirmedStatus = new Map<string, boolean>();
  private readonly inFlight = new Set<string>();

  readonly alerts = signal<AccountUserStatusAlert[]>(this.readAlerts());
  readonly alertCount = computed(() => this.alerts().length);
  readonly busyAccounts = signal<string[]>([]);

  constructor() {
    effect(() => this.writeAlerts(this.alerts()));
  }

  syncAccount(accountNumber: string, isActive: boolean, force = false): void {
    const accountKey = this.accountKey(accountNumber);
    if (!isPlatformBrowser(this.platformId) || !accountKey) return;

    this.desiredStatus.set(accountKey, isActive);
    if (this.inFlight.has(accountKey)) return;
    if (!force && this.confirmedStatus.get(accountKey) === isActive) return;

    this.setBusy(accountKey, true);
    const verifyAfterUpdate = this.searchQuery.setAccountUsersActive(accountNumber, isActive).pipe(
      catchError(() => of(null)),
      concatMap(() => this.selectAccountUsers(accountNumber)),
      finalize(() => this.finishRequest(accountKey, accountNumber, isActive)),
    );

    this.runVerification(verifyAfterUpdate, [{ accountNumber, isActive }]);
  }

  syncAccounts(targets: AccountUserStatusTarget[]): void {
    const accounts = this.uniqueTargets(targets);
    if (!isPlatformBrowser(this.platformId) || accounts.length === 0) return;

    for (const target of accounts) this.desiredStatus.set(this.accountKey(target.accountNumber), target.isActive);
    const availableTargets = accounts.filter((target) => !this.inFlight.has(this.accountKey(target.accountNumber)));
    if (availableTargets.length === 0) return;

    const keys = availableTargets.map((target) => this.accountKey(target.accountNumber));
    keys.forEach((key) => this.setBusy(key, true));

    let accountsNeedingUpdate: AccountUserStatusTarget[] = [];
    const initialCheck = this.selectAccountsUsers(availableTargets.map((target) => target.accountNumber)).pipe(
      concatMap((response) => {
        const rows = this.readRows(response);
        accountsNeedingUpdate = rows
          ? availableTargets.filter((target) => !this.rowsMatch(rows, target.accountNumber, target.isActive))
          : availableTargets;

        for (const target of availableTargets) {
          if (!accountsNeedingUpdate.some((entry) => this.accountKey(entry.accountNumber) === this.accountKey(target.accountNumber))) {
            this.markVerified(target.accountNumber, target.isActive);
          }
        }

        if (accountsNeedingUpdate.length === 0) return EMPTY;
        return this.searchQuery.setAccountUsersActiveBulk(accountsNeedingUpdate).pipe(
          catchError(() => of(null)),
          concatMap(() => this.selectAccountsUsers(accountsNeedingUpdate.map((target) => target.accountNumber))),
        );
      }),
      finalize(() => {
        for (const key of keys) {
          this.inFlight.delete(key);
          this.setBusy(key, false);
        }
        for (const target of availableTargets) {
          const key = this.accountKey(target.accountNumber);
          const latestStatus = this.desiredStatus.get(key);
          if (latestStatus !== undefined && latestStatus !== target.isActive) {
            this.syncAccount(target.accountNumber, latestStatus, true);
          }
        }
      }),
    );

    keys.forEach((key) => this.inFlight.add(key));
    initialCheck.subscribe({
      next: (response) => {
        for (const target of accountsNeedingUpdate) {
          this.applyVerification(response, target.accountNumber, target.isActive);
        }
      },
      error: () => {
        for (const target of accountsNeedingUpdate.length ? accountsNeedingUpdate : availableTargets) {
          this.saveAlert(target.accountNumber, target.isActive, null, null, 'Could not confirm the account users’ access status.');
        }
      },
    });
  }

  verifyAccount(accountNumber: string, isActive?: boolean): void {
    const alert = this.findAlert(accountNumber);
    const requestedStatus = isActive ?? (alert?.requestedStatus === 'active');
    if (!alert && isActive === undefined) return;
    this.verifyAccounts([{ accountNumber, isActive: requestedStatus }]);
  }

  verifyAllAlerts(): void {
    this.verifyAccounts(this.alerts().map((alert) => ({
      accountNumber: alert.accountNumber,
      isActive: alert.requestedStatus === 'active',
    })));
  }

  retryAlert(accountNumber: string): void {
    const alert = this.findAlert(accountNumber);
    if (alert) this.syncAccount(alert.accountNumber, alert.requestedStatus === 'active', true);
  }

  retryAllAlerts(): void {
    this.syncAccounts(this.alerts().map((alert) => ({
      accountNumber: alert.accountNumber,
      isActive: alert.requestedStatus === 'active',
    })));
  }

  isBusy(accountNumber: string): boolean {
    return this.busyAccounts().includes(this.accountKey(accountNumber));
  }

  private verifyAccounts(targets: AccountUserStatusTarget[]): void {
    const accounts = this.uniqueTargets(targets);
    if (!isPlatformBrowser(this.platformId) || accounts.length === 0) return;

    const availableTargets = accounts.filter((target) => !this.inFlight.has(this.accountKey(target.accountNumber)));
    if (availableTargets.length === 0) return;
    const keys = availableTargets.map((target) => this.accountKey(target.accountNumber));
    keys.forEach((key) => this.setBusy(key, true));
    keys.forEach((key) => this.inFlight.add(key));

    this.selectAccountsUsers(availableTargets.map((target) => target.accountNumber)).pipe(
      finalize(() => {
        for (const key of keys) {
          this.inFlight.delete(key);
          this.setBusy(key, false);
        }
        for (const target of availableTargets) {
          const key = this.accountKey(target.accountNumber);
          const latestStatus = this.desiredStatus.get(key);
          if (latestStatus !== undefined && latestStatus !== target.isActive) {
            this.syncAccount(target.accountNumber, latestStatus, true);
          }
        }
      }),
    ).subscribe({
      next: (response) => {
        for (const target of availableTargets) {
          this.applyVerification(response, target.accountNumber, target.isActive);
        }
      },
      error: () => {
        for (const target of availableTargets) {
          this.saveAlert(target.accountNumber, target.isActive, null, null, 'Could not confirm the account users’ access status.');
        }
      },
    });
  }

  private runVerification(
    request: Observable<SearchQueryResponse | null>,
    targets: AccountUserStatusTarget[],
  ): void {
    const target = targets[0];
    const key = this.accountKey(target.accountNumber);
    this.inFlight.add(key);
    request.subscribe({
      next: (response) => this.applyVerification(response, target.accountNumber, target.isActive),
      error: () => this.saveAlert(target.accountNumber, target.isActive, null, null, 'Could not confirm the account users’ access status.'),
    });
  }

  private selectAccountUsers(accountNumber: string): Observable<SearchQueryResponse | null> {
    return this.searchQuery.getAccountUsersActive(accountNumber).pipe(catchError(() => of(null)));
  }

  private selectAccountsUsers(accountNumbers: string[]): Observable<SearchQueryResponse | null> {
    return this.searchQuery.getAccountsUsersActive(accountNumbers).pipe(catchError(() => of(null)));
  }

  private applyVerification(
    response: SearchQueryResponse | null,
    accountNumber: string,
    isActive: boolean,
  ): void {
    const rows = this.readRows(response);
    if (!rows) {
      this.saveAlert(accountNumber, isActive, null, null, 'Could not confirm the account users’ access status.');
      return;
    }

    const accountRows = this.rowsForAccount(rows, accountNumber);
    if (accountRows.length === 0) {
      if (!isActive) {
        this.markVerified(accountNumber, false);
        return;
      }
      this.saveAlert(accountNumber, isActive, 0, 0, 'No user records were found for this account.');
      return;
    }

    const activeUserCount = accountRows.filter((row) => this.isUserActive(this.readField(row, 'Active')) === true).length;
    const allMatch = accountRows.every((row) => this.isUserActive(this.readField(row, 'Active')) === isActive);
    if (allMatch) {
      this.markVerified(accountNumber, isActive);
      return;
    }

    const outOfDateCount = isActive
      ? accountRows.length - activeUserCount
      : activeUserCount;
    const message = isActive
      ? `${outOfDateCount} of ${accountRows.length} account users are still inactive.`
      : `${outOfDateCount} of ${accountRows.length} account users are still active.`;
    this.saveAlert(accountNumber, isActive, activeUserCount, accountRows.length, message);
  }

  private rowsMatch(rows: AccountUserRow[], accountNumber: string, isActive: boolean): boolean {
    const accountRows = this.rowsForAccount(rows, accountNumber);
    return accountRows.length === 0 && !isActive
      || accountRows.length > 0
      && accountRows.every((row) => this.isUserActive(this.readField(row, 'Active')) === isActive);
  }

  private rowsForAccount(rows: AccountUserRow[], accountNumber: string): AccountUserRow[] {
    const accountKey = this.accountKey(accountNumber);
    return rows.filter((row) => this.accountKey(String(this.readField(row, 'Accno') ?? '')) === accountKey);
  }

  private readRows(response: SearchQueryResponse | null): AccountUserRow[] | null {
    if (String(response?.Code) !== '1' || response?.Description?.trim().toUpperCase() !== 'SUCCESS') return null;
    try {
      const parsed = JSON.parse(response.JasonString || '[]') as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((entry): entry is AccountUserRow => typeof entry === 'object' && entry !== null && !Array.isArray(entry))
        : null;
    } catch {
      return null;
    }
  }

  private readField(row: AccountUserRow, fieldName: string): unknown {
    const field = Object.entries(row).find(([key]) => key.trim().toLowerCase() === fieldName.toLowerCase());
    return field?.[1];
  }

  private isUserActive(value: unknown): boolean | null {
    if (value === true || value === 1 || String(value).trim() === '1') return true;
    if (value === false || value === 0 || String(value).trim() === '0') return false;
    return null;
  }

  private markVerified(accountNumber: string, isActive: boolean): void {
    const key = this.accountKey(accountNumber);
    this.confirmedStatus.set(key, isActive);
    this.alerts.update((alerts) => alerts.filter((alert) => this.accountKey(alert.accountNumber) !== key));
  }

  private saveAlert(
    accountNumber: string,
    isActive: boolean,
    activeUserCount: number | null,
    totalUserCount: number | null,
    message: string,
  ): void {
    const key = this.accountKey(accountNumber);
    const alert: AccountUserStatusAlert = {
      accountNumber,
      requestedStatus: isActive ? 'active' : 'inactive',
      activeUserCount,
      totalUserCount,
      message,
      lastCheckedAt: new Date().toISOString(),
    };
    this.confirmedStatus.delete(key);
    this.alerts.update((alerts) => [
      ...alerts.filter((entry) => this.accountKey(entry.accountNumber) !== key),
      alert,
    ].sort((first, second) => second.lastCheckedAt.localeCompare(first.lastCheckedAt)));
  }

  private findAlert(accountNumber: string): AccountUserStatusAlert | undefined {
    const key = this.accountKey(accountNumber);
    return this.alerts().find((alert) => this.accountKey(alert.accountNumber) === key);
  }

  private uniqueTargets(targets: AccountUserStatusTarget[]): AccountUserStatusTarget[] {
    return Array.from(new Map(targets
      .filter((target) => target.accountNumber.trim())
      .map((target) => [this.accountKey(target.accountNumber), target])).values());
  }

  private finishRequest(accountKey: string, accountNumber: string, requestedStatus: boolean): void {
    this.inFlight.delete(accountKey);
    this.setBusy(accountKey, false);
    const latestStatus = this.desiredStatus.get(accountKey);
    if (latestStatus !== undefined && latestStatus !== requestedStatus) {
      this.syncAccount(accountNumber, latestStatus, true);
    }
  }

  private setBusy(accountKey: string, isBusy: boolean): void {
    this.busyAccounts.update((accounts) => isBusy
      ? accounts.includes(accountKey) ? accounts : [...accounts, accountKey]
      : accounts.filter((account) => account !== accountKey));
  }

  private accountKey(accountNumber: string): string {
    return accountNumber.trim().toUpperCase();
  }

  private localStorage(): Storage | null {
    return isPlatformBrowser(this.platformId) ? this.document.defaultView?.localStorage ?? null : null;
  }

  private readAlerts(): AccountUserStatusAlert[] {
    const raw = this.localStorage()?.getItem(ALERTS_STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed as AccountUserStatusAlert[] : [];
    } catch {
      return [];
    }
  }

  private writeAlerts(alerts: AccountUserStatusAlert[]): void {
    this.localStorage()?.setItem(ALERTS_STORAGE_KEY, JSON.stringify(alerts));
  }
}
