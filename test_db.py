import psycopg
import sys
try:
    conn = psycopg.connect("postgresql://postgres:Shubh123%23%40%21@db.jfqiqeyxnzztvkztinsu.supabase.co:6543/postgres", connect_timeout=5)
    print("Connected to 6543")
    conn.close()
    sys.exit(0)
except Exception as e:
    print("6543 Failed:", e)

try:
    conn = psycopg.connect("postgresql://postgres:Shubh123%23%40%21@db.jfqiqeyxnzztvkztinsu.supabase.co:5432/postgres", connect_timeout=5)
    print("Connected to 5432")
    conn.close()
    sys.exit(0)
except Exception as e:
    print("5432 Failed:", e)
