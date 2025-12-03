import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, Router } from '@angular/router';

import { User } from '../services/auth';

/**
 * Guards lab users from accessing main modules when subscription is not valid.
 *
 * Rules:
 * - SuperAdmin is never blocked.
 * - If no user -> redirect to login.
 * - If subscription is not valid -> redirect to My Subscription page.
 * - My Subscription page itself is always allowed so user can renew.
 */
@Injectable({ providedIn: 'root' })
export class SubscriptionGuard implements CanActivate {
  constructor(private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean | UrlTree {
    const url = state.url || '';

    // Allow direct access to auth/public routes
    if (url.startsWith('/auth') || url.startsWith('/public')) {
      return true;
    }

    // Always allow subscription page (even if expired)
    if (url.startsWith('/pathology/my-subscription')) {
      return true;
    }

    const user = this.getCurrentUser();
    if (!user) {
      return this.router.createUrlTree(['/auth/login']);
    }

    // SuperAdmin is never blocked by subscription
    if (user.role === 'SuperAdmin') {
      return true;
    }

    if (this.hasValidSubscription(user)) {
      return true;
    }

    // Subscription invalid: send user to My Subscription page
    return this.router.createUrlTree(['/pathology/my-subscription'], {
      queryParams: {
        reason: 'subscription_expired',
        redirect: url
      }
    });
  }

  private getCurrentUser(): User | null {
    try {
      const raw = localStorage.getItem('user');
      if (!raw) return null;
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  }

  private hasValidSubscription(user: User): boolean {
    const lab: any = (user as any).lab || {};
    const status: string | undefined = lab.subscriptionStatus;
    const plan: string | undefined = lab.subscriptionPlan;
    const trialEndsAt: string | undefined = lab.trialEndsAt;
    const subscriptionEndsAt: string | undefined = lab.subscriptionEndsAt;

    // Mirror back-end Lab.hasValidSubscription logic as closely as possible
    if (!status || status !== 'active') {
      return false;
    }

    // If trial plan, ensure trial not expired
    if (plan === 'trial' && trialEndsAt) {
      const trialEnd = new Date(trialEndsAt);
      if (isFinite(trialEnd.getTime()) && new Date() > trialEnd) {
        return false;
      }
    }

    if (subscriptionEndsAt) {
      const subEnd = new Date(subscriptionEndsAt);
      if (isFinite(subEnd.getTime()) && new Date() > subEnd) {
        return false;
      }
    }

    return true;
  }
}

