const axios = require('axios');

const testLogin = async () => {
  try {
    console.log('🔐 Testing login API directly...');
    
    const loginData = {
      email: 'admin@hospital.com',
      password: 'admin123'
    };
    
    console.log('📤 Sending login request:', loginData);
    
    const response = await axios.post('http://localhost:3000/api/auth/login', loginData);
    
    console.log('✅ Login successful!');
    console.log('📧 User:', response.data.user.email);
    console.log('🎭 Role:', response.data.user.role);
    console.log('🔑 Token received:', response.data.token ? 'YES' : 'NO');
    console.log('🔑 Token length:', response.data.token?.length || 0);
    
    // Test token with profile API
    console.log('\n🔍 Testing profile API with token...');
    const profileResponse = await axios.get('http://localhost:3000/api/auth/profile', {
      headers: {
        'Authorization': `Bearer ${response.data.token}`
      }
    });
    
    console.log('✅ Profile API working!');
    console.log('👤 Profile:', profileResponse.data.email, profileResponse.data.role);
    
  } catch (error) {
    console.error('❌ Error:', error.response?.status, error.response?.data || error.message);
  }
};

testLogin();
