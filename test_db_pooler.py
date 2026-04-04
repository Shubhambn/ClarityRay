import psycopg, sys

passwords = ["Shubh123#@!", "YKytq62ZQwDAAyOQ"]
users = ["postgres", "postgres.jfqiqeyxnzztvkztinsu"]

for pwd in passwords:
    for user in users:
        print(f"Trying user={user} pwd={pwd[:5]}...")
        try:
            conn = psycopg.connect(
                host="db.jfqiqeyxnzztvkztinsu.supabase.co",
                port=6543,
                user=user,
                password=pwd,
                dbname="postgres",
                connect_timeout=3
            )
            print("SUCCESS:", user, pwd[:5])
            conn.close()
            sys.exit(0)
        except Exception as e:
            pass

print("All exhausted")
sys.exit(1)
