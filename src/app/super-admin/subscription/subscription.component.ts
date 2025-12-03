import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, timeout } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

interface SubscriptionLab {
  _id: string;
  labCode: string;
  labName: string;
  email: string;
  subscriptionPlan: 'trial' | 'basic' | 'premium';
  subscriptionStatus: 'active' | 'expired' | 'cancelled';
  trialEndsAt?: string;
  subscriptionEndsAt?: string;
  daysLeft: number;
  isExpiringSoon: boolean;
  notificationSent: boolean;
}

interface SubscriptionPlan {
  _id: string;
  planName: string;
  displayName: string;
  priceMonthly: number;
  priceYearly: number;
  discountPercent: number;
  offerText: string;
  trialDays: number;
  featureList: string[];
  badgeColor: string;
  isPopular: boolean;
  isActive: boolean;
}

@Component({
  selector: 'app-subscription',
  standalone: false,
  templateUrl: './subscription.component.html',
  styleUrls: ['./subscription.component.css']
})
export class SubscriptionComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private dataLoaded = false;

  labs: SubscriptionLab[] = [];
  filteredLabs: SubscriptionLab[] = [];
  loading = false;
  error = '';

  // Dynamic plans from API
  plans: SubscriptionPlan[] = [];
  plansLoading = false;

  // Filters
  filterPlan: string = 'all';
  filterStatus: string = 'all';
  searchQuery: string = '';

  // Stats
  totalTrialLabs = 0;
  expiringTrialLabs = 0;
  expiredTrialLabs = 0;
  activePaidLabs = 0;

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    // Load plans dynamically
    this.loadPlans();

    // Load from cache first for instant display
    const cached = sessionStorage.getItem('superadmin_labs');
    if (cached) {
      try {
        const labs = JSON.parse(cached);
        this.processLabs(labs);
        this.calculateStats();
        this.dataLoaded = true;
      } catch (e) { }
    }

    // Check for query params
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (params['status']) {
        this.filterStatus = params['status'];
      }

      // If we have cached data, just apply filters
      if (this.dataLoaded && this.labs.length > 0) {
        this.applyFilters();
      }

      // Load fresh data
      if (!this.loading) {
        this.loadSubscriptions(!this.dataLoaded);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadPlans(): void {
    // Load from cache first for instant display
    const cached = sessionStorage.getItem('subscription_plans_public');
    if (cached) {
      try {
        this.plans = JSON.parse(cached);
      } catch (e) {}
    }

    // Only show loading if no cached plans
    if (this.plans.length === 0) {
      this.plansLoading = true;
    }

    const apiUrl = `${environment.apiUrl}/subscription-plans`;

    this.http.get<any>(apiUrl).pipe(
      timeout(15000),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.plans = response.plans || [];
        sessionStorage.setItem('subscription_plans_public', JSON.stringify(this.plans));
        this.plansLoading = false;
      },
      error: () => {
        this.plansLoading = false;
        // Only use fallback if no cached data
        if (this.plans.length === 0) {
          this.plans = [
            { _id: '1', planName: 'trial', displayName: 'Trial', priceMonthly: 0, priceYearly: 0, discountPercent: 0, offerText: '', trialDays: 10, featureList: ['10 Days Free Trial', 'All Features Included', 'Limited Reports'], badgeColor: '#17a2b8', isPopular: false, isActive: true },
            { _id: '2', planName: 'basic', displayName: 'Basic', priceMonthly: 2000, priceYearly: 20000, discountPercent: 0, offerText: '', trialDays: 0, featureList: ['Unlimited Reports', 'Email Support', 'All Core Features'], badgeColor: '#007bff', isPopular: false, isActive: true },
            { _id: '3', planName: 'premium', displayName: 'Premium', priceMonthly: 5000, priceYearly: 50000, discountPercent: 0, offerText: '', trialDays: 0, featureList: ['Everything in Basic', 'Priority Support', 'Advanced Analytics', 'Custom Branding'], badgeColor: '#f5af19', isPopular: true, isActive: true }
          ];
        }
      }
    });
  }

  loadSubscriptions(showLoading = true): void {
    if (showLoading) {
      this.loading = true;
    }
    this.error = '';

    const apiUrl = `${environment.apiUrl}/lab-management/labs`;
    const token = localStorage.getItem('token');

    this.http.get<any>(apiUrl, {
      headers: { Authorization: `Bearer ${token}` }
    }).pipe(
      timeout(15000),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        const labs = response.labs || [];
        // Cache for instant load next time
        sessionStorage.setItem('superadmin_labs', JSON.stringify(labs));
        this.dataLoaded = true;
        this.processLabs(labs);
        this.calculateStats();
        this.applyFilters();
        this.loading = false;
      },
      error: (error) => {
        if (error.name === 'TimeoutError') {
          this.error = 'Server is slow. Please try again.';
        } else {
          this.error = error.error?.message || 'Failed to load subscriptions';
        }
        this.loading = false;
      }
    });
  }

  processLabs(labs: any[]): void {
    this.labs = labs.map(lab => {
      const endDate = lab.subscriptionPlan === 'trial' ? lab.trialEndsAt : lab.subscriptionEndsAt;
      const daysLeft = this.calculateDaysLeft(endDate);
      
      return {
        ...lab,
        daysLeft,
        isExpiringSoon: daysLeft >= 0 && daysLeft <= 3,
        notificationSent: lab.trialNotificationSent || false
      };
    });
  }

  calculateDaysLeft(dateString: string): number {
    if (!dateString) return -1;
    const endDate = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
    const diffTime = endDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  calculateStats(): void {
    this.totalTrialLabs = this.labs.filter(l => l.subscriptionPlan === 'trial').length;
    this.expiringTrialLabs = this.labs.filter(l => 
      l.subscriptionPlan === 'trial' && l.isExpiringSoon && l.daysLeft >= 0
    ).length;
    this.expiredTrialLabs = this.labs.filter(l => 
      l.subscriptionPlan === 'trial' && l.daysLeft < 0
    ).length;
    this.activePaidLabs = this.labs.filter(l => 
      (l.subscriptionPlan === 'basic' || l.subscriptionPlan === 'premium') && l.daysLeft >= 0
    ).length;
  }

  applyFilters(): void {
    let filtered = [...this.labs];
    
    if (this.filterPlan !== 'all') {
      filtered = filtered.filter(l => l.subscriptionPlan === this.filterPlan);
    }
    
    if (this.filterStatus === 'expiring') {
      filtered = filtered.filter(l => l.isExpiringSoon && l.daysLeft >= 0);
    } else if (this.filterStatus === 'expired') {
      filtered = filtered.filter(l => l.daysLeft < 0);
    } else if (this.filterStatus === 'active') {
      filtered = filtered.filter(l => l.daysLeft >= 0);
    }
    
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(l =>
        l.labName.toLowerCase().includes(query) ||
        l.labCode.toLowerCase().includes(query) ||
        l.email.toLowerCase().includes(query)
      );
    }
    
    // Sort by days left (expiring first)
    filtered.sort((a, b) => a.daysLeft - b.daysLeft);
    
    this.filteredLabs = filtered;
  }

  onFilterChange(): void {
    this.applyFilters();
  }

  sendTrialEndingNotification(lab: SubscriptionLab): void {
    if (!confirm(`Send trial ending notification to ${lab.labName}?`)) {
      return;
    }

    const apiUrl = `${environment.apiUrl || 'http://localhost:3000/api'}/lab-management/labs/${lab._id}/send-trial-notification`;
    const token = localStorage.getItem('token');

    this.http.post<any>(apiUrl, {}, {
      headers: { Authorization: `Bearer ${token}` }
    }).subscribe({
      next: () => {
        alert('Notification sent successfully!');
        lab.notificationSent = true;
      },
      error: (error) => {
        alert(error.error?.message || 'Failed to send notification');
      }
    });
  }

  extendTrial(lab: SubscriptionLab): void {
    const days = prompt('Enter number of days to extend trial:', '7');
    if (!days || isNaN(Number(days))) return;

    const apiUrl = `${environment.apiUrl || 'http://localhost:3000/api'}/lab-management/labs/${lab._id}/extend-trial`;
    const token = localStorage.getItem('token');

    this.http.put<any>(apiUrl, { days: Number(days) }, {
      headers: { Authorization: `Bearer ${token}` }
    }).subscribe({
      next: () => {
        alert('Trial extended successfully!');
        this.loadSubscriptions();
      },
      error: (error) => {
        alert(error.error?.message || 'Failed to extend trial');
      }
    });
  }

  upgradeToPaid(lab: SubscriptionLab): void {
    const plan = prompt('Enter plan (basic/premium):', 'basic');
    if (!plan || (plan !== 'basic' && plan !== 'premium')) {
      alert('Invalid plan. Please enter "basic" or "premium".');
      return;
    }

    const apiUrl = `${environment.apiUrl || 'http://localhost:3000/api'}/lab-management/labs/${lab._id}/upgrade-plan`;
    const token = localStorage.getItem('token');

    this.http.put<any>(apiUrl, { plan, durationMonths: 12 }, {
      headers: { Authorization: `Bearer ${token}` }
    }).subscribe({
      next: () => {
        alert('Lab upgraded successfully!');
        this.loadSubscriptions();
      },
      error: (error) => {
        alert(error.error?.message || 'Failed to upgrade lab');
      }
    });
  }

  formatDate(dateString: string): string {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  getDaysLeftClass(daysLeft: number): string {
    if (daysLeft < 0) return 'text-danger';
    if (daysLeft <= 3) return 'text-warning';
    return 'text-success';
  }

  getPlanBadgeClass(plan: string): string {
    switch (plan) {
      case 'trial': return 'badge-info';
      case 'basic': return 'badge-primary';
      case 'premium': return 'badge-gold';
      default: return 'badge-secondary';
    }
  }
}

