# Pathology Module API Documentation

## Overview
This document describes the backend API workflow for the pathology module in the hospital management system. The API supports patient management, test booking, payment handling, and bill generation.

## Base URL
```
http://103.181.200.73:3001/api/pathology-booking
```

## Models

### 1. Patient Model (Existing)
- **patientId**: Auto-generated unique ID
- **firstName, lastName**: Required patient name
- **phone**: Required contact number
- **gender**: Male/Female/Other
- **age**: Patient age
- **address**: Patient address

### 2. PathologyBooking Model (New)
- **bookingId**: Auto-generated (PB000001)
- **invoiceNumber**: Auto-generated (INV24120001)
- **patient**: Reference to Patient
- **doctor**: Reference to Doctor (optional)
- **bookedTests**: Array of selected tests
- **payment**: Payment information with history
- **status**: Booking status
- **labInfo**: Lab/clinic details

### 3. ServiceHead Model (Existing)
- **category**: Test category (PATHOLOGY, X-RAY, etc.)
- **testName**: Name of the test
- **price**: Test price

## API Endpoints

### Patient Management

#### 1. Search Patients
```http
GET /api/pathology-booking/patients/search?query={searchTerm}
GET /api/pathology-booking/patients/search?patientId={id}
GET /api/pathology-booking/patients/search?phone={phone}
```

**Response:**
```json
{
  "success": true,
  "patients": [
    {
      "_id": "patient_id",
      "patientId": "PAT000001",
      "firstName": "John",
      "lastName": "Doe",
      "phone": "9876543210",
      "gender": "Male",
      "age": 30,
      "address": "123 Main St"
    }
  ],
  "total": 1
}
```

#### 2. Get Patient by ID
```http
GET /api/pathology-booking/patients/{id}
```

#### 3. Create New Patient
```http
POST /api/pathology-booking/patients
```

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "phone": "9876543210",
  "gender": "Male",
  "age": 30,
  "address": "123 Main St"
}
```

### Test Management

#### 4. Get Available Tests
```http
GET /api/pathology-booking/tests
GET /api/pathology-booking/tests?category=PATHOLOGY
```

**Response:**
```json
{
  "success": true,
  "tests": [
    {
      "_id": "test_id",
      "category": "PATHOLOGY",
      "testName": "Complete Blood Count (CBC)",
      "price": 300,
      "description": "Blood test description"
    }
  ],
  "total": 50
}
```

#### 5. Get Test Categories
```http
GET /api/pathology-booking/categories
```

### Booking Management

#### 6. Create Pathology Booking
```http
POST /api/pathology-booking/bookings
```

**Request Body:**
```json
{
  "patientId": "patient_object_id",
  "doctorId": "doctor_object_id",
  "selectedTests": [
    {
      "testId": "test_object_id",
      "quantity": 1,
      "discount": 0
    }
  ],
  "payment": {
    "paidAmount": 500,
    "paymentMethod": "Cash",
    "transactionId": "TXN123"
  },
  "collectionDate": "2024-12-07",
  "priority": "Normal",
  "mode": "OPD",
  "clinicalHistory": "Patient history",
  "specialInstructions": "Special notes",
  "createdBy": "Dr. Smith"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Pathology booking created successfully",
  "booking": {
    "bookingId": "PB000001",
    "invoiceNumber": "INV24120001",
    "patient": { "patientId": "PAT000001", "firstName": "John" },
    "bookedTests": [...],
    "payment": {
      "totalAmount": 1000,
      "paidAmount": 500,
      "dueAmount": 500,
      "paymentStatus": "Partial Paid"
    }
  }
}
```

#### 7. Get All Bookings
```http
GET /api/pathology-booking/bookings
GET /api/pathology-booking/bookings?page=1&limit=10
GET /api/pathology-booking/bookings?status=Booked
GET /api/pathology-booking/bookings?paymentStatus=Due
```

#### 8. Get Booking by ID
```http
GET /api/pathology-booking/bookings/{id}
```

#### 9. Get Printable Bill
```http
GET /api/pathology-booking/bookings/{id}/print
```

**Response:**
```json
{
  "success": true,
  "billData": {
    "invoiceNumber": "INV24120001",
    "bookingId": "PB000001",
    "bookingDate": "2024-12-07T10:30:00Z",
    "patient": {
      "patientId": "PAT000001",
      "name": "John Doe",
      "phone": "9876543210",
      "gender": "Male",
      "age": 30
    },
    "tests": [
      {
        "name": "Complete Blood Count (CBC)",
        "category": "PATHOLOGY",
        "price": 300,
        "quantity": 1,
        "discount": 0,
        "netAmount": 300
      }
    ],
    "payment": {
      "totalAmount": 1000,
      "paidAmount": 500,
      "dueAmount": 500,
      "paymentStatus": "Partial Paid"
    },
    "labInfo": {
      "name": "राजकीय आयुर्वेद महाविद्यालय एवं चिकित्सालय",
      "address": "चौकाघाट, वाराणसी",
      "phone": "+91-542-2307001"
    }
  }
}
```

### Payment Management

#### 10. Update Payment
```http
PUT /api/pathology-booking/bookings/{id}/payment
```

**Request Body:**
```json
{
  "amount": 300,
  "method": "Card",
  "transactionId": "TXN456",
  "receivedBy": "Cashier"
}
```

#### 11. Update Booking Status
```http
PUT /api/pathology-booking/bookings/{id}/status
```

**Request Body:**
```json
{
  "status": "Sample Collected",
  "updatedBy": "Lab Technician"
}
```

## Payment Status Types
- **Paid**: Full payment completed
- **Partial Paid**: Partial payment made, amount due remaining
- **Due**: No payment made yet

## Booking Status Types
- **Booked**: Initial booking created
- **Sample Collected**: Sample collected from patient
- **In Progress**: Tests being processed
- **Completed**: Tests completed, results ready
- **Cancelled**: Booking cancelled

## Error Responses
All endpoints return consistent error responses:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

## Setup Instructions

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Seed Pathology Tests:**
   ```bash
   node back-end/scripts/seedPathologyTests.js
   ```

3. **Start Server:**
   ```bash
   npm start
   ```

## Usage Workflow

1. **Search/Create Patient** → Get patient details
2. **Get Available Tests** → Show test catalog
3. **Create Booking** → Book tests with payment info
4. **Handle Payment** → Process full/partial payments
5. **Generate Bill** → Print invoice for patient
6. **Update Status** → Track booking progress

## Frontend Integration Example

### Angular Service Example
```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class PathologyBookingService {
  private baseUrl = 'http://103.181.200.73:3001/api/pathology-booking';

  constructor(private http: HttpClient) {}

  // Search patients
  searchPatients(query: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/patients/search?query=${query}`);
  }

  // Create new patient
  createPatient(patientData: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/patients`, patientData);
  }

  // Get available tests
  getTests(category?: string): Observable<any> {
    const url = category ? `${this.baseUrl}/tests?category=${category}` : `${this.baseUrl}/tests`;
    return this.http.get(url);
  }

  // Create booking
  createBooking(bookingData: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/bookings`, bookingData);
  }

  // Get printable bill
  getPrintableBill(bookingId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/bookings/${bookingId}/print`);
  }

  // Update payment
  updatePayment(bookingId: string, paymentData: any): Observable<any> {
    return this.http.put(`${this.baseUrl}/bookings/${bookingId}/payment`, paymentData);
  }
}
```

### Component Usage Example
```typescript
export class PathologyBookingComponent {
  selectedPatient: any = null;
  availableTests: any[] = [];
  selectedTests: any[] = [];
  totalAmount: number = 0;

  constructor(private pathologyService: PathologyBookingService) {}

  searchPatients(query: string) {
    this.pathologyService.searchPatients(query).subscribe(response => {
      this.patients = response.patients;
    });
  }

  loadTests() {
    this.pathologyService.getTests().subscribe(response => {
      this.availableTests = response.tests;
    });
  }

  addTest(test: any) {
    this.selectedTests.push({
      testId: test._id,
      testName: test.testName,
      price: test.price,
      quantity: 1,
      discount: 0
    });
    this.calculateTotal();
  }

  calculateTotal() {
    this.totalAmount = this.selectedTests.reduce((sum, test) =>
      sum + (test.price * test.quantity - test.discount), 0
    );
  }

  createBooking(paymentData: any) {
    const bookingData = {
      patientId: this.selectedPatient._id,
      selectedTests: this.selectedTests,
      payment: paymentData,
      collectionDate: new Date().toISOString().split('T')[0],
      mode: 'OPD'
    };

    this.pathologyService.createBooking(bookingData).subscribe(response => {
      console.log('Booking created:', response.booking);
      // Generate and show bill
      this.generateBill(response.booking._id);
    });
  }

  generateBill(bookingId: string) {
    this.pathologyService.getPrintableBill(bookingId).subscribe(response => {
      // Open print dialog or show bill
      this.printBill(response.billData);
    });
  }
}
```

## Testing

Run the API test script:
```bash
node test-pathology-api.js
```

This will test all endpoints and create sample data.

This API provides a complete pathology booking system with patient management, test selection, flexible payment options, and comprehensive reporting.
