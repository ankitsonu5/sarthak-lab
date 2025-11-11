const axios = require('axios');

async function main() {
  try {
    console.log('🔐 Logging in as SuperAdmin...');
    const login = await axios.post('http://localhost:3000/api/auth/login', {
      email: 'superadmin@hospital.com',
      password: 'superadmin123'
    });
    const token = login.data.token;
    console.log('✅ Logged in, token length:', token?.length || 0);

    console.log('📧 Sending test email to pgpinka3003@gmail.com ...');
    const res = await axios.post('http://localhost:3000/api/auth/test-email', { to: 'pgpinka3003@gmail.com' }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('📨 Test Email Response:', res.data);
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data || err.message;
    console.error('❌ Failed:', status, data);
  }
}

main();

