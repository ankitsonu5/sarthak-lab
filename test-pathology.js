const axios = require('axios');

// Test pathology creation
const testPathologyCreation = async () => {
  try {
    console.log('🧪 Testing pathology test creation...');
    
    const pathologyData = {
      patient: '686a28e464231b4742b59991', // Real patient ID
      doctor: '686a322c7dab00e5f08315cf', // Real doctor/room ID
      testCategory: 'PATHOLOGY',
      testType: 'Blood Test',
      selectedTests: [
        {
          testName: 'Complete Blood Count (CBC)',
          testType: 'Blood Test',
          price: 300,
          description: 'Complete blood count with differential',
          parameters: [
            { parameterName: 'Hemoglobin', normalRange: '12-16 g/dL', unit: 'g/dL', isRequired: true },
            { parameterName: 'WBC Count', normalRange: '4000-11000 /μL', unit: '/μL', isRequired: true }
          ]
        }
      ],
      testNames: 'Complete Blood Count (CBC)',
      collectionDate: new Date(),
      status: 'Pending',
      mode: 'OPD',
      cost: 300,
      totalCost: 300,
      isPaid: false,
      remarks: 'Test pathology creation'
    };
    
    console.log('📋 Sending pathology data:', pathologyData);
    
    const response = await axios.post('http://localhost:3000/api/pathology', pathologyData);
    
    console.log('✅ Response:', response.data);
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
};

testPathologyCreation();
