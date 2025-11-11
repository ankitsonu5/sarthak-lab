import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { trigger, state, style, transition, animate } from '@angular/animations';

@Component({
  selector: 'app-record-exists-modal',
  standalone: true,
  imports: [CommonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './record-exists-modal.component.html',
  styleUrls: ['./record-exists-modal.component.css'],
  animations: [
    trigger('fadeInOut', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('300ms ease-in', style({ opacity: 1 }))
      ]),
      transition(':leave', [
        animate('300ms ease-out', style({ opacity: 0 }))
      ])
    ]),
    trigger('slideInOut', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.8) translateY(-20px)' }),
        animate('400ms cubic-bezier(0.25, 0.8, 0.25, 1)', 
          style({ opacity: 1, transform: 'scale(1) translateY(0)' }))
      ]),
      transition(':leave', [
        animate('300ms ease-out', 
          style({ opacity: 0, transform: 'scale(0.95) translateY(-10px)' }))
      ])
    ])
  ]
})
export class RecordExistsModalComponent implements OnInit, OnDestroy, OnChanges {
  @Input() show: boolean = false;
  @Input() title: string = 'Record Already Exists!';
  @Input() message: string = 'A record with similar information already exists in the system.';
  @Input() subMessage: string = '';
  @Input() badgeText: string = 'Duplicate Record Found';
  @Input() autoHideDelay: number = 2000; // 2 seconds default

  @Output() closed = new EventEmitter<void>();

  private autoHideTimer: any;

  ngOnInit() {
    if (this.show && this.autoHideDelay > 0) {
      this.startAutoHideTimer();
    }
  }

  ngOnDestroy() {
    this.clearAutoHideTimer();
  }

  ngOnChanges() {
    if (this.show && this.autoHideDelay > 0) {
      this.startAutoHideTimer();
    } else {
      this.clearAutoHideTimer();
    }
  }

  private startAutoHideTimer() {
    this.clearAutoHideTimer();
    this.autoHideTimer = setTimeout(() => {
      this.closeModal();
    }, this.autoHideDelay);
  }

  private clearAutoHideTimer() {
    if (this.autoHideTimer) {
      clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }
  }

  closeModal() {
    this.clearAutoHideTimer();
    this.closed.emit();
  }

  // Handle click outside modal
  onOverlayClick(event: Event) {
    if (event.target === event.currentTarget) {
      this.closeModal();
    }
  }

  // Handle escape key
  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      this.closeModal();
    }
  }
}
