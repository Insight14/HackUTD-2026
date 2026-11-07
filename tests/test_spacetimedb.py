"""Unit and Integration Tests for SpacetimeDB Live Shared Operational State."""
import pytest
from backend.app.integrations.spacetimedb import SpacetimeDBAdapter

@pytest.mark.asyncio
async def test_shared_state_hydration():
    stdb = SpacetimeDBAdapter()
    state = stdb.get_full_shared_state()

    assert "tanks" in state and len(state["tanks"]) >= 2
    assert "pumps" in state and len(state["pumps"]) >= 2
    assert "plans" in state and len(state["plans"]) >= 1
    assert "options" in state and len(state["options"]) >= 4
    assert "presence" in state and len(state["presence"]) >= 2

@pytest.mark.asyncio
async def test_action_claim_and_deduplication():
    stdb = SpacetimeDBAdapter()

    # Session 1: Operator A claims action "opt_standby_pump"
    claim1 = await stdb.claim_action(
        action_id="opt_standby_pump",
        action_name="Start Standby Transfer Pump (P-2)",
        claimed_by="Operator R.D.",
    )
    assert claim1.status == "CLAIMED"
    assert claim1.claimed_by == "Operator R.D."

    # Session 2: Field Tech tries to claim the same action concurrently
    with pytest.raises(ValueError, match="already claimed by Operator R.D."):
        await stdb.claim_action(
            action_id="opt_standby_pump",
            action_name="Start Standby Transfer Pump (P-2)",
            claimed_by="Field Tech Mike",
        )

@pytest.mark.asyncio
async def test_complete_action():
    stdb = SpacetimeDBAdapter()
    claim = await stdb.claim_action(
        action_id="opt_curtail_wells",
        action_name="Curtail Wells",
        claimed_by="Operator R.D.",
    )

    completed = await stdb.complete_action(claim.id, completed_by="Operator R.D.")
    assert completed.status == "COMPLETED"
    assert completed.completed_at is not None

@pytest.mark.asyncio
async def test_human_approval_gate_and_double_approval_prevention():
    stdb = SpacetimeDBAdapter()

    # Verify plan exists and is unapproved initially
    assert stdb.plans["plan_1"].is_approved is False

    # Human operator approves plan
    decision = await stdb.approve_plan(plan_id="plan_1", operator_name="Lead Operator R.D.")
    assert decision.status == "APPROVED"
    assert decision.approved_by == "Lead Operator R.D."
    assert stdb.plans["plan_1"].is_approved is True

    # Check automatic shift handoff entry was created
    handoff_items = list(stdb.handoff_items.values())
    assert any("Plan Approved" in h.title for h in handoff_items)

    # Double approval attempt must be rejected
    with pytest.raises(ValueError, match="already been approved"):
        await stdb.approve_plan(plan_id="plan_1", operator_name="Second Operator")

@pytest.mark.asyncio
async def test_alert_acknowledgement():
    stdb = SpacetimeDBAdapter()

    # Create test alert
    from backend.app.integrations.spacetimedb import AlertRecord
    stdb.alerts["alert_test_1"] = AlertRecord(
        id="alert_test_1",
        severity="CRITICAL",
        title="High Inflow Alarm",
        message="Tank A filling rapidly",
        tank_id="tank_a",
        acknowledged=False,
        created_at="2026-11-07T02:00:00Z",
    )

    alert = await stdb.ack_alert(alert_id="alert_test_1", user_name="Operator R.D.")
    assert alert.acknowledged is True
    assert alert.acknowledged_by == "Operator R.D."

@pytest.mark.asyncio
async def test_shift_handoff_lifecycle():
    stdb = SpacetimeDBAdapter()

    # Add handoff note
    note = await stdb.add_note(
        title="Well 7 choke replaced",
        details="Night shift replaced valve. Monitor downstream pressure.",
        category="SHIFT_HANDOFF",
        user_name="Night Operator",
    )
    assert note.resolved is False

    # Morning operator accepts handoff
    accepted = await stdb.accept_handoff(item_id=note.id, accepted_by="Morning Operator")
    assert accepted.resolved is True
