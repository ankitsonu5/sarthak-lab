const axios = require('axios');

const BASE_URL = 'http://103.181.200.73:3001/api/pathology-booking';

async function testPathologyAPI() {
  console.log('🧪 Testing Pathology Booking API...\n');

  try {
    // 1. Test getting test categories
    console.log('1️⃣ Testing GET /categories');
    const categoriesResponse = await axios.get(`${BASE_URL}/categories`);
    console.log('✅ Categories:', categoriesResponse.data.categories);
    console.log('');

    // 2. Test getting available tests
    console.log('2️⃣ Testing GET /tests');
    const testsResponse = await axios.get(`${BASE_URL}/tests?category=PATHOLOGY`);
    console.log(`✅ Found ${testsResponse.data.tests.length} PATHOLOGY tests`);
    console.log('Sample tests:', testsResponse.data.tests.slice(0, 3).map(t => `${t.testName} - ₹${t.price}`));
    console.log('');

    // 3. Test patient search (should return empty initially)
    console.log('3️⃣ Testing GET /patients/search');
    const searchResponse = await axios.get(`${BASE_URL}/patients/search?query=John`);
    console.log(`✅ Found ${searchResponse.data.patients.length} patients matching 'John'`);
    console.log('');

    // 4. Test creating a new patient
    console.log('4️⃣ Testing POST /patients');
    const newPatient = {
      firstName: 'John',
      lastName: 'Doe',
      phone: '9876543210',
      gender: 'Male',
      age: 35,
      address: '123 Test Street, Test City'
    };

    const patientResponse = await axios.post(`${BASE_URL}/patients`, newPatient);
    console.log('✅ Patient created:', patientResponse.data.patient.patientId);
    const createdPatient = patientResponse.data.patient;
    console.log('');

    // 5. Test creating a pathology booking
    console.log('5️⃣ Testing POST /bookings');
    const selectedTests = testsResponse.data.tests.slice(0, 3); // Select first 3 tests

    const bookingData = {
      patientId: createdPatient._id,
      selectedTests: selectedTests.map(test => ({
        testId: test._id,
        quantity: 1,
        discount: 0
      })),
      payment: {
        paidAmount: 500,
        paymentMethod: 'Cash',
        transactionId: 'TEST123'
      },
      collectionDate: new Date().toISOString().split('T')[0],
      priority: 'Normal',
      mode: 'OPD',
      clinicalHistory: 'Test patient for API verification',
      specialInstructions: 'Handle with care',
      createdBy: 'API Test'
    };

    const bookingResponse = await axios.post(`${BASE_URL}/bookings`, bookingData);
    console.log('✅ Booking created:', bookingResponse.data.booking.bookingId);
    console.log('✅ Invoice Number:', bookingResponse.data.booking.invoiceNumber);
    console.log('✅ Payment Status:', bookingResponse.data.booking.payment.paymentStatus);
    const createdBooking = bookingResponse.data.booking;
    console.log('');

    // 6. Test getting all bookings
    console.log('6️⃣ Testing GET /bookings');
    const bookingsResponse = await axios.get(`${BASE_URL}/bookings`);
    console.log(`✅ Found ${bookingsResponse.data.bookings.length} total bookings`);
    console.log('');

    // 7. Test getting booking by ID
    console.log('7️⃣ Testing GET /bookings/:id');
    const bookingByIdResponse = await axios.get(`${BASE_URL}/bookings/${createdBooking._id}`);
    console.log('✅ Booking details:', bookingByIdResponse.data.booking.bookingId);
    console.log('');

    // 8. Test getting printable bill
    console.log('8️⃣ Testing GET /bookings/:id/print');
    const printResponse = await axios.get(`${BASE_URL}/bookings/${createdBooking._id}/print`);
    console.log('✅ Bill generated for invoice:', printResponse.data.billData.invoiceNumber);
    console.log('✅ Total Amount:', printResponse.data.billData.payment.totalAmount);
    console.log('✅ Tests Count:', printResponse.data.billData.tests.length);
    console.log('');

    // 9. Test payment update
    console.log('9️⃣ Testing PUT /bookings/:id/payment');
    const paymentUpdate = {
      amount: 200,
      method: 'Card',
      transactionId: 'TEST456',
      receivedBy: 'API Test Cashier'
    };

    const paymentResponse = await axios.put(`${BASE_URL}/bookings/${createdBooking._id}/payment`, paymentUpdate);
    console.log('✅ Payment updated. New status:', paymentResponse.data.payment.paymentStatus);
    console.log('✅ Total Paid:', paymentResponse.data.payment.paidAmount);
    console.log('✅ Due Amount:', paymentResponse.data.payment.dueAmount);
    console.log('');

    // 10. Test status update
    console.log('🔟 Testing PUT /bookings/:id/status');
    const statusUpdate = {
      status: 'Sample Collected',
      updatedBy: 'API Test Lab Tech'
    };

    const statusResponse = await axios.put(`${BASE_URL}/bookings/${createdBooking._id}/status`, statusUpdate);
    console.log('✅ Status updated to:', statusResponse.data.booking.status);
    console.log('');

    console.log('🎉 All API tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`- Patient Created: ${createdPatient.patientId}`);
    console.log(`- Booking Created: ${createdBooking.bookingId}`);
    console.log(`- Invoice Generated: ${createdBooking.invoiceNumber}`);
    console.log(`- Tests Booked: ${selectedTests.length}`);
    console.log(`- Final Status: Sample Collected`);
    console.log(`- Payment Status: ${paymentResponse.data.payment.paymentStatus}`);

  } catch (error) {
    console.error('❌ API Test Error:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Error Details:', error.response.data);
    }
  }
}

// Run the test
if (require.main === module) {
  testPathologyAPI();
}

module.exports = testPathologyAPI;
