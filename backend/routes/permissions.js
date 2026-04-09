const express = require('express');
const router = express.Router();
const pool = require('../db');

// Default permissions structure
const DEFAULT_ROLES = {
  admin: {
    inventory: true,
    recipes: true,
    shopping: true,
    booking: true,
    admin: true
  },
  teacher: {
    inventory: true,
    recipes: true,
    shopping: true,
    booking: true,
    admin: false
  },
  technician: {
    inventory: false,
    recipes: true,
    shopping: true,
    booking: false,
    admin: false
  },
  student: {
    inventory: true,
    recipes: true,
    shopping: false,
    booking: false,
    admin: false
  },
  public_access: {
    inventory: true,
    recipes: true,
    shopping: false,
    booking: false,
    admin: false
  }
};

const ROUTES = ['recipes', 'inventory', 'shopping', 'booking', 'admin'];

// Initialize permissions table
const schemaReady = (async () => {
  try {
    // Drop the table if it exists with old schema (recipes before inventory)
    await pool.query(`DROP TABLE IF EXISTS role_permissions`);
    
    // Create fresh table with correct column order (inventory first)
    await pool.query(`
      CREATE TABLE role_permissions (
        id SERIAL PRIMARY KEY,
        role_name VARCHAR(50) UNIQUE NOT NULL,
        recipes BOOLEAN DEFAULT false,
        inventory BOOLEAN DEFAULT false,
        shopping BOOLEAN DEFAULT false,
        booking BOOLEAN DEFAULT false,
        admin BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[PERMISSIONS] Schema ready');
  } catch (err) {
    console.error('[PERMISSIONS] Schema initialization error:', err);
    throw err;
  }
})();

// GET /api/permissions - Fetch all role permissions
router.get('/all', async (req, res) => {
  try {
    await schemaReady;
    const result = await pool.query(`
      SELECT role_name, recipes, inventory, shopping, booking, admin
      FROM role_permissions
      ORDER BY CASE 
        WHEN role_name = 'admin' THEN 1
        WHEN role_name = 'teacher' THEN 2
        WHEN role_name = 'technician' THEN 3
        WHEN role_name = 'student' THEN 4
        WHEN role_name = 'public_access' THEN 5
      END
    `);

    if (result.rows.length === 0) {
      // Initialize with default permissions if table is empty
      for (const [roleName, permissions] of Object.entries(DEFAULT_ROLES)) {
        await pool.query(`
          INSERT INTO role_permissions (role_name, recipes, inventory, shopping, booking, admin)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          roleName,
          permissions.recipes,
          permissions.inventory,
          permissions.shopping,
          permissions.booking,
          permissions.admin
        ]);
      }
      
      // Fetch again
      const freshResult = await pool.query(`
        SELECT role_name, recipes, inventory, shopping, booking, admin
        FROM role_permissions
        ORDER BY CASE 
          WHEN role_name = 'admin' THEN 1
          WHEN role_name = 'teacher' THEN 2
          WHEN role_name = 'technician' THEN 3
          WHEN role_name = 'student' THEN 4
          WHEN role_name = 'public_access' THEN 5
        END
      `);
      return res.json({ success: true, roles: freshResult.rows, routes: ROUTES });
    }

    res.json({ success: true, roles: result.rows, routes: ROUTES });
  } catch (err) {
    console.error('[PERMISSIONS] Error fetching permissions:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/permissions/:roleName - Update permissions for a role
router.put('/:roleName', async (req, res) => {
  const roleName = req.params.roleName;
  const permissions = req.body;

  if (!DEFAULT_ROLES[roleName]) {
    return res.status(400).json({ success: false, error: 'Invalid role name' });
  }

  try {
    await schemaReady;
    
    await pool.query(`
      UPDATE role_permissions
      SET recipes = $1, inventory = $2, shopping = $3, booking = $4, admin = $5,
          updated_at = CURRENT_TIMESTAMP
      WHERE role_name = $6
    `, [
      permissions.recipes || false,
      permissions.inventory || false,
      permissions.shopping || false,
      permissions.booking || false,
      permissions.admin || false,
      roleName
    ]);

    res.json({ success: true, message: `Permissions for ${roleName} updated successfully` });
  } catch (err) {
    console.error('[PERMISSIONS] Error updating permissions:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/permissions/reset - Reset to default permissions
router.post('/reset', async (req, res) => {
  try {
    await schemaReady;
    await pool.query('TRUNCATE TABLE role_permissions RESTART IDENTITY');

    for (const [roleName, permissions] of Object.entries(DEFAULT_ROLES)) {
      await pool.query(`
        INSERT INTO role_permissions (role_name, recipes, inventory, shopping, booking, admin)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        roleName,
        permissions.recipes,
        permissions.inventory,
        permissions.shopping,
        permissions.booking,
        permissions.admin
      ]);
    }

    res.json({ success: true, message: 'Permissions reset to defaults' });
  } catch (err) {
    console.error('[PERMISSIONS] Error resetting permissions:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
