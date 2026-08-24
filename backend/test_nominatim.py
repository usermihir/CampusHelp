import requests
import time

def test_nominatim():
    places = [
        "Nalanda Complex, IIT Kharagpur",
        "Takshashila, IIT Kharagpur",
        "Central Library, IIT Kharagpur",
        "Netaji Auditorium, IIT Kharagpur"
    ]
    
    for place in places:
        url = "https://nominatim.openstreetmap.org/search"
        params = {
            "q": place,
            "format": "json",
            "limit": 1
        }
        headers = {
            "User-Agent": "CampusHelp/1.0 (test script)"
        }
        resp = requests.get(url, params=params, headers=headers)
        data = resp.json()
        if data:
            print(f"{place}: {data[0]['lat']}, {data[0]['lon']}")
        else:
            print(f"{place}: Not found")
        time.sleep(1)

if __name__ == "__main__":
    test_nominatim()
