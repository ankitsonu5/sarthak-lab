const mongoose = require('mongoose');
const Counter = require('../models/Counter');

/**
 * Universal Counter Service - Handles all counter operations with sync
 * Fixes inconsistencies and provides atomic operations
 */
class CounterService {
  
  /**
   * Get next counter value with automatic sync
   * @param {string} counterName - Name of the counter
   * @param {string} format - Format for ID generation (PAT, APT, PB, etc.)
   * @param {number} padding - Number of digits for padding (default: 6)
   * @returns {Promise<{value: number, formattedId: string}>}
   */
  static async getNextValue(counterName, format = '', padding = 6) {
    try {
      console.log(`🔢 Getting next value for counter: ${counterName}`);
      
      // Atomic increment with retry logic
      let attempts = 0;
      const maxAttempts = 5;
      
      while (attempts < maxAttempts) {
        try {
          const counter = await Counter.findOneAndUpdate(
            { name: counterName },
            { $inc: { value: 1 } },
            { new: true, upsert: true, runValidators: true }
          );
          
          const formattedId = format ? 
            `${format}${String(counter.value).padStart(padding, '0')}` : 
            counter.value.toString();
          
          console.log(`✅ Counter ${counterName}: ${counter.value} -> ${formattedId}`);
          
          return {
            value: counter.value,
            formattedId: formattedId
          };
          
        } catch (error) {
          attempts++;
          if (attempts >= maxAttempts) {
            throw error;
          }
          console.warn(`⚠️ Counter retry ${attempts}/${maxAttempts} for ${counterName}`);
          await new Promise(resolve => setTimeout(resolve, 100 * attempts));
        }
      }
      
    } catch (error) {
      console.error(`❌ Counter service error for ${counterName}:`, error);
      throw new Error(`Failed to get next counter value: ${error.message}`);
    }
  }
  
  /**
   * Sync counter with existing data in collection
   * @param {string} counterName - Name of the counter
   * @param {string} collectionName - MongoDB collection name
   * @param {string} fieldName - Field containing the ID
   * @param {string} idPrefix - Prefix to extract number from (e.g., 'PAT')
   */
  static async syncWithCollection(counterName, collectionName, fieldName, idPrefix = '') {
    try {
      console.log(`🔄 Syncing counter ${counterName} with collection ${collectionName}`);
      
      const db = mongoose.connection.db;
      const collection = db.collection(collectionName);
      
      // Find highest number in collection
      let maxNumber = 0;
      
      if (idPrefix) {
        // For prefixed IDs like PAT000123
        const regex = new RegExp(`^${idPrefix}(\\d+)$`);
        const docs = await collection.find({
          [fieldName]: { $regex: regex }
        }).toArray();
        
        for (const doc of docs) {
          const match = doc[fieldName].match(regex);
          if (match) {
            const number = parseInt(match[1], 10);
            if (number > maxNumber) {
              maxNumber = number;
            }
          }
        }
      } else {
        // For numeric IDs
        const result = await collection.findOne(
          {},
          { sort: { [fieldName]: -1 } }
        );
        
        if (result && result[fieldName]) {
          maxNumber = parseInt(result[fieldName], 10) || 0;
        }
      }
      
      console.log(`📊 Highest number found in ${collectionName}: ${maxNumber}`);
      
      // Update counter to match
      const counter = await Counter.findOneAndUpdate(
        { name: counterName },
        { 
          $set: { 
            value: maxNumber,
            updatedAt: new Date()
          },
          $setOnInsert: {
            createdAt: new Date()
          }
        },
        { upsert: true, new: true }
      );
      
      console.log(`✅ Counter ${counterName} synced to: ${counter.value}`);
      return counter.value;
      
    } catch (error) {
      console.error(`❌ Sync error for ${counterName}:`, error);
      throw error;
    }
  }
  
  /**
   * Get current counter value without incrementing
   * @param {string} counterName - Name of the counter
   */
  static async getCurrentValue(counterName) {
    try {
      const counter = await Counter.findOne({ name: counterName });
      return counter ? counter.value : 0;
    } catch (error) {
      console.error(`❌ Error getting current value for ${counterName}:`, error);
      return 0;
    }
  }
  
  /**
   * Reset counter to specific value
   * @param {string} counterName - Name of the counter
   * @param {number} value - Value to reset to
   */
  static async resetCounter(counterName, value = 0) {
    try {
      console.log(`🔄 Resetting counter ${counterName} to ${value}`);
      
      const counter = await Counter.findOneAndUpdate(
        { name: counterName },
        { 
          $set: { 
            value: value,
            updatedAt: new Date()
          }
        },
        { upsert: true, new: true }
      );
      
      console.log(`✅ Counter ${counterName} reset to: ${counter.value}`);
      return counter.value;
      
    } catch (error) {
      console.error(`❌ Reset error for ${counterName}:`, error);
      throw error;
    }
  }
  
  /**
   * Fix all counter inconsistencies
   */
  static async fixAllCounters() {
    try {
      console.log('🔧 Starting comprehensive counter fix...');
      
      const currentYear = new Date().getFullYear();
      
      // Define all counter mappings
      const counterMappings = [
        {
          counterName: `patientId_${currentYear}`,
          collectionName: 'patients',
          fieldName: 'patientId',
          idPrefix: 'PAT'
        },
        {
          counterName: `appointmentId_${currentYear}`,
          collectionName: 'appointments',
          fieldName: 'appointmentId',
          idPrefix: 'APT'
        },
        {
          counterName: 'pharmacySupplier',
          collectionName: 'pharmacysuppliers',
          fieldName: 'supplierId',
          idPrefix: 'SUP'
        }
      ];
      
      const results = [];
      
      for (const mapping of counterMappings) {
        try {
          const syncedValue = await this.syncWithCollection(
            mapping.counterName,
            mapping.collectionName,
            mapping.fieldName,
            mapping.idPrefix
          );
          
          results.push({
            counter: mapping.counterName,
            syncedTo: syncedValue,
            status: 'success'
          });
          
        } catch (error) {
          console.error(`❌ Failed to sync ${mapping.counterName}:`, error);
          results.push({
            counter: mapping.counterName,
            error: error.message,
            status: 'failed'
          });
        }
      }
      
      console.log('🎉 Counter fix completed!');
      return results;
      
    } catch (error) {
      console.error('❌ Counter fix failed:', error);
      throw error;
    }
  }
}

module.exports = CounterService;
