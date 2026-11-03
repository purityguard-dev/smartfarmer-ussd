const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// PostgreSQL Connection Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Auto-create database tables on server launch
const initDb = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS farmers (
        id SERIAL PRIMARY KEY,
        national_id VARCHAR(50) UNIQUE NOT NULL,
        registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS vouchers (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        item VARCHAR(100) NOT NULL,
        is_redeemed BOOLEAN DEFAULT FALSE,
        redeemed_at TIMESTAMP
      );

      INSERT INTO vouchers (code, item) 
      VALUES ('VOUCH-5465', '50kg NPK Fertilizer'), ('VOUCH-9921', '10kg Certified Maize Seed')
      ON CONFLICT (code) DO NOTHING;
    `);
    console.log('Database tables initialized successfully!');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
};
initDb();

// USSD Callback Endpoint
app.post('/ussd', async (req, res) => {
  const { text } = req.body;
  let ussdResponse = '';
  const textArray = (text || '').split('*');

  try {
    // Main Menu
    if (text === '' || !text) {
      ussdResponse = `CON Welcome to SmartFarmer E-Voucher Gateway
1. Check My Subsidy Balance
2. Redeem Voucher at Agro-Dealer
3. Register New Farmer`;
    } 

    // Option 1: Balance Check
    else if (text === '1') {
      ussdResponse = `END SmartFarmer E-Voucher Status:
Allocated: 1x 50kg NPK Fertilizer
Status: READY FOR PICKUP at registered ward dealer.`;
    } 

    // Option 2: Redeem Voucher
    else if (text === '2') {
      ussdResponse = `CON Enter your E-Voucher Code (e.g. VOUCH-5465):`;
    } 
    else if (textArray[0] === '2' && textArray.length === 2) {
      const voucherCode = textArray[1].trim().toUpperCase();
      
      const vResult = await pool.query('SELECT * FROM vouchers WHERE code = $1', [voucherCode]);

      if (vResult.rows.length === 0) {
        ussdResponse = `END Voucher ${voucherCode} not found in system.`;
      } else if (vResult.rows[0].is_redeemed) {
        ussdResponse = `END ALREADY REDEEMED! Voucher ${voucherCode} was already used.`;
      } else {
        ussdResponse = `CON Voucher ${voucherCode} Valid!
Item: ${vResult.rows[0].item}
Enter 4-Digit Agro-Dealer PIN:`;
      }
    } 
    else if (textArray[0] === '2' && textArray.length === 3) {
      const voucherCode = textArray[1].trim().toUpperCase();
      const dealerPin = textArray[2].trim();

      if (dealerPin === '1234') {
        const updateRes = await pool.query(
          'UPDATE vouchers SET is_redeemed = TRUE, redeemed_at = NOW() WHERE code = $1 AND is_redeemed = FALSE RETURNING *',
          [voucherCode]
        );

        if (updateRes.rows.length > 0) {
          ussdResponse = `END SUCCESS!
Voucher ${voucherCode} REDEEMED & SAVED IN DB.
Agro-Dealer authorized to release goods.`;
        } else {
          ussdResponse = `END Redemption Failed: Voucher already redeemed or invalid.`;
        }
      } else {
        ussdResponse = `END Authorization Failed: Incorrect Agro-Dealer PIN.`;
      }
    } 

    // Option 3: Register Farmer (Saved to Postgres)
    else if (text === '3') {
      ussdResponse = `CON Enter your National ID Number for Ward Verification:`;
    } 
    else if (textArray[0] === '3' && textArray.length === 2) {
      const idNumber = textArray[1].trim();
      
      await pool.query(
        'INSERT INTO farmers (national_id) VALUES ($1) ON CONFLICT (national_id) DO NOTHING',
        [idNumber]
      );

      ussdResponse = `END Registration Saved! National ID ${idNumber} recorded permanently in SmartFarmer Database.`;
    } 

    else {
      ussdResponse = `END Invalid selection. Please try again.`;
    }
  } catch (err) {
    console.error('USSD Database Error:', err);
    ussdResponse = `END System Error. Please try again later.`;
  }

  res.set('Content-Type', 'text/plain');
  res.send(ussdResponse);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  
