# Right Slide Alert System

A beautiful, modern alert system that slides in from the right side of the screen. Perfect for replacing traditional `alert()` dialogs with a more professional and user-friendly experience.

## Features

✨ **Beautiful Design**: Modern gradient backgrounds with smooth animations  
🎯 **Right-side Sliding**: Alerts slide in from the right side of the screen  
🎨 **Multiple Types**: Success, Error, Warning, and Info alerts with distinct colors  
⏰ **Auto-hide**: Configurable auto-hide with progress bar indicator  
📱 **Responsive**: Works perfectly on all screen sizes  
🎭 **Hover Effects**: Pauses auto-hide when user hovers over the alert  
🔧 **Easy Integration**: Simple service-based API for global usage  

## Quick Setup

### 1. Add Global Alert Container to App Component

Add the global alert container to your main app component template:

```html
<!-- In app.component.html -->
<router-outlet></router-outlet>
<app-global-alert-container></app-global-alert-container>
```

### 2. Import in App Component

```typescript
// In app.component.ts
import { GlobalAlertContainerComponent } from './shared/components';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    GlobalAlertContainerComponent,
    // ... other imports
  ],
  templateUrl: './app.component.html'
})
export class AppComponent { }
```

## Usage Examples

### Basic Usage with AlertService

```typescript
import { AlertService } from '../shared/services/alert.service';

constructor(private alertService: AlertService) {}

// Success alert
this.alertService.showSuccess('Success!', 'Operation completed successfully.');

// Error alert
this.alertService.showError('Error!', 'Something went wrong.');

// Warning alert
this.alertService.showWarning('Warning!', 'Please check your input.');

// Info alert
this.alertService.showInfo('Info', 'Here is some information.');
```

### Convenience Methods

```typescript
// Registration success
this.alertService.showRegistrationSuccess('Doctor');

// Update success
this.alertService.showUpdateSuccess('Patient Record');

// Delete success
this.alertService.showDeleteSuccess('Test Result');

// Validation error
this.alertService.showValidationError('Please fill all required fields.');

// Network error
this.alertService.showNetworkError();

// Specific pathology errors
this.alertService.showReceiptAlreadyRegistered();
this.alertService.showNoPathologyTests();
this.alertService.showNoTestsSelected();

// Draft saved
this.alertService.showDraftSaved();
```

### Custom Configuration

```typescript
// Custom alert with specific options
this.alertService.showAlert({
  type: 'success',
  title: 'Custom Alert',
  message: 'This is a custom configured alert.',
  autoHide: false,           // Don't auto-hide
  showCloseButton: true,     // Show close button
  autoHideDelay: 6000       // Custom delay (if autoHide is true)
});
```

## Replacing Traditional Alerts

### Before (Old Way)
```typescript
// ❌ Old browser alert
alert('❌ This receipt number is already registered for pathology tests. Please use a different receipt number.');

// ❌ Old browser alert
alert('Please select at least one test before proceeding');
```

### After (New Way)
```typescript
// ✅ Beautiful right-slide alert
this.alertService.showReceiptAlreadyRegistered();

// ✅ Beautiful right-slide alert
this.alertService.showNoTestsSelected();
```

## Alert Types and Colors

| Type | Color | Use Case |
|------|-------|----------|
| `success` | Green gradient | Successful operations, registrations, updates |
| `error` | Red gradient | Errors, validation failures, network issues |
| `warning` | Orange gradient | Warnings, missing data, confirmations needed |
| `info` | Blue gradient | Information, tips, general notifications |

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `type` | string | 'info' | Alert type: 'success', 'error', 'warning', 'info' |
| `title` | string | '' | Alert title text |
| `message` | string | '' | Alert message text |
| `autoHide` | boolean | true | Whether to auto-hide the alert |
| `autoHideDelay` | number | 4000 | Auto-hide delay in milliseconds |
| `showCloseButton` | boolean | true | Whether to show the close button |

## Animation Details

- **Slide In**: Smooth slide-in from right with cubic-bezier easing
- **Bounce Effect**: Subtle bounce effect on icon
- **Progress Bar**: Animated progress bar showing remaining time
- **Hover Pause**: Auto-hide pauses when user hovers over alert
- **Responsive**: Adapts to mobile screens automatically

## Integration with Existing Components

Replace all existing `alert()` calls in these components:

1. **Pathology Registration** - ✅ Ready to implement
2. **Test Entry** - Ready to implement  
3. **Doctor Registration** - Ready to implement
4. **Room Management** - Ready to implement
5. **All other components** - Ready to implement

## Benefits Over Traditional Alerts

- 🎨 **Professional Appearance**: Modern design vs browser default
- 📱 **Mobile Friendly**: Responsive vs fixed browser dialogs  
- 🎯 **Non-blocking**: Doesn't stop user interaction
- 🎭 **Customizable**: Full control over appearance and behavior
- 🔧 **Consistent**: Same look across all browsers and devices
- ⚡ **Better UX**: Smooth animations and hover effects

## Next Steps

1. Add `<app-global-alert-container></app-global-alert-container>` to app.component.html
2. Replace all `alert()` calls with `AlertService` methods
3. Test the new alert system across all components
4. Enjoy the improved user experience! 🎉
