import urllib.request
import urllib.error

url = 'http://localhost:8000/manifest'
try:
    with urllib.request.urlopen(url) as response:
        print("Status:", response.status)
        print("Body:", response.read().decode())
except urllib.error.HTTPError as e:
    print("HTTP Error code:", e.code)
    print("HTTP Error body:", e.read().decode())
except Exception as e:
    print("Other error:", e)
