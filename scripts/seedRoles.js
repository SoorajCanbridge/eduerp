/**
 * Seed default "owner" role with full access (global, no college).
 * Run: npm run seed:roles  or  node scripts/seedRoles.js
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), process.env.NODE_ENV === 'test' ? '.env.test' : '.env') });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI is required');
  process.exit(1);
}

async function seed() {
  await mongoose.connect(MONGODB_URI);
  const Role = require('../src/models/role.model');
  const {
    getOwnerPermissions,
    getDefaultRolePermissions,
    DEFAULT_ROLE_NAME
  } = require('../src/utils/permissions');

  const ownerDescription = 'Company/college owner with full access to all modules';
  const ownerPermissions = getOwnerPermissions();

  let result = await Role.findOne({ name: 'owner', college: null }).lean();
  if (result) {
    await Role.updateOne(
      { name: 'owner', college: null },
      { $set: { description: ownerDescription, permissions: ownerPermissions } }
    );
  } else {
    const existing = await Role.findOne({ name: 'owner' }).lean();
    if (existing) {
      await Role.updateOne(
        { _id: existing._id },
        { $set: { description: ownerDescription, permissions: ownerPermissions, college: null } }
      );
    } else {
      await Role.create({
        name: 'owner',
        description: ownerDescription,
        permissions: ownerPermissions,
        college: null
      });
    }
  }

  const userDescription = 'Default role for new users (view-only access)';
  const userPermissions = getDefaultRolePermissions();
  const userRole = await Role.findOne({ name: DEFAULT_ROLE_NAME, college: null }).lean();
  if (userRole) {
    await Role.updateOne(
      { name: DEFAULT_ROLE_NAME, college: null },
      { $set: { description: userDescription, permissions: userPermissions } }
    );
  } else {
    await Role.create({
      name: DEFAULT_ROLE_NAME,
      description: userDescription,
      permissions: userPermissions,
      college: null
    });
  }

  console.log('Owner and default user role seeded');
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
