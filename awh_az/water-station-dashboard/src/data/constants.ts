import { Station, StationData } from '@/types';

/**
 * STATIONS CONFIGURATION
 * 
 * To add a new station:
 * 1. Add a new object to the array below with a unique id
 * 2. Provide name, location, status, and units array
 * 3. Add image URL and description (optional)
 * 
 * To remove a station:
 * 1. Simply delete or comment out the station object from the array
 * 
 * To add/remove units for a station:
 * 1. Edit the "units" array - add or remove unit names
 * 2. Units are case-sensitive strings
 * 
 * The rest of the application will automatically update!
 */
export const stations: Station[] = [
  { 
    id: 1, 
    name: "CHP Cooling Tower", 
    location: "Central Heat & Power Facility", 
    status: "Online",
    units: ["AguaPars", "Tsunami"],  // Two units at CHP
    image: "https://picsum.photos/seed/chp-cooling/400/300",
    description: "Advanced atmospheric water harvesting system integrated with the campus cooling tower infrastructure. Optimized for high-efficiency water extraction from industrial air flows."
  },
  { 
    id: 2, 
    name: "ASU Greenhouse", 
    location: "ASU Polytechnic Campus", 
    status: "Online",
    units: ["DewStand"],  // One unit at Greenhouse
    image: "https://picsum.photos/seed/greenhouse/400/300",
    description: "Climate-controlled greenhouse testbed for atmospheric water harvesting research. Monitors humidity, temperature variations, and water production in controlled agricultural environments."
  },
  { 
    id: 3, 
    name: "SRP Cooling Tower", 
    location: "Salt River Project Facility", 
    status: "Online",
    units: ["Airjoule"],  // One unit at SRP
    image: "https://picsum.photos/seed/srp-cooling/400/300",
    description: "Collaborative research station with Salt River Project, focusing on industrial-scale atmospheric water harvesting from cooling tower exhaust streams."
  },
  { 
    id: 4, 
    name: "Mobile Station", 
    location: "Various Locations", 
    status: "Online",
    units: ["Airjoule"],  // One unit at Mobile
    image: "https://picsum.photos/seed/mobile/400/300",
    description: "Portable atmospheric water harvesting unit for field research and data collection across multiple Arizona climate zones. Enables comparative studies of AWH efficiency."
  },
];

// Generate realistic dummy data for atmospheric water harvesting
const generateDummyData = () => {
  const data: StationData[] = [];
  const baseDate = new Date('2025-10-01');
  
  for (let i = 0; i < 30; i++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    
    // Time-based variations (simulating day/night cycles)
    const dayFactor = Math.sin((i % 7) * Math.PI / 7) * 0.3 + 1;
    const trendFactor = 1 + (i / 30) * 0.1; // slight upward trend
    const randomVariation = () => 0.9 + Math.random() * 0.2;
    
    data.push({
      date: dateStr,
      
      // Intake Air parameters
      'Intake Air - Temperature': 20 + dayFactor * 8 * randomVariation(), // 20-30°C
      'Intake Air - Relative Humidity': 40 + dayFactor * 15 * randomVariation(), // 40-60%
      'Intake Air - Air Velocity': 2 + dayFactor * 1.5 * randomVariation(), // 2-4 m/s
      'Intake Air - Absolute Humidity': 8 + dayFactor * 4 * randomVariation(), // 8-14 g/m³
      
      // Outtake Air parameters
      'Outtake Air - Temperature': 15 + dayFactor * 6 * randomVariation(), // 15-23°C
      'Outtake Air - Relative Humidity': 60 + dayFactor * 20 * randomVariation(), // 60-85%
      'Outtake Air - Air Velocity': 1.5 + dayFactor * 1 * randomVariation(), // 1.5-2.8 m/s
      'Outtake Air - Absolute Humidity': 6 + dayFactor * 3 * randomVariation(), // 6-10 g/m³
      
      // Water Production parameters
      'Water Production - Flow Rate': 5 + dayFactor * trendFactor * 3 * randomVariation(), // 5-10 L/hr
      'Water Production - Conductivity': 150 + dayFactor * 50 * randomVariation(), // 150-250 μS/cm
      'Water Production - pH': 6.8 + Math.random() * 0.6, // 6.8-7.4
      'Water Production - Amount of Water': 100 + dayFactor * trendFactor * 60 * randomVariation(), // 100-200 L/day
      
      // Power Consumption parameters
      'Power Consumption - Power': 800 + dayFactor * trendFactor * 200 * randomVariation(), // 800-1200 W
      'Power Consumption - Voltage': 220 + Math.random() * 10, // 220-230 V
      'Power Consumption - Current': 3.5 + dayFactor * trendFactor * 1.5 * randomVariation(), // 3.5-6 A
      
      // Legacy fields (for backward compatibility)
      Temperature: 20 + dayFactor * 8 * randomVariation(),
      Humidity: 40 + dayFactor * 15 * randomVariation(),
      Population: Math.floor(1000 + dayFactor * trendFactor * 200),
      'Water Production': 450 + dayFactor * trendFactor * 100 * randomVariation(),
      'pH Level': 6.8 + Math.random() * 0.6
    });
  }
  
  return data;
};

// Static sample data for the last 30 days (to avoid hydration mismatches)
export const sampleData: StationData[] = generateDummyData();

export const getStationById = (id: number): Station | undefined => {
  return stations.find(station => station.id === id);
};

export const getDataForDateRange = (startDate: string, endDate: string): StationData[] => {
  return sampleData.filter(item => {
    const itemDate = new Date(item.date);
    const start = new Date(startDate);
    const end = new Date(endDate);
    return itemDate >= start && itemDate <= end;
  });
};