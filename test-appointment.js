const axios = require('axios');

// Test appointment booking
const testAppointmentBooking = async () => {
  try {
    console.log('🧪 Testing appointment booking...');

    const appointmentData = {
      patient: '686a28e464231b4742b59991', // Real patient ID
      room: '686a322c7dab00e5f08315cf', // Real room ID
      appointmentDate: new Date(),
      appointmentTime: '14:30',
      reason: 'Test Consultation',
      type: 'Consultation'
    };

    console.log('📅 Sending appointment data:', appointmentData);

    const response = await axios.post('http://103.181.200.73:3001/api/appointments/book-opd', appointmentData);

    console.log('✅ Response:', response.data);

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
};

testAppointmentBooking();
