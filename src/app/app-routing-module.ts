import { NgModule } from '@angular/core';
import { RouterModule, Routes, PreloadAllModules } from '@angular/router';
import { AuthGuard } from './core/guards/auth.guard';
import { RoleDashboardGuard } from './core/guards/role-dashboard.guard';
import { RoleGuard } from './core/guards/role.guard';
import { SubscriptionGuard } from './core/guards/subscription.guard';
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
  // All protected routes - requires login
  {
    path: '',
    component: ProtectedLayoutComponent,
    canActivate: [AuthGuard], // 🔐 AUTH GUARD - Login required for ALL protected routes
    children: [
      {
        path: 'dashboard',
        children: [
          {
            path: '',
            canActivate: [RoleDashboardGuard],
            children: [] // Redirect based on role
          },
          {
            path: 'admin',
            loadChildren: () => import('./dashboard/dashboard-module').then(m => m.DashboardModule),
	            canActivate: [RoleDashboardGuard, SubscriptionGuard],
            data: { expectedRole: 'Admin' }
          },
          {
            path: 'pathology',
            component: PathologyDashboardComponent,
	            canActivate: [RoleDashboardGuard, SubscriptionGuard],
            data: { expectedRole: 'Pathology' }
          },

        ]
      },

	      {
	        path: 'appointments',
	        loadChildren: () => import('./appointments/appointments-module').then(m => m.AppointmentsModule),
	        canActivate: [SubscriptionGuard]
	      },
	      {
	        path: 'billing',
	        loadChildren: () => import('./billing/billing-module').then(m => m.BillingModule),
	        canActivate: [SubscriptionGuard]
	      },
	      {
	        path: 'reception',
	        loadChildren: () => import('./reception/reception.module').then(m => m.ReceptionModule),
	        canActivate: [SubscriptionGuard]
	      },
      {
        path: 'setup',
        loadChildren: () => import('./setup/setup.module').then(m => m.SetupModule),
	        canActivate: [RoleGuard, SubscriptionGuard],
        data: { roles: ['Admin', 'LabAdmin'] }
      },

      {
        path: 'lab-setup',
        loadChildren: () => import('./setup/lab-setup/lab-setup.module').then(m => m.LabSetupModule),
	        canActivate: [RoleGuard, SubscriptionGuard],
        data: { roles: ['Admin', 'LabAdmin'] }
      },
      {
        path: 'cash-receipt',
        loadChildren: () => import('./cash-receipt/cash-receipt.module').then(m => m.CashReceiptModule),
	        canActivate: [RoleGuard, SubscriptionGuard],
        data: { roles: ['Admin', 'SuperAdmin', 'Pathology', 'LabAdmin', 'Receptionist'] }
      },
      {
        path: 'pathology-module',
        loadChildren: () => import('./pathology/pathology.module').then(m => m.PathologyModule),
	        canActivate: [RoleGuard, SubscriptionGuard],
        data: { roles: ['Pathology', 'Admin', 'LabAdmin', 'Technician', 'Receptionist'] }
      },
      {
        path: 'pathology',
        loadChildren: () => import('./pathology/pathology.module').then(m => m.PathologyModule),
	        canActivate: [RoleGuard, SubscriptionGuard],
        data: { roles: ['Pathology', 'Admin', 'LabAdmin', 'Technician', 'Receptionist'] }
      },
      {
        path: 'reporting',
	        loadChildren: () => import('./reporting/reporting.module').then(m => m.ReportingModule),
	        canActivate: [SubscriptionGuard]
      },
      {
        path: 'inventory',
	        loadChildren: () => import('./inventory/inventory.module').then(m => m.InventoryModule),
	        canActivate: [SubscriptionGuard]
      },
      {
        path: 'profile',
        component: UserProfileComponent
      },
		      {
		        path: 'roles',
		        loadChildren: () => import('./roles/roles.module').then(m => m.RolesModule),
		        canActivate: [RoleGuard, SubscriptionGuard],
		        data: { roles: ['SuperAdmin', 'LabAdmin', 'Admin'] }
		      },
      {
        path: 'super-admin',
        loadChildren: () => import('./super-admin/super-admin.module').then(m => m.SuperAdminModule),
        canActivate: [RoleGuard],
        data: { roles: ['SuperAdmin'] }
      }
    ]
  },
  {
    path: 'public/self-register/:labCode',
    loadComponent: () => import('./public/self-register/self-register.component').then(m => m.SelfRegisterComponent)
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
