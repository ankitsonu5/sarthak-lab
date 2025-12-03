import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { takeUntil, timeout } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

interface SubscriptionPlan {
  _id: string;
  planName: string;
  displayName: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  discountPercent: number;
  offerText: string;
  offerValidTill: string | null;
  trialDays: number;
  featureList: string[];
  sortOrder: number;
  badgeColor: string;
  isPopular: boolean;
  isActive: boolean;
}

@Component({
  selector: 'app-plans-management',
  templateUrl: './plans-management.component.html',
  styleUrls: ['./plans-management.component.css'],
  standalone: false
})
export class PlansManagementComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  plans: SubscriptionPlan[] = [];
  loading = false;
  error = '';
  successMessage = '';
  
  // Edit modal state
  showModal = false;
  editingPlan: Partial<SubscriptionPlan> = {};
  isNewPlan = false;
  newFeature = '';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    // Load from cache first for instant display
    const cached = sessionStorage.getItem('subscription_plans');
    if (cached) {
      try {
        this.plans = JSON.parse(cached);
      } catch (e) {}
    }
    this.loadPlans();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadPlans(): void {
    // Only show loading if no cached data
    if (this.plans.length === 0) {
      this.loading = true;
    }
    this.error = '';

    const apiUrl = `${environment.apiUrl}/subscription-plans/all`;
    const token = localStorage.getItem('token');

    this.http.get<any>(apiUrl, {
      headers: { Authorization: `Bearer ${token}` }
    }).pipe(
      timeout(15000),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.plans = response.plans || [];
        // Cache for instant load next time
        sessionStorage.setItem('subscription_plans', JSON.stringify(this.plans));
        this.loading = false;
      },
      error: (error) => {
        if (error.name === 'TimeoutError') {
          this.error = 'Server is slow. Please try again.';
        } else {
          this.error = error.error?.message || 'Failed to load plans';
        }
        this.loading = false;
      }
    });
  }

  openAddPlan(): void {
    this.isNewPlan = true;
    this.editingPlan = {
      planName: '',
      displayName: '',
      description: '',
      priceMonthly: 0,
      priceYearly: 0,
      discountPercent: 0,
      offerText: '',
      offerValidTill: null,
      trialDays: 0,
      featureList: [],
      sortOrder: this.plans.length + 1,
      badgeColor: '#007bff',
      isPopular: false,
      isActive: true
    };
    this.showModal = true;
  }

  editPlan(plan: SubscriptionPlan): void {
    this.isNewPlan = false;
    this.editingPlan = { ...plan };
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.editingPlan = {};
    this.newFeature = '';
  }

  addFeature(): void {
    if (this.newFeature.trim()) {
      if (!this.editingPlan.featureList) {
        this.editingPlan.featureList = [];
      }
      this.editingPlan.featureList.push(this.newFeature.trim());
      this.newFeature = '';
    }
  }

  removeFeature(index: number): void {
    this.editingPlan.featureList?.splice(index, 1);
  }

  savePlan(): void {
    this.loading = true;
    const apiUrl = `${environment.apiUrl}/subscription-plans`;
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    const request = this.isNewPlan
      ? this.http.post<any>(apiUrl, this.editingPlan, { headers })
      : this.http.put<any>(`${apiUrl}/${this.editingPlan._id}`, this.editingPlan, { headers });

    request.pipe(
      timeout(15000),
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.successMessage = this.isNewPlan ? 'Plan created successfully!' : 'Plan updated successfully!';
        this.closeModal();
        // Clear cache to force fresh load
        sessionStorage.removeItem('subscription_plans');
        this.loadPlans();
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (error) => {
        this.loading = false;
        if (error.name === 'TimeoutError') {
          this.error = 'Server is slow. Please try again.';
        } else {
          this.error = error.error?.message || 'Failed to save plan';
        }
      }
    });
  }

  deletePlan(plan: SubscriptionPlan): void {
    if (!confirm(`Are you sure you want to delete "${plan.displayName}" plan?`)) return;

    const apiUrl = `${environment.apiUrl}/subscription-plans/${plan._id}`;
    const token = localStorage.getItem('token');

    this.http.delete<any>(apiUrl, {
      headers: { Authorization: `Bearer ${token}` }
    }).pipe(
      timeout(15000),
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.successMessage = 'Plan deleted successfully!';
        sessionStorage.removeItem('subscription_plans');
        this.loadPlans();
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (error) => {
        this.error = error.error?.message || 'Failed to delete plan';
      }
    });
  }

  toggleActive(plan: SubscriptionPlan): void {
    const apiUrl = `${environment.apiUrl}/subscription-plans/${plan._id}`;
    const token = localStorage.getItem('token');

    this.http.put<any>(apiUrl, { isActive: !plan.isActive }, {
      headers: { Authorization: `Bearer ${token}` }
    }).pipe(
      timeout(15000),
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        plan.isActive = !plan.isActive;
        sessionStorage.removeItem('subscription_plans');
        this.successMessage = `Plan ${plan.isActive ? 'activated' : 'deactivated'}!`;
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (error) => {
        this.error = error.error?.message || 'Failed to update plan';
      }
    });
  }

  seedDefaultPlans(): void {
    if (!confirm('This will reset plans to default values. Continue?')) return;

    this.loading = true;
    const apiUrl = `${environment.apiUrl}/subscription-plans/seed`;
    const token = localStorage.getItem('token');

    this.http.post<any>(apiUrl, {}, {
      headers: { Authorization: `Bearer ${token}` }
    }).pipe(
      timeout(15000),
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.successMessage = 'Default plans seeded!';
        sessionStorage.removeItem('subscription_plans');
        this.loadPlans();
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (error) => {
        this.loading = false;
        this.error = error.error?.message || 'Failed to seed plans';
      }
    });
  }
}

