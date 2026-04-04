import psycopg
import sys
try:
    conn = psycopg.connect(
        host="db.jfqiqeyxnzztvkztinsu.supabase.co",
        port=6543,
        user="postgres",
        password="Shubh123#@!",
        dbname="postgres",
        connect_timeout=5
    )
    print("Connected to 6543 with direct kwargs!")
    conn.close()
    sys.exit(0)
except Exception as e:
    print("6543 kwargs Failed:", e)

try:
    conn = psycopg.connect(
        host="db.jfqiqeyxnzztvkztinsu.supabase.co",
        port=5432,
        user="postgres",
        password="Shubh123#@!",
        dbname="postgres",
        connect_timeout=5
    )
    print("Connected to 5432 with direct kwargs!")
    conn.close()
    sys.exit(0)
except Exception as e:
    print("5432 kwargs Failed:", e)
