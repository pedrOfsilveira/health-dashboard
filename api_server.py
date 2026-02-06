import sqlite3
import json
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler
import urllib.parse

DB_PATH = '/home/pedro/clawd/projects/health-dashboard/health_data.db'

class HealthHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        
        if parsed_path.path == '/log_entry':
            query = urllib.parse.parse_qs(parsed_path.query)
            data_str = query.get('data', [None])[0]
            if data_str:
                # Logar a entrada para o main agent processar via watchdog
                print(f"ENTRY_RECEIVED: {data_str}")
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"status":"ok"}')
                return

        if parsed_path.path == '/api/data':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Buscar dias
            cursor.execute("SELECT * FROM days ORDER BY date DESC")
            days = [dict(row) for row in cursor.fetchall()]
            
            result = {}
            for day in days:
                date = day['date']
                # Buscar refeições para o dia
                cursor.execute("SELECT * FROM meals WHERE date=?", (date,))
                meals = []
                for m_row in cursor.fetchall():
                    meal = dict(m_row)
                    # Buscar itens da refeição
                    cursor.execute("SELECT name, kcal, ptn FROM meal_items WHERE meal_id=?", (meal['id'],))
                    meal['items'] = [dict(i_row) for i_row in cursor.fetchall()]
                    meals.append(meal)
                
                result[date] = {
                    "date": date,
                    "summary": {
                        "kcal": day['kcal_total'],
                        "ptn": day['ptn_total'],
                        "carb": day['carb_total'],
                        "fat": day['fat_total']
                    },
                    "sleep": {
                        "start": day['sleep_start'],
                        "end": day['sleep_end'],
                        "quality": day['sleep_quality']
                    },
                    "meals": meals,
                    "notes": [day['notes']] if day['notes'] else []
                }
            
            conn.close()
            self.wfile.write(json.dumps(result).encode())
            return

        return super().do_GET()

if __name__ == "__main__":
    os.chdir('/home/pedro/clawd/projects/health-dashboard')
    server = HTTPServer(('0.0.0.0', 8080), HealthHandler)
    print("API Server running on port 8080...")
    server.serve_forever()
