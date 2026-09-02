export interface Station {
  id: string | number; // Accept both string (station_name) and number (legacy ID)
  name: string;
  location?: string;  // Optional location field from API
  status: 'Online' | 'Offline';
  image?: string;
  description?: string;
  units?: string[];  // Array of unit names for this station
}

export interface StationData {
  date: string;
  
  // Intake Air parameters
  'Intake Air - Temperature': number;
  'Intake Air - Relative Humidity': number;
  'Intake Air - Air Velocity': number;
  'Intake Air - Absolute Humidity': number;
  
  // Outtake Air parameters
  'Outtake Air - Temperature': number;
  'Outtake Air - Relative Humidity': number;
  'Outtake Air - Air Velocity': number;
  'Outtake Air - Absolute Humidity': number;
  
  // Water Production parameters
  'Water Production - Flow Rate': number;
  'Water Production - Conductivity': number;
  'Water Production - pH': number;
  'Water Production - Amount of Water': number;
  
  // Power Consumption parameters
  'Power Consumption - Power': number;
  'Power Consumption - Voltage': number;
  'Power Consumption - Current': number;
  
  // Legacy fields (for backward compatibility)
  Temperature: number;
  Humidity: number;
  Population: number;
  'Water Production': number;
  'pH Level': number;
}

export type FeatureType = 
  | 'Temperature' 
  | 'Humidity' 
  | 'Population' 
  | 'Water Production' 
  | 'pH Level'
  | 'Intake Air - Temperature'
  | 'Intake Air - Relative Humidity'
  | 'Intake Air - Air Velocity'
  | 'Intake Air - Absolute Humidity'
  | 'Outtake Air - Temperature'
  | 'Outtake Air - Relative Humidity'
  | 'Outtake Air - Air Velocity'
  | 'Outtake Air - Absolute Humidity'
  | 'Water Production - Flow Rate'
  | 'Water Production - Conductivity'
  | 'Water Production - pH'
  | 'Water Production - Amount of Water'
  | 'Power Consumption - Power'
  | 'Power Consumption - Voltage'
  | 'Power Consumption - Current';

export interface ChartDataPoint {
  date: string;
  value: number;
  value2?: number;
}