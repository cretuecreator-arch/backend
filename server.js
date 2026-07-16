require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors({
  origin: [
    'https://frontend-sigma-jade-61.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:5500'
  ]
}));
app.use(express.json());

// In-memory OTP store (fine for demo/small scale, use Redis or a DB in production).
// Structure: { "+95912345678": { code: "123456", expiresAt: 169999999 } }
const otpStore = new Map();

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

function generateOtp() {
  // 5-digit code, to match the 5-box entry screen on the frontend
  return Math.floor(10000 + Math.random() * 90000).toString();
}

// POST /api/send-otp  { phone: "+95912345678" }
app.post('/api/send-otp', async (req, res) => {
  const { phone } = req.body;

  if (!phone || typeof phone !== 'string') {
    return res.status(400).json({ error: 'A valid phone number is required.' });
  }

  const code = generateOtp();
  otpStore.set(phone, { code, expiresAt: Date.now() + OTP_TTL_MS });

  try {
    // ---------------------------------------------------------------
    // Plug in a real SMS provider here (Twilio, Vonage, etc). Example
    // with Twilio (npm install twilio, then uncomment):
    //
    // const twilio = require('twilio')(
    //   process.env.TWILIO_ACCOUNT_SID,
    //   process.env.TWILIO_AUTH_TOKEN
    // );
    // await twilio.messages.create({
    //   body: `Your verification code is ${code}`,
    //   from: process.env.TWILIO_FROM_NUMBER,
    //   to: phone,
    // });
    // ---------------------------------------------------------------

    // For now (no SMS provider configured), just log it so you can test locally.
    console.log(`[OTP] ${phone} -> ${code}`);

    return res.json({ message: 'OTP sent successfully.' });
  } catch (err) {
    console.error('Failed to send OTP:', err);
    return res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
  }
});

// POST /api/verify-otp  { phone: "+95912345678", code: "123456" }
app.post('/api/verify-otp', (req, res) => {
  const { phone, code } = req.body;

  if (!phone || !code) {
    return res.status(400).json({ error: 'Phone and code are required.' });
  }

  const record = otpStore.get(phone);

  if (!record) {
    return res.status(400).json({ error: 'No OTP was requested for this number.' });
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(phone);
    return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
  }

  if (record.code !== code) {
    return res.status(400).json({ error: 'Incorrect OTP.' });
  }

  otpStore.delete(phone);
  return res.json({ message: 'Phone number verified.' });
});

app.get('/', (req, res) => {
  res.send('OTP backend is running.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
