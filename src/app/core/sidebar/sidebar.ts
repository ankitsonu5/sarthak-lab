import { Component, OnInit, OnDestroy, HostListener, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { Auth, User } from '../services/auth';
import { DeleteConfirmationModalComponent } from '../../shared/components/delete-confirmation-modal/delete-confirmation-modal.component';
import { DeleteSuccessModalComponent } from '../../shared/components/delete-success-modal/delete-success-modal.component';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    DeleteConfirmationModalComponent,
    DeleteSuccessModalComponent
  ],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
  changeDetection: ChangeDetectionStrategy.OnPush // PERFORMANCE FIX: OnPush change detection
})
export class Sidebar implements OnInit, OnDestroy {
  currentUser: User | null = null;
  private subscription = new Subscription();
  // Logout confirmation modal state
  showLogoutConfirm = false;
  // Logout success modal state
  showLogoutSuccess = false;

  openLogoutConfirm(): void {
    this.showLogoutConfirm = true;
    this.isSettingsOpen = false;
  }

  cancelLogout(): void {
    this.showLogoutConfirm = false;
  }

  confirmLogout(): void {
    // Perform logout immediately
    this.authService.logout();
    // Close confirm and show success toast/modal, then navigate on close
    this.showLogoutConfirm = false;
    this.showLogoutSuccess = true;
  }

  onLogoutSuccessClosed(): void {
    this.showLogoutSuccess = false;
    this.router.navigate(['/auth/login']);
  }

  isSettingsOpen = false;
  private isAnimating = false; // Prevent multiple clicks during animation


  // Cached sections to avoid rebuilds during change detection
  sidebarSections: Array<{ icon: string; title: string; superAdminOnly?: boolean; children: Array<{ label: string; route: string }> }> = [];

  // trackBy functions to stabilize DOM
  trackSection = (_: number, s: any) => s?.title;
  trackChild = (_: number, c: any) => c?.route;


  expandedSections: { [key: string]: boolean } = {
    'Patients': false,
    'Tests / Lab Reports': false,
    'Appointments / Sample Collection': false,
    'Billing / Payments': false,
    'Inventory': false,
    'Analytics / Reports': false,
    'Setup': false
  };

  constructor(
    private authService: Auth,
    private router: Router
  ) {}

  avatarUrl(): string | null {
    const raw = this.currentUser?.profilePicture || '';
    if (!raw) return null;
    if (/^https?:\/\//.test(raw)) return raw;
    // If it already begins with /uploads, keep as-is so proxy serves it in dev and same-origin in prod
    if (raw.startsWith('/uploads/')) return raw;
    // Fallback: if some older records stored relative without leading slash
    return raw.startsWith('/') ? raw : '/' + raw;
  }

  ngOnInit(): void {
    // Subscribe to current user changes
    this.subscription.add(
      this.authService.currentUser$.subscribe(user => {
        this.currentUser = user;
        this.setDefaultExpandedSection();
        this.buildSidebarSections();
      })
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  getUserInitial(): string {
    if (!this.currentUser) return 'U';
    return this.currentUser.firstName?.charAt(0).toUpperCase() || 'U';
  }

  logout(): void {
    this.openLogoutConfirm();
  }

  toggleSettings(): void {
    this.isSettingsOpen = !this.isSettingsOpen;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement;
    const settingsDropdown = target.closest('.settings-dropdown');

    if (!settingsDropdown && this.isSettingsOpen) {
      this.isSettingsOpen = false;
    }
  }

  setDefaultExpandedSection(): void {
    if (!this.currentUser) return;

    // Reset all sections to closed first
    Object.keys(this.expandedSections).forEach(key => {
      this.expandedSections[key] = false;
    });

    // Default: expand Dashboard for all roles
    this.expandedSections['Dashboard (Home)'] = true;
  }



  // Build and cache sidebar sections once per user change
  private buildSidebarSections() {
    // SuperAdmin gets different sidebar - only lab management
    if (this.currentUser?.role === 'SuperAdmin') {
      this.sidebarSections = [
        {
          icon: '🏢',
          title: 'Lab Management',
          children: [
            { label: 'All Labs', route: '/super-admin/dashboard' },
            { label: 'Pending Approvals', route: '/super-admin/dashboard' },
            { label: 'Active Labs', route: '/super-admin/dashboard' }
          ]
        },
        {
          icon: '👥',
          title: 'User Management',
          children: [
            { label: 'Create User', route: '/auth/register' },
            { label: 'Manage Users', route: '/roles/list' }
          ]
        }
      ];
      return;
    }

    // Lab users (LabAdmin, Technician, etc.) get full pathology sidebar
    const allSections = [
      {
        icon: '🛠️',
        title: 'Setup',
        children: [

          { label: 'Doctors', route: '/setup/doctors' },
          { label: 'Doctor List', route: '/setup/doctors/doctor-list' },
          { label: 'Category Heads', route: '/setup/category-heads' },
          { label: 'Prefixes', route: '/setup/prefixes' },
          { label: 'Test Master', route: '/setup/pathology/test-master' },
          { label: 'Test Entry', route: '/setup/pathology/test-entry' },
          { label: 'Test Database', route: '/setup/pathology/test-database' },
          { label: 'Test Panels', route: '/setup/pathology/test-panels' },
          { label: 'Reference Ranges', route: '/setup/pathology/reference-ranges' }
        ]
      },
      {
        icon: '👤',
        title: 'Patients',
        children: [
          { label: 'All Patients', route: '/reception/search-patient' },
          { label: 'Register Patient', route: '/reception/patient-registration' }
        ]
      },
      {
        icon: '🧪',
        title: 'Tests / Lab Reports',
        children: [
          { label: 'Generate Report', route: '/pathology/test-report' },
          { label: 'All Reports', route: '/pathology/all-reports' },
          { label: 'Reports Records', route: '/pathology/reports-records' },
          { label: 'Test Summary', route: '/pathology/test-summary' }
        ]
      },
      {
        icon: '📅',
        title: 'Appointments / Sample Collection',
        children: [
          { label: 'All Appointments', route: '/appointments' },
          { label: 'Scheduled Tests', route: '/pathology/scheduled-tests' },
          { label: 'Register Sample', route: '/pathology/registration' }
        ]
      },
      {
        icon: '💳',
        title: 'Billing / Payments',
        children: [
          { label: 'Receive Cash', route: '/cash-receipt/register-opt-ipd' },
          { label: 'Invoices', route: '/billing' },
          { label: 'Receipts Edit History', route: '/cash-receipt/edit-history' }
        ]
      },
      {
        icon: '📦',
        title: 'Inventory',
        children: [
          { label: 'Manage Equipment / Reagents', route: '/inventory/manage' },
          { label: 'Track Stock & Expiry', route: '/inventory/stock-expiry' }
        ]
      },
      {
        icon: '📈',
        title: 'Analytics / Reports',
        children: [
          { label: 'Daily Cash Report', route: '/reporting/daily-cash-report' },
          { label: 'Daily Cash Summary', route: '/reporting/daily-cash-summary' }
        ]
      }
    ];

    const applyAllowedRoutes = (sections: any[]) => {
      const user = this.currentUser as any;
      const allowed: string[] = (user && Array.isArray(user.allowedRoutes)) ? user.allowedRoutes : [];
      if (!user || user.role === 'SuperAdmin' || !allowed.length) return sections;
      const allowedSet = new Set(allowed);
      return sections.map(s => ({
        ...s,
        children: (s.children || []).filter((c: any) => allowedSet.has(c.route))
      }));
    };

    // Unified sidebar for all roles; allowedRoutes will trim items per user
    this.sidebarSections = applyAllowedRoutes(allSections);
    return;
  }

  // Backward-compat shim for template usage
  getSidebarSections() { return this.sidebarSections; }

  // Get dashboard route based on role
  getDashboardRoute(): string {
    if (!this.currentUser) return '/auth/login';

    switch (this.currentUser.role) {
      case 'SuperAdmin':
        return '/super-admin/dashboard';
      case 'LabAdmin':
      case 'Technician':
      case 'Receptionist':
      case 'Pathology':
        return '/dashboard/pathology';
      case 'Admin':
        return '/dashboard/admin';
      default:
        return '/dashboard/pathology';
    }
  }

  // Get dashboard label based on role
  getDashboardLabel(): string {
    if (!this.currentUser) return 'Dashboard';

    switch (this.currentUser.role) {
      case 'SuperAdmin':
        return 'Super Admin Dashboard';
      case 'LabAdmin':
      case 'Technician':
      case 'Receptionist':
      case 'Pathology':
        return 'Lab Dashboard';
      case 'Admin':
        return 'Admin Dashboard';
      default:
        return 'Dashboard';
    }
  }

  toggleSection(sectionTitle: string) {
    // Prevent multiple clicks during animation
    if (this.isAnimating) return;

    this.isAnimating = true;

    // Smooth accordion with auto-scroll
    const isCurrentlyExpanded = this.expandedSections[sectionTitle];

    // Close all other sections first
    Object.keys(this.expandedSections).forEach(key => {
      if (key !== sectionTitle) {
        this.expandedSections[key] = false;
      }
    });

    // Toggle the clicked section
    this.expandedSections[sectionTitle] = !isCurrentlyExpanded;

    // Auto-scroll to show the opened section at top
    if (!isCurrentlyExpanded) {
      setTimeout(() => {
        this.scrollToSection(sectionTitle);
      }, 100); // Small delay to let DOM update
    }

    // Reset animation flag after animation completes
    setTimeout(() => {
      this.isAnimating = false;
    }, 600); // Match CSS animation duration
  }

  private scrollToSection(sectionTitle: string) {
    try {
      // Find the section element
      const sectionElement = document.querySelector(`[data-section="${sectionTitle}"]`);
      if (sectionElement) {
        // Scroll the sidebar nav container
        const sidebarNav = document.querySelector('.sidebar-nav');
        if (sidebarNav) {
          const elementTop = (sectionElement as HTMLElement).offsetTop;
          sidebarNav.scrollTo({
            top: elementTop - 20, // 20px padding from top
            behavior: 'smooth'
          });
        }
      }
    } catch (error) {
      console.log('Scroll to section failed:', error);
    }
  }

  isSectionExpanded(sectionTitle: string): boolean {
    return this.expandedSections[sectionTitle] || false;
  }
}
