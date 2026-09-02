# Station Management Guide

## Overview
This document explains how to easily add, remove, or modify water harvesting stations in the application.

## Configuration File Location
All stations are configured in a single file:
```
src/data/constants.ts
```

## Adding a New Station

1. Open `src/data/constants.ts`
2. Add a new station object to the `stations` array:

```typescript
{
  id: 5,  // Use the next available ID number
  name: "Your Station Name",
  area: "Location/Campus Name",
  status: "Online",  // or "Offline"
  units: ["Unit1", "Unit2"],  // Array of unit names
  image: "https://your-image-url.com/image.jpg",  // Optional
  description: "Brief description of this station and its purpose."  // Optional
}
```

### Example:
```typescript
export const stations: Station[] = [
  // ... existing stations ...
  {
    id: 5,
    name: "Desert Research Station",
    area: "Sonoran Desert Research Center",
    status: "Online",
    units: ["Genesis", "Aquifer"],  // Two units at this station
    image: "https://picsum.photos/seed/desert/400/300",
    description: "Specialized AWH testbed for extreme arid conditions, studying water extraction efficiency in low-humidity desert environments."
  }
];
```

## Managing Units for a Station

### Adding Units
To add units to a station, simply add them to the `units` array:

```typescript
{
  id: 1,
  name: "CHP Cooling Tower",
  units: ["AguaPars", "Tsunami", "NewUnit"],  // Added "NewUnit"
  // ... other properties
}
```

### Removing Units
Remove units from the array:

```typescript
{
  id: 1,
  name: "CHP Cooling Tower",
  units: ["AguaPars"],  // Removed "Tsunami"
  // ... other properties
}
```

### Station with No Units
If a station has no units yet, you can:
- Omit the `units` property entirely
- OR set it to an empty array: `units: []`

The unit dropdown will automatically hide for stations without units.

## Removing a Station

1. Open `src/data/constants.ts`
2. Find the station object you want to remove
3. Delete the entire object (including the comma)

**OR**

Comment it out for future reference:
```typescript
// {
//   id: 3,
//   name: "Old Station",
//   ...
// },
```

## Modifying a Station

Simply edit the values in the station object:

```typescript
{
  id: 1,
  name: "CHP Cooling Tower - Updated",  // Changed name
  area: "New Location",  // Changed location
  status: "Offline",  // Changed status
  // ... rest of fields
}
```

## Station Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | number | ✅ Yes | Unique identifier (must be unique!) |
| `name` | string | ✅ Yes | Display name of the station |
| `area` | string | ✅ Yes | Location or campus name |
| `status` | string | ✅ Yes | Either "Online" or "Offline" |
| `units` | string[] | ❌ No | Array of unit names at this station |
| `image` | string | ❌ No | URL to station image (fallback provided) |
| `description` | string | ❌ No | Brief description (default provided) |

## Current Stations

As of now, we have **4 active stations** with their units:

1. **CHP Cooling Tower** - Central Heat & Power Facility
   - Units: AguaPars, Tsunami

2. **ASU Greenhouse** - ASU Polytechnic Campus
   - Units: DewStand

3. **SRP Cooling Tower** - Salt River Project Facility
   - Units: Airjoule

4. **Mobile Station** - Various Locations
   - Units: Airjoule

## Important Notes

- **Always use unique ID numbers** - Duplicate IDs will cause issues
- **Status values are case-sensitive** - Use "Online" or "Offline" (not "online")
- **Units are case-sensitive** - "AguaPars" is different from "aguapars"
- **Unit dropdown automatically shows/hides** - If no units array or empty array, the dropdown won't appear
- The application automatically updates everywhere when you modify `constants.ts`
- Changes require a page refresh to take effect
- Images are optional - the system provides fallback images if not specified

## Testing Your Changes

1. Save the `constants.ts` file
2. Refresh your browser
3. Check the homepage to see your station cards
4. Click on a station to verify the details page works

## Need Help?

If you encounter issues:
- Check that all IDs are unique
- Verify status is exactly "Online" or "Offline"
- Ensure all commas are in the right place
- Make sure the last station object doesn't have a trailing comma before `]`
