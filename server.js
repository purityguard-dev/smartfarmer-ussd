const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 10000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// PostgreSQL Pool Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Initialize Database Tables & Migrations safely
async function initDb() {
  try {
    // 1. Ensure farmers table & all columns exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS farmers (
        id SERIAL PRIMARY KEY,
        phone_number VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100),
        national_id VARCHAR(50),
        location VARCHAR(100),
        registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Add missing columns to farmers if older table version exists
    await pool.query(`
      ALTER TABLE farmers ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50) UNIQUE;
      ALTER TABLE farmers ADD COLUMN IF NOT EXISTS name VARCHAR(100);
      ALTER TABLE farmers ADD COLUMN IF NOT EXISTS national_id VARCHAR(50);
      ALTER TABLE farmers ADD COLUMN IF NOT EXISTS location VARCHAR(100);
    `);

    // 2. Ensure vouchers table & all columns exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vouchers (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        status VARCHAR(20) DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add missing columns to vouchers if older table version exists
    await pool.query(`
      ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS code VARCHAR(50) UNIQUE;
      ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS amount DECIMAL(10, 2) DEFAULT 500.00;
      ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ACTIVE';
    `);

    // 3. Insert default test vouchers if table is empty
    const voucherCheck = await pool.query('SELECT COUNT(*) FROM vouchers');
    if (parseInt(voucherCheck.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO vouchers (code, amount, status) VALUES
        ('FARM2026', 500.00, 'ACTIVE'),
        ('EVOUCHER100', 1000.00, 'ACTIVE')
        ON CONFLICT DO NOTHING;
      `);
    }

    console.log('Database initialized and columns migrated successfully.');
  } catch (err) {
    console.error('Database initialization error:', err.message);
  }
}

initDb();

// USSD Endpoint
app.post('/ussd', async (req, res) => {
  res.set('Content-Type', 'text/plain');

  try {
    const { sessionId, serviceCode, phoneNumber, text } = req.body;
    let response = '';

    const rawText = text ? text.trim() : '';
    const textArray = rawText.length > 0 ? rawText.split('*') : [];

    if (rawText === '') {
      response = `CON Welcome to SmartFarmer Kenya
1. Register Farmer
2. Check Voucher Status
3. Redeem Voucher`;
    } 
    else if (textArray[0] === '1') {
      if (textArray.length === 1) {
        response = `CON Enter your Full Name:`;
      } else if (textArray.length === 2) {
        response = `CON Enter your National ID:`;
      } else if (textArray.length === 3) {
        response = `CON Enter your Location:`;
      } else if (textArray.length === 4) {
        const name = textArray[1].trim();
        const nationalId = textArray[2].trim();
        const location = textArray[3].trim();
        const phone = phoneNumber ? phoneNumber.trim() : 'UNKNOWN';

        await pool.query(
          `INSERT INTO farmers (phone_number, name, national_id, location)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (phone_number) 
           DO UPDATE SET name = $2, national_id = $3, location = $4`,
          [phone, name, nationalId, location]
        );

        response = `END Registration successful!\nWelcome to SmartFarmer, ${name}.`;
      }
    } 
    else if (textArray[0] === '2') {
      const result = await pool.query(
        'SELECT code, amount, status FROM vouchers WHERE status = $1 LIMIT 1', 
        ['ACTIVE']
      );

      if (result.rows.length > 0) {
        const v = result.rows[0];
        response = `END Active Voucher Found:\nCode: ${v.code}\nAmount: KES ${v.amount}`;
      } else {
        response = `END No active e-vouchers found for your account.`;
      }
    } 
    else if (textArray[0] === '3') {
      if (textArray.length === 1) {
        response = `CON Enter Voucher Code to redeem:`;
      } else if (textArray.length === 2) {
        const code = textArray[1].trim();
        const resV = await pool.query(
          'SELECT * FROM vouchers WHERE code = $1 AND status = $2', 
          [code, 'ACTIVE']
        );

        if (resV.rows.length > 0) {
          await pool.query(
            'UPDATE vouchers SET status = $1 WHERE code = $2', 
            ['REDEEMED', code]
          );
          response = `END Voucher ${code} redeemed successfully!`;
        } else {
          response = `END Invalid or already redeemed voucher code.`;
        }
      }
    } else {
      response = `END Invalid option. Please try again.`;
    }

    res.send(response);
  } catch (err) {
    console.error('USSD Processing Error:', err.message);
    res.send('END Technical error occurred. Please try again.');
  }
});

app.listen(port, () => {
  console.log(`SmartFarmer USSD Server running on port ${port}`);
});
  
