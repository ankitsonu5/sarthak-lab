const axios = require('axios');

// Test multiple patient registrations to check immediate refresh
const testMultiplePatientRegistrations = async () => {
  try {
    console.log('🧪 Testing MULTIPLE patient registrations for immediate refresh...');

    // Test multiple patients
    const patients = [
      {
        firstName: 'Test1',
        lastName: 'Patient1',
        age: 25,
        ageIn: 'Years',
        gender: 'Male',
        contact: '9876543211',
        aadharNo: '123456789011',
        address: 'Test Address 1',
        city: 'Test City 1',
        post: 'Test Post 1',
        remark: 'First test patient',
        date: new Date().toISOString().split('T')[0]
      },
      {
        firstName: 'Test2',
        lastName: 'Patient2',
        age: 30,
        ageIn: 'Years',
        gender: 'Female',
        contact: '9876543212',
        aadharNo: '123456789012',
        address: 'Test Address 2',
        city: 'Test City 2',
        post: 'Test Post 2',
        remark: 'Second test patient',
        date: new Date().toISOString().split('T')[0]
      },
      {
        firstName: 'Test3',
        lastName: 'Patient3',
        age: 35,
        ageIn: 'Years',
        gender: 'Male',
        contact: '9876543213',
        aadharNo: '123456789013',
        address: 'Test Address 3',
        city: 'Test City 3',
        post: 'Test Post 3',
        remark: 'Third test patient',
        date: new Date().toISOString().split('T')[0]
      }
    ];

    // Register patients one by one with delays
    for (let i = 0; i < patients.length; i++) {
      const patientData = patients[i];
      console.log(`\n📝 Registering patient ${i + 1}:`, patientData.firstName, patientData.lastName);

      // Register patient
      const response = await axios.post('http://localhost:3000/api/patients/register', patientData);

      console.log(`✅ Patient ${i + 1} registration response:`, response.data.success ? 'SUCCESS' : 'FAILED');

      if (response.data.success) {
        console.log(`🎯 Patient ${i + 1} registered successfully!`);
        console.log(`📋 Patient ID: ${response.data.patient.patientId}`);
        console.log(`📋 MongoDB ID: ${response.data.patient._id}`);

        // Wait a moment and then fetch today's patients to verify immediate availability
        console.log(`⏳ Waiting 3 seconds before checking if patient ${i + 1} appears in lists...`);
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Check if patient appears in today's OPD list
        const opdResponse = await axios.get('http://localhost:3000/api/patients/list?todayOnly=true&page=1&limit=50');

        console.log(`📋 Total today's patients count: ${opdResponse.data.patients?.length || 0}`);

        const newPatient = opdResponse.data.patients?.find(p => p._id === response.data.patient._id);

        if (newPatient) {
          console.log(`✅ SUCCESS: Patient ${i + 1} immediately available in OPD list!`);
          console.log(`📋 Found: ${newPatient.firstName} ${newPatient.lastName}`);
        } else {
          console.log(`❌ ISSUE: Patient ${i + 1} not found in OPD list`);
          console.log('📋 Available patients:', opdResponse.data.patients?.slice(0, 5).map(p => `${p.firstName} ${p.lastName} (${p.patientId})`));
        }

        // Also check search patient endpoint
        const searchResponse = await axios.get('http://localhost:3000/api/patients/list?todayOnly=false&page=1&limit=50');

        const searchPatient = searchResponse.data.patients?.find(p => p._id === response.data.patient._id);

        if (searchPatient) {
          console.log(`✅ SUCCESS: Patient ${i + 1} immediately available in Search Patient list!`);
        } else {
          console.log(`❌ ISSUE: Patient ${i + 1} not found in Search Patient list`);
        }

      } else {
        console.log(`❌ Patient ${i + 1} registration failed:`, response.data.message);
      }

      // Wait between registrations
      if (i < patients.length - 1) {
        console.log(`\n⏳ Waiting 2 seconds before next registration...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
};

testMultiplePatientRegistrations();
