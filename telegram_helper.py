import sys
import asyncio
import json
import os
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.errors import SessionPasswordNeededError

API_ID = 17349
API_HASH = '344583e45741c457fe1862106095a5eb'

# We will use an in-memory session to ensure StringSession.save() always works
# File-based sessions sometimes fail to return a string session correctly
async def send_code(phone):
    # Use a fresh StringSession for each request
    client = TelegramClient(StringSession(), API_ID, API_HASH)
    await client.connect()
    try:
        sent = await client.send_code_request(phone)
        # We must return the current session state so we can resume it in the next step
        return {
            "status": "success", 
            "phone_code_hash": sent.phone_code_hash,
            "temp_session": client.session.save()
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        await client.disconnect()

async def verify_code(phone, code, phone_code_hash, temp_session, password=None):
    # Resume the session from the temporary string session
    client = TelegramClient(StringSession(temp_session), API_ID, API_HASH)
    await client.connect()
    try:
        try:
            await client.sign_in(phone, code, phone_code_hash=phone_code_hash)
        except SessionPasswordNeededError:
            if not password:
                return {"status": "password_required", "temp_session": temp_session}
            await client.sign_in(password=password)
        
        # This is the final permanent string session
        final_session = client.session.save()
        return {"status": "success", "session": final_session}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        await client.disconnect()

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"status": "error", "message": "Missing arguments"}))
        sys.exit(1)

    command = sys.argv[1]
    data = json.loads(sys.argv[2])
    
    async def run():
        if command == "send_code":
            res = await send_code(data['phone'])
        elif command == "verify_code":
            res = await verify_code(
                data['phone'], 
                data['code'], 
                data['phone_code_hash'],
                data.get('temp_session'), # Pass the temp session back
                data.get('password')
            )
        else:
            res = {"status": "error", "message": "Unknown command"}
        print(json.dumps(res))

    asyncio.run(run())
