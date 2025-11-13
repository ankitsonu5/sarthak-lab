# Dynamic Lab Name Feature

## Overview
The system now supports **dynamic lab names** - each pathology user can set their own lab name, and it will be displayed throughout the application instead of the hardcoded "Sarthak Diagnostic Network".

## How It Works

### 1. **Setting Your Lab Name**
1. Login to your pathology account
2. Go to **Lab Setup** from the sidebar
3. Fill in the **Lab Name** field (e.g., "ABC Diagnostics", "XYZ Pathology Lab")
4. Click **Save & Preview**
5. Your lab name is now saved!

### 2. **Where Lab Name Appears**
The dynamic lab name will automatically appear in:
- ✅ **Dashboard Header** - "Your Lab Name Dashboard"
- ✅ **Pathology Dashboard** - "Your Lab Name Dashboard"
- ✅ **Admin Dashboard** - "Your Lab Name Dashboard"
- ✅ **Super Admin Dashboard** - "Your Lab Name Dashboard"
- ✅ **Lab Reports** (via lab settings)
- ✅ **Print Headers** (via lab settings)

### 3. **Multi-Lab Support**
- Each user account has its own `labSettings`
- Different pathology users can have different lab names
- When you login, your lab name is automatically loaded
- No interference between different lab accounts

## Technical Implementation

### Files Modified:

1. **Backend (Already Exists)**
   - `back-end/models/User.js` - User model has `labSettings.labName` field

2. **Frontend Services**
   - `src/app/core/services/auth.ts` - User interface updated with labSettings
   - `src/app/core/services/lab-name.service.ts` - **NEW** - Manages dynamic lab name
   - `src/app/setup/lab-setup/lab-settings.service.ts` - Updates lab name when settings saved

3. **Dashboard Components**
   - `src/app/pathology/pathology-dashboard/` - Uses dynamic lab name
   - `src/app/dashboard/dashboard/` - Uses dynamic lab name
   - `src/app/roles/super-admin-dashboard/` - Uses dynamic lab name

4. **HTML Templates**
   - All dashboard HTML files updated to use `{{ labName }}` instead of hardcoded text

### How It Works Internally:

1. **User Login** → Auth service loads user profile with `labSettings`
2. **LabNameService** → Subscribes to user changes and extracts `labSettings.labName`
3. **Dashboard Components** → Subscribe to `labName$` observable from LabNameService
4. **Real-time Updates** → When lab settings are saved, all dashboards update automatically

## Default Behavior

- **If no lab name is set**: Displays "Sarthak Diagnostic Network" (default fallback)
- **If lab name is set**: Displays your custom lab name
- **On logout**: Resets to default

## Example Usage

```typescript
// In any component
constructor(private labNameService: LabNameService) {}

ngOnInit() {
  // Subscribe to lab name changes
  this.labNameService.labName$.subscribe(name => {
    this.labName = name;
    console.log('Current lab name:', name);
  });
  
  // Or get current value directly
  const currentLabName = this.labNameService.getLabName();
}
```

## Benefits

✅ **Multi-tenant Ready** - Each lab can have its own branding
✅ **No Code Changes Needed** - Just update lab settings
✅ **Real-time Updates** - Changes reflect immediately
✅ **Backward Compatible** - Works with existing data
✅ **Centralized Management** - One place to update (Lab Setup)

## Future Enhancements

- [ ] Dynamic logo support (already in labSettings)
- [ ] Dynamic color themes per lab
- [ ] Dynamic email templates with lab name
- [ ] Dynamic SMS templates with lab name
- [ ] Lab name in PDF reports (already supported via lab settings)

---

**Created**: 2025-11-11
**Version**: 1.0
**Status**: ✅ Implemented and Working

