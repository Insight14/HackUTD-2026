export type EquipmentStatus = "running" | "standby" | "failed" | "warning";
export interface Equipment {
  id: string;
  name: string;
  kind: "tank" | "pump" | "treatment";
  status: EquipmentStatus;
  position: [number, number, number];
  level?: number;
  capacity?: number;
  inflow?: number;
  outflow?: number;
  history: number[];
  ultrasonic?: number;
  camera?: number | null;
  balance?: number;
}
export interface TwinSnapshot {
  source: "synthetic" | "simulator" | "live";
  timestamp: string;
  equipment: Equipment[];
  incident: { title: string; description: string; equipmentId: string } | null;
  forecast: {
    minutes: number;
    p10: number;
    p90: number;
    costPerMinute: number;
  } | null;
}
export interface TwinSource {
  subscribe: (
    next: (snapshot: TwinSnapshot) => void,
    error: (error: Error) => void,
  ) => () => void;
}
export type ViewCommand =
  | { type: "rotate"; delta: number }
  | { type: "zoom"; delta: number }
  | { type: "select"; x: number; y: number }
  | { type: "reset" }
  | { type: "top" };
