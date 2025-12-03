import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Subject } from 'rxjs';
import { takeUntil, timeout } from 'rxjs/operators';

interface AdminUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  profilePicture?: string;
}

interface Lab {
  _id: string;
  labCode: string;
  labName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  subscriptionPlan: string;
  subscriptionStatus: string;
  approvalStatus: string;
  trialEndsAt?: string;
  totalUsers: number;
  totalPatients: number;
  totalReports: number;
  createdAt: string;
  adminUser?: AdminUser; // Lab admin user details
}

interface DashboardStats {
  totalLabs: number;
  pendingApprovals: number;
  activeLabs: number;
  trialLabs: number;
  basicLabs: number;
  premiumLabs: number;
}

@Component({
  selector: 'app-super-admin-dashboard',
  standalone: false,
  templateUrl: './super-admin-dashboard.component.html',
  styleUrls: ['./super-admin-dashboard.component.css']
})
export class SuperAdminDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private dataLoaded = false;

  stats: DashboardStats = {
    totalLabs: 0,
    pendingApprovals: 0,
    activeLabs: 0,
    trialLabs: 0,
    basicLabs: 0,
    premiumLabs: 0
  };

  labs: Lab[] = [];
  filteredLabs: Lab[] = [];
  loading = false;
  error = '';

  // Filters
  filterStatus: string = 'all'; // all, pending, approved, rejected
  filterPlan: string = 'all'; // all, trial, basic, premium
  searchQuery: string = '';

  // View mode
  viewMode: 'table' | 'cards' = 'cards'; // Default to cards view

  constructor(
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnInit(): void {
    // Try to load from cache first for instant display
    const cached = sessionStorage.getItem('superadmin_labs');
    if (cached) {
      try {
        this.labs = JSON.parse(cached);
        this.calculateStats();
        this.applyFilters();
        this.dataLoaded = true;
      } catch (e) { }
    }

    // Subscribe to query params
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const filter = params['filter'];
      if (filter === 'all') {
        this.filterStatus = 'all';
      } else if (filter === 'pending') {
        this.filterStatus = 'pending';
      } else if (filter === 'active') {
        this.filterStatus = 'approved';
      }

      // If we have cached data, just apply filters
      if (this.dataLoaded && this.labs.length > 0) {
        this.applyFilters();
      }

      // Load fresh data in background (or immediately if no cache)
      if (!this.loading) {
        this.loadDashboardData(!this.dataLoaded);
      }
    });
  }

  loadDashboardData(showLoading = true): void {
    if (showLoading) {
      this.loading = true;
    }
    this.error = '';

    const apiUrl = `${environment.apiUrl || 'http://localhost:3000/api'}/lab-management/labs`;
    const token = localStorage.getItem('token');

    this.http.get<any>(apiUrl, {
      headers: { Authorization: `Bearer ${token}` }
    }).pipe(
      timeout(10000), // 10 second timeout
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.labs = response.labs || [];
        // Cache for instant load next time
        sessionStorage.setItem('superadmin_labs', JSON.stringify(this.labs));
        this.dataLoaded = true;
        this.calculateStats();
        this.applyFilters();
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        if (error.name === 'TimeoutError') {
          this.error = 'Request timed out. Please try again.';
        } else {
          this.error = error.error?.message || error.message || 'Failed to load labs';
        }
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  refreshData(): void {
    sessionStorage.removeItem('superadmin_labs');
    this.loadDashboardData(true);
  }

  calculateStats(): void {
    this.stats.totalLabs = this.labs.length;
    this.stats.pendingApprovals = this.labs.filter(l => l.approvalStatus === 'pending').length;
    this.stats.activeLabs = this.labs.filter(l => l.approvalStatus === 'approved').length;
    this.stats.trialLabs = this.labs.filter(l => l.subscriptionPlan === 'trial').length;
    this.stats.basicLabs = this.labs.filter(l => l.subscriptionPlan === 'basic').length;
    this.stats.premiumLabs = this.labs.filter(l => l.subscriptionPlan === 'premium').length;
  }

  applyFilters(): void {
    let filtered = [...this.labs];

    // Filter by approval status
    if (this.filterStatus !== 'all') {
      filtered = filtered.filter(l => l.approvalStatus === this.filterStatus);
    }

    // Filter by subscription plan
    if (this.filterPlan !== 'all') {
      filtered = filtered.filter(l => l.subscriptionPlan === this.filterPlan);
    }

    // Search filter
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(l =>
        l.labName.toLowerCase().includes(query) ||
        l.labCode.toLowerCase().includes(query) ||
        l.email.toLowerCase().includes(query) ||
        l.city.toLowerCase().includes(query)
      );
    }

    this.filteredLabs = filtered;
  }

  onFilterChange(): void {
    this.applyFilters();
  }

  approveLab(labId: string): void {
    if (!confirm('Are you sure you want to approve this lab?')) {
      return;
    }

    const apiUrl = `${environment.apiUrl || 'http://localhost:3000/api'}/lab-management/labs/${labId}/approve`;
    const token = localStorage.getItem('token');

    this.http.put<any>(apiUrl, {}, {
      headers: { Authorization: `Bearer ${token}` }
    }).subscribe({
      next: () => {
        alert('Lab approved successfully!');
        this.loadDashboardData();
      },
      error: (error) => {
        alert(error.error?.message || 'Failed to approve lab');
      }
    });
  }

  rejectLab(labId: string): void {
    const reason = prompt('Enter rejection reason:');
    if (!reason) {
      return;
    }

    const apiUrl = `${environment.apiUrl || 'http://localhost:3000/api'}/lab-management/labs/${labId}/reject`;
    const token = localStorage.getItem('token');

    this.http.put<any>(apiUrl, { reason }, {
      headers: { Authorization: `Bearer ${token}` }
    }).subscribe({
      next: () => {
        alert('Lab rejected successfully!');
        this.loadDashboardData();
      },
      error: (error) => {
        alert(error.error?.message || 'Failed to reject lab');
      }
    });
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'pending': return 'badge-warning';
      case 'approved': return 'badge-success';
      case 'rejected': return 'badge-danger';
      default: return 'badge-secondary';
    }
  }

  getPlanBadgeClass(plan: string): string {
    switch (plan) {
      case 'trial': return 'badge-info';
      case 'basic': return 'badge-primary';
      case 'premium': return 'badge-gold';
      default: return 'badge-secondary';
    }
  }

  formatDate(dateString: string): string {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'table' ? 'cards' : 'table';
  }

  getAdminInitials(lab: Lab): string {
    if (!lab.adminUser) return 'LA';
    const firstName = lab.adminUser.firstName || '';
    const lastName = lab.adminUser.lastName || '';
    return (firstName.charAt(0) + lastName.charAt(0)).toUpperCase() || 'LA';
  }

  getAdminProfilePicture(lab: Lab): string | null {
    if (!lab.adminUser?.profilePicture) return null;
    const pic = lab.adminUser.profilePicture;
    // If it's already a full URL, return as-is
    if (pic.startsWith('http://') || pic.startsWith('https://')) return pic;
    // If it starts with /uploads, proxy will handle it
    if (pic.startsWith('/uploads/')) return pic;
    // Otherwise prepend /
    return pic.startsWith('/') ? pic : '/' + pic;
  }

  isTrialExpiring(lab: Lab): boolean {
    if (lab.subscriptionPlan !== 'trial' || !lab.trialEndsAt) {
      return false;
    }
    const daysLeft = this.getDaysLeft(lab.trialEndsAt);
    return daysLeft <= 3 && daysLeft >= 0;
  }

  getDaysLeft(dateString: string): number {
    if (!dateString) return -1;
    const endDate = new Date(dateString);
    const today = new Date();
    const diffTime = endDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  viewLabProfile(labId: string): void {
    this.router.navigate(['/super-admin/lab', labId]);
  }
}

