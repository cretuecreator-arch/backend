import sys
import asyncio
import json
import os
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.errors import SessionPasswordNeededError

API_ID = 17349
API_HASH = '344583e45741c457fe1862106095a5eb'

SESSION_DIR = "sessions"
if not os.path.exists(SESSION_DIR):
    os.makedirs(SESSION_DIR)

# Global client cache to keep connection alive during the login flow
# This significantly speeds up the verification step
clients = {}

async def get_client(phone):
    if phone not in clients:
        client = TelegramClient(f"{SESSION_DIR}/{phone}", API_ID, API_HASH)
        await client.connect()
        clients[phone] = client
    return clients[phone]

async def send_code(phone):
    client = await get_client(phone)
    try:
        sent = await client.send_code_request(phone)
        return {"status": "success", "phone_code_hash": sent.phone_code_hash}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    # Note: We don't disconnect here to keep the session alive for the next step

async def verify_code(phone, code, phone_code_hash, password=None):
    client = await get_client(phone)
    try:
        try:
            await client.sign_in(phone, code, phone_code_hash=phone_code_hash)
        except SessionPasswordNeededError:
            if not password:
                return {"status": "password_required"}
            await client.sign_in(password=password)
        
        session_string = client.session.save()
        if not session_string:
            # Fallback if save() returns empty for some reason
            from telethon.sessions import StringSession
            session_string = StringSession.save(client.session)
            
        return {"status": "success", "session": str(session_string)}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        await client.disconnect()
        if phone in clients:
            del clients[phone]

if __name__ == "__main__":
    # Since we are calling this as a child process, 
    # the "global" clients cache won't persist between calls.
    # To truly speed it up, we'd need a long-running python daemon.
    # For now, we optimize by ensuring clean connection handling.
    
    command = sys.argv[1]
    data = json.loads(sys.argv[2])
    
    async def run():
        if command == "send_code":
            res = await send_code(data['phone'])
            # For child_process mode, we MUST disconnect or it hangs
            if data['phone'] in clients:
                await clients[data['phone']].disconnect()
        elif command == "verify_code":
            res = await verify_code(
                data['phone'], 
                data['code'], 
                data['phone_code_hash'],
                data.get('password')
            )
        else:
            res = {"status": "error", "message": "Unknown command"}
        print(json.dumps(res))

    asyncio.run(run())
