const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Main USSD Endpoint for Africa's Talking
app.post('/ussd', (req, res) => {
  const { text } = req.body;
  let ussdResponse = '';
  const textArray = (text || '').split('*');

  // Root Menu
  if (text === '' || !text) {
    ussdResponse = `CON Welcome to SmartFarmer E-Voucher Gateway
1. Check My Subsidy Balance
2. Redeem Voucher at Agro-Dealer
3. Register New Farmer`;
  } 
  
  // Option 1: Check Balance
  else if (text === '1') {
    ussdResponse = `END SmartFarmer E-Voucher Status:
Allocated: 1x 50kg Fertilizer (Subsidized)
Status: READY FOR PICKUP
Visit your nearest registered ward dealer.`;
  } 
  
  // Option 2: Redeem Voucher
  else if (text === '2') {
    ussdResponse = `CON Enter your 8-digit E-Voucher Code (e.g. VOUCH-9921):`;
  } 
  else if (textArray[0] === '2' && textArray.length === 2) {
    const voucherCode = textArray[1].toUpperCase();
    ussdResponse = `CON Voucher ${voucherCode} Found!
Item: 50kg NPK Fertilizer
Enter 4-Digit Agro-Dealer PIN to Authorize:`;
  } 
  else if (textArray[0] === '2' && textArray.length === 3) {
    const voucherCode = textArray[1].toUpperCase();
    const dealerPin = textArray[2];

    if (dealerPin === '1234') {
      ussdResponse = `END SUCCESS!
Voucher ${voucherCode} REDEEMED.
Agro-Dealer authorized to release goods. SMS confirmation sent.`;
    } else {
      ussdResponse = `END Authorization Failed: Incorrect Agro-Dealer PIN.`;
    }
  } 

  // Option 3: Register Farmer
  else if (text === '3') {
    ussdResponse = `CON Enter your National ID Number for Ward Verification:`;
  } 
  else if (textArray[0] === '3' && textArray.length === 2) {
    const idNumber = textArray[1];
    ussdResponse = `END Registration Received for ID ${idNumber}! Submitted to County Agriculture Dept.`;
  } 

  // Fallback
  else {
    ussdResponse = `END Invalid selection. Please try again.`;
  }

  // Send plain text response
  res.set('Content-Type', 'text/plain');
  res.send(ussdResponse);
});

// Port configuration for Cloud deployment
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
           
