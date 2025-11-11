import { NgModule } from '@angular/core';
import { RouterModule, Routes, PreloadAllModules } from '@angular/router';
import { AuthGuard } from './core/guards/auth.guard';
import { RoleDashboardGuard } from './core/guards/role-dashboard.guard';
import { RoleGuard } from './core/guards/role.guard';
import { UnauthorizedComponent } from './shared/components/unauthorized.component';
import { ProtectedLayoutComponent } from './core/protected-layout.component';
import { PathologyDashboardComponent } from './pathology/pathology-dashboard/pathology-dashboard.component';
import { NotFoundComponent } from './shared/components/not-found.component';
import { NotAvailableComponent } from './shared/components/not-available.component';
import { UserProfileComponent } from './profile/user-profile.component';

const routes: Routes = [
  { path: '', redirectTo: '/auth/login', pathMatch: 'full' },
  {
    path: 'auth',
    loadChildren: () => import('./auth/auth-module').then(m => m.AuthModule)
  },
  // Direct access routes for testing
  {
    path: 'test-setup',
    loadChildren: () => import('./setup/setup.module').then(m => m.SetupModule)
  },
  {
    path: '',
    component: ProtectedLayoutComponent,
    children: [
      {
        path: 'dashboard',
        children: [
          {
            path: '',
            // canActivate: [RoleDashboardGuard],
            children: [] // Empty component to prevent rendering before redirect
          },
          {
            path: 'admin',
            loadChildren: () => import('./dashboard/dashboard-module').then(m => m.DashboardModule),
            // canActivate: [RoleDashboardGuard],
            data: { expectedRole: 'Admin' }
          },
          {
            path: 'pathology',
            component: PathologyDashboardComponent,
            // canActivate: [RoleDashboardGuard],
            data: { expectedRole: 'Pathology' }
          },

        ]
      },

      {
        path: 'appointments',
        loadChildren: () => import('./appointments/appointments-module').then(m => m.AppointmentsModule),
        canActivate: [AuthGuard]
      },
      {
        path: 'billing',
        loadChildren: () => import('./billing/billing-module').then(m => m.BillingModule),
        canActivate: [AuthGuard]
      },
      {
        path: 'reception',
        loadChildren: () => import('./reception/reception.module').then(m => m.ReceptionModule),
        // canActivate: [AuthGuard]
      },
      {
        path: 'setup',
        loadChildren: () => import('./setup/setup.module').then(m => m.SetupModule),
        canActivate: [AuthGuard]
      },

	      {
	        path: 'lab-setup',
	        loadChildren: () => import('./setup/lab-setup/lab-setup.module').then(m => m.LabSetupModule),
	        canActivate: [AuthGuard]
	      },

      {
        path: 'cash-receipt',
        loadChildren: () => import('./cash-receipt/cash-receipt.module').then(m => m.CashReceiptModule),
        canActivate: [AuthGuard, RoleGuard],
        data: { roles: ['Admin', 'SuperAdmin', 'Pathology'] }
      },
      {
        path: 'pathology-module',
        loadChildren: () => import('./pathology/pathology.module').then(m => m.PathologyModule),
        canActivate: [AuthGuard, RoleGuard],
        data: { roles: ['Pathology', 'Admin'] }
      },
      {
        path: 'pathology',
        loadChildren: () => import('./pathology/pathology.module').then(m => m.PathologyModule),
        canActivate: [AuthGuard, RoleGuard],
        data: { roles: ['Pathology', 'Admin'] }
      },
      {
        path: 'reporting',
        loadChildren: () => import('./reporting/reporting.module').then(m => m.ReportingModule),
        canActivate: [AuthGuard]
      },
      {
        path: 'inventory',
        loadChildren: () => import('./inventory/inventory.module').then(m => m.InventoryModule),
        canActivate: [AuthGuard]
      },

      {
        path: 'profile',
        component: UserProfileComponent,
        canActivate: [AuthGuard]
      }
    ]
  },
  {
    path: 'unauthorized',
    component: UnauthorizedComponent
  },
  // Fallback 404 page
  { path: '404', component: NotFoundComponent },
  { path: '**', component: NotFoundComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, {
    // DISABLED: Router tracing for performance and to prevent console flooding
    enableTracing: false,
    preloadingStrategy: PreloadAllModules,
    onSameUrlNavigation: 'ignore',
    scrollPositionRestoration: 'disabled'
  })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
