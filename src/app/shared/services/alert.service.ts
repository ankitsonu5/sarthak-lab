import { Injectable } from '@angular/core';

export interface AlertConfig {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  autoHide?: boolean;
  autoHideDelay?: number;
  showCloseButton?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AlertService {
  private currentAlert: HTMLElement | null = null;

  constructor() { }

  /**
   * Show success alert
   */
  showSuccess(title: string, message: string, options?: Partial<AlertConfig>): void {
    this.showAlert({
      type: 'success',
      title,
      message,
      autoHide: true,
      autoHideDelay: 3000,
      showCloseButton: true,
      ...options
    });
  }

  /**
   * Show error alert
   */
  showError(title: string, message: string, options?: Partial<AlertConfig>): void {
    this.showAlert({
      type: 'error',
      title,
      message,
      autoHide: true, // Error alerts should not auto-hide by default
      autoHideDelay: 3000,
      showCloseButton: true,
      ...options
    });
  }

  /**
   * Show warning alert
   */
  showWarning(title: string, message: string, options?: Partial<AlertConfig>): void {
    this.showAlert({
      type: 'warning',
      title,
      message,
      autoHide: true,
      autoHideDelay: 4000,
      showCloseButton: true,
      ...options
    });
  }

  /**
   * Show info alert
   */
  showInfo(title: string, message: string, options?: Partial<AlertConfig>): void {
    this.showAlert({
      type: 'info',
      title,
      message,
      autoHide: true,
      autoHideDelay: 4000,
      showCloseButton: true,
      ...options
    });
  }

  /**
   * Show custom alert
   */
  showAlert(config: AlertConfig): void {
    this.hideAlert(); // Hide any existing alert first
    this.createAlert(config);
  }

  /**
   * Hide current alert
   */
  hideAlert(): void {
    if (this.currentAlert) {
      this.currentAlert.remove();
      this.currentAlert = null;
    }
  }

  /**
   * Create and display alert element
   */
  private createAlert(config: AlertConfig): void {
    // Create alert container
    const alertContainer = document.createElement('div');
    alertContainer.className = `alert-container alert-${config.type}`;

    // Add styles
    this.addAlertStyles();

    // Create alert content
    alertContainer.innerHTML = `
      <div class="alert-content">
        ${config.showCloseButton !== false ? '<button class="close-btn" onclick="this.parentElement.parentElement.remove()">×</button>' : ''}
        <div class="alert-icon">
          <span class="icon-emoji">${this.getAlertIcon(config.type)}</span>
        </div>
        <div class="alert-body">
          ${config.title ? `<h4 class="alert-title">${config.title}</h4>` : ''}
          ${config.message ? `<p class="alert-message">${config.message}</p>` : ''}
        </div>
      </div>
      ${config.autoHide !== false ? `<div class="progress-bar"><div class="progress-fill" style="animation-duration: ${config.autoHideDelay || 4000}ms;"></div></div>` : ''}
    `;

    // Add to document
    document.body.appendChild(alertContainer);
    this.currentAlert = alertContainer;

    // Auto-hide if enabled
    if (config.autoHide !== false) {
      setTimeout(() => {
        this.hideAlert();
      }, config.autoHideDelay || 4000);
    }
  }

  /**
   * Get alert icon based on type
   */
  private getAlertIcon(type: string): string {
    switch (type) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      default: return 'ℹ️';
    }
  }

  /**
   * Add CSS styles for alerts
   */
  private addAlertStyles(): void {
    if (document.getElementById('alert-styles')) return;

    const style = document.createElement('style');
    style.id = 'alert-styles';
    style.textContent = `
      .alert-container {
        position: fixed;
        top: 20px;
        right: 20px;
        min-width: 350px;
        max-width: 450px;
        z-index: 10000;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
        backdrop-filter: blur(10px);
        animation: slideInFromRight 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.2);
      }

      @keyframes slideInFromRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }

      .alert-content {
        padding: 20px;
        display: flex;
        align-items: flex-start;
        gap: 15px;
        position: relative;
      }

      .close-btn {
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(255, 0, 0, 0.2);
        border: none;
        border-radius: 50%;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: rgba(255, 6, 6, 0.8);
        font-size: 16px;
        transition: all 0.2s ease;
      }

      .close-btn:hover {
        background: rgba(255, 17, 17, 0.36);
        color: rgba(255, 6, 6, 0.8);
        transform: scale(1.01,1.01);
      }

      .alert-icon {
        flex-shrink: 0;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.2);
        backdrop-filter: blur(5px);
      }

      .icon-emoji {
        font-size: 20px;
        animation: bounce 0.6s ease-in-out;
      }

      @keyframes bounce {
        0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
        40% { transform: translateY(-8px); }
        60% { transform: translateY(-4px); }
      }

      .alert-body {
        flex: 1;
      }

      .alert-title {
        margin: 0 0 8px 0;
        font-size: 16px;
        font-weight: 600;
        line-height: 1.3;
      }

      .alert-message {
        margin: 0;
        font-size: 14px;
        line-height: 1.5;
        opacity: 0.95;
        white-space: pre-line;
      }

      .progress-bar {
        height: 3.5px;
        background: rgba(0, 0, 0, 0.1);
        overflow: hidden;
      }

      .progress-fill {
        height: 100%;
        background: rgba(251, 0, 117, 0.5);
        width: 100%;
        animation: progressShrink linear;
        transform-origin: left;
      }

      @keyframes progressShrink {
        from { transform: scaleX(1); }
        to { transform: scaleX(0); }
      }

      .alert-success {
        background: #d1f2c4;
        border: 1px solid #34d399;
        border-left: 4px solid #34d399;
        color: #065f46;
      }

      .alert-success .alert-title {
        color: #065f46;
        font-weight: 600;
      }

      .alert-success .alert-message {
        color: #047857;
        opacity: 0.9;
      }

      .alert-error {
        background: #f0cccc;
        border: 1px solid #f87171;
        border-left: 4px solid #f87171;
        color: #7f1d1d;
      }

      .alert-error .alert-title {
        color: #7f1d1d;
        font-weight: 600;
      }

      .alert-error .alert-message {
        color: #991b1b;
        opacity: 0.9;
      }

      .alert-warning {
        background: linear-gradient(135deg, #ffebc9 0%, #ffe9d1 100%);
        border: 1px solid #fbbf24;
        border-left: 4px solid #fbbf24;
        color: #78350f;
      }

      .alert-warning .alert-title {
        color: #78350f;
        font-weight: 600;
      }

      .alert-warning .alert-message {
        color: #92400e;
        opacity: 0.9;
      }

      .alert-info {
        background: #bfdcef;
        border: 1px solid #60a5fa;
        border-left: 4px solid #60a5fa;
        color: #1e3a8a;
      }

      .alert-info .alert-title {
        color: #1e3a8a;
        font-weight: 600;
      }

      .alert-info .alert-message {
        color: #1e40af;
        opacity: 0.9;
      }

      /* Progress bar colors for each alert type */
      .alert-success .progress-bar {
        background: #d1f2c4;
      }

      .alert-success .progress-fill {
        background: #34d399;
      }

      .alert-error .progress-bar {
        background: #f0cccc;
      }

      .alert-error .progress-fill {
        background: #f87171;
      }

      .alert-warning .progress-bar {
        background: linear-gradient(135deg, #ffebc9 0%, #ffe9d1 100%);
      }

      .alert-warning .progress-fill {
        background: #fbbf24;
      }

      .alert-info .progress-bar {
       background: #bfdcef;
      }

      .alert-info .progress-fill {
        background: #60a5fa;
      }

      @media (max-width: 768px) {
        .alert-container {
          right: 10px;
          left: 10px;
          min-width: auto;
          max-width: none;
        }

        .alert-content {
          padding: 16px;
          gap: 12px;
        }

        .alert-title {
          font-size: 15px;
        }

        .alert-message {
          font-size: 13px;
        }
      }

      .alert-container:hover {

        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
        transition: all 0.3s ease;
      }

      /* Center-blocking modal */
      .alert-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,0.45);
        display: flex; align-items: center; justify-content: center;
        z-index: 10001; backdrop-filter: blur(1.5px);
      }
      .alert-modal {
        width: min(520px, 92vw); border-radius: 14px; overflow: hidden;
        background: #fff; box-shadow: 0 16px 50px rgba(0,0,0,0.25);
        animation: popIn 0.18s ease-out;
        border: 1px solid #e5e7eb;
      }
      @keyframes popIn { from { transform: scale(.96); opacity:.6 } to { transform: scale(1); opacity:1 } }
      .alert-modal-header { padding: 14px 18px; display:flex; gap:10px; align-items:center; border-bottom:1px solid #f3f4f6; }
      .alert-modal-header.error { background:#fee2e2; color:#991b1b; }
      .alert-modal-header.info { background:#dbeafe; color:#1e40af; }
      .alert-modal-header.warning { background:#fef3c7; color:#92400e; }
      .alert-modal-title { margin:0; font-size:16px; font-weight:700; }
      .alert-modal-body { padding: 16px 18px; color:#374151; font-size:14px; white-space:pre-line; }
      .alert-modal-actions { padding: 12px 18px; display:flex; justify-content:flex-end; gap:10px; background:#fafafa; border-top:1px solid #f3f4f6; }
      .btn-ok { background:#2563eb; color:#fff; border:none; border-radius:8px; padding:8px 14px; font-weight:600; }
      .btn-ok:focus { outline:2px solid #93c5fd; outline-offset:2px; }
    `;

    document.head.appendChild(style);
  }

  /**
   * Convenience methods for common scenarios
   */

  // Registration success
  showRegistrationSuccess(entityName: string = 'Record'): void {
    this.showSuccess(
      '🎉 Registration Successful!',
      `${entityName} has been registered successfully.`
    );
  }

  // Update success
  showUpdateSuccess(entityName: string = 'Record'): void {
    this.showSuccess(
      '✅ Update Successful!',
      `${entityName} has been updated successfully.`
    );
  }

  // Delete success
  showDeleteSuccess(entityName: string = 'Record'): void {
    this.showSuccess(
      '🗑️ Delete Successful!',
      `${entityName} has been deleted successfully.`
    );
  }

  // Validation error
  showValidationError(message: string = 'Please check the form and try again.'): void {
    this.showError(
      '❌ Validation Error',
      message
    );
  }

  // Network error
  showNetworkError(): void {
    this.showError(
      '🌐 Network Error',
      'Unable to connect to the server. Please check your internet connection and try again.'
    );
  }

  // Receipt already registered error
  showReceiptAlreadyRegistered(): void {
    this.showError(
      '❌ Receipt Already Registered',
      'This receipt number is already registered for pathology tests. Please use a different receipt number.'
    );
  }


  /**
   * Blocking center modal: returns Promise resolved on OK only
   */
  showBlocking(title: string, message: string, type: 'error'|'info'|'warning'|'success' = 'error'): Promise<void> {
    this.addAlertStyles();
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'alert-overlay';
      // Block only background clicks; let button clicks work normally
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          e.preventDefault();
          e.stopPropagation();
        }
      });

      const modal = document.createElement('div');
      modal.className = 'alert-modal';
      modal.innerHTML = `
        <div class="alert-modal-header ${type}">
          <span>${this.getAlertIcon(type)}</span>
          <h4 class="alert-modal-title">${title}</h4>
        </div>
        <div class="alert-modal-body">${message}</div>
        <div class="alert-modal-actions">
          <button class="btn-ok" id="alert-ok-btn">OK</button>
        </div>
      `;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      const okBtn = modal.querySelector('#alert-ok-btn') as HTMLButtonElement | null;
      const cleanup = () => { overlay.remove(); resolve(); };
      okBtn?.addEventListener('click', cleanup);
      // Trap Enter to OK; disable Esc/outside click
      overlay.addEventListener('keydown', (ev: KeyboardEvent) => {
        if (ev.key === 'Enter') { ev.preventDefault(); okBtn?.click(); }
        ev.stopPropagation();
      });
      okBtn?.focus();
    });
  }

  showBlockingError(title: string, message: string): Promise<void> {
    return this.showBlocking(title, message, 'error');
  }

  // No pathology tests error
  showNoPathologyTests(): void {
    this.showError(
      '❌ No Pathology Tests Found',
      'This receipt does not contain any PATHOLOGY tests. Only patients with pathology tests can be registered here.'
    );
  }

  // No tests selected warning
  showNoTestsSelected(): void {
    this.showWarning(
      '⚠️ No Tests Selected',
      'Please select at least one test before proceeding.'
    );
  }

  // Draft saved info
  showDraftSaved(): void {
    this.showInfo(
      '💾 Draft Saved',
      'Your draft has been saved successfully.'
    );
  }
}
