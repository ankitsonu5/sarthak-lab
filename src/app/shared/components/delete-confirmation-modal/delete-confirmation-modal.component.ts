import { Component, Input, Output, EventEmitter, CUSTOM_ELEMENTS_SCHEMA, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-delete-confirmation-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './delete-confirmation-modal.component.html',
  styleUrls: ['./delete-confirmation-modal.component.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class DeleteConfirmationModalComponent implements OnInit {
  @Input() show: boolean = false;
  @Input() title: string = 'Delete Confirmation';
  @Input() message: string = 'Are you sure you want to delete this item?';
  @Input() itemName: string = '';
  @Input() warningText: string = 'This action cannot be undone';
  @Input() confirming: boolean = false; // disable button while confirming

  // Visual theme: 'delete' (red) | 'save' (green) | 'warning' (amber)
  @Input() theme: 'delete' | 'save' | 'warning' = 'delete';

  // Customization inputs (safe defaults keep existing delete UX)
  @Input() confirmLabel: string = 'Delete';
  @Input() cancelLabel: string = 'Cancel';
  @Input() confirmIcon: string = 'fa-trash'; // fontawesome class suffix
  @Input() titleIcon: string = 'fa-triangle-exclamation';
  @Input() confirmClass: string = 'btn-delete'; // CSS class to style confirm button
  @Input() lottieSrc: string = 'https://lottie.host/89b4e8bd-1141-4b51-8db2-6dc41eb13933/UtXmPHXEfL.lottie';

  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  // Feature-detect available Lottie custom elements
  hasDotLottiePlayer = false;
  hasDotLottieWC = false;

  ngOnInit(): void {
    try {
      const ce: any = (window as any).customElements;
      if (ce && typeof ce.get === 'function') {
        this.hasDotLottiePlayer = !!ce.get('dotlottie-player');
        this.hasDotLottieWC = !!ce.get('dotlottie-wc');
      }
    } catch {}
  }

  onConfirm(): void { this.confirmed.emit(); }
  onCancel(): void { this.cancelled.emit(); }
}
