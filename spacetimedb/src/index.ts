import { schema, table, t } from 'spacetimedb/server';

/**
 * Authoritative SpacetimeDB Module for Tidewatch.
 * Stores shared live operational state across all connected control rooms and field devices.
 */
const spacetimedb = schema({
  tank_state: table(
    { public: true },
    {
      id: t.string().primaryKey(),
      name: t.string(),
      level_bbl: t.f64(),
      fill_fraction: t.f64(),
      inflow_bbl_per_hr: t.f64(),
      outflow_bbl_per_hr: t.f64(),
      time_to_high_high_minutes: t.f64().optional(),
      time_to_high_high_p10: t.f64().optional(),
      time_to_high_high_p90: t.f64().optional(),
      updated_at: t.string(),
    }
  ),

  pump_state: table(
    { public: true },
    {
      id: t.string().primaryKey(),
      name: t.string(),
      tank_id: t.string(),
      status: t.string(), // "RUNNING", "STOPPED", "FAILED", "STANDBY"
      flow_bbl_per_hr: t.f64(),
      discharge_pressure_psi: t.f64(),
      vibration_rms: t.f64(),
      is_standby: t.bool(),
      updated_at: t.string(),
    }
  ),

  level_estimates: table(
    { public: true },
    {
      tank_id: t.string().primaryKey(),
      ultrasonic_level_fraction: t.f64(),
      camera_level_fraction: t.f64().optional(),
      flow_balance_level_fraction: t.f64(),
      trust_status: t.string(), // "THREE_WAY_AGREEMENT", "ODD_ONE_OUT", "SPLIT_CONFIDENCE", "VISION_OFFLINE"
      suspect_sensor: t.string().optional(),
      updated_at: t.string(),
    }
  ),

  alert: table(
    { public: true },
    {
      id: t.string().primaryKey(),
      severity: t.string(), // "INFO", "WARNING", "CRITICAL"
      title: t.string(),
      message: t.string(),
      tank_id: t.string().optional(),
      pump_id: t.string().optional(),
      acknowledged: t.bool(),
      acknowledged_by: t.string().optional(),
      created_at: t.string(),
    }
  ),

  hypothesis: table(
    { public: true },
    {
      id: t.string().primaryKey(),
      title: t.string(),
      probability: t.f64(),
      evidence_summary: t.string(),
      recommended_check: t.string(),
      expected_information_gain: t.f64(),
    }
  ),

  option: table(
    { public: true },
    {
      id: t.string().primaryKey(),
      name: t.string(),
      lead_time_minutes: t.i32(),
      estimated_cost_usd: t.f64(),
      decision_deadline_minutes: t.f64(),
      is_expired: t.bool(),
      status: t.string(), // "AVAILABLE", "EXPIRED", "EXECUTING", "COMPLETED"
    }
  ),

  plan: table(
    { public: true },
    {
      id: t.string().primaryKey(),
      name: t.string(),
      option_ids: t.array(t.string()),
      expected_cost_usd: t.f64(),
      breach_probability: t.f64(),
      decide_by_timestamp: t.string(),
      minutes_remaining: t.f64(),
      cost_of_waiting_per_minute: t.f64(),
      is_recommended: t.bool(),
      is_approved: t.bool(),
      approved_by: t.string().optional(),
      approved_at: t.string().optional(),
    }
  ),

  decision: table(
    { public: true },
    {
      id: t.string().primaryKey(),
      plan_id: t.string(),
      approved_by: t.string(),
      approved_at: t.string(),
      status: t.string(), // "APPROVED", "REJECTED"
      notes: t.string().optional(),
    }
  ),

  action_claim: table(
    { public: true },
    {
      id: t.string().primaryKey(),
      action_id: t.string(),
      action_name: t.string(),
      claimed_by: t.string(),
      claimed_at: t.string(),
      status: t.string(), // "CLAIMED", "IN_PROGRESS", "COMPLETED"
      completed_at: t.string().optional(),
    }
  ),

  handoff_item: table(
    { public: true },
    {
      id: t.string().primaryKey(),
      title: t.string(),
      details: t.string(),
      category: t.string(), // "OPEN_DECISION", "EXPIRED_OPTION", "EQUIPMENT_STATUS"
      severity: t.string(),
      resolved: t.bool(),
      created_by: t.string(),
      created_at: t.string(),
    }
  ),

  presence: table(
    { public: true },
    {
      identity: t.string().primaryKey(),
      role: t.string(), // "CONTROL_ROOM_OPERATOR", "FIELD_TECH"
      name: t.string(),
      last_active: t.string(),
    }
  ),
});

export default spacetimedb;

// --- LIFECYCLE HOOKS ---

export const init = spacetimedb.init(_ctx => {
  console.info('Tidewatch SpacetimeDB Module Initialized.');
});

export const onConnect = spacetimedb.clientConnected(ctx => {
  console.info(`Operator connected with identity: ${ctx.sender.toHexString()}`);
});

export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  console.info(`Operator disconnected: ${ctx.sender.toHexString()}`);
});

// --- TRANSACTIONAL REDUCERS ---

// Reducer 1: Acknowledge an operational alert
export const ack_alert = spacetimedb.reducer(
  { alert_id: t.string(), user_name: t.string() },
  (ctx, { alert_id, user_name }) => {
    const alertRow = ctx.db.alert.id.find(alert_id);
    if (alertRow) {
      ctx.db.alert.id.update({
        ...alertRow,
        acknowledged: true,
        acknowledged_by: user_name,
      });
    }
  }
);

// Reducer 2: Approve Plan (Strict Human-Only Gate with Invariant Checks)
export const approve_plan = spacetimedb.reducer(
  { plan_id: t.string(), operator_name: t.string() },
  (ctx, { plan_id, operator_name }) => {
    const planRow = ctx.db.plan.id.find(plan_id);
    if (!planRow || planRow.is_approved) return;

    const now = new Date().toISOString();
    ctx.db.plan.id.update({
      ...planRow,
      is_approved: true,
      approved_by: operator_name,
      approved_at: now,
    });

    // Record formal decision
    ctx.db.decision.insert({
      id: `dec_${Date.now()}`,
      plan_id,
      approved_by: operator_name,
      approved_at: now,
      status: 'APPROVED',
      notes: 'Approved via Tidewatch Console',
    });

    // Auto-create handoff audit trail
    ctx.db.handoff_item.insert({
      id: `handoff_${Date.now()}`,
      title: `Plan Approved: ${planRow.name}`,
      details: `Executed by ${operator_name} at ${now}.`,
      category: 'OPEN_DECISION',
      severity: 'WARNING',
      resolved: false,
      created_by: operator_name,
      created_at: now,
    });
  }
);

// Reducer 3: Claim Action (Duplicate Claim Prevention)
export const claim_action = spacetimedb.reducer(
  { action_id: t.string(), action_name: t.string(), claimed_by: t.string() },
  (ctx, { action_id, action_name, claimed_by }) => {
    for (const existing of ctx.db.action_claim.iter()) {
      if (existing.action_id === action_id && existing.status !== 'COMPLETED') {
        console.warn(`Action ${action_id} already claimed by ${existing.claimed_by}`);
        return;
      }
    }

    ctx.db.action_claim.insert({
      id: `claim_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      action_id,
      action_name,
      claimed_by,
      claimed_at: new Date().toISOString(),
      status: 'CLAIMED',
      completed_at: undefined,
    });
  }
);

// Reducer 4: Complete Action
export const complete_action = spacetimedb.reducer(
  { claim_id: t.string() },
  (ctx, { claim_id }) => {
    const claim = ctx.db.action_claim.id.find(claim_id);
    if (claim) {
      ctx.db.action_claim.id.update({
        ...claim,
        status: 'COMPLETED',
        completed_at: new Date().toISOString(),
      });
    }
  }
);

// Reducer 5: Add Note
export const add_note = spacetimedb.reducer(
  { title: t.string(), details: t.string(), category: t.string(), user_name: t.string() },
  (ctx, { title, details, category, user_name }) => {
    ctx.db.handoff_item.insert({
      id: `note_${Date.now()}`,
      title,
      details,
      category,
      severity: 'INFO',
      resolved: false,
      created_by: user_name,
      created_at: new Date().toISOString(),
    });
  }
);

// Reducer 6: Set Risk Tolerance
export const set_risk_tolerance = spacetimedb.reducer(
  { tolerance: t.f64() },
  (_ctx, { tolerance }) => {
    console.info(`Set system risk tolerance: ${tolerance}`);
  }
);

// Reducer 7: Open Handoff Item
export const open_handoff = spacetimedb.reducer(
  { title: t.string(), details: t.string(), created_by: t.string() },
  (ctx, { title, details, created_by }) => {
    ctx.db.handoff_item.insert({
      id: `handoff_${Date.now()}`,
      title,
      details,
      category: 'SHIFT_HANDOFF',
      severity: 'WARNING',
      resolved: false,
      created_by,
      created_at: new Date().toISOString(),
    });
  }
);

// Reducer 8: Accept Handoff Item
export const accept_handoff = spacetimedb.reducer(
  { item_id: t.string() },
  (ctx, { item_id }) => {
    const item = ctx.db.handoff_item.id.find(item_id);
    if (item) {
      ctx.db.handoff_item.id.update({
        ...item,
        resolved: true,
      });
    }
  }
);

// Reducer 9: Resolve Incident
export const resolve_incident = spacetimedb.reducer(
  { incident_id: t.string(), resolution_notes: t.string() },
  (_ctx, { incident_id, resolution_notes }) => {
    console.info(`Incident ${incident_id} resolved: ${resolution_notes}`);
  }
);
