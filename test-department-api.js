const axios = require('axios');

const testDepartmentAPI = async () => {
  try {
    console.log('🔐 Testing department API...');
    
    // First login to get token
    const loginData = {
      email: 'admin@hospital.com',
      password: 'admin123'
    };
    
    console.log('📤 Logging in...');
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', loginData);
    const token = loginResponse.data.token;
    console.log('✅ Login successful, token received');
    
    // Test department list
    console.log('📤 Getting departments...');
    const deptResponse = await axios.get('http://localhost:3000/api/departments', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ Departments loaded:', deptResponse.data.length);
    console.log('📋 First few departments:');
    deptResponse.data.slice(0, 3).forEach(dept => {
      console.log(`  📁 ${dept.name} (${dept.code}) - ID: ${dept._id}`);
    });
    
    // Now test doctor registration with valid department ID
    const validDeptId = deptResponse.data[0]._id;
    console.log('🎯 Using department ID:', validDeptId);
    
    const doctorData = {
      firstName: 'Test',
      lastName: 'Doctor',
      email: 'test.doctor@hospital.com',
      phone: '9876543210',
      dateOfBirth: '1980-01-01',
      age: 44,
      gender: 'Male',
      specialization: 'Cardiology',
      qualification: 'MBBS, MD',
      experience: 10,
      department: validDeptId,
      licenseNumber: 'LIC123456',
      address: {
        street: 'Test Street',
        city: 'Test City',
        state: 'Test State',
        zipCode: '123456',
        country: 'India'
      }
    };
    
    console.log('📤 Creating doctor with valid department...');
    const doctorResponse = await axios.post('http://localhost:3000/api/doctors', doctorData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Doctor created successfully!');
    console.log('👨‍⚕️ Doctor ID:', doctorResponse.data.doctor.doctorId);
    console.log('🏥 Department:', doctorResponse.data.doctor.department);
    
  } catch (error) {
    console.error('❌ Error:', error.response?.status, error.response?.data || error.message);
    if (error.response?.data) {
      console.error('📋 Error details:', JSON.stringify(error.response.data, null, 2));
    }
  }
};

testDepartmentAPI();
