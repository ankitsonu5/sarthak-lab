const axios = require('axios');

const testData = {
  name: "SIMPLE TEST " + Date.now(),
  shortName: "675b476fe34a52b32af33e25", // ServiceHead ID
  category: "675b476fe34a52b32af33e24", // CategoryHead ID
  testType: "single",
  parameters: [
    {
      order: 1,
      name: "Test Parameter",
      unit: "mg/dL",
      inputType: "Numeric",
      defaultResult: "",
      isOptional: false
    }
  ],
  sampleType: "Blood",
  method: "Test Method",
  instrument: "Test Instrument",
  isActive: true
};

async function createTest() {
  try {
    console.log('🧪 Creating test with data:', JSON.stringify(testData, null, 2));

    const response = await axios.post('http://103.181.200.73:3001/api/pathology-master/test-definitions', testData);

    console.log('✅ Test created successfully!');
    console.log('Response:', response.data);

  } catch (error) {
    console.error('❌ Error creating test:');
    console.error('Status:', error.response?.status);
    console.error('Message:', error.response?.data?.message);
    console.error('Error:', error.response?.data?.error);
    console.error('Full response:', error.response?.data);
  }
}

createTest();
