import sqlite3
import requests
import re
from datetime import datetime

SUPABASE_URL = "https://cjlowdjmqdsgigstagoi.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqbG93ZGptcWRzZ2lnc3RhZ29pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDM0NzQxMSwiZXhwIjoyMDg1OTIzNDExfQ.D1kfCPgH5Hlw9Mkxj9b74XnHFRG5HIFh1gOftpqB_g0"
LOG_PATH = '/home/pedro/clawd/memory/sleep_nutrition_log.md'

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

def parse_and_migrate():
    with open(LOG_PATH, 'r') as f:
        content = f.read()

    sections = content.split('## ')
    for section in sections[1:]:
        lines = section.split('\n')
        date = lines[0].strip()
        print(f"Processando {date}...")
        
        day_data = {
            "date": date,
            "kcal_total": 0, "ptn_total": 0, "carb_total": 0, "fat_total": 0,
            "sleep_start": None, "sleep_end": None, "sleep_quality": "BOA",
            "notes": ""
        }
        
        meals = []
        
        for line in lines:
            line = line.strip()
            if line.startswith('- sleep:'):
                match = re.search(r'deitei (\d{2}:\d{2}) -> acordou (\d{2}:\d{2}); qualidade: ([^;]+)', line)
                if match:
                    day_data["sleep_start"], day_data["sleep_end"], day_data["sleep_quality"] = match.groups()
            
            elif line.startswith('- summary:'):
                match = re.search(r'summary: (\d+) kcal, (\d+)g ptn, (\d+)g carb, (\d+)g fat', line)
                if match:
                    day_data["kcal_total"], day_data["ptn_total"], day_data["carb_total"], day_data["fat_total"] = map(int, match.groups())

            elif line.startswith('- notes:'):
                day_data["notes"] = line.replace('- notes:', '').strip()

            elif line.startswith('  -'):
                meal_text = line.replace('  -', '').strip()
                header_match = re.match(r'^([^\(]+)\s*\((\d+)\s*kcal,\s*(\d+)g\s*ptn\)', meal_text)
                if header_match:
                    meal = {
                        "name": header_match.group(1).trim() if hasattr(header_match.group(1), 'trim') else header_match.group(1).strip(),
                        "kcal": int(header_match.group(2)),
                        "ptn": int(header_match.group(3)),
                        "items": []
                    }
                    details = meal_text.split(':')
                    if len(details) > 1:
                        items_raw = re.findall(r'([^,]+?)\s*\((\d+)\s*kcal,\s*(\d+)g\s*ptn\)', details[1])
                        for i in items_raw:
                            meal["items"].append({"name": i[0].strip(), "kcal": int(i[1]), "ptn": int(i[2])})
                    meals.append(meal)

        # Upsert Dia
        requests.post(f"{SUPABASE_URL}/rest/v1/days", headers=headers, json=day_data)
        
        # Inserir Refeições
        for m in meals:
            m_payload = {"date": date, "name": m["name"], "kcal": m["kcal"], "ptn": m["ptn"]}
            res = requests.post(f"{SUPABASE_URL}/rest/v1/meals", headers=headers, json=m_payload)
            if res.status_code in [200, 201]:
                m_id = res.json()[0]['id']
                for it in m["items"]:
                    it_payload = {"meal_id": m_id, "name": it["name"], "kcal": it["kcal"], "ptn": it["ptn"]}
                    requests.post(f"{SUPABASE_URL}/rest/v1/meal_items", headers=headers, json=it_payload)

    print("MIGRAÇÃO DO LOG COMPLETA!")

if __name__ == "__main__":
    parse_and_migrate()
