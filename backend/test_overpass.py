import requests

def test_overpass():
    overpass_url = "http://overpass-api.de/api/interpreter"
    # Query for named buildings or amenities in IIT KGP bounding box
    overpass_query = """
    [out:json];
    (
      node["name"](22.31,87.29,22.33,87.32);
      way["name"]["building"](22.31,87.29,22.33,87.32);
    );
    out center;
    """
    response = requests.get(overpass_url, params={'data': overpass_query})
    data = response.json()
    
    print(f"Found {len(data['elements'])} elements")
    for el in data['elements'][:10]:
        name = el.get('tags', {}).get('name', 'Unknown')
        lat = el.get('lat') or el.get('center', {}).get('lat')
        lon = el.get('lon') or el.get('center', {}).get('lon')
        print(f"{name}: {lat}, {lon}")

if __name__ == "__main__":
    test_overpass()
