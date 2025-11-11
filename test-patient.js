const axios = require('axios');

async function testPatientRegistration() {
  try {
    console.log('Testing patient registration...');
    
    const patientData = {
      firstName: 'Test',
      lastName: 'Patient',
      age: 25,
      gender: 'Male',
      contact: '9999999999',
      address: 'Test Address',
      city: 'Test City'
    };
    
    const response = await axios.post('http://localhost:3000/api/patients/register', patientData);
    
    console.log('✅ Patient registration successful!');
    console.log('Response:', response.data);
    
  } catch (error) {
    console.error('❌ Patient registration failed:', error.response?.data || error.message);
  }
}

async function testPatientList() {
  try {
    console.log('\nTesting patient list...');
    
    const response = await axios.get('http://localhost:3000/api/patients/list');
    
    console.log('✅ Patient list retrieved!');
    console.log('Total patients:', response.data.totalPatients);
    console.log('Patients:', response.data.patients?.length || 0);
    
  } catch (error) {
    console.error('❌ Patient list failed:', error.response?.data || error.message);
  }
}

async function runTests() {
  await testPatientRegistration();
  await testPatientList();
}

runTests();
