// db_schema.js
// Centralized database schema and table creation for recipeCalculator

module.exports = function initializeDatabase(db) {
  // Suggestions table for recipe suggestions
  db.run(`CREATE TABLE IF NOT EXISTS suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    recipe_name TEXT,
    suggested_by TEXT,
    email TEXT,
    url TEXT,
    reason TEXT
  )`);
              // Preload useful aisle keywords if table is empty
              db.all('SELECT COUNT(*) as count FROM aisle_keywords', (err, rows) => {
                if (!err && rows && rows[0].count === 0) {
                  // Get category IDs for mapping
                  db.all('SELECT id, name FROM aisle_category', (err, cats) => {
                    if (!err && cats) {
                      const catMap = {};
                      cats.forEach(c => { catMap[c.name.toLowerCase()] = c.id; });
                      // Predefined keywords for each category
                      const keywords = [
                        { cat: 'Produce', words: ['Apple', 'Banana', 'Carrot', 'Lettuce', 'Tomato', 'Onion', 'Potato', 'Spinach', 'Broccoli', 'Garlic'] },
                        { cat: 'Dairy', words: ['Milk', 'Cheese', 'Butter', 'Yogurt', 'Cream', 'Eggs'] },
                        { cat: 'Pantry', words: ['Rice', 'Pasta', 'Flour', 'Sugar', 'Salt', 'Oil', 'Vinegar', 'Beans', 'Lentils', 'Cereal'] },
                        { cat: 'Other', words: ['Chocolate', 'Snacks', 'Baking Powder', 'Yeast', 'Honey'] }
                      ];
                      keywords.forEach(group => {
                        const catId = catMap[group.cat.toLowerCase()];
                        if (catId) {
                          group.words.forEach(word => {
                            db.run('INSERT INTO aisle_keywords (aisle_category_id, keyword) VALUES (?, ?)', [catId, word]);
                          });
                        }
                      });
                    }
                  });
                }
              });
            // Aisle Keywords table for dynamic aisle assignment
            db.run(`CREATE TABLE IF NOT EXISTS aisle_keywords (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              aisle_category_id INTEGER REFERENCES aisle_category(id),
              keyword TEXT NOT NULL
            )`);
          // Add aisle_category_id to ingredients_inventory if it doesn't exist
          db.all("PRAGMA table_info(ingredients_inventory)", (err, columns) => {
            if (!err && columns && !columns.some(col => col.name === 'aisle_category_id')) {
              db.run(`ALTER TABLE ingredients_inventory ADD COLUMN aisle_category_id INTEGER REFERENCES aisle_category(id)`);
            }
          });
        // Aisle Category table
        db.run(`CREATE TABLE IF NOT EXISTS aisle_category (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          sort_order INTEGER DEFAULT 0
        )`);

        // Example inserts (only if table is empty)
        db.all('SELECT COUNT(*) as count FROM aisle_category', (err, rows) => {
          if (!err && rows && rows[0].count === 0) {
            db.run(`INSERT INTO aisle_category (name, sort_order) VALUES ('Produce', 1)`);
            db.run(`INSERT INTO aisle_category (name, sort_order) VALUES ('Dairy', 2)`);
            db.run(`INSERT INTO aisle_category (name, sort_order) VALUES ('Pantry', 3)`);
            db.run(`INSERT INTO aisle_category (name, sort_order) VALUES ('Other', 4)`);
          }
        });

        // To link to ingredients, add a column to your ingredients_inventory table:
        // ALTER TABLE ingredients_inventory ADD COLUMN aisle_category_id INTEGER REFERENCES aisle_category(id);
      // Desired Servings Ingredients table
      db.run(`CREATE TABLE IF NOT EXISTS desired_servings_ingredients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER,
        teacher TEXT,
        class_name TEXT,
        class_date TEXT,
        class_size INTEGER,
        groups INTEGER,
        desired_servings INTEGER,
        ingredient_id INTEGER,
        ingredient_name TEXT,
        measure_qty TEXT,
        measure_unit TEXT,
        fooditem TEXT,
        stripFoodItem TEXT,
        aisle_category_id INTEGER,
        calculated_qty TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      // Add columns if missing (for existing DBs)
      db.all("PRAGMA table_info(desired_servings_ingredients)", (err, columns) => {
        if (!err && columns && !columns.some(col => col.name === 'stripFoodItem')) {
          db.run("ALTER TABLE desired_servings_ingredients ADD COLUMN stripFoodItem TEXT;");
        }
        if (!err && columns && !columns.some(col => col.name === 'aisle_category_id')) {
          db.run("ALTER TABLE desired_servings_ingredients ADD COLUMN aisle_category_id INTEGER;");
        }
      });
    // Bookings table
    db.run(`CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id TEXT,
      staff_name TEXT,
      class_name TEXT,
      booking_date TEXT,
      period TEXT,
      recipe TEXT,
      recipe_id INTEGER,
      class_size INTEGER
    )`);
  // Recipes table
  db.run(`CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uploaded_recipe_id INTEGER,
    name TEXT,
    description TEXT,
    ingredients TEXT,
    ingredients_display TEXT,
    serving_size INTEGER,
    url TEXT,
    instructions_extracted TEXT,
    instructions TEXT
  )`);

  // Add url, instructions_extracted, and instructions columns if they don't exist (for existing DBs)
  db.all("PRAGMA table_info(recipes);", (err, columns) => {
    if (!err && columns) {
      if (!columns.some(col => col.name === 'ingredients_display')) {
        db.run("ALTER TABLE recipes ADD COLUMN ingredients_display TEXT;");
        db.run("UPDATE recipes SET ingredients_display = ingredients;");
      }
      if (!columns.some(col => col.name === 'url')) {
        db.run("ALTER TABLE recipes ADD COLUMN url TEXT;");
      }
      if (!columns.some(col => col.name === 'instructions_extracted')) {
        db.run("ALTER TABLE recipes ADD COLUMN instructions_extracted TEXT;");
      }
      if (!columns.some(col => col.name === 'instructions')) {
        db.run("ALTER TABLE recipes ADD COLUMN instructions TEXT;");
      }
    }
  });

  // Department table
  db.run(`CREATE TABLE IF NOT EXISTS department (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    Staff_Name TEXT,
    staff_email TEXT,
    department TEXT,
    Classes TEXT
  );`);

  // Kamar timetable table
  db.run(`CREATE TABLE IF NOT EXISTS kamar_timetable (
    "Teacher" TEXT,
    "Teacher_Name" TEXT,
    "Form_Class" TEXT,
    "D1_P1_1" TEXT,
    "D1_P1_2" TEXT,
    "D1_P2" TEXT,
    "D1_I" TEXT,
    "D1_P3" TEXT,
    "D1_P4" TEXT,
    "D1_L" TEXT,
    "D1_P5" TEXT,
    "D1_blank_1" TEXT,
    "D1_blank_2" TEXT,
    "D2_P1_1" TEXT,
    "D2_P1_2" TEXT,
    "D2_P2" TEXT,
    "D2_I" TEXT,
    "D2_P3" TEXT,
    "D2_P4" TEXT,
    "D2_L" TEXT,
    "D2_P5" TEXT,
    "D2_blank_1" TEXT,
    "D2_blank_2" TEXT,
    "D3_P1_1" TEXT,
    "D3_P1_2" TEXT,
    "D3_P2" TEXT,
    "D3_I" TEXT,
    "D3_P3" TEXT,
    "D3_P4" TEXT,
    "D3_L" TEXT,
    "D3_P5" TEXT,
    "D3_blank_1" TEXT,
    "D3_blank_2" TEXT,
    "D4_P1_1" TEXT,
    "D4_P1_2" TEXT,
    "D4_P2" TEXT,
    "D4_I" TEXT,
    "D4_P3" TEXT,
    "D4_P4" TEXT,
    "D4_L" TEXT,
    "D4_P5" TEXT,
    "D4_blank_1" TEXT,
    "D4_blank_2" TEXT,
    "D5_P1_1" TEXT,
    "D5_P1_2" TEXT,
    "D5_P2" TEXT,
    "D5_I" TEXT,
    "D5_P3" TEXT,
    "D5_P4" TEXT,
    "D5_L" TEXT,
    "D5_P5" TEXT,
    "D5_blank_1" TEXT,
    "D5_blank_2" TEXT
  );`);

  // Ingredients inventory table (with fooditem)
  db.run(`CREATE TABLE IF NOT EXISTS ingredients_inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredient_name TEXT NOT NULL,
    recipe_id INTEGER,
    quantity TEXT,
    measure_qty REAL,
    measure_unit TEXT,
    fooditem TEXT,
    stripFoodItem TEXT,
    FOREIGN KEY(recipe_id) REFERENCES recipes(id)
  )`);

  // Add stripFoodItem column if missing (for existing DBs)
  db.all("PRAGMA table_info(ingredients_inventory)", (err, columns) => {
    if (!err && columns && !columns.some(col => col.name === 'stripFoodItem')) {
      db.run("ALTER TABLE ingredients_inventory ADD COLUMN stripFoodItem TEXT;");
    }
  });

  // Food brands table
  db.run(`CREATE TABLE IF NOT EXISTS food_brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brand_name TEXT NOT NULL UNIQUE
  )`);

  // Uploads table
  db.run(`CREATE TABLE IF NOT EXISTS uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_title TEXT NOT NULL,
    upload_type TEXT,
    source_url TEXT,
    uploaded_by TEXT,
    upload_date TEXT,
    raw_data TEXT
  )`);

  // Staff upload table for CSV import
  db.run(`CREATE TABLE IF NOT EXISTS staff_upload (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT,
    last_name TEXT,
    first_name TEXT,
    title TEXT,
    email_school TEXT
  )`);


  // Class upload table (expanded for class upload)
  db.run(`CREATE TABLE IF NOT EXISTS class_upload (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ttcode TEXT,
    level TEXT,
    name TEXT,
    qualification TEXT,
    department TEXT,
    sub_department TEXT,
    teacher_in_charge TEXT,
    description TEXT,
    star TEXT
  )`);

  // Shopping lists table
  // Classes table (for class upload and shopping list reference)
  db.run(`CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ttcode TEXT,
    level TEXT,
    name TEXT,
    qualification TEXT,
    department TEXT,
    sub_department TEXT,
    teacher_in_charge TEXT,
    description TEXT,
    star TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS shopping_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER,
    created_at TEXT,
    FOREIGN KEY(class_id) REFERENCES classes(id)
  )`);

  // Recipe display table (for published/approved recipes)
  db.run(`CREATE TABLE IF NOT EXISTS recipe_display (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    description TEXT,
    ingredients TEXT,
    serving_size INTEGER,
    url TEXT,
    instructions TEXT,
    recipeID INTEGER
  )`);
};
