import { Routes } from '@angular/router';
import { adminGuard } from './core/auth/admin.guard';
import { customerGuard } from './core/auth/customer.guard';
import { visitorGuard } from './core/auth/visitor.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    loadComponent: () =>
      import('./Auth/components/login/login/login').then((component) => component.Login),
  },
  {
    path: 'adminDashboard',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./Admin/components/dashboard/dashboard').then((component) => component.Dashboard),
  },
  {
    path: 'admCustomer',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./Admin/components/prepaid-customer/prepaid-customer').then((component) => component.PrepaidCustomer),
  },
  {
    path: 'admpackages',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./Admin/components/packeges/packeges').then((component) => component.Packeges),
  },
  {
    path: 'adminActivity',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./Admin/components/activity-log/activity-log').then((component) => component.ActivityLog),
  },
  {
    path: 'adminAlerts',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./Admin/components/alerts/alerts').then((component) => component.Alerts),
  },
  {
    path: 'customer',
    canActivate: [customerGuard],
    loadComponent: () =>
      import('./layouts/customer-layout/customer-layout').then((component) => component.CustomerLayout),
    children: [
      {
        path: 'create-shipment',
        loadComponent: () =>
          import('./features/customer/pages/create-shipment/create-shipment')
            .then((component) => component.CreateShipmentPage),
      },
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/customer/pages/dashboard/customer-dashboard/customer-dashboard')
            .then((component) => component.CustomerDashboard),
      },
      { path: '**', redirectTo: '/customer' },
    ],
  },
  {
    path: 'visitor',
    canActivate: [visitorGuard],
    loadComponent: () =>
      import('./layouts/customer-layout/customer-layout').then((component) => component.CustomerLayout),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/customer/pages/dashboard/visitor-dashboard/visitor-dashboard')
            .then((component) => component.VisitorDashboard),
      },
      { path: '**', redirectTo: '/visitor' },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
