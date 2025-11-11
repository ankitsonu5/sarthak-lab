const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// In-memory database seeding function
const seedInMemoryDB = async () => {
  try {
    console.log('🌱 Seeding in-memory database...');

    // Seed users
    global.inMemoryDB.users = [
      {
        _id: 'user-admin-1',
        username: 'admin',
        email: 'admin@hospital.com',
        password: await bcrypt.hash('admin123', 10),
        role: 'Admin',
        firstName: 'Admin',
        lastName: 'User',
        phone: '9999999999',
        isActive: true,
        createdAt: new Date()
      },
      {
        _id: 'user-doctor-1',
        username: 'doctor1',
        email: 'doctor1@hospital.com',
        password: await bcrypt.hash('doctor123', 10),
        role: 'Doctor',
        firstName: 'Dr. John',
        lastName: 'Smith',
        phone: '9999999998',
        isActive: true,
        createdAt: new Date()
      }
    ];

    // Seed doctors
    global.inMemoryDB.doctors = [
      {
        _id: 'doc-1',
        doctorId: 'DOC001',
        firstName: 'Dr. John',
        lastName: 'Smith',
        specialization: 'General Medicine',
        department: 'General Medicine',
        qualification: 'MBBS, MD',
        experience: 10,
        phone: '9876543210',
        email: 'doctor1@hospital.com',
        isActive: true,
        createdAt: new Date()
      },
      {
        _id: 'doc-2',
        doctorId: 'DOC002',
        firstName: 'Dr. Sarah',
        lastName: 'Johnson',
        specialization: 'Cardiology',
        department: 'Cardiology',
        qualification: 'MBBS, MD, DM',
        experience: 15,
        phone: '9876543211',
        email: 'sarah.johnson@hospital.com',
        isActive: true,
        createdAt: new Date()
      }
    ];

    // Seed patients
    global.inMemoryDB.patients = [
      {
        _id: 'pat-1',
        patientId: 'PAT000001',
        firstName: 'Rajesh',
        lastName: 'Kumar',
        age: 35,
        ageIn: 'Years',
        gender: 'Male',
        bloodGroup: 'B+',
        phone: '9876543220',
        contact: '9876543220',
        aadharNo: '123456789012',
        address: 'MG Road, Delhi',
        city: 'Delhi',
        post: 'Central Delhi',
        isActive: true,
        createdAt: new Date()
      },
      {
        _id: 'pat-2',
        patientId: 'PAT000002',
        firstName: 'Priya',
        lastName: 'Sharma',
        age: 28,
        ageIn: 'Years',
        gender: 'Female',
        bloodGroup: 'A+',
        phone: '9876543222',
        contact: '9876543222',
        aadharNo: '123456789013',
        address: 'Sector 15, Noida',
        city: 'Noida',
        post: 'Noida',
        isActive: true,
        createdAt: new Date()
      }
    ];

    // Seed appointments
    global.inMemoryDB.appointments = [
      {
        _id: 'apt-1',
        appointmentId: 'APT000001',
        patient: 'pat-1',
        doctor: 'doc-1',
        appointmentDate: new Date(),
        appointmentTime: '10:00',
        reason: 'Regular Checkup',
        type: 'Consultation',
        status: 'Scheduled',
        consultationFee: 500,
        createdAt: new Date()
      }
    ];

    console.log('✅ In-memory database seeded successfully');
  } catch (error) {
    console.error('❌ Error seeding in-memory database:', error);
  }
};

const connectDB = async () => {
  try {
    // STRICTLY use only environment variable - NO FALLBACKS
    let mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
      console.error('❌ MONGODB_URI environment variable is not set!');
      console.error('Please set MONGODB_URI in your .env file');
      throw new Error('MONGODB_URI environment variable is required');
    }

    // Add database name if not present in Atlas URI
    if (mongoUri.includes('mongodb+srv://') && !mongoUri.includes('/hospital_management')) {
      mongoUri = mongoUri.replace('/?', '/hospital_management?');
      if (!mongoUri.includes('?')) {
        mongoUri += '/hospital_management';
      }
    }

    console.log(`🔄 Attempting to connect to MongoDB Atlas...`);
    console.log(`📍 Connection URI: ${mongoUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);

    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000,
      maxPoolSize: 10
    });

    console.log(`✅ MongoDB Atlas Connected Successfully!`);
    console.log(`🏠 Host: ${conn.connection.host}`);
    console.log(`🗃️ Database: ${conn.connection.name}`);
    console.log(`🔗 Connection State: ${conn.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);



    // One-time: drop any index on users.username to allow duplicate usernames for fixed-role accounts
    try {
      const coll = mongoose.connection && mongoose.connection.db && mongoose.connection.db.collection('users');
      if (coll) {
        const idx = await coll.indexes();
        console.log('Users indexes before cleanup:', idx.map(i => ({ name: i.name, unique: i.unique, key: i.key })));
        for (const i of idx) {
          if (i.key && i.key.username) {
            try {
              await coll.dropIndex(i.name);
              console.log('🧹 Dropped index on users.username:', i.name);
            } catch (err) {
              console.warn('Could not drop index', i.name, '-', err.message);
            }
          }
        }
        const after = await coll.indexes();
        console.log('Users indexes after cleanup:', after.map(i => ({ name: i.name, unique: i.unique, key: i.key })));
      }
    } catch (e) { console.warn('Index cleanup (users.username) skipped:', e && e.message ? e.message : e); }


    // Handle connection events
    mongoose.connection.on('connected', () => {
      console.log('Mongoose connected to MongoDB');
    });

    mongoose.connection.on('error', (err) => {
      console.error('Mongoose connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('Mongoose disconnected from MongoDB');
    });

    // Handle application termination
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed through app termination');
      process.exit(0);
    });

  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
};

module.exports = connectDB;
