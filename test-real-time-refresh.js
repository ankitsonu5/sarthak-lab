const axios = require('axios');

// Test real-time refresh functionality
const testRealTimeRefresh = async () => {
  try {
    console.log('🧪 Testing REAL-TIME refresh functionality...');
    
    // Get initial count
    console.log('\n📊 Getting initial patient count...');
    const initialResponse = await axios.get('http://localhost:3000/api/patients/list?todayOnly=true&page=1&limit=50');
    const initialCount = initialResponse.data.patients?.length || 0;
    console.log(`📊 Initial today's patients count: ${initialCount}`);
    
    // Register a new patient
    const newPatient = {
      firstName: 'RealTime',
      lastName: 'Test',
      age: 25,
      ageIn: 'Years',
      gender: 'Male',
      contact: '9999999999',
      aadharNo: '999999999999',
      address: 'Real Time Test Address',
      city: 'Test City',
      post: 'Test Post',
      remark: 'Testing real-time refresh',
      date: new Date().toISOString().split('T')[0]
    };
    
    console.log('\n📝 Registering new patient for real-time test...');
    const registrationResponse = await axios.post('http://localhost:3000/api/patients/register', newPatient);
    
    if (registrationResponse.data.success) {
      console.log('✅ Patient registered successfully!');
      console.log(`📋 Patient ID: ${registrationResponse.data.patient.patientId}`);
      console.log(`📋 MongoDB ID: ${registrationResponse.data.patient._id}`);
      
      // Immediately check if patient appears in list (simulating real-time check)
      console.log('\n⚡ IMMEDIATE CHECK: Checking if patient appears in list...');
      const immediateResponse = await axios.get('http://localhost:3000/api/patients/list?todayOnly=true&page=1&limit=50');
      const immediateCount = immediateResponse.data.patients?.length || 0;
      
      console.log(`📊 Immediate count: ${immediateCount} (was ${initialCount})`);
      
      const newPatientFound = immediateResponse.data.patients?.find(p => p._id === registrationResponse.data.patient._id);
      
      if (newPatientFound) {
        console.log('✅ SUCCESS: Patient IMMEDIATELY available in list!');
        console.log(`📋 Found: ${newPatientFound.firstName} ${newPatientFound.lastName}`);
      } else {
        console.log('❌ ISSUE: Patient NOT found in immediate check');
      }
      
      // Wait 2 seconds and check again
      console.log('\n⏳ Waiting 2 seconds for any delayed updates...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const delayedResponse = await axios.get('http://localhost:3000/api/patients/list?todayOnly=true&page=1&limit=50');
      const delayedCount = delayedResponse.data.patients?.length || 0;
      
      console.log(`📊 Delayed count: ${delayedCount}`);
      
      const delayedPatientFound = delayedResponse.data.patients?.find(p => p._id === registrationResponse.data.patient._id);
      
      if (delayedPatientFound) {
        console.log('✅ CONFIRMED: Patient available after 2 seconds');
      } else {
        console.log('❌ ISSUE: Patient still not found after 2 seconds');
      }
      
      // Test search patient endpoint too
      console.log('\n🔍 Testing Search Patient endpoint...');
      const searchResponse = await axios.get('http://localhost:3000/api/patients/list?todayOnly=false&page=1&limit=50');
      const searchPatientFound = searchResponse.data.patients?.find(p => p._id === registrationResponse.data.patient._id);
      
      if (searchPatientFound) {
        console.log('✅ SUCCESS: Patient available in Search Patient list!');
      } else {
        console.log('❌ ISSUE: Patient not found in Search Patient list');
      }
      
    } else {
      console.log('❌ Patient registration failed:', registrationResponse.data.message);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
};

// Run the test
testRealTimeRefresh();
