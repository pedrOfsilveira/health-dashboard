import sqlite3
import json
from supabase import create_client, Client

SUPABASE_URL = "https://cjlowdjmqdsgigstagoi.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqbG93ZGptcWRzZ2lnc3RhZ29pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDM0NzQxMSwiZXhwIjoyMDg1OTIzNDExfQ.D1kfCPgH5Hlw9Mkxj9b74XnHFRG5HIFh1gOftpqB_g0"
DB_PATH = '/home/pedro/clawd/projects/health-dashboard/health_data.db'

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def migrate():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # 1. Migrar Dias
    cursor.execute("SELECT * FROM days")
    days = [dict(row) for row in cursor.fetchall()]
    for day in days:
        # Supabase usa 'upsert' para não duplicar
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
        supabase.table("days").upsert(data).execute()

    # 2. Migrar Refeições e Itens
    cursor.execute("SELECT * FROM meals")
    meals = [dict(row) for row in cursor.fetchall()]
    for meal in meals:
        # No Supabase o ID será novo, então removemos o do SQLite
        meal_data = {
            "date": meal['date'],
            "name": meal['name'],
            "kcal": meal['kcal'],
            "ptn": meal['ptn']
        }
        response = supabase.table("meals").insert(meal_data).execute()
        new_meal_id = response.data[0]['id']

        # Buscar itens
        cursor.execute("SELECT * FROM meal_items WHERE meal_id=?", (meal['id'],))
        items = [dict(row) for row in cursor.fetchall()]
        for item in items:
            item_data = {
                "meal_id": new_meal_id,
                "name": item['name'],
                "kcal": item['kcal'],
                "ptn": item['ptn']
            }
            supabase.table("meal_items").insert(item_data).execute()

    conn.close()
    print("Migração concluída com sucesso para o Supabase!")

if __name__ == "__main__":
    migrate()
