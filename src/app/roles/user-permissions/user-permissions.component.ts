import { Component, ChangeDetectionStrategy, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { RolesService, AppUser } from '../services/roles.service';
import { SuccessAlertComponent } from '../../shared/components/success-alert/success-alert.component';

// Sidebar sections snapshot for route-level access
const ALL_SECTIONS: Array<{ title: string; children: Array<{ label: string; route: string }> }> = [
  { title: 'Setup', children: [


    { label: 'Doctor Registration', route: '/setup/doctors/doctor-registration' },
    { label: 'Search Doctor', route: '/setup/doctors/doctor-list' },

    { label: 'Prefix Registration', route: '/setup/prefixes/new' },
    { label: 'Search Prefix', route: '/setup/prefixes/list' },
    { label: 'Category Head', route: '/setup/category-heads/category-head-registration' },
    { label: 'Service Head', route: '/setup/category-heads/service-head' },
    { label: 'Search Service', route: '/setup/category-heads/search-service' },
    { label: 'Test Master', route: '/setup/pathology/test-master' },
    { label: 'Test Entry', route: '/setup/pathology/test-entry' },
    { label: 'Test Database', route: '/setup/pathology/test-database' },
    { label: 'Test Panels', route: '/setup/pathology/test-panels' },
    { label: 'Reference Ranges', route: '/setup/pathology/reference-ranges' },

  ]},
  { title: 'Reception', children: [
    { label: 'Patient Registration', route: '/reception/patient-registration' },
    { label: 'Search Patient', route: '/reception/search-patient' },
  ]},

  { title: 'Cash Receipt', children: [
    { label: 'Receive Cash', route: '/cash-receipt/register-opt-ipd' },
    { label: 'Edit Record', route: '/cash-receipt/edit-record' }
  ]},
  { title: 'Edit History', children: [
    { label: 'Edited Patients Records', route: '/cash-receipt/edit-history' }
  ]},
  { title: 'Pathology', children: [
    { label: 'Scheduled Tests', route: '/pathology/scheduled-tests' },
    { label: 'Register Test', route: '/pathology-module/register-test-opd' },
    { label: 'Generate Report', route: '/pathology-module/test-report' },
    { label: 'Registered Report', route: '/pathology/registered-report' }
  ]},

  { title: 'Data', children: [
    { label: 'All Reports', route: '/pathology-module/all-reports' },
    { label: 'All IPD Reports', route: '/pathology-module/all-ipd-reports' },
    { label: 'Reports Records', route: '/pathology-module/reports-records' },
    { label: 'Test Summary', route: '/pathology-module/test-summary' }
  ]},

  { title: 'Reports', children: [
    { label: 'Daily IPD Report', route: '/reporting/daily-ipd-report' },
    { label: 'Consolidated IPD Report', route: '/reporting/consolidated-ipd-report' },
    { label: 'Monthly IPD Report', route: '/reporting/monthly-ipd-report' },
    { label: 'Daily Cash Report', route: '/reporting/daily-cash-report' },
    { label: 'Daily Cash Summary', route: '/reporting/daily-cash-summary' }
  ]}
];




@Component({
  selector: 'app-user-permissions',
  standalone: true,
  imports: [CommonModule, FormsModule, SuccessAlertComponent],
  templateUrl: './user-permissions.component.html',
  styleUrls: ['./user-permissions.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserPermissionsComponent implements OnInit {
  userId!: string;
  user?: AppUser & { permissions?: string[]; allowedRoutes?: string[] };
  loading = true;
  saving = false;

  // Success alert state
  showSuccessAlert = false;
  alertTitle = '🎉 Permissions Updated!';
  alertMessage = 'User permissions saved successfully.';

  // Route-level groups per section
  routeSections: Array<{ title: string; children: Array<{ label: string; route: string }> }> = [];
  allowedRoutes: string[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private rolesService: RolesService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.userId = this.route.snapshot.paramMap.get('id')!;
    this.fetchUser();
  }

  private buildSectionsForRole(role: string) {
    // Only include sections relevant to this role
    if (role === 'SuperAdmin') {
      // Hide only Pathology for SuperAdmin
      const hide = new Set(['Pathology']);
      this.routeSections = ALL_SECTIONS.filter(s => !hide.has(s.title));
    } else if (role === 'Admin') {
      // Admin: show core sections + IPD
      this.routeSections = ALL_SECTIONS.filter(s => ['Setup','Reception','IPD','Cash Receipt','Reports'].includes(s.title));
    } else if (role === 'Pathology') {
      // Pathology role: show Setup, Pathology and Data (lab reports lists)
      this.routeSections = ALL_SECTIONS.filter(s => ['Setup','Pathology','Data'].includes(s.title));
    } else {
      this.routeSections = ALL_SECTIONS.slice();
    }
  }

  private fetchUser(): void {
    this.loading = true;
    this.rolesService.getUsers(true).subscribe({
      next: ({ users }) => {
        const u = users.find(x => x._id === this.userId);
        if (u) {
          // permissions/allowedRoutes not in AppUser strictly; keep local fields
          this.user = { ...u, permissions: (u as any).permissions || [], allowedRoutes: (u as any).allowedRoutes || [] };

          // Build route sections for this role
          this.buildSectionsForRole((u as any).role);

          // Initialize allowedRoutes
          this.allowedRoutes = ((u as any).allowedRoutes || []).slice();

          // Preselect permissions passed from Add Role
          const st: any = history.state || {};
          const prePerm: string[] | undefined = Array.isArray(st.preselectPermissions) ? st.preselectPermissions : undefined;
          if (prePerm?.length) {
            const perms = new Set(this.user.permissions || []);
            for (const k of prePerm) perms.add(k);
            this.user.permissions = Array.from(perms);
          }
          // Preselect routes passed from Add Role
          const preRoutes: string[] | undefined = Array.isArray(st.preselectRoutes) ? st.preselectRoutes : undefined;
          if (preRoutes?.length) {
            const set = new Set(this.allowedRoutes);
            for (const r of preRoutes) set.add(r);
            this.allowedRoutes = Array.from(set);
          }

          // Default route selection if none set yet: enable all routes of the visible sections
          if (this.allowedRoutes.length === 0) {
            const allRoutes = this.routeSections.flatMap(sec => (sec.children || []).map(c => c.route));
            this.allowedRoutes = allRoutes;
          }
        }
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); }
    });
  }


  isRouteChecked(route: string): boolean { return this.allowedRoutes.includes(route); }
  toggleRoute(route: string, checked: boolean): void {
    const set = new Set(this.allowedRoutes);
    if (checked) set.add(route); else set.delete(route);
    this.allowedRoutes = Array.from(set);
    this.cdr.markForCheck();
  }
  // Select All helpers for route sections
  areAllRoutesChecked(section: { children: { route: string }[] }): boolean {
    const list = section.children?.map(c => c.route) || [];
    return list.length > 0 && list.every(r => this.allowedRoutes.includes(r));
  }
  toggleAllRoutes(section: { children: { route: string }[] }, checked: boolean): void {
    const set = new Set(this.allowedRoutes);
    for (const ch of section.children || []) {
      if (checked) set.add(ch.route); else set.delete(ch.route);
    }
    this.allowedRoutes = Array.from(set);
    this.cdr.markForCheck();
  }

  save(): void {
    if (!this.user) return;
    this.saving = true;
    this.rolesService.updateUser(this.userId, { allowedRoutes: this.allowedRoutes }).subscribe({
      next: () => {
        this.saving = false;
        this.showSuccessAlert = true;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.saving = false;
        const msg = err?.error?.message || 'Failed to update permissions';
        alert(msg);
        this.cdr.markForCheck();
      },
    });
  }

  onSuccessAlertClose(): void {
    this.showSuccessAlert = false;
    this.cdr.markForCheck();
    this.router.navigate(['/roles/list']);
  }

  cancel(): void {
    this.router.navigate(['/roles/list']);
  }
}

