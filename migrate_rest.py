import sqlite3
import requests
import json
from datetime import datetime

SUPABASE_URL = "https://cjlowdjmqdsgigstagoi.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqbG93ZGptcWRzZ2lnc3RhZ29pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDM0NzQxMSwiZXhwIjoyMDg1OTIzNDExfQ.D1kfCPgH5Hlw9Mkxj9b74XnHFRG5HIFh1gOftpqB_g0"
DB_PATH = '/home/pedro/clawd/projects/health-dashboard/health_data.db'

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

def migrate():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # 1. Migrar Dias
    cursor.execute("SELECT * FROM days")
    days = [dict(row) for row in cursor.fetchall()]
    print(f"Migrando {len(days)} dias...")
    for day in days:
        data = {
            "date": day['date'],
            "kcal_total": day['kcal_total'],
            "ptn_total": day['ptn_total'],
            "carb_total": day['carb_total'],
            "fat_total": day['fat_total'],
            "sleep_start": day['sleep_start'],
            "sleep_end": day['sleep_end'],
            "sleep_quality": day['sleep_quality'],
            "notes": day['notes']
        }
        res = requests.post(f"{SUPABASE_URL}/rest/v1/days", headers=headers, json=data)
        if res.status_code not in [200, 201]:
            # Se já existir, tentar patch
            requests.patch(f"{SUPABASE_URL}/rest/v1/days?date=eq.{day['date']}", headers=headers, json=data)

    # 2. Migrar Refeições
    cursor.execute("SELECT * FROM meals")
    meals = [dict(row) for row in cursor.fetchall()]
    print(f"Migrando {len(meals)} refeições...")
    for meal in meals:
        meal_data = {
            "date": meal['date'],
            "name": meal['name'],
            "kcal": meal['kcal'],
            "ptn": meal['ptn']
        }
        res = requests.post(f"{SUPABASE_URL}/rest/v1/meals", headers=headers, json=meal_data)
        if res.status_code in [200, 201]:
            new_meal_id = res.json()[0]['id']
            
            # Migrar itens da refeição
            cursor.execute("SELECT * FROM meal_items WHERE meal_id=?", (meal['id'],))
            items = [dict(row) for row in cursor.fetchall()]
            for item in items:
                item_data = {
                    "meal_id": new_meal_id,
                    "name": item['name'],
                    "kcal": item['kcal'],
                    "ptn": item['ptn']
                }
                requests.post(f"{SUPABASE_URL}/rest/v1/meal_items", headers=headers, json=item_data)

    conn.close()
    print("MIGRAÇÃO CONCLUÍDA!")

if __name__ == "__main__":
    migrate()
