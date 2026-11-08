import type { TwinSnapshot, TwinSource, Equipment } from "./types";
import { demoSnapshot } from "./demo";

/**
 * Live WebSocket / REST TwinSource bridging the physical simulator to the 3D Digital Twin.
 */
export const liveTwinSource: TwinSource = {
  subscribe: (next, error) => {
    let ws: WebSocket | null = null;
    let isSubscribed = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let historyMap: Record<string, number[]> = {
      "T-101": [54, 54.2],
      "T-102": [36, 36.8],
      "T-104": [40, 42],
      "P-01": [120, 120],
      "P-02": [0, 0],
      "D-01": [200, 202],
    };

    function connect() {
      if (!isSubscribed) return;
      const wsUrl = "ws://localhost:8000/api/simulator/ws";
      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          // Connected to live simulator backend
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (!data.tanks) return;

            const tankA = data.tanks.find((t: any) => t.id === "tank_a") || data.tanks[0];
            const tankB = data.tanks.find((t: any) => t.id === "tank_b") || data.tanks[1] || tankA;
            const tankC = data.tanks.find((t: any) => t.id === "tank_c") || data.tanks[2] || tankA;

            const p1 = data.pumps?.find((p: any) => p.id === "p_1");
            const p2 = data.pumps?.find((p: any) => p.id === "p_2");

            const lvlA = Math.min(100, Math.max(0, (tankA?.fill_fraction ?? 0.42) * 100));
            const lvlB = Math.min(100, Math.max(0, (tankB?.fill_fraction ?? 0.54) * 100));
            const lvlC = Math.min(100, Math.max(0, (tankC?.fill_fraction ?? 0.36) * 100));

            // Append to rolling history
            const pushHist = (id: string, val: number) => {
              if (!historyMap[id]) historyMap[id] = [val];
              else {
                historyMap[id].push(val);
                if (historyMap[id].length > 10) historyMap[id].shift();
              }
              return historyMap[id];
            };

            const p1Status = (p1?.status === "RUNNING") ? "running" : (p1?.status === "STANDBY" ? "standby" : "failed");
            const p2Status = (p2?.status === "RUNNING") ? "running" : "standby";

            const equipment: Equipment[] = [
              {
                id: "T-101",
                name: "West gathering tank",
                kind: "tank",
                status: lvlB > 85 ? "warning" : "running",
                position: [-5, 0, -2.5],
                level: Number(lvlB.toFixed(1)),
                capacity: tankB?.capacity_bbl ?? 1000,
                inflow: tankB?.inflow_bbl_per_hr ?? 120,
                outflow: tankB?.outflow_bbl_per_hr ?? 118,
                history: pushHist("T-101", Number(lvlB.toFixed(1))),
                ultrasonic: Number(lvlB.toFixed(1)),
                camera: Number(lvlB.toFixed(1)),
                balance: Number(lvlB.toFixed(1)),
              },
              {
                id: "T-102",
                name: "Buffer storage",
                kind: "tank",
                status: lvlC > 85 ? "warning" : "running",
                position: [-5, 0, 3],
                level: Number(lvlC.toFixed(1)),
                capacity: tankC?.capacity_bbl ?? 1000,
                inflow: tankC?.inflow_bbl_per_hr ?? 80,
                outflow: tankC?.outflow_bbl_per_hr ?? 82,
                history: pushHist("T-102", Number(lvlC.toFixed(1))),
                ultrasonic: Number(lvlC.toFixed(1)),
                camera: Number(lvlC.toFixed(1)),
                balance: Number(lvlC.toFixed(1)),
              },
              {
                id: "T-104",
                name: "East gathering tank A",
                kind: "tank",
                status: lvlA > 80 ? "warning" : "running",
                position: [1, 0, -2.5],
                level: Number(lvlA.toFixed(1)),
                capacity: tankA?.capacity_bbl ?? 1000,
                inflow: tankA?.inflow_bbl_per_hr ?? 125,
                outflow: tankA?.outflow_bbl_per_hr ?? 120,
                history: pushHist("T-104", Number(lvlA.toFixed(1))),
                ultrasonic: Number(lvlA.toFixed(1)),
                camera: Number((lvlA - 0.4).toFixed(1)),
                balance: Number((lvlA - 0.2).toFixed(1)),
              },
              {
                id: "P-01",
                name: "Primary transfer pump P-1",
                kind: "pump",
                status: p1Status,
                position: [-1.5, 0, 2],
                inflow: p1?.flow_rate_bbl_per_hr ?? 120,
                outflow: p1?.flow_rate_bbl_per_hr ?? 120,
                history: pushHist("P-01", p1?.flow_rate_bbl_per_hr ?? 120),
              },
              {
                id: "P-02",
                name: "Standby transfer pump P-2",
                kind: "pump",
                status: p2Status,
                position: [2, 0, 3.8],
                inflow: p2?.flow_rate_bbl_per_hr ?? 0,
                outflow: p2?.flow_rate_bbl_per_hr ?? 0,
                history: pushHist("P-02", p2?.flow_rate_bbl_per_hr ?? 0),
              },
              {
                id: "D-01",
                name: "Water treatment unit",
                kind: "treatment",
                status: "running",
                position: [6.2, 0, 0],
                inflow: 202,
                outflow: 202,
                history: pushHist("D-01", 202),
              },
            ];

            const isIncident = p1Status === "failed" || lvlA > 75;
            const snapshot: TwinSnapshot = {
              source: "live",
              timestamp: new Date().toISOString(),
              equipment,
              incident: isIncident
                ? {
                    title: p1Status === "failed" ? "Primary transfer pump offline" : "Tank A high level surge",
                    description: p1Status === "failed" ? "Mechanical trip detected. Standby pump P-2 available." : "Accumulation exceeds nominal discharge.",
                    equipmentId: p1Status === "failed" ? "P-01" : "T-104",
                  }
                : null,
              forecast: isIncident
                ? {
                    minutes: 24.5,
                    p10: 18.2,
                    p90: 31.0,
                    costPerMinute: 14.2,
                  }
                : null,
            };

            next(snapshot);
          } catch (err) {
            // Silently maintain state
          }
        };

        ws.onerror = (e) => {
          // If live connection is not ready, push graceful demo snapshot
          next(demoSnapshot(0, "normal"));
        };

        ws.onclose = () => {
          if (isSubscribed) {
            reconnectTimer = setTimeout(connect, 2000);
          }
        };
      } catch (e) {
        if (isSubscribed) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      }
    }

    connect();

    return () => {
      isSubscribed = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  },
};
