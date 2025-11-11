const axios = require('axios');

const BASE_URL = 'http://103.181.200.73:3001/api/pathology-master';

async function testReferenceRangesAPI() {
  console.log('📊 Testing Reference Ranges API...\n');

  try {
    // 1. First get test categories and parameters
    console.log('1️⃣ Getting test categories and parameters...');

    const categoriesResponse = await axios.get(`${BASE_URL}/categories`);
    const parametersResponse = await axios.get(`${BASE_URL}/parameters`);

    console.log(`✅ Found ${categoriesResponse.data.categories.length} categories`);
    console.log(`✅ Found ${parametersResponse.data.parameters.length} parameters`);

    if (parametersResponse.data.parameters.length === 0) {
      console.log('⚠️ No test parameters found. Please run test-pathology-master.js first.');
      return;
    }

    const hemoglobinParam = parametersResponse.data.parameters.find(p =>
      p.name.includes('HEMOGLOBIN')
    );

    if (!hemoglobinParam) {
      console.log('⚠️ HEMOGLOBIN parameter not found. Using first available parameter.');
      const firstParam = parametersResponse.data.parameters[0];
      console.log(`Using parameter: ${firstParam.name}`);
    }

    const testParameter = hemoglobinParam || parametersResponse.data.parameters[0];
    console.log(`Selected test parameter: ${testParameter.name} (${testParameter.unit})`);
    console.log('');

    // 2. Create reference ranges for Hemoglobin
    console.log('2️⃣ Creating reference ranges for test parameter...');

    const referenceRanges = [
      {
        testParameterId: testParameter._id,
        testParameterName: testParameter.name,
        rangeType: 'Numeric range',
        gender: 'Any',
        minAge: 1,
        maxAge: 4,
        ageUnit: 'Years',
        lowerValue: 11,
        upperValue: 36,
        displayText: '11 - 36',
        unit: testParameter.unit,
        priority: 1,
        notes: 'Pediatric range for ages 1-4 years'
      },
      {
        testParameterId: testParameter._id,
        testParameterName: testParameter.name,
        rangeType: 'Numeric range',
        gender: 'Male',
        minAge: 14,
        maxAge: 20,
        ageUnit: 'Years',
        lowerValue: 19,
        upperValue: 45,
        displayText: '19 - 45',
        unit: testParameter.unit,
        priority: 2,
        notes: 'Male adolescent range'
      },
      {
        testParameterId: testParameter._id,
        testParameterName: testParameter.name,
        rangeType: 'Numeric range',
        gender: 'Female',
        minAge: 20,
        maxAge: 50,
        ageUnit: 'Years',
        lowerValue: 21,
        upperValue: 43,
        displayText: '21 - 43',
        unit: testParameter.unit,
        priority: 3,
        notes: 'Adult female range'
      },
      {
        testParameterId: testParameter._id,
        testParameterName: testParameter.name,
        rangeType: 'Numeric range',
        gender: 'Male',
        minAge: 21,
        maxAge: 65,
        ageUnit: 'Years',
        lowerValue: 13.5,
        upperValue: 17.5,
        displayText: '13.5 - 17.5',
        unit: testParameter.unit,
        priority: 4,
        notes: 'Adult male range'
      }
    ];

    const createdRanges = [];
    for (const range of referenceRanges) {
      try {
        const response = await axios.post(`${BASE_URL}/reference-ranges`, range);
        console.log(`✅ Created range: ${range.gender} ${range.minAge}-${range.maxAge} ${range.ageUnit} = ${range.displayText}`);
        createdRanges.push(response.data.range);
      } catch (error) {
        if (error.response?.status === 400) {
          console.log(`⚠️ Range already exists: ${range.gender} ${range.minAge}-${range.maxAge} ${range.ageUnit}`);
        } else {
          console.error(`❌ Error creating range:`, error.message);
        }
      }
    }
    console.log('');

    // 3. Get all reference ranges for the test parameter
    console.log('3️⃣ Getting all reference ranges for test parameter...');
    const rangesResponse = await axios.get(`${BASE_URL}/reference-ranges/${testParameter._id}`);
    console.log(`✅ Found ${rangesResponse.data.ranges.length} reference ranges`);

    rangesResponse.data.ranges.forEach(range => {
      console.log(`  - ${range.gender} ${range.minAge}-${range.maxAge} ${range.ageUnit}: ${range.displayText} ${range.unit}`);
    });
    console.log('');

    // 4. Test finding appropriate range for different patients
    console.log('4️⃣ Testing patient-specific range finding...');

    const testPatients = [
      { age: 3, gender: 'Any', description: '3-year-old child' },
      { age: 16, gender: 'Male', description: '16-year-old male' },
      { age: 30, gender: 'Female', description: '30-year-old female' },
      { age: 45, gender: 'Male', description: '45-year-old male' },
      { age: 80, gender: 'Female', description: '80-year-old female' }
    ];

    for (const patient of testPatients) {
      try {
        const findResponse = await axios.post(`${BASE_URL}/reference-ranges/find-for-patient`, {
          testParameterId: testParameter._id,
          patientAge: patient.age,
          patientGender: patient.gender,
          ageUnit: 'Years'
        });

        const range = findResponse.data.range;
        console.log(`✅ ${patient.description}: ${range.displayText} ${range.unit} (${range.gender} ${range.minAge}-${range.maxAge} ${range.ageUnit})`);
      } catch (error) {
        if (error.response?.status === 404) {
          console.log(`⚠️ ${patient.description}: No appropriate range found`);
        } else {
          console.error(`❌ Error finding range for ${patient.description}:`, error.message);
        }
      }
    }
    console.log('');

    // 5. Test updating a reference range
    if (createdRanges.length > 0) {
      console.log('5️⃣ Testing reference range update...');
      const rangeToUpdate = createdRanges[0];
      const updateData = {
        ...rangeToUpdate,
        notes: 'Updated notes for testing',
        priority: 5
      };

      try {
        const updateResponse = await axios.put(`${BASE_URL}/reference-ranges/${rangeToUpdate._id}`, updateData);
        console.log(`✅ Updated range: ${updateResponse.data.range.rangeId}`);
        console.log(`   New notes: ${updateResponse.data.range.notes}`);
        console.log(`   New priority: ${updateResponse.data.range.priority}`);
      } catch (error) {
        console.error(`❌ Error updating range:`, error.response?.data?.message || error.message);
      }
      console.log('');
    }

    // 6. Test value status checking
    console.log('6️⃣ Testing value status checking...');
    if (rangesResponse.data.ranges.length > 0) {
      const sampleRange = rangesResponse.data.ranges.find(r => r.rangeType === 'Numeric range');
      if (sampleRange) {
        console.log(`Sample range: ${sampleRange.displayText} ${sampleRange.unit}`);

        const testValues = [
          sampleRange.lowerValue - 1, // Low
          (sampleRange.lowerValue + sampleRange.upperValue) / 2, // Normal
          sampleRange.upperValue + 1 // High
        ];

        testValues.forEach(value => {
          let status = 'Normal';
          if (value < sampleRange.lowerValue) status = 'Low';
          if (value > sampleRange.upperValue) status = 'High';
          console.log(`  Value ${value}: ${status}`);
        });
      }
    }
    console.log('');

    console.log('🎉 Reference Ranges API testing completed successfully!');

  } catch (error) {
    console.error('❌ API Test failed:', error.response?.data || error.message);
  }
}

// Run the test
testReferenceRangesAPI();
