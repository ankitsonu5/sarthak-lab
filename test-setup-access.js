const axios = require('axios');

const testSetupAccess = async () => {
  try {
    console.log('🧪 Testing setup module access...');
    
    // Test departments
    console.log('\n📋 Testing Departments API:');
    const deptResponse = await axios.get('http://localhost:3000/api/departments/list');
    console.log('✅ Departments:', deptResponse.status, deptResponse.data.departments?.length || 0, 'departments');
    
    // Test doctors
    console.log('\n👨‍⚕️ Testing Doctors API:');
    const doctorResponse = await axios.get('http://localhost:3000/api/doctors');
    console.log('✅ Doctors:', doctorResponse.status, doctorResponse.data.doctors?.length || 0, 'doctors');
    
    // Test rooms
    console.log('\n🏠 Testing Rooms API:');
    const roomResponse = await axios.get('http://localhost:3000/api/rooms');
    console.log('✅ Rooms:', roomResponse.status, roomResponse.data.rooms?.length || 0, 'rooms');
    
    console.log('\n🎉 All APIs working! Setup module should be accessible now.');
    
  } catch (error) {
    console.error('❌ Error:', error.response?.status, error.response?.data || error.message);
  }
};

testSetupAccess();
