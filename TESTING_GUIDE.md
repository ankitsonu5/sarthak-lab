# Testing Guide - Unified Report by Receipt Number

## Quick Test Steps

### 1. Test Creating a New Report with Multiple Tests

**Steps:**
1. Go to Pathology Registration
2. Create a new registration with multiple tests (e.g., CBC, Blood Sugar, Lipid Profile)
3. Note the Receipt Number (e.g., "131")
4. Go to Test Report page
5. Enter the Receipt Number and press Enter
6. **Expected Result**: All tests for that receipt should load in a single unified report

### 2. Test Duplicate Prevention

**Steps:**
1. Use the same Receipt Number from Test 1
2. Fill in the test results
3. Click "Save Only" or "Save & Print"
4. **Expected Result**: Report should save successfully
5. Try to generate report again with the same Receipt Number
6. **Expected Result**: Should show warning "Report already generated for this receipt number!" and navigate to All Reports page

### 3. Test Viewing Unified Report

**Steps:**
1. Go to All Reports page
2. Find the report you just created
3. Click "View" or "Edit"
4. **Expected Result**: Should show all tests for that receipt in one unified view

### 4. Test Editing Unified Report

**Steps:**
1. From All Reports, click "Edit" on a report
2. Modify some test results
3. Click "Update Report"
4. **Expected Result**: All tests should be updated and saved together

### 5. Test Printing Unified Report

**Steps:**
1. Open a report with multiple tests
2. Click "Print Report"
3. **Expected Result**: Print preview should show all tests in one document

## Backend API Testing

### Test GET `/pathology-reports`
```bash
curl http://localhost:3000/api/pathology-reports
```
**Expected**: Reports should be grouped by receiptNo

### Test GET `/pathology-reports/by-receipt/:receiptNo`
```bash
curl http://localhost:3000/api/pathology-reports/by-receipt/131
```
**Expected**: Should return unified report with all tests for receipt 131

### Test GET `/pathology-reports/:id`
```bash
curl http://localhost:3000/api/pathology-reports/[reportId]
```
**Expected**: Should return report with all tests merged by receiptNo

## Edge Cases to Test

### 1. Receipt with Single Test
- Create registration with only one test
- Generate report
- **Expected**: Should work normally, no issues

### 2. Receipt with No Tests
- Try to generate report for receipt with no tests
- **Expected**: Should show appropriate message

### 3. Old Reports (Before Update)
- View old reports created before this update
- **Expected**: Should still display correctly, backend merges them automatically

### 4. Multiple Users
- User A creates report for receipt 131
- User B tries to create report for same receipt
- **Expected**: User B should see warning and be prevented from creating duplicate

## Database Verification

### Check Reports Collection
```javascript
// In MongoDB Compass or Shell
db.reports.find({ receiptNo: "131" })
```
**Expected**: May see multiple documents with same receiptNo (old data), but frontend/backend merge them

### Check for Duplicates
```javascript
db.reports.aggregate([
  { $match: { reportType: "pathology" } },
  { $group: { _id: "$receiptNo", count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } }
])
```
**Expected**: Shows receipts with multiple reports (these will be merged in display)

## Performance Testing

### Test with Large Dataset
1. Create 100+ pathology registrations
2. Generate reports for all
3. Navigate to All Reports page
4. **Expected**: Should load quickly with grouped reports

### Test Pagination
1. With many reports, test pagination
2. **Expected**: Pagination should work correctly with grouped reports

## Troubleshooting

### Issue: Reports not merging
**Solution**: Check that reports have the same `receiptNo` value (exact match)

### Issue: Duplicate reports still being created
**Solution**: 
- Check backend duplicate prevention logic
- Verify `/by-receipt/:receiptNo` endpoint is working
- Check frontend duplicate check in `saveReport()` method

### Issue: Old reports not displaying
**Solution**: 
- Check that `reportType: 'pathology'` is set correctly
- Verify backend merging logic in GET endpoints

## Success Criteria

✅ All tests with same receiptNo appear in one unified report
✅ Duplicate reports cannot be created for same receipt
✅ Editing updates all tests together
✅ Printing shows all tests in one document
✅ Old reports still work correctly
✅ Performance is acceptable with large datasets
✅ No data loss or corruption

## Rollback Plan

If issues occur:
1. The changes are backward compatible
2. Old reports will still work
3. Can revert backend changes by restoring `pathologyReports.js`
4. Can revert frontend changes by restoring `test-report.component.ts`
5. No database migration needed, so no data cleanup required

