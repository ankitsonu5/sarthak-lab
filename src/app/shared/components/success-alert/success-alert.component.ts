import { Component, Input, Output, EventEmitter, CUSTOM_ELEMENTS_SCHEMA, OnInit, OnDestroy, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-success-alert',
  standalone: true,
  imports: [CommonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './success-alert.component.html',
  styleUrls: ['./success-alert.component.css']
})
export class SuccessAlertComponent implements OnInit, OnDestroy, OnChanges {
  @Input() show: boolean = false;
  @Input() title: string = '🎉 Registration Successful!';
  @Input() message: string = '';
  @Input() badgeText: string = 'Added Successfully';
  @Input() autoHideDelay: number = 2000; // 2 seconds default
  @Output() close = new EventEmitter<void>();

  private autoHideTimeout: any;

  ngOnInit(): void {
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
      this.closeAlert();
    }, this.autoHideDelay);
  }

  private clearAutoHide(): void {
    if (this.autoHideTimeout) {
      clearTimeout(this.autoHideTimeout);
      this.autoHideTimeout = null;
    }
  }

  closeAlert(): void {
    this.clearAutoHide();
    this.close.emit();
  }
}
