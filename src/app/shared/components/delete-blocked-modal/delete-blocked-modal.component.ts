import { Component, Input, Output, EventEmitter, CUSTOM_ELEMENTS_SCHEMA, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-delete-blocked-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './delete-blocked-modal.component.html',
  styleUrls: ['./delete-blocked-modal.component.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class DeleteBlockedModalComponent implements OnChanges, OnDestroy {
  @Input() show: boolean = false;
  @Input() title: string = 'Cannot Delete';
  @Input() message: string = 'This item cannot be deleted because it is being used by other records.';
  @Input() details: string[] = []; // e.g., ["Category has services", "Department has doctors"]
  @Input() badgeText: string = 'Deletion blocked due to dependencies';
  // Optional auto-hide delay (ms). When provided and show=true, modal will close automatically after delay.
  @Input() autoHideDelay: number | null = null;

  // Optional: pass full records to show quick-edit buttons
  @Input() rooms: Array<{ _id: string; roomNumber: string }> = [];
  @Input() doctors: Array<{ _id: string; name?: string; firstName?: string; lastName?: string }> = [];
  // Control visibility of OK button (kept for compatibility; template may ignore)
  @Input() showOkButton: boolean = true;

  // Emit edit intents to parent so it can navigate appropriately
  @Output() editRoom = new EventEmitter<string>();
  @Output() editDoctor = new EventEmitter<string>();
  @Output() closed = new EventEmitter<void>();

  private autoHideTimeout: any;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['show'] && this.show && this.autoHideDelay && this.autoHideDelay > 0) {
      if (this.autoHideTimeout) {
        clearTimeout(this.autoHideTimeout);
      }
      this.autoHideTimeout = setTimeout(() => this.close(), this.autoHideDelay);
    }
  }

  ngOnDestroy(): void {
    if (this.autoHideTimeout) {
      clearTimeout(this.autoHideTimeout);
    }
  }

  getDoctorDisplayName(d: { name?: string; firstName?: string; lastName?: string }): string {
    return (d.name || `${d.firstName || ''} ${d.lastName || ''}`.trim() || 'Unknown').trim();
  }

  onEditRoom(id: string): void {
    this.editRoom.emit(id);
  }

  onEditDoctor(id: string): void {
    this.editDoctor.emit(id);
  }

  close(): void {
    if (this.autoHideTimeout) {
      clearTimeout(this.autoHideTimeout);
      this.autoHideTimeout = null;
    }
    this.closed.emit();
  }
}

