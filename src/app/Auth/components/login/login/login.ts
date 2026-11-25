import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminDataService } from '../../../../Admin/shared/services/admin-data.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { LoginService } from '../../../service/loginserv.service';

@Component({
  imports: [ReactiveFormsModule],
  selector: 'app-login',
  styleUrl: './login.css',
  templateUrl: './login.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly adminData = inject(AdminDataService);
  private readonly loginService = inject(LoginService);
  private readonly router = inject(Router);

  protected readonly isPasswordVisible = signal(false);
  protected readonly isSubmitting = signal(false);
  protected readonly submitted = signal(false);
  protected readonly errorMessage = signal('');

  protected readonly loginForm = this.formBuilder.nonNullable.group({
    accountNumber: ['', Validators.required],
    password: ['', Validators.required],
    rememberMe: [false],
  });

  protected togglePasswordVisibility(): void {
    this.isPasswordVisible.update((visible) => !visible);
  }

  protected submit(): void {
    this.submitted.set(true);
    this.errorMessage.set('');
    if (this.loginForm.invalid || this.isSubmitting()) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const { accountNumber, password, rememberMe } = this.loginForm.getRawValue();
    this.authService.logout();

    if (this.authService.loginAdmin(accountNumber, password, rememberMe)) {
      void this.router.navigateByUrl('/adminDashboard');
      return;
    }

    this.isSubmitting.set(true);
    this.loginService.login({ UserID: accountNumber.trim(), UserPwd: password }).subscribe({
      next: (response) => {
        const credentials = response?.UserCredentials;
        const description = response?.Description?.trim();
        const loginSucceeded = description?.toUpperCase() === 'SUCCESS';
        if (!loginSucceeded) {
          this.showError(description || 'The account number or password is incorrect.');
          return;
        }

        const responseAccountNumber = credentials?.CoCode?.trim() || '';
        if (!responseAccountNumber) {
          this.authService.loginVisitor(
            credentials?.UserName?.trim() || 'Visitor',
            credentials?.UserID?.trim() || accountNumber.trim(),
            credentials?.UserPWD || password,
            rememberMe,
          );
          this.isSubmitting.set(false);
          void this.router.navigateByUrl('/visitor');
          return;
        }

        const customer = this.adminData.findCustomerByAccountNumber(responseAccountNumber);
        if (!customer?.isActive) {
          this.showError('This account is not enabled for the customer portal.');
          return;
        }

        const packageSummary = this.adminData.getCustomerPackageSummary(customer.id);
        this.authService.loginCustomer({
          accountNumber: responseAccountNumber,
          displayName: credentials?.UserName?.trim() || responseAccountNumber,
          shipmentLimit: packageSummary.shipmentLimit,
          usedShipments: packageSummary.usedShipments,
          apiUserId: credentials?.UserID?.trim() || accountNumber.trim(),
          apiUserPassword: credentials?.UserPWD || password,
        }, rememberMe);
        this.isSubmitting.set(false);
        void this.router.navigateByUrl('/customer');
      },
      error: (error: unknown) => {
        const responseBody = error instanceof HttpErrorResponse
          ? error.error as { Description?: string } | null
          : null;
        this.showError(responseBody?.Description || 'Unable to sign in right now. Please try again.');
      },
    });
  }

  private showError(message: string): void {
    this.errorMessage.set(message);
    this.isSubmitting.set(false);
  }
}
