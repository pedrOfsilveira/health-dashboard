import sqlite3
import json
import os
import sys
from datetime import datetime

DB_PATH = '/home/pedro/clawd/projects/health-dashboard/health_data.db'

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Tabela de dias (resumo)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS days (
            date TEXT PRIMARY KEY,
            kcal_total INTEGER DEFAULT 0,
            ptn_total INTEGER DEFAULT 0,
            carb_total INTEGER DEFAULT 0,
            fat_total INTEGER DEFAULT 0,
            sleep_start TEXT,
            sleep_end TEXT,
            sleep_quality TEXT,
            notes TEXT
        )
    ''')
    
    # Tabela de refeições
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS meals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            name TEXT,
            kcal INTEGER,
            ptn INTEGER,
            FOREIGN KEY(date) REFERENCES days(date)
        )
    ''')
    
    # Tabela de itens de refeição
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS meal_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            meal_id INTEGER,
            name TEXT,
            kcal INTEGER,
            ptn INTEGER,
            FOREIGN KEY(meal_id) REFERENCES meals(id) ON DELETE CASCADE
        )
    ''')
    
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print(f"Database initialized at {DB_PATH}")
