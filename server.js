const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.get('/', (req, res) => {
  res.send('SmartFarmer USSD Gateway is Online!');
});

app.post('/ussd', async (req, res) => {
  let { sessionId, serviceCode, phoneNumber, text } = req.body;
  text = text || '';

  let response = '';
  const textArray = text.split('*');
  const userOption = textArray[0];

  try {
    if (text === '') {
      response = `CON Welcome to SmartFarmer E-Voucher System
1. Check Voucher Balance
2. Redeem Voucher
3. Register Farmer`;
    } 
    else if (userOption === '1') {
      response = `END Your active voucher balance is KES 5,000 for Fertilizer Subsidy.`;
    } 
    else if (userOption === '2') {
      if (textArray.length === 1) {
        response = `CON Enter Voucher Code:`;
      } else if (textArray.length === 2) {
        response = `CON Enter Agro-Dealer PIN:`;
      } else if (textArray.length === 3) {
        const voucherCode = textArray[1];
        const dealerPin = textArray[2];

        const result = await pool.query(
          'SELECT * FROM vouchers WHERE code = $1 AND status = $2', 
          [voucherCode, 'ACTIVE']
        );

        if (result.rows.length > 0) {
          await pool.query(
            'UPDATE vouchers SET status = $1 WHERE code = $2',
            ['REDEEMED', voucherCode]
          );
          response = `END Success! Voucher ${voucherCode} redeemed for KES 5,000.`;
        } else {
          response = `END Invalid or already redeemed voucher code: ${voucherCode}.`;
        }
      }
    } 
    else if (userOption === '3') {
      if (textArray.length === 1) {
        response = `CON Enter National ID Number:`;
      } else if (textArray.length === 2) {
        const nationalId = textArray[1];

        await pool.query(
          'INSERT INTO farmers (phone_number, national_id) VALUES ($1, $2) ON CONFLICT (phone_number) DO NOTHING',
          [phoneNumber, nationalId]
        );

        response = `END Thank you! ID ${nationalId} has been registered to ${phoneNumber}.`;
      }
    } 
    else {
      response = `END Invalid menu option. Please try again.`;
    }
  } catch (err) {
    console.error('USSD Database Error:', err);
    response = `END Service temporary unavailable. Please try again later.`;
  }

  res.set('Content-Type', 'text/plain');
  res.send(response);
});

app.listen(port, async () => {
  console.log(`Server listening on port ${port}`);
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS farmers (
        id SERIAL PRIMARY KEY,
        phone_number VARCHAR(20) UNIQUE NOT NULL,
        national_id VARCHAR(50) NOT NULL
      );
      CREATE TABLE IF NOT EXISTS vouchers (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        status VARCHAR(20) DEFAULT 'ACTIVE'
      );
      INSERT INTO vouchers (code, status) 
      VALUES ('VOUCH-5465', 'ACTIVE') 
      ON CONFLICT (code) DO NOTHING;
    `);
    console.log('Database tables ready!');
  } catch (err) {
    console.error('Database initialization failed:', err);
  }
});
        
