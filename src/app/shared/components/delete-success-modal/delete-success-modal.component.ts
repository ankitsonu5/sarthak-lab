import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import {CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';

@Component({
  selector: 'app-delete-success-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './delete-success-modal.component.html',
  styleUrls: ['./delete-success-modal.component.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class DeleteSuccessModalComponent implements OnInit, OnDestroy {
  @Input() show: boolean = false;
  @Input() title: string = 'Deleted Successfully!';
  @Input() message: string = 'Item has been deleted successfully';
  @Input() badgeText: string = 'Deletion Completed';
  @Input() autoHideDelay: number = 2000; // 2 seconds default
  @Input() showCloseButton: boolean = true;
  @Input() lottieSrc: string = 'https://lottie.host/6b85bdb6-4641-4caf-99f2-82f5f4e1944e/oQua0ovoX4.lottie';

  @Output() closed = new EventEmitter<void>();
  @Output() refreshData = new EventEmitter<void>();

  private autoHideTimeout: any;

  // Feature-detect available Lottie custom elements
  hasDotLottiePlayer = false;
  hasDotLottieWC = false;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    try {
      const ce: any = (window as any).customElements;
      if (ce && typeof ce.get === 'function') {
        this.hasDotLottiePlayer = !!ce.get('dotlottie-player');
        this.hasDotLottieWC = !!ce.get('dotlottie-wc');
      }
    } catch {}

    if (this.show && this.autoHideDelay > 0) {
      this.startAutoHide();
    }
  }

  ngOnDestroy(): void {
    this.clearAutoHide();
  }

  ngOnChanges(): void {
    if (this.show && this.autoHideDelay > 0) {
      this.startAutoHide();
    } else {
      this.clearAutoHide();
    }
  }

  private startAutoHide(): void {
    this.clearAutoHide();
    this.autoHideTimeout = setTimeout(() => {
      this.onClose();
      this.refreshData.emit();
    }, this.autoHideDelay);
  }

  private clearAutoHide(): void {
    if (this.autoHideTimeout) {
      clearTimeout(this.autoHideTimeout);
      this.autoHideTimeout = null;
    }
  }

  onClose(): void {
    this.clearAutoHide();
    this.closed.emit();
  }
}
