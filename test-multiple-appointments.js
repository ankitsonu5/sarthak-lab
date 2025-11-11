const axios = require('axios');

// Test multiple simultaneous appointments
const testMultipleAppointments = async () => {
  try {
    console.log('🧪 Testing multiple simultaneous appointments...');
    
    const appointmentPromises = [];
    
    // Create 5 simultaneous appointment requests
    for (let i = 0; i < 5; i++) {
      const appointmentData = {
        patient: '686a28e464231b4742b59991', // Real patient ID
        room: '686a322c7dab00e5f08315cf', // Real room ID
        appointmentDate: new Date(),
        appointmentTime: `${14 + i}:30`,
        reason: `Test Consultation ${i + 1}`,
        type: 'Consultation'
      };
      
      appointmentPromises.push(
        axios.post('http://localhost:3000/api/appointments/book-opd', appointmentData)
      );
    }
    
    console.log('📅 Sending 5 simultaneous requests...');
    
    const responses = await Promise.all(appointmentPromises);
    
    console.log('✅ All appointments booked successfully!');
    console.log('\n📊 Generated Appointment IDs:');
    
    responses.forEach((response, index) => {
      const appointment = response.data.appointment;
      console.log(`${index + 1}. ${appointment.appointmentId} - Time: ${appointment.appointmentTime}`);
    });
    
    // Check if IDs are sequential
    const ids = responses.map(r => r.data.appointment.appointmentId);
    const numbers = ids.map(id => parseInt(id.replace('APT', '')));
    
    console.log('\n🔢 ID Numbers:', numbers);
    
    let isSequential = true;
    for (let i = 1; i < numbers.length; i++) {
      if (numbers[i] !== numbers[i-1] + 1) {
        isSequential = false;
        break;
      }
    }
    
    if (isSequential) {
      console.log('✅ All IDs are sequential!');
    } else {
      console.log('❌ IDs are not sequential!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
};

testMultipleAppointments();
