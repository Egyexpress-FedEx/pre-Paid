import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);

  // Browser storage is not available during SSR. Let the client-side guard
  // make the final decision after the stored session has been restored.
  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  return authService.hasRole('admin') ? true : router.parseUrl('/login');
};
