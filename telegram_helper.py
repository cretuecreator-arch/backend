import sys
import asyncio
import json
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.errors import SessionPasswordNeededError

API_ID = 17349
API_HASH = '344583e45741c457fe1862106095a5eb'

# Use a file-based session to store intermediate states if needed, 
# but for this specific stateless bridge, we'll use memory or simple files.
SESSION_DIR = "sessions"
import os
if not os.path.exists(SESSION_DIR):
    os.makedirs(SESSION_DIR)

async def send_code(phone):
    client = TelegramClient(f"{SESSION_DIR}/{phone}", API_ID, API_HASH)
    await client.connect()
    try:
        sent = await client.send_code_request(phone)
        return {"status": "success", "phone_code_hash": sent.phone_code_hash}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        await client.disconnect()

async def verify_code(phone, code, phone_code_hash, password=None):
    client = TelegramClient(f"{SESSION_DIR}/{phone}", API_ID, API_HASH)
    await client.connect()
    try:
        try:
            await client.sign_in(phone, code, phone_code_hash=phone_code_hash)
        except SessionPasswordNeededError:
            if not password:
                return {"status": "password_required"}
            await client.sign_in(password=password)
        
        session_string = client.session.save()
        return {"status": "success", "session": session_string}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        await client.disconnect()

if __name__ == "__main__":
    command = sys.argv[1]
    data = json.loads(sys.argv[2])
    
    if command == "send_code":
        result = asyncio.run(send_code(data['phone']))
    elif command == "verify_code":
        result = asyncio.run(verify_code(
            data['phone'], 
            data['code'], 
            data['phone_code_hash'],
            data.get('password')
        ))
    else:
        result = {"status": "error", "message": "Unknown command"}
    
    print(json.dumps(result))
