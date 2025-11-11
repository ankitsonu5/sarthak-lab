# Shared Delete Modal Components

This document explains how to use the shared Delete Confirmation Modal and Delete Success Modal components across all components in the HMS system.

## Components

### 1. DeleteConfirmationModalComponent
A reusable modal for confirming delete operations with beautiful design and FontAwesome icons.

### 2. DeleteSuccessModalComponent  
A reusable modal for showing delete success messages with auto-hide functionality and beautiful animations.

## Installation & Usage

### Step 1: Import Components

```typescript
import { DeleteConfirmationModalComponent, DeleteSuccessModalComponent } from '../../../shared/components';

@Component({
  // ... other config
  imports: [
    CommonModule,
    FormsModule,
    DeleteConfirmationModalComponent,
    DeleteSuccessModalComponent
  ],
})
```

### Step 2: Add Properties to Component

```typescript
export class YourComponent {
  // Delete Modal Properties
  showDeleteConfirmation = false;
  showDeleteSuccess = false;
  deleteMessage = '';
  deleteSuccessMessage = '';
  itemToDelete: YourItemType | null = null;

  // Delete Methods
  deleteItem(item: YourItemType): void {
    this.itemToDelete = item;
    this.deleteMessage = `You are about to remove "${item.name}" forever. Once deleted, this cannot be restored.`;
    this.showDeleteConfirmation = true;
  }

  closeDeleteConfirmation(): void {
    this.showDeleteConfirmation = false;
    this.itemToDelete = null;
    this.deleteMessage = '';
  }

  confirmDelete(): void {
    if (this.itemToDelete) {
      this.yourService.deleteItem(this.itemToDelete._id!).subscribe({
        next: () => {
          this.deleteSuccessMessage = `"${this.itemToDelete!.name}" deleted successfully!`;
          this.showDeleteSuccess = true;
          this.closeDeleteConfirmation();
        },
        error: (error) => {
          console.error('Error deleting item:', error);
          alert('Failed to delete item. Please try again.');
          this.closeDeleteConfirmation();
        }
      });
    }
  }

  closeDeleteSuccess(): void {
    this.showDeleteSuccess = false;
    this.deleteSuccessMessage = '';
    this.cdr.detectChanges();
  }

  refreshData(): void {
    this.loadItems(); // Your data loading method
  }
}
```

### Step 3: Add to Template

```html
<!-- Delete Confirmation Modal -->
<app-delete-confirmation-modal
  [show]="showDeleteConfirmation"
  [message]="deleteMessage"
  [warningText]="'This action cannot be undone'"
  (confirmed)="confirmDelete()"
  (cancelled)="closeDeleteConfirmation()">
</app-delete-confirmation-modal>

<!-- Delete Success Modal -->
<app-delete-success-modal
  [show]="showDeleteSuccess"
  [title]="'Item Deleted!'"
  [message]="deleteSuccessMessage"
  [badgeText]="'Deletion Completed'"
  [autoHideDelay]="2000"
  (closed)="closeDeleteSuccess()"
  (refreshData)="refreshData()">
</app-delete-success-modal>
```

## Component Properties

### DeleteConfirmationModalComponent

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| show | boolean | false | Controls modal visibility |
| title | string | 'Delete Confirmation' | Modal title |
| message | string | 'Are you sure...' | Confirmation message |
| warningText | string | 'This action cannot be undone' | Warning badge text |

### DeleteSuccessModalComponent

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| show | boolean | false | Controls modal visibility |
| title | string | 'Deleted Successfully!' | Success title |
| message | string | 'Item has been deleted...' | Success message |
| badgeText | string | 'Deletion Completed' | Badge text |
| autoHideDelay | number | 2000 | Auto-hide delay in ms |
| showCloseButton | boolean | true | Show close button |

## Events

### DeleteConfirmationModalComponent
- `confirmed`: Emitted when user confirms deletion
- `cancelled`: Emitted when user cancels deletion

### DeleteSuccessModalComponent  
- `closed`: Emitted when modal is closed
- `refreshData`: Emitted when auto-hide triggers (use for data refresh)

## Components to Update

The following components should be updated to use these shared modals:

1. ✅ **Category Head Registration** - Already implemented
2. ✅ **Search Department** - Already implemented  
3. **Room Registration**
4. **Search Room**
5. **Search Doctor**
6. **Service Head**
7. **Search Service**
8. **Doctor Room Directory**
9. **OPD** (if applicable)

## Benefits

- ✨ **Consistent Design**: All delete operations have the same beautiful UI
- 🚀 **Better UX**: Smooth animations and auto-hide functionality
- 🔧 **Easy Maintenance**: Single source of truth for delete modals
- 📱 **Responsive**: Works on all screen sizes
- ♿ **Accessible**: Proper ARIA labels and keyboard navigation
