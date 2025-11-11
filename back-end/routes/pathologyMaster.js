const express = require('express');
const router = express.Router();
const TestDefinition = require('../models/TestDefinition');
const ServiceHead = require('../models/ServiceHead');
const TestCategory = require('../models/TestCategory');
const Unit = require('../models/Unit');


// Get all test definitions
router.get('/test-definitions', async (req, res) => {
  try {
    console.log('📋 Fetching all test definitions...');

    const testDefinitions = await TestDefinition.find({})


    
      .populate('category', 'name categoryId')
      .populate('shortName', 'testName price')
      .populate('sampleType', 'name') // handles array
      .populate('unit', 'name')
      .populate('parameters.unit', 'name')
      .populate({ path: 'tests', select: 'name' })
      .sort({ name: 1 });

    console.log(`✅ Found ${testDefinitions.length} test definitions`);

    res.json({
      success: true,
      count: testDefinitions.length,
      testDefinitions: testDefinitions
    });
  } catch (error) {
    console.error('❌ Error fetching test definitions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching test definitions',
      error: error.message
    });
  }
});

// Get test definition by ID
router.get('/test-definitions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📋 Fetching test definition with ID: ${id}`);

    const testDefinition = await TestDefinition.findById(id)
      .populate('category', 'name categoryId')
      .populate('shortName', 'testName price')
      .populate('sampleType', 'name') // handles array
      .populate('unit', 'name')
      .populate('parameters.unit', 'name')
      .populate({ path: 'tests', select: 'name' });

    if (!testDefinition) {
      return res.status(404).json({
        success: false,
        message: 'Test definition not found'
      });
    }

    console.log(`✅ Found test definition: ${testDefinition.name}`);

    res.json({
      success: true,
      testDefinition: testDefinition
    });
  } catch (error) {
    console.error('❌ Error fetching test definition:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching test definition',
      error: error.message
    });
  }
});

// Create new test definition
router.post('/test-definitions', async (req, res) => {
  try {
    console.log('📝 Creating new test definition...');
    console.log('Request body:', req.body);

    const testDefinitionData = { ...req.body };

    // Validate required fields
    if (!testDefinitionData.name || !testDefinitionData.shortName || !testDefinitionData.category) {
      return res.status(400).json({
        success: false,
        message: 'Name, shortName, and category are required fields'
      });
    }

    // Normalize name for duplicate check (store is uppercase in schema)
    const incomingName = String(testDefinitionData.name || '').trim().toUpperCase();

    // Duplicate checks for name and shortName across all test types (including panels)
    const [existingByName, existingByShortName] = await Promise.all([
      TestDefinition.findOne({ name: incomingName }),
      TestDefinition.findOne({ shortName: testDefinitionData.shortName })
    ]);

    if (existingByName) {
      return res.status(400).json({ success: false, error: 'DUPLICATE_NAME', message: 'A test with this name already exists.' });
    }
    if (existingByShortName) {
      return res.status(400).json({ success: false, error: 'DUPLICATE_SHORTNAME', message: 'A test with this short name already exists.' });
    }

    // Map sampleType (string/object/id OR array of those) to array of Unit ObjectIds with kind: 'SAMPLE'
    if (testDefinitionData.sampleType) {
      const incoming = Array.isArray(testDefinitionData.sampleType) ? testDefinitionData.sampleType : [testDefinitionData.sampleType];
      const ids = [];
      for (const item of incoming) {
        if (!item) continue;
        if (typeof item === 'object' && item._id) {
          ids.push(item._id);
        } else if (typeof item === 'string') {
          const name = item.trim();
          if (name.match(/^[0-9a-fA-F]{24}$/)) {
            ids.push(name);
          } else {
            let stDoc = await Unit.findOne({ name, kind: 'SAMPLE' });
            if (!stDoc) stDoc = await Unit.create({ name, kind: 'SAMPLE' });
            ids.push(stDoc._id);
          }
        }
      }
      // de-duplicate
      testDefinitionData.sampleType = Array.from(new Set(ids.map(x => String(x))));
    }

    // Map unit values (string name, populated object, or id) to ObjectId references (kind: 'UNIT')
    if (testDefinitionData.unit) {
      if (typeof testDefinitionData.unit === 'object' && testDefinitionData.unit._id) {
        testDefinitionData.unit = testDefinitionData.unit._id;
      } else if (typeof testDefinitionData.unit === 'string') {
        const name = testDefinitionData.unit.trim();
        if (name.match(/^[0-9a-fA-F]{24}$/)) {
          // Already an ObjectId-like string
        } else {
          let unitDoc = await Unit.findOne({ name, kind: 'UNIT' });
          if (!unitDoc) unitDoc = await Unit.create({ name, kind: 'UNIT' });
          testDefinitionData.unit = unitDoc._id;
        }
      }
    }
    if (Array.isArray(testDefinitionData.parameters)) {
      for (const p of testDefinitionData.parameters) {
        if (!p) continue;
        if (p.unit) {
          if (typeof p.unit === 'object' && p.unit._id) {
            p.unit = p.unit._id;
          } else if (typeof p.unit === 'string') {
            const name = p.unit.trim();
            if (name.match(/^[0-9a-fA-F]{24}$/)) {
              // ok
            } else {
              let u = await Unit.findOne({ name });
              if (!u) u = await Unit.create({ name });
              p.unit = u._id;
            }
          }
        }
      }
    }
    // Remove empty strings for unit fields to avoid ObjectId cast errors
    if (testDefinitionData.unit === '' || testDefinitionData.unit === null) {
      delete testDefinitionData.unit;
    }
    if (Array.isArray(testDefinitionData.parameters)) {
      testDefinitionData.parameters = testDefinitionData.parameters.map(p => {
        if (!p) return p;
        if (p.unit === '' || p.unit === null) {
          delete p.unit;
        }
        return p;
      });
    }


    // Clean up parameters based on testType
    if (testDefinitionData.parameters && Array.isArray(testDefinitionData.parameters)) {
      testDefinitionData.parameters = testDefinitionData.parameters.map(param => {
        const cleanParam = { ...param };

        // Only keep groupBy for nested test types
        if (testDefinitionData.testType !== 'nested') {
          delete cleanParam.groupBy;
        }

        return cleanParam;
      });
    }

    // Note: Duplicate check will be handled by MongoDB unique constraint

    // Create new test definition
    const testDefinition = new TestDefinition(testDefinitionData);
    const savedTestDefinition = await testDefinition.save();

    // Populate the saved test definition
    const populatedTestDefinition = await TestDefinition.findById(savedTestDefinition._id)
      .populate('category', 'name categoryId')
      .populate('shortName', 'testName price')
      .populate('sampleType', 'name')
      .populate('unit', 'name')
      .populate('parameters.unit', 'name');

    console.log(`✅ Test definition created successfully: ${populatedTestDefinition.name}`);

    res.status(201).json({
      success: true,
      message: 'Test definition created successfully',
      testDefinition: populatedTestDefinition
    });
  } catch (error) {
    console.error('❌ Error creating test definition:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Test definition with this name already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error creating test definition',
      error: error.message
    });
  }
});

// Update test definition
router.put('/test-definitions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📝 Updating test definition with ID: ${id}`);
    console.log('Update data:', req.body);

    const updateData = { ...req.body };

    // Duplicate checks when updating
    if (updateData.name || updateData.shortName) {
      const nameToCheck = updateData.name ? String(updateData.name).trim().toUpperCase() : null;
      const shortNameToCheck = updateData.shortName ? String(updateData.shortName) : null;

      const [dupByName, dupByShortName] = await Promise.all([
        nameToCheck ? TestDefinition.findOne({ _id: { $ne: id }, name: nameToCheck }) : null,
        shortNameToCheck ? TestDefinition.findOne({ _id: { $ne: id }, shortName: shortNameToCheck }) : null
      ]);

      if (dupByName) {
        return res.status(400).json({ success: false, error: 'DUPLICATE_NAME', message: 'A test with this name already exists.' });
      }
      if (dupByShortName) {
        return res.status(400).json({ success: false, error: 'DUPLICATE_SHORTNAME', message: 'A test with this short name already exists.' });
      }
    }

    // Map incoming sampleType (strings/object/id OR array) to array of Unit ObjectIds with kind: 'SAMPLE'
    if (updateData.sampleType) {
      const incoming = Array.isArray(updateData.sampleType) ? updateData.sampleType : [updateData.sampleType];
      const ids = [];
      for (const item of incoming) {
        if (!item) continue;
        if (typeof item === 'object' && item._id) {
          ids.push(item._id);
        } else if (typeof item === 'string') {
          const name = item.trim();
          if (name.match(/^[0-9a-fA-F]{24}$/)) {
            ids.push(name);
          } else {
            let stDoc = await Unit.findOne({ name, kind: 'SAMPLE' });
            if (!stDoc) stDoc = await Unit.create({ name, kind: 'SAMPLE' });
            ids.push(stDoc._id);
          }
        }
      }
      updateData.sampleType = Array.from(new Set(ids.map(x => String(x))));
    }

    // Map incoming unit fields (strings, populated objects, or IDs) to ObjectId references (kind: 'UNIT')
    if (updateData.unit) {
      if (typeof updateData.unit === 'object' && updateData.unit._id) {
        updateData.unit = updateData.unit._id;
      } else if (typeof updateData.unit === 'string') {
        const name = updateData.unit.trim();
        if (name.match(/^[0-9a-fA-F]{24}$/)) {
          // already id-like
        } else {
          let unitDoc = await Unit.findOne({ name, kind: 'UNIT' });
          if (!unitDoc) unitDoc = await Unit.create({ name, kind: 'UNIT' });
          updateData.unit = unitDoc._id;
        }
      }
    }
    if (Array.isArray(updateData.parameters)) {
      for (const p of updateData.parameters) {
        if (!p) continue;
        if (p.unit) {
          if (typeof p.unit === 'object' && p.unit._id) {
            p.unit = p.unit._id;
          } else if (typeof p.unit === 'string') {
            const name = p.unit.trim();
            if (name.match(/^[0-9a-fA-F]{24}$/)) {
              // ok
            } else {
              let u = await Unit.findOne({ name });
              if (!u) u = await Unit.create({ name });
              p.unit = u._id;
            }
          }
        }
      }
    }

    // Clean up parameters based on testType
    if (updateData.parameters && Array.isArray(updateData.parameters)) {
      updateData.parameters = updateData.parameters.map(param => {
        const cleanParam = { ...param };

        // Only keep groupBy for nested test types
        if (updateData.testType !== 'nested') {
          delete cleanParam.groupBy;
        }

        return cleanParam;
      });
    }

    const updatedTestDefinition = await TestDefinition.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: false }
    )
    .populate('category', 'name categoryId')
    .populate('shortName', 'testName price')
    .populate('unit', 'name')
    .populate('parameters.unit', 'name');

    if (!updatedTestDefinition) {
      return res.status(404).json({
        success: false,
        message: 'Test definition not found'
      });
    }

    console.log(`✅ Test definition updated successfully: ${updatedTestDefinition.name}`);

    res.json({
      success: true,
      message: 'Test definition updated successfully',
      testDefinition: updatedTestDefinition
    });
  } catch (error) {
    console.error('❌ Error updating test definition:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating test definition',
      error: error.message
    });
  }
});

// Delete test definition
router.delete('/test-definitions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🗑️ Deleting test definition with ID: ${id}`);

    const deletedTestDefinition = await TestDefinition.findByIdAndDelete(id);

    if (!deletedTestDefinition) {
      return res.status(404).json({
        success: false,
        message: 'Test definition not found'
      });
    }

    console.log(`✅ Test definition deleted successfully: ${deletedTestDefinition.name}`);

    res.json({
      success: true,
      message: 'Test definition deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting test definition:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting test definition',
      error: error.message
    });
  }
});

// Get test categories (from TestCategory model)
router.get('/categories', async (req, res) => {
  try {
    console.log('📋 Fetching test categories...');

    // Get categories from TestCategory model
    const categories = await TestCategory.find({})
      .select('name categoryId createdAt updatedAt')
      .sort({ name: 1 });

    console.log(`✅ Found ${categories.length} categories`);

    res.json({
      success: true,
      count: categories.length,
      categories: categories
    });
  } catch (error) {
    console.error('❌ Error fetching test categories:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching test categories',
      error: error.message
    });
  }
});

// Create test category
router.post('/categories', async (req, res) => {
  try {
    console.log('📝 Creating new test category...');
    console.log('Request body:', req.body);

    const categoryData = { ...req.body };

    // Validate required fields
    if (!categoryData.name) {
      return res.status(400).json({
        success: false,
        message: 'Category name is required'
      });
    }

    // Normalize name (trim + collapse spaces + uppercase)
    const normalizedName = String(categoryData.name || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();

    // Check for duplicate category name
    const existingCategory = await TestCategory.findOne({ name: normalizedName });

    if (existingCategory) {
      console.warn('⚠️ Duplicate test category attempt', {
        incoming: normalizedName,
        existingId: existingCategory._id,
        existingName: existingCategory.name
      });
      return res.status(400).json({
        success: false,
        message: 'Test category with this name already exists',
        existing: { _id: existingCategory._id, name: existingCategory.name, categoryId: existingCategory.categoryId }
      });
    }

    // Set normalized value
    categoryData.name = normalizedName;

    // Create new test category
    const testCategory = new TestCategory(categoryData);
    const savedCategory = await testCategory.save();

    console.log(`✅ Test category created successfully: ${savedCategory.name}`);

    res.status(201).json({
      success: true,
      message: 'Test category created successfully',
      category: savedCategory
    });
  } catch (error) {
    console.error('❌ Error creating test category:', error);

    if (error.code === 11000) {
      const fields = Object.keys(error.keyPattern || {});
      const duplicateField = fields && fields.length ? fields[0] : 'unknown';
      return res.status(400).json({
        success: false,
        message: duplicateField === 'categoryId' ? 'Duplicate categoryId generated. Please retry.' : 'Test category with this name already exists',
        duplicateField,
        keyValue: error.keyValue
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error creating test category',
      error: error.message
    });
  }
});

// Update test category
router.put('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📝 Updating test category with ID: ${id}`);
    console.log('Update data:', req.body);

    const updateData = { ...req.body };

    // Validate required fields
    if (!updateData.name) {
      return res.status(400).json({
        success: false,
        message: 'Category name is required'
      });
    }

    // Normalize name (trim + collapse spaces + uppercase)
    const normalizedUpdateName = String(updateData.name || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();

    // Check for duplicate category name (excluding current category)
    const existingCategory = await TestCategory.findOne({
      name: normalizedUpdateName,
      _id: { $ne: id }
    });

    if (existingCategory) {
      console.warn('⚠️ Duplicate test category update attempt', {
        incoming: normalizedUpdateName,
        existingId: existingCategory._id,
        existingName: existingCategory.name
      });
      return res.status(400).json({
        success: false,
        message: 'Test category with this name already exists',
        existing: { _id: existingCategory._id, name: existingCategory.name, categoryId: existingCategory.categoryId }
      });
    }

    // Set normalized name
    updateData.name = normalizedUpdateName;

    const updatedCategory = await TestCategory.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedCategory) {
      return res.status(404).json({
        success: false,
        message: 'Test category not found'
      });
    }

    console.log(`✅ Test category updated successfully: ${updatedCategory.name}`);

    res.json({
      success: true,
      message: 'Test category updated successfully',
      category: updatedCategory
    });
  } catch (error) {
    console.error('❌ Error updating test category:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating test category',
      error: error.message
    });
  }
});

// Check test category usage before deletion
router.get('/categories/:id/usage', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🔍 Checking usage for test category ID: ${id}`);

    // Check if category exists
    const category = await TestCategory.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Test category not found'
      });
    }

    // Check if any test definitions use this category
    const testDefinitions = await TestDefinition.find({
      category: id
    }).select('name testId');

    const hasTests = testDefinitions.length > 0;

    console.log(`✅ Category usage check completed. Tests found: ${testDefinitions.length}`);

    res.json({
      success: true,
      hasTests: hasTests,
      testCount: testDefinitions.length,
      tests: testDefinitions
    });
  } catch (error) {
    console.error('❌ Error checking test category usage:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking test category usage',
      error: error.message
    });
  }
});

// Delete test category
router.delete('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🗑️ Deleting test category with ID: ${id}`);

    // Check if category exists
    const category = await TestCategory.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Test category not found'
      });
    }

    // Check if any test definitions use this category
    const testDefinitions = await TestDefinition.find({
      category: id
    });

    if (testDefinitions.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete test category. It is being used by ${testDefinitions.length} test definition${testDefinitions.length > 1 ? 's' : ''}.`
      });
    }

    // Hard delete - permanently remove the category
    await TestCategory.findByIdAndDelete(id);

    console.log(`✅ Test category hard-deleted`);

    res.json({
      success: true,
      message: 'Test category deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting test category:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting test category',
      error: error.message
    });
  }
});

// Get test categories (from ServiceHead model) - Legacy endpoint
router.get('/test-categories', async (req, res) => {
  try {
    console.log('📋 Fetching test categories...');

    // Assuming categories are stored in ServiceHead model or similar
    // You might need to adjust this based on your actual category model
    const categories = await ServiceHead.find({ isActive: true })
      .select('serviceName serviceId')
      .sort({ serviceName: 1 });

    console.log(`✅ Found ${categories.length} categories`);

    res.json({
      success: true,
      count: categories.length,
      categories: categories.map(cat => ({
        _id: cat._id,
        name: cat.serviceName,
        categoryId: cat.serviceId
      }))
    });
  } catch (error) {
    console.error('❌ Error fetching test categories:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching test categories',
      error: error.message
    });
  }
});

// Cleanup endpoint to remove old fields and fix data
router.post('/cleanup-test-definitions', async (req, res) => {
  try {
    console.log('🧹 Starting cleanup of test definitions...');

    // Find all test definitions
    const testDefinitions = await TestDefinition.find({});
    console.log(`📋 Found ${testDefinitions.length} test definitions to process`);

    let updatedCount = 0;

    for (const testDef of testDefinitions) {
      let needsUpdate = false;
      const updateData = {};

      // Clean up parameters
      if (testDef.parameters && Array.isArray(testDef.parameters)) {
        const cleanedParameters = testDef.parameters.map(param => {
          const cleanParam = { ...param.toObject() };

          // Remove groupBy for non-nested test types
          if (testDef.testType !== 'nested' && cleanParam.groupBy !== undefined) {
            delete cleanParam.groupBy;
            needsUpdate = true;
            console.log(`  🧹 Removing groupBy from parameter "${cleanParam.name}" in test "${testDef.name}"`);
          }

          // Clean up normalValues - remove old ageUnit field
          if (cleanParam.normalValues && Array.isArray(cleanParam.normalValues)) {
            cleanParam.normalValues = cleanParam.normalValues.map(nv => {
              const cleanNV = { ...nv };
              if (cleanNV.ageUnit !== undefined) {
                delete cleanNV.ageUnit;
                needsUpdate = true;
                console.log(`  🧹 Removing ageUnit from normal value in parameter "${cleanParam.name}"`);
              }
              return cleanNV;
            });
          }

          return cleanParam;
        });

        if (needsUpdate) {
          updateData.parameters = cleanedParameters;
        }
      }

      // Update the document if needed
      if (needsUpdate) {
        await TestDefinition.findByIdAndUpdate(testDef._id, updateData);
        updatedCount++;
        console.log(`✅ Updated test definition: ${testDef.name}`);
      }
    }

    console.log(`🎉 Cleanup completed! Updated ${updatedCount} test definitions`);

    res.json({
      success: true,
      message: `Cleanup completed! Updated ${updatedCount} test definitions`,
      updatedCount
    });

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    res.status(500).json({
      success: false,
      message: 'Error during cleanup',

      error: error.message
    });
  }
});

// ================= UNITS (for Pathology) =================
// Get all units (measurement units only)
router.get('/units', async (req, res) => {
  try {
    const units = await Unit.find({ kind: 'UNIT' }).sort({ name: 1 });
    res.json({ success: true, units });
  } catch (error) {
    console.error('❌ Error fetching units:', error);
    res.status(500).json({ success: false, message: 'Error fetching units', error: error.message });
  }
});

// Create a single unit (preserve case, avoid case-insensitive duplicates) - measurement units only by default
router.post('/units', async (req, res) => {
  try {
    const { name } = req.body || {};
    const raw = (name || '').trim();
    if (!raw) {
      return res.status(400).json({ success: false, message: 'Unit name is required' });
    }
    const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existing = await Unit.findOne({ name: { $regex: `^${escaped}$`, $options: 'i' }, kind: 'UNIT' });
    if (existing) {
      return res.status(200).json({ success: true, unit: existing, message: 'Unit already exists' });
    }
    const unit = await Unit.create({ name: raw, kind: 'UNIT' });
    res.status(201).json({ success: true, unit });
  } catch (error) {
    console.error('❌ Error creating unit:', error);
    res.status(500).json({ success: false, message: 'Error creating unit', error: error.message });
  }
});

// Bulk create measurement units (idempotent, preserve case)
router.post('/units/bulk', async (req, res) => {
  try {
    const { names } = req.body || {};
    const candidateNames = (Array.isArray(names) ? names : [])
      .map(n => (n || '').trim())
      .filter(n => !!n);

    if (candidateNames.length === 0) {
      return res.status(400).json({ success: false, message: 'No unit names provided' });
    }

    // Find existing (case-insensitive)
    const regexes = candidateNames.map(n => new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));
    const existing = await Unit.find({ name: { $in: regexes }, kind: 'UNIT' });
    const existingLower = new Set(existing.map(u => u.name.toLowerCase()));
    const toCreate = candidateNames.filter(n => !existingLower.has(n.toLowerCase()));

    if (toCreate.length > 0) {
      await Unit.insertMany(toCreate.map(n => ({ name: n, kind: 'UNIT' })), { ordered: false });
    }

    const all = await Unit.find({ name: { $in: regexes }, kind: 'UNIT' }).sort({ name: 1 });
    res.json({ success: true, count: all.length, units: all });
  } catch (error) {
    console.error('❌ Error bulk-creating units:', error);
    res.status(500).json({ success: false, message: 'Error bulk-creating units', error: error.message });
  }
});

// ===== SAMPLE TYPES (stored in same collection with kind: 'SAMPLE') =====
router.get('/sample-types', async (req, res) => {
  try {
    const samples = await Unit.find({ kind: 'SAMPLE' }).sort({ name: 1 });
    res.json({ success: true, sampleTypes: samples });
  } catch (error) {
    console.error('❌ Error fetching sample types:', error);
    res.status(500).json({ success: false, message: 'Error fetching sample types', error: error.message });
  }
});

// ===== SAMPLE TYPE usage + delete (mirror unit rules) =====
router.get('/sample-types/:id/usage', async (req, res) => {
  try {
    const { id } = req.params;
    const st = await Unit.findById(id);
    if (!st) return res.status(404).json({ success: false, message: 'Sample type not found' });
    const count = await TestDefinition.countDocuments({ sampleType: st._id });
    res.json({ success: true, blocked: count > 0, count });
  } catch (error) {
    console.error('❌ Error checking sample type usage:', error);
    res.status(500).json({ success: false, message: 'Error checking sample type usage', error: error.message });
  }
});

router.delete('/sample-types/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const st = await Unit.findById(id);
    if (!st) return res.status(404).json({ success: false, message: 'Sample type not found' });
    const count = await TestDefinition.countDocuments({ sampleType: st._id });
    if (count > 0) {
      return res.status(409).json({ success: false, blocked: true, message: 'Sample type is used by test definitions.' });
    }
    await Unit.findByIdAndDelete(id);
    res.json({ success: true, message: 'Sample type deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting sample type:', error);
    res.status(500).json({ success: false, message: 'Error deleting sample type', error: error.message });
  }
});

router.post('/sample-types/bulk', async (req, res) => {
  try {
    const { names } = req.body || {};
    const candidateNames = (Array.isArray(names) ? names : [])
      .map(n => (n || '').trim())
      .filter(n => !!n);

    if (candidateNames.length === 0) {
      return res.status(400).json({ success: false, message: 'No sample type names provided' });
    }

    const regexes = candidateNames.map(n => new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));
    const existing = await Unit.find({ name: { $in: regexes }, kind: 'SAMPLE' });
    const existingLower = new Set(existing.map(u => u.name.toLowerCase()));
    const toCreate = candidateNames.filter(n => !existingLower.has(n.toLowerCase()));

    if (toCreate.length > 0) {
      await Unit.insertMany(toCreate.map(n => ({ name: n, kind: 'SAMPLE' })), { ordered: false });
    }

    const all = await Unit.find({ name: { $in: regexes }, kind: 'SAMPLE' }).sort({ name: 1 });
    res.json({ success: true, count: all.length, sampleTypes: all });
  } catch (error) {
    console.error('❌ Error bulk-creating sample types:', error);
    res.status(500).json({ success: false, message: 'Error bulk-creating sample types', error: error.message });
  }
});



// Check unit usage (non-destructive)
router.get('/units/:id/usage', async (req, res) => {
  try {
    const { id } = req.params;
    const unit = await Unit.findById(id);
    if (!unit) {
      return res.status(404).json({ success: false, message: 'Unit not found' });
    }

    const unitId = unit._id;
    const inSingle = await TestDefinition.countDocuments({ unit: unitId });
    const inParams = await TestDefinition.countDocuments({ 'parameters.unit': unitId });
    const count = inSingle + inParams;

    res.json({ success: true, blocked: count > 0, inSingle, inParams, count });
  } catch (error) {
    console.error('❌ Error checking unit usage:', error);
    res.status(500).json({ success: false, message: 'Error checking unit usage', error: error.message });
  }
});


// Delete a unit with dependency check
router.delete('/units/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Find the unit
    const unit = await Unit.findById(id);
    if (!unit) {
      return res.status(404).json({ success: false, message: 'Unit not found' });
    }

    const unitId = unit._id;

    // Check dependencies in TestDefinition (single test unit or parameter units)
    const inSingle = await TestDefinition.exists({ unit: unitId });
    const inParams = await TestDefinition.exists({ 'parameters.unit': unitId });

    if (inSingle || inParams) {
      return res.status(409).json({
        success: false,
        blocked: true,
        message: 'Unit cannot be deleted because it is used by one or more test definitions.'
      });
    }

    await Unit.findByIdAndDelete(id);
    res.json({ success: true, message: 'Unit deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting unit:', error);
    res.status(500).json({ success: false, message: 'Error deleting unit', error: error.message });
  }
});

module.exports = router;
