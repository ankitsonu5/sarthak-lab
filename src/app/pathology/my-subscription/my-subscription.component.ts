import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, timeout } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

declare var Razorpay: any;

interface SubscriptionPlan {
  _id: string;
  planName: string;
  displayName: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  discountPercent: number;
  offerText: string;
  trialDays: number;
  featureList: string[];
  badgeColor: string;
  isPopular: boolean;
}

interface SubscriptionInfo {
  subscriptionPlan: string;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  subscriptionEndsAt: string | null;
  labName: string;
  labCode: string;
}

@Component({
  selector: 'app-my-subscription',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './my-subscription.component.html',
  styleUrls: ['./my-subscription.component.css']
})
export class MySubscriptionComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  plans: SubscriptionPlan[] = [];
  currentSubscription: SubscriptionInfo | null = null;
  loading = true;
  processing = false;
  error = '';
  successMessage = '';

  // Billing cycle
  billingCycle: 'monthly' | 'yearly' = 'monthly';

  // User info for payment
  userEmail = '';
  userName = '';
  userPhone = '';

  // Login status
  isLoggedIn = false;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.checkLoginStatus();
  }

  checkLoginStatus(): void {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');

    if (token && user) {
      this.isLoggedIn = true;
      this.loadRazorpayScript();
      this.loadUserInfo();
      this.loadSubscriptionInfo();
      this.loadPlans();
    } else {
      this.isLoggedIn = false;
      this.loading = false;
      // Still load plans for display
      this.loadPlans();
    }
  }

  goToLogin(): void {
    this.router.navigate(['/auth/login']);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadRazorpayScript(): void {
    if (typeof Razorpay !== 'undefined') return;
    
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
  }

  loadUserInfo(): void {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    this.userEmail = user.email || '';
    this.userName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
    this.userPhone = user.phone || '';
  }

  loadSubscriptionInfo(): void {
    const token = localStorage.getItem('token');
    if (!token) return;

    this.http.get<any>(`${environment.apiUrl}/settings/subscription-info`, {
      headers: { Authorization: `Bearer ${token}` }
    }).pipe(
      timeout(15000),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        if (response.success) {
          this.currentSubscription = response.subscription;
        }
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error loading subscription:', err)
    });
  }

  loadPlans(): void {
    this.http.get<any>(`${environment.apiUrl}/subscription-plans`).pipe(
      timeout(15000),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.plans = (response.plans || []).filter((p: SubscriptionPlan) => p.planName !== 'trial');
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.error = 'Failed to load plans';
      }
    });
  }

  getPrice(plan: SubscriptionPlan): number {
    return this.billingCycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;
  }

  getDaysLeft(): number {
    if (!this.currentSubscription) return 0;
    const endDate = this.currentSubscription.subscriptionPlan === 'trial' 
      ? this.currentSubscription.trialEndsAt 
      : this.currentSubscription.subscriptionEndsAt;
    if (!endDate) return 0;
    const diff = new Date(endDate).getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  isCurrentPlan(plan: SubscriptionPlan): boolean {
    return this.currentSubscription?.subscriptionPlan === plan.planName;
  }

  subscribeToPlan(plan: SubscriptionPlan): void {
    if (this.processing) return;
    this.processing = true;
    this.error = '';

    const token = localStorage.getItem('token');
    const amount = this.getPrice(plan) * 100; // Razorpay expects paise

    // Create order on backend
    this.http.post<any>(`${environment.apiUrl}/payments/create-order`, {
      planId: plan._id,
      planName: plan.planName,
      amount: amount,
      billingCycle: this.billingCycle
    }, {
      headers: { Authorization: `Bearer ${token}` }
    }).pipe(
      timeout(30000),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        if (response.success) {
          this.openRazorpayCheckout(response.order, plan);
        } else {
          this.error = response.message || 'Failed to create order';
          this.processing = false;
        }
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to create order';
        this.processing = false;
      }
    });
  }

  openRazorpayCheckout(order: any, plan: SubscriptionPlan): void {
    const options = {
      key: order.razorpayKeyId,
      amount: order.amount,
      currency: order.currency || 'INR',
      name: 'Lab Book Pathology',
      description: `${plan.displayName} Plan - ${this.billingCycle === 'yearly' ? 'Yearly' : 'Monthly'}`,
      order_id: order.orderId,
      prefill: {
        name: this.userName,
        email: this.userEmail,
        contact: this.userPhone
      },
      theme: {
        color: '#1e3a5f'
      },
      handler: (response: any) => {
        this.verifyPayment(response, plan);
      },
      modal: {
        ondismiss: () => {
          this.processing = false;
          this.cdr.detectChanges();
        }
      }
    };

    try {
      const rzp = new Razorpay(options);
      rzp.on('payment.failed', (response: any) => {
        this.error = response.error?.description || 'Payment failed';
        this.processing = false;
        this.cdr.detectChanges();
      });
      rzp.open();
    } catch (e) {
      this.error = 'Failed to open payment gateway';
      this.processing = false;
    }
  }

  verifyPayment(paymentResponse: any, plan: SubscriptionPlan): void {
    const token = localStorage.getItem('token');

    this.http.post<any>(`${environment.apiUrl}/payments/verify`, {
      razorpay_order_id: paymentResponse.razorpay_order_id,
      razorpay_payment_id: paymentResponse.razorpay_payment_id,
      razorpay_signature: paymentResponse.razorpay_signature,
      planName: plan.planName,
      billingCycle: this.billingCycle
    }, {
      headers: { Authorization: `Bearer ${token}` }
    }).pipe(
      timeout(30000),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.processing = false;
        if (response.success) {
          this.successMessage = `🎉 Successfully upgraded to ${plan.displayName} plan!`;
          this.loadSubscriptionInfo();
          setTimeout(() => this.successMessage = '', 5000);
        } else {
          this.error = response.message || 'Payment verification failed';
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.processing = false;
        this.error = err.error?.message || 'Payment verification failed';
        this.cdr.detectChanges();
      }
    });
  }
}

