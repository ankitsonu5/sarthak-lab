const axios = require('axios');

const testDoctorAPI = async () => {
  try {
    console.log('🔐 Testing doctor registration API...');
    
    // First login to get token
    const loginData = {
      email: 'admin@hospital.com',
      password: 'admin123'
    };
    
    console.log('📤 Logging in...');
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', loginData);
    const token = loginResponse.data.token;
    console.log('✅ Login successful, token received');
    
    // Test doctor registration
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
      department: '507f1f77bcf86cd799439011', // Dummy department ID
      licenseNumber: 'LIC123456',
      address: {
        street: 'Test Street',
        city: 'Test City',
        state: 'Test State',
        zipCode: '123456',
        country: 'India'
      }
    };
    
    console.log('📤 Creating doctor...');
    const doctorResponse = await axios.post('http://localhost:3000/api/doctors', doctorData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Doctor created successfully!');
    console.log('👨‍⚕️ Doctor ID:', doctorResponse.data.doctor.doctorId);
    
  } catch (error) {
    console.error('❌ Error:', error.response?.status, error.response?.data || error.message);
    if (error.response?.data) {
      console.error('📋 Error details:', JSON.stringify(error.response.data, null, 2));
    }
  }
};

testDoctorAPI();
