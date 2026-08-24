# IIT KGP Campus Building Navigation --- V1 Implementation Plan

## 1. V1 Goal

Build a simple campus-building locator for IIT Kharagpur.

A fresher should be able to:

1.  Search for a building such as `CIC`, `Nalanda`, `Takshashila`, `EE`,
    etc.
2.  See the building on the IIT KGP map.
3.  See the building's latitude and longitude internally.
4.  See their current location.
5.  See the distance from their current location to the selected
    building.
6.  Click **Navigate** and open navigation to that building.

### V1 does NOT include

-   Room-level navigation
-   Floor-level navigation
-   3D indoor maps
-   Indoor positioning
-   Campus A\*/Dijkstra routing
-   Detailed turn-by-turn navigation
-   Automatic extraction of building coordinates

For V1, **latitude and longitude will be manually collected from Google
Maps**.

------------------------------------------------------------------------

# 2. Recommended Architecture

``` text
                    Frontend
              React / Next.js
                     |
                     |
              Backend API
              FastAPI / Node
                     |
                     |
              PostgreSQL
                     |
                  PostGIS
```

The important idea is:

``` text
Building
   |
   ├── name
   ├── aliases
   ├── latitude
   ├── longitude
   └── metadata
```

Do not build the routing graph yet.

------------------------------------------------------------------------

# 3. Technology Stack

Use:

### Frontend

-   React / Next.js
-   MapLibre GL JS
-   Tailwind CSS

### Backend

Use whichever backend is already being used by the project:

-   FastAPI, or
-   Node.js/Express

### Database

-   PostgreSQL
-   PostGIS

PostGIS is not strictly required for the first simple version, but using
it now will make the system easier to extend later.

### Location

Browser/device Geolocation API.

### Map

MapLibre GL JS with a suitable map tile/style provider.

------------------------------------------------------------------------

# 4. Building Database

Create a `buildings` table.

Recommended schema:

``` sql
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE buildings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(150) NOT NULL,

    short_name VARCHAR(50),

    aliases TEXT[],

    category VARCHAR(50),

    latitude DOUBLE PRECISION NOT NULL,

    longitude DOUBLE PRECISION NOT NULL,

    location GEOGRAPHY(
        POINT,
        4326
    ),

    description TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

After inserting a building, populate the spatial location:

``` sql
UPDATE buildings
SET location = ST_SetSRID(
    ST_MakePoint(longitude, latitude),
    4326
)::geography
WHERE id = '...';
```

The order is important:

``` text
ST_MakePoint(longitude, latitude)
```

not:

``` text
ST_MakePoint(latitude, longitude)
```

------------------------------------------------------------------------

# 5. Example Building Data

Example structure:

``` json
{
  "name": "Electrical Engineering Department",
  "short_name": "EE",
  "aliases": [
    "EE",
    "Electrical",
    "Electrical Department",
    "EE Dept"
  ],
  "category": "department",
  "latitude": 22.xxxxx,
  "longitude": 87.xxxxx
}
```

Do not copy the example coordinates above.

For the actual database, manually collect the coordinates from Google
Maps.

------------------------------------------------------------------------

# 6. How to Collect Coordinates from Google Maps

For every IIT KGP building:

### Step 1

Open Google Maps.

Search for:

``` text
IIT Kharagpur <building name>
```

For example:

``` text
IIT Kharagpur CIC
```

### Step 2

Open the correct building/place.

### Step 3

Get the latitude and longitude.

Google Maps exposes coordinates when you inspect/copy the location.

You want values similar to:

``` text
22.xxxxxxxx, 87.xxxxxxxx
```

### Step 4

Verify the point visually.

Make sure the coordinate points to the correct building and not:

-   a nearby road
-   another building
-   a general IIT KGP location
-   a nearby department

### Step 5

Store it in your seed data.

Example:

``` json
{
  "name": "CIC",
  "short_name": "CIC",
  "aliases": [
    "Computer & Informatics Centre",
    "Computer and Informatics Centre"
  ],
  "category": "centre",
  "latitude": 22.xxxxx,
  "longitude": 87.xxxxx
}
```

------------------------------------------------------------------------

# 7. Start With 20--30 Buildings

Do not map the entire campus initially.

Start with buildings that freshers commonly need.

Suggested categories:

``` text
Academic buildings
Departments
Important centres
Library
Auditorium
Administrative buildings
Student facilities
```

Example list:

``` text
CIC
Nalanda
Takshashila
Vikramshila
Electrical Engineering Department
Computer Science Department
Central Library
Main Building
Netaji Auditorium
...
```

Add more buildings after the basic system works.

------------------------------------------------------------------------

# 8. Building Aliases

Freshers will not always search using the official building name.

For example:

``` text
Electrical Engineering Department
```

could be searched as:

``` text
EE
Electrical
EE Dept
Electrical Department
```

Therefore store aliases.

Example:

``` json
{
  "name": "Electrical Engineering Department",
  "short_name": "EE",
  "aliases": [
    "EE",
    "Electrical",
    "EE Dept",
    "Electrical Department"
  ]
}
```

The frontend search should search:

``` text
name
short_name
aliases
```

------------------------------------------------------------------------

# 9. Backend API

Create these endpoints.

## GET `/api/buildings`

Return all buildings.

Example:

``` json
[
  {
    "id": "1",
    "name": "CIC",
    "short_name": "CIC",
    "latitude": 22.xxxxx,
    "longitude": 87.xxxxx
  }
]
```

------------------------------------------------------------------------

## GET `/api/buildings/{id}`

Return one building.

Example:

``` json
{
  "id": "1",
  "name": "CIC",
  "short_name": "CIC",
  "latitude": 22.xxxxx,
  "longitude": 87.xxxxx,
  "description": "Computer & Informatics Centre"
}
```

------------------------------------------------------------------------

## GET `/api/buildings/search?q=CIC`

Search by:

``` text
name
short_name
aliases
```

Return matching buildings.

------------------------------------------------------------------------

# 10. Frontend Map

Use MapLibre GL JS.

The page should contain:

``` text
------------------------------------------------
| Search building...                           |
------------------------------------------------
|                                              |
|                                              |
|                 IIT KGP MAP                  |
|                                              |
|        ● EE                                  |
|                       ● CIC                  |
|                                              |
|    ● Nalanda                                 |
|                         ● Takshashila        |
|                                              |
|                                              |
------------------------------------------------
| Selected Building                            |
| CIC                                          |
| Computer & Informatics Centre                |
|                                              |
| Distance: 850 m                              |
|                                              |
| [ Navigate ]                                 |
------------------------------------------------
```

------------------------------------------------------------------------

# 11. Display Building Markers

For every building returned by:

``` text
GET /api/buildings
```

create a marker:

``` javascript
new maplibregl.Marker()
  .setLngLat([building.longitude, building.latitude])
  .setPopup(
    new maplibregl.Popup().setHTML(
      `<strong>${building.name}</strong>`
    )
  )
  .addTo(map);
```

Remember:

``` javascript
[longitude, latitude]
```

Map libraries commonly expect longitude first.

------------------------------------------------------------------------

# 12. Building Selection

When the user searches:

``` text
CIC
```

the frontend should:

1.  Call `/api/buildings/search?q=CIC`.
2.  Display matching results.
3.  User selects CIC.
4.  Map moves to CIC.
5.  CIC marker becomes selected/highlighted.
6.  Show the building information card.

Example:

``` javascript
map.flyTo({
  center: [building.longitude, building.latitude],
  zoom: 17
});
```

------------------------------------------------------------------------

# 13. User's Current Location

Use the browser Geolocation API.

``` javascript
navigator.geolocation.getCurrentPosition(
  (position) => {
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;

    console.log(latitude, longitude);
  },
  (error) => {
    console.error(error);
  }
);
```

Display the user's position as:

``` text
        ● YOU
```

on the map.

Do not store the user's location in the database for V1 unless there is
a specific product requirement.

------------------------------------------------------------------------

# 14. Calculate Distance

For V1, calculate straight-line distance between:

``` text
User
  ↓
Building
```

Do NOT call this walking distance.

It is only:

``` text
straight-line distance
```

Use the Haversine formula.

``` javascript
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;

  const toRad = (degree) => degree * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(
    Math.sqrt(a),
    Math.sqrt(1 - a)
  );

  return R * c;
}
```

Display:

``` text
Distance: 720 m
```

or:

``` text
Distance: 1.4 km
```

depending on the result.

------------------------------------------------------------------------

# 15. Navigate Button

For V1, do not build your own routing engine.

When the user clicks:

``` text
[ Navigate ]
```

open Google Maps navigation with the building's coordinates as the
destination.

Conceptually:

``` text
Current Location
       ↓
Google Maps
       ↓
IIT KGP Building
```

The destination should use your database coordinates.

This means your application controls:

``` text
Which building?
Where exactly is the building?
```

while Google Maps handles:

``` text
Road routing
Walking directions
Turn-by-turn navigation
```

This is an excellent shortcut for V1.

------------------------------------------------------------------------

# 16. Important: Building Coordinate vs Entrance Coordinate

For V1, store only:

``` text
latitude
longitude
```

But design the database so you can later add:

``` text
entrance_latitude
entrance_longitude
```

Eventually:

``` text
Building
    |
    ├── center coordinate
    |
    └── main entrance coordinate
```

Then navigation can target:

``` text
main entrance
```

instead of the center of the building.

Do not implement this complexity until the basic version works.

------------------------------------------------------------------------

# 17. What NOT to Build Yet

Avoid these features in V1:

``` text
❌ A* routing
❌ Dijkstra campus routing
❌ Custom road graph
❌ 3D buildings
❌ Floor maps
❌ Room coordinates
❌ Indoor positioning
❌ AR navigation
❌ BLE beacons
❌ Computer vision navigation
❌ Complex GIS editing system
```

These are future phases.

------------------------------------------------------------------------

# 18. V1 User Flow

The complete flow should be:

``` text
User opens CampusHelp
        |
        ↓
Campus Map
        |
        ↓
Search: "CIC"
        |
        ↓
CIC appears
        |
        ↓
User selects CIC
        |
        ↓
Map zooms to CIC
        |
        ↓
Building marker displayed
        |
        ↓
User location requested
        |
        ↓
Distance calculated
        |
        ↓
[ Navigate ]
        |
        ↓
Google Maps
```

------------------------------------------------------------------------

# 19. V1 Definition of Done

Consider V1 complete when all of these work:

-   [ ] 20--30 IIT KGP buildings have been added.
-   [ ] Every building has manually verified latitude/longitude.
-   [ ] Buildings are stored in PostgreSQL.
-   [ ] Backend can return all buildings.
-   [ ] Backend can search buildings.
-   [ ] Frontend displays IIT KGP map.
-   [ ] Building markers appear correctly.
-   [ ] User can search `CIC`, `EE`, `Nalanda`, etc.
-   [ ] Selecting a building zooms to it.
-   [ ] Building information appears.
-   [ ] User's current location can be displayed.
-   [ ] Distance from user to building is displayed.
-   [ ] Navigate button opens Google Maps with the correct destination.

------------------------------------------------------------------------

# 20. After V1

Once V1 works reliably, build V2:

``` text
V1
Building coordinates
      ↓
V2
Building entrances
      ↓
V3
Campus walking paths
      ↓
V4
A* campus routing
      ↓
V5
Floor maps
      ↓
V6
Room locations
      ↓
V7
Indoor navigation
```

The key principle is:

> **Do not solve indoor navigation before you have a reliable campus
> building database.**

Your V1 is essentially a **digital IIT KGP building directory + map +
location-based navigation launcher**. It should be small enough to
implement quickly but structured so that the later room/floor system
does not require rebuilding the entire architecture.
