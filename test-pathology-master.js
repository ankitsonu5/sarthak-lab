const axios = require('axios');

const BASE_URL = 'http://103.181.200.73:3001/api/pathology-master';

async function testPathologyMasterAPI() {
  console.log('🧪 Testing Pathology Master API...\n');

  try {
    // 1. Test creating test categories
    console.log('1️⃣ Testing POST /categories - Creating test categories');

    const categories = [
      { name: 'BIOCHEMISTRY', description: 'Blood chemistry tests', isActive: true },
      { name: 'HEMATOLOGY', description: 'Blood cell analysis', isActive: true },
      { name: 'URINE ANALYSIS', description: 'Urine examination tests', isActive: true },
      { name: 'SEROLOGY', description: 'Antibody and antigen tests', isActive: true }
    ];

    const createdCategories = [];
    for (const category of categories) {
      try {
        const response = await axios.post(`${BASE_URL}/categories`, category);
        console.log(`✅ Created category: ${response.data.category.name} (${response.data.category.categoryId})`);
        createdCategories.push(response.data.category);
      } catch (error) {
        if (error.response?.status === 400) {
          console.log(`⚠️ Category ${category.name} already exists`);
        } else {
          console.error(`❌ Error creating category ${category.name}:`, error.message);
        }
      }
    }
    console.log('');

    // 2. Test getting all categories
    console.log('2️⃣ Testing GET /categories');
    const categoriesResponse = await axios.get(`${BASE_URL}/categories`);
    console.log(`✅ Found ${categoriesResponse.data.categories.length} categories`);
    console.log('Categories:', categoriesResponse.data.categories.map(c => `${c.name} (${c.categoryId})`));
    console.log('');

    // 3. Test creating test parameters
    console.log('3️⃣ Testing POST /parameters - Creating test parameters');

    const biochemistryCategory = categoriesResponse.data.categories.find(c => c.name === 'BIOCHEMISTRY');
    const hematologyCategory = categoriesResponse.data.categories.find(c => c.name === 'HEMATOLOGY');

    if (biochemistryCategory && hematologyCategory) {
      const parameters = [
        {
          name: 'HEMOGLOBIN',
          categoryId: hematologyCategory._id,
          unit: 'g/dL',
          sampleType: 'Blood',
          normalRanges: {
            male: { min: 13.5, max: 17.5 },
            female: { min: 12.0, max: 15.5 },
            child: { min: 11.0, max: 14.0 }
          },
          testMethod: 'Automated Hematology Analyzer',
          isActive: true
        },
        {
          name: 'GLUCOSE FASTING',
          categoryId: biochemistryCategory._id,
          unit: 'mg/dL',
          sampleType: 'Blood',
          normalRanges: {
            male: { min: 70, max: 100 },
            female: { min: 70, max: 100 },
            child: { min: 60, max: 100 }
          },
          testMethod: 'Glucose Oxidase Method',
          isActive: true
        },
        {
          name: 'TOTAL CHOLESTEROL',
          categoryId: biochemistryCategory._id,
          unit: 'mg/dL',
          sampleType: 'Serum',
          normalRanges: {
            male: { min: 0, max: 200 },
            female: { min: 0, max: 200 },
            child: { min: 0, max: 170 }
          },
          testMethod: 'Enzymatic Method',
          isActive: true
        }
      ];

      for (const parameter of parameters) {
        try {
          const response = await axios.post(`${BASE_URL}/parameters`, parameter);
          console.log(`✅ Created parameter: ${response.data.parameter.name} (${response.data.parameter.parameterId})`);
        } catch (error) {
          if (error.response?.status === 400) {
            console.log(`⚠️ Parameter ${parameter.name} already exists`);
          } else {
            console.error(`❌ Error creating parameter ${parameter.name}:`, error.message);
          }
        }
      }
    }
    console.log('');

    // 4. Test getting all parameters
    console.log('4️⃣ Testing GET /parameters');
    const parametersResponse = await axios.get(`${BASE_URL}/parameters`);
    console.log(`✅ Found ${parametersResponse.data.parameters.length} parameters`);
    parametersResponse.data.parameters.forEach(p => {
      console.log(`  - ${p.name} (${p.parameterId}) - ${p.unit} - Category: ${p.categoryId?.name || 'Unknown'}`);
    });
    console.log('');

    // 5. Test getting parameters by category
    if (biochemistryCategory) {
      console.log('5️⃣ Testing GET /parameters/category/:categoryId');
      const categoryParametersResponse = await axios.get(`${BASE_URL}/parameters/category/${biochemistryCategory._id}`);
      console.log(`✅ Found ${categoryParametersResponse.data.parameters.length} parameters for BIOCHEMISTRY category`);
      categoryParametersResponse.data.parameters.forEach(p => {
        console.log(`  - ${p.name} (${p.parameterId}) - ${p.unit}`);
      });
      console.log('');
    }

    // 6. Test updating a category
    if (createdCategories.length > 0) {
      console.log('6️⃣ Testing PUT /categories/:id - Updating category');
      const categoryToUpdate = createdCategories[0];
      const updateData = {
        name: categoryToUpdate.name,
        description: 'Updated description for testing',
        isActive: true
      };

      try {
        const updateResponse = await axios.put(`${BASE_URL}/categories/${categoryToUpdate._id}`, updateData);
        console.log(`✅ Updated category: ${updateResponse.data.category.name}`);
        console.log(`   Description: ${updateResponse.data.category.description}`);
      } catch (error) {
        console.error(`❌ Error updating category:`, error.response?.data?.message || error.message);
      }
      console.log('');
    }

    console.log('🎉 Pathology Master API testing completed successfully!');

  } catch (error) {
    console.error('❌ API Test failed:', error.response?.data || error.message);
  }
}

// Run the test
testPathologyMasterAPI();
