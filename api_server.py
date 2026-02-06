import sqlite3
import json
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler
import urllib.parse
import requests

# Configurações do Supabase (obtidas do index.html)
SUPABASE_URL = "https://cjlowdjmqdsgigstagoi.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqbG93ZGptcWRzZ2lnc3RhZ29pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDM0NzQxMSwiZXhwIjoyMDg1OTIzNDExfQ.D1kfCPgH5Hlw9Mkxj9b74XnHFRG5HIFh1gOftpqB_g0"

class HealthHandler(SimpleHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        
        if parsed_path.path == '/log_entry':
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            query = urllib.parse.parse_qs(parsed_path.query)
            data_str = query.get('data', [None])[0]
            
            if data_str:
                try:
                    payload = json.loads(data_str)
                    print(f"ENTRY_RECEIVED: {json.dumps(payload)}")
                    
                    # Salvar no Supabase (chat_logs)
                    headers = {
                        "apikey": SUPABASE_KEY,
                        "Authorization": f"Bearer {SUPABASE_KEY}",
                        "Content-Type": "application/json",
                        "Prefer": "return=representation"
                    }
                    
                    supabase_payload = {
                        "date": payload.get('date'),
                        "text": payload.get('text'),
                        "status": "received"
                    }
                    
                    res = requests.post(f"{SUPABASE_URL}/rest/v1/chat_logs", headers=headers, json=supabase_payload)
                    if res.status_code >= 200 and res.status_code < 300:
                        self.wfile.write(json.dumps({"status": "ok", "message": "Log saved to Supabase"}).encode())
                    else:
                        print(f"Error saving to Supabase: {res.text}")
                        self.wfile.write(json.dumps({"status": "partial_ok", "error": "Supabase error"}).encode())
                except Exception as e:
                    print(f"Error processing log_entry: {e}")
                    self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode())
                return
            
            self.wfile.write(json.dumps({"status": "error", "message": "No data"}).encode())
            return

        return super().do_GET()

if __name__ == "__main__":
    os.chdir('/home/pedro/clawd/projects/health-dashboard')
    server = HTTPServer(('0.0.0.0', 8000), HealthHandler)
    print("API Server running on port 8000...")
    server.serve_forever()
