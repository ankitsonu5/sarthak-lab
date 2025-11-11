const mongoose = require('mongoose');
const PathologyRegistration = require('../models/PathologyRegistration');
const TestDefinition = require('../models/TestDefinition');
const ServiceHead = require('../models/ServiceHead');
// Ensure related models are registered for population
require('../models/TestCategory');
require('../models/Unit');

/**
 * Pathology Linking Service
 * Fixes the missing links between registrations and test definitions
 */
class PathologyLinkingService {

  /**
   * Link pathology registration tests with test definitions
   * @param {string} registrationId - PathologyRegistration ID
   * @returns {Promise<Object>} Updated registration with linked test IDs
   */
  static async linkRegistrationWithTestDefinitions(registrationId) {
    try {
      console.log(`🔗 Linking registration ${registrationId} with test definitions...`);

      // Get the registration
      const registration = await PathologyRegistration.findById(registrationId);
      if (!registration) {
        throw new Error('Registration not found');
      }

      console.log(`📋 Found registration with ${registration.tests.length} tests`);

      // Process each test in the registration
      const updatedTests = [];
      
      for (const test of registration.tests) {
        console.log(`🔍 Processing test: ${test.name} (${test.category})`);
        
        // Find matching test definition
        const linkedTest = await this.findAndLinkTestDefinition(test);
        updatedTests.push(linkedTest);
      }

      // Update the registration with linked tests
      registration.tests = updatedTests;
      await registration.save();

      console.log(`✅ Successfully linked ${updatedTests.length} tests`);
      return registration;

    } catch (error) {
      console.error(`❌ Error linking registration ${registrationId}:`, error);
      throw error;
    }
  }

  /**
   * Find and link test definition for a single test
   * @param {Object} test - Test object from registration
   * @returns {Promise<Object>} Enhanced test object with definition ID and parameters
   */
  static async findAndLinkTestDefinition(test) {
    try {
      const testName = test.name.toUpperCase().trim();
      console.log(`🔍 Looking for test definition: ${testName}`);

      // Try to find exact match first
      let testDefinition = await TestDefinition.findOne({ 
        name: testName 
      }).populate('shortName category');

      // If not found, try partial match
      if (!testDefinition) {
        testDefinition = await TestDefinition.findOne({ 
          name: { $regex: testName, $options: 'i' } 
        }).populate('shortName category');
      }

      // If still not found, try to find by service head name
      if (!testDefinition) {
        const serviceHead = await ServiceHead.findOne({
          testName: { $regex: testName, $options: 'i' }
        });

        if (serviceHead) {
          testDefinition = await TestDefinition.findOne({
            shortName: serviceHead._id
          }).populate('shortName category');
        }
      }

      if (testDefinition) {
        console.log(`✅ Found test definition: ${testDefinition.name} (ID: ${testDefinition._id})`);

        // Derive readable category name if available
        let categoryName = (test.category || '').toString();
        try {
          if (testDefinition.category) {
            const TestCategory = require('../models/TestCategory');
            const catDoc = await TestCategory.findById(testDefinition.category).select('name');
            if (catDoc && catDoc.name) {
              categoryName = catDoc.name.toString();
            }
          }
        } catch {}

        // Return enhanced test object and normalize category if it was generic/blank
        const base = test.toObject ? test.toObject() : test;
        return {
          ...base,
          category: (!base.category || /^(general|others?)$/i.test(base.category)) ? categoryName : base.category,
          testDefinitionId: testDefinition._id,
          serviceHeadId: testDefinition.shortName || null,
          categoryId: testDefinition.category || null,
          testDefinition: {
            id: testDefinition._id,
            name: testDefinition.name,
            testType: testDefinition.testType,
            parameters: testDefinition.parameters || [],
            category: testDefinition.category,
            shortName: testDefinition.shortName
          }
        };
      } else {
        console.warn(`⚠️ No test definition found for: ${testName}`);
        
        // Return original test with warning
        return {
          ...test.toObject(),
          testDefinitionId: null,
          warning: `No test definition found for ${testName}`
        };
      }

    } catch (error) {
      console.error(`❌ Error finding test definition for ${test.name}:`, error);
      return {
        ...test.toObject(),
        testDefinitionId: null,
        error: error.message
      };
    }
  }

  /**
   * Fix all existing pathology registrations
   * @returns {Promise<Array>} Results of fixing all registrations
   */
  static async fixAllExistingRegistrations() {
    try {
      console.log('🔧 Starting to fix all existing pathology registrations...');

      // Get all registrations that don't have test definition links
      const registrations = await PathologyRegistration.find({
        $or: [
          { 'tests.testDefinitionId': { $exists: false } },
          { 'tests.testDefinitionId': null }
        ]
      });

      console.log(`📊 Found ${registrations.length} registrations to fix`);

      const results = [];

      for (const registration of registrations) {
        try {
          console.log(`🔄 Fixing registration ${registration._id} (Receipt: ${registration.receiptNumber})`);
          
          const updatedRegistration = await this.linkRegistrationWithTestDefinitions(registration._id);
          
          results.push({
            registrationId: registration._id,
            receiptNumber: registration.receiptNumber,
            testsCount: registration.tests.length,
            status: 'success',
            linkedTests: updatedRegistration.tests.filter(t => t.testDefinitionId).length
          });

        } catch (error) {
          console.error(`❌ Failed to fix registration ${registration._id}:`, error);
          results.push({
            registrationId: registration._id,
            receiptNumber: registration.receiptNumber,
            status: 'failed',
            error: error.message
          });
        }
      }

      console.log('🎉 Completed fixing all registrations!');
      return results;

    } catch (error) {
      console.error('❌ Error fixing all registrations:', error);
      throw error;
    }
  }

  /**
   * Get test parameters for report generation
   * @param {string} registrationId - PathologyRegistration ID
   * @returns {Promise<Object>} Test parameters organized by test
   */
  static async getTestParametersForReport(registrationId) {
    try {
      console.log(`📋 Getting test parameters for report: ${registrationId}`);

      const registration = await PathologyRegistration.findById(registrationId);
      if (!registration) {
        throw new Error('Registration not found');
      }

      const testResults = [];

      for (const test of registration.tests) {
        if (test.testDefinitionId) {
          // Get full test definition with parameters
          const testDefinition = await TestDefinition.findById(test.testDefinitionId)
            .populate('shortName category');

          // Resolve readable category string
          let categoryName = (test.category || '').toString();
          try {
            if ((!categoryName || /^(general|others?)$/i.test(categoryName)) && testDefinition?.category) {
              const TestCategory = require('../models/TestCategory');
              const catDoc = await TestCategory.findById(testDefinition.category).select('name');
              if (catDoc?.name) categoryName = catDoc.name.toString();
            }
          } catch {}

          if (testDefinition && testDefinition.parameters) {
            testResults.push({
              testName: test.name,
              category: categoryName,
              parameters: testDefinition.parameters.map(param => ({
                name: param.name,
                unit: param.unit,
                normalRange: Array.isArray(param.normalValues) && param.normalValues.length > 0
                  ? (param.normalValues[0].textValue || param.normalValues[0].normalRange || '')
                  : '',
                result: '', // To be filled during report generation
                resultType: param.resultType || 'manual',
                groupBy: param.groupBy || '',
                isOptional: param.isOptional || false
              }))
            });
          }
        } else {
          // Test without definition - create basic structure
          testResults.push({
            testName: test.name,
            category: test.category,
            parameters: [{
              name: test.name,
              unit: '',
              normalRange: '',
              result: '',
              resultType: 'manual',
              groupBy: '',
              isOptional: false
            }]
          });
        }
      }

      console.log(`✅ Generated parameters for ${testResults.length} tests`);
      return {
        registrationId,
        receiptNumber: registration.receiptNumber,
        patientData: registration.patient,
        testResults
      };

    } catch (error) {
      console.error(`❌ Error getting test parameters for ${registrationId}:`, error);
      throw error;
    }
  }

  /**
   * Create missing test definitions from registration data
   * @param {Array} testNames - Array of test names to create definitions for
   * @returns {Promise<Array>} Created test definitions
   */
  static async createMissingTestDefinitions(testNames) {
    try {
      console.log(`🔧 Creating missing test definitions for: ${testNames.join(', ')}`);

      const created = [];

      for (const testName of testNames) {
        try {
          // Check if already exists
          const existing = await TestDefinition.findOne({ 
            name: testName.toUpperCase().trim() 
          });

          if (existing) {
            console.log(`⚠️ Test definition already exists: ${testName}`);
            continue;
          }

          // Find or create service head
          let serviceHead = await ServiceHead.findOne({
            testName: { $regex: testName, $options: 'i' }
          });

          if (!serviceHead) {
            console.log(`🔧 Creating service head for: ${testName}`);
            // This would need category ID - for now, skip auto-creation
            console.warn(`⚠️ Cannot create test definition without service head: ${testName}`);
            continue;
          }

          // Create basic test definition
          const testDefinition = new TestDefinition({
            name: testName.toUpperCase().trim(),
            shortName: serviceHead._id,
            category: serviceHead.category,
            testType: 'single',
            parameters: [{
              order: 1,
              name: testName,
              inputType: 'Numeric',
              resultType: 'manual',
              normalValues: [{
                type: 'numeric_range',
                textValue: 'Normal'
              }]
            }]
          });

          await testDefinition.save();
          created.push(testDefinition);
          console.log(`✅ Created test definition: ${testName}`);

        } catch (error) {
          console.error(`❌ Error creating test definition for ${testName}:`, error);
        }
      }

      return created;

    } catch (error) {
      console.error('❌ Error creating missing test definitions:', error);
      throw error;
    }
  }
}

module.exports = PathologyLinkingService;
