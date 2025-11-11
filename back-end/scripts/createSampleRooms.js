const mongoose = require('mongoose');
const Room = require('../models/Room');
const Department = require('../models/Department');
require('dotenv').config();

const createSampleRooms = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hospital_management');
    console.log('Connected to MongoDB');

    // Check if rooms already exist
    const existingRooms = await Room.countDocuments();
    if (existingRooms > 0) {
      console.log('Rooms already exist in database. Skipping creation.');
      process.exit(0);
    }

    // Get all departments
    const departments = await Department.find({ isActive: true });
    if (departments.length === 0) {
      console.log('No departments found. Please create departments first.');
      process.exit(1);
    }

    console.log(`Found ${departments.length} departments`);

    // Sample room data for each department
    const roomsData = [];

    // Cardiology Rooms
    const cardiologyDept = departments.find(d => d.name === 'Cardiology');
    if (cardiologyDept) {
      roomsData.push(
        { roomNumber: '101', department: cardiologyDept._id },
        { roomNumber: '102', department: cardiologyDept._id },
        { roomNumber: '103', department: cardiologyDept._id }
      );
    }

    // Neurology Rooms
    const neurologyDept = departments.find(d => d.name === 'Neurology');
    if (neurologyDept) {
      roomsData.push(
        { roomNumber: '201', department: neurologyDept._id },
        { roomNumber: '202', department: neurologyDept._id }
      );
    }

    // Orthopedics Rooms
    const orthopedicsDept = departments.find(d => d.name === 'Orthopedics');
    if (orthopedicsDept) {
      roomsData.push(
        { roomNumber: '301', department: orthopedicsDept._id },
        { roomNumber: '302', department: orthopedicsDept._id },
        { roomNumber: '303', department: orthopedicsDept._id }
      );
    }

    // Pediatrics Rooms
    const pediatricsDept = departments.find(d => d.name === 'Pediatrics');
    if (pediatricsDept) {
      roomsData.push(
        { roomNumber: '401', department: pediatricsDept._id },
        { roomNumber: '402', department: pediatricsDept._id }
      );
    }

    // Gynecology Rooms
    const gynecologyDept = departments.find(d => d.name === 'Gynecology');
    if (gynecologyDept) {
      roomsData.push(
        { roomNumber: '501', department: gynecologyDept._id },
        { roomNumber: '502', department: gynecologyDept._id }
      );
    }

    // General Medicine Rooms
    const generalMedicineDept = departments.find(d => d.name === 'General Medicine');
    if (generalMedicineDept) {
      roomsData.push(
        { roomNumber: '601', department: generalMedicineDept._id },
        { roomNumber: '602', department: generalMedicineDept._id },
        { roomNumber: '603', department: generalMedicineDept._id },
        { roomNumber: '604', department: generalMedicineDept._id }
      );
    }

    // Surgery Rooms
    const surgeryDept = departments.find(d => d.name === 'Surgery');
    if (surgeryDept) {
      roomsData.push(
        { roomNumber: '701', department: surgeryDept._id },
        { roomNumber: '702', department: surgeryDept._id }
      );
    }

    // Dermatology Rooms
    const dermatologyDept = departments.find(d => d.name === 'Dermatology');
    if (dermatologyDept) {
      roomsData.push(
        { roomNumber: '801', department: dermatologyDept._id }
      );
    }

    // Ophthalmology Rooms
    const ophthalmologyDept = departments.find(d => d.name === 'Ophthalmology');
    if (ophthalmologyDept) {
      roomsData.push(
        { roomNumber: '901', department: ophthalmologyDept._id },
        { roomNumber: '902', department: ophthalmologyDept._id }
      );
    }

    // ENT Rooms
    const entDept = departments.find(d => d.name === 'ENT');
    if (entDept) {
      roomsData.push(
        { roomNumber: '1001', department: entDept._id }
      );
    }

    // Emergency Rooms
    const emergencyDept = departments.find(d => d.name === 'Emergency');
    if (emergencyDept) {
      roomsData.push(
        { roomNumber: 'ER-1', department: emergencyDept._id },
        { roomNumber: 'ER-2', department: emergencyDept._id },
        { roomNumber: 'ER-3', department: emergencyDept._id }
      );
    }

    // Radiology Rooms
    const radiologyDept = departments.find(d => d.name === 'Radiology');
    if (radiologyDept) {
      roomsData.push(
        { roomNumber: 'RAD-1', department: radiologyDept._id },
        { roomNumber: 'RAD-2', department: radiologyDept._id }
      );
    }

    if (roomsData.length === 0) {
      console.log('No valid departments found for rooms. Please check department data.');
      process.exit(1);
    }

    // Create rooms
    const createdRooms = await Room.insertMany(roomsData);
    
    console.log('✅ Sample rooms created successfully!');
    console.log(`📊 Total rooms created: ${createdRooms.length}`);
    
    // Group rooms by department for display
    const roomsByDept = {};
    for (const room of createdRooms) {
      const dept = departments.find(d => d._id.toString() === room.department.toString());
      if (dept) {
        if (!roomsByDept[dept.name]) {
          roomsByDept[dept.name] = [];
        }
        roomsByDept[dept.name].push(room.roomNumber);
      }
    }

    console.log('\n📋 Rooms by Department:');
    Object.keys(roomsByDept).forEach(deptName => {
      console.log(`   ${deptName}: ${roomsByDept[deptName].join(', ')}`);
    });

  } catch (error) {
    console.error('❌ Error creating sample rooms:', error);
  } finally {
    mongoose.connection.close();
  }
};

createSampleRooms();
