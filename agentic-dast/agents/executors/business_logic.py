"""Business Logic Executor: fare tampering, negative quantity, skip-pay, coupon reuse, double-refund."""

from __future__ import annotations

import uuid

import httpx

from agents.planner import AssertionOracle, AttackTask, CandidateFinding, HttpStepSpec
from safety.gateway import SafeAsyncClient, SafetyGateway


class BusinessLogicExecutor:
    """Tests travel booking business-logic invariants safely through SafetyGateway."""

    name = "business_logic"

    def __init__(
        self,
        gateway: SafetyGateway,
        base_url: str = "http://127.0.0.1:8001",
        async_transport: httpx.AsyncBaseTransport | None = None,
        hitl_approval_id: str | None = None,
    ) -> None:
        self.gateway = gateway
        self.base_url = base_url.rstrip("/")
        self._async_transport = async_transport
        self.hitl_approval_id = hitl_approval_id

    async def execute(self, task: AttackTask) -> list[CandidateFinding]:
        candidates: list[CandidateFinding] = []
        path = task.canonical_path

        async with SafeAsyncClient(
            self.gateway,
            agent="executor_business_logic",
            actor="agency_a_admin",
            pace=True,
            inner_transport=self._async_transport,
        ) as client:
            # 1. Fare tampering & negative quantity on POST /api/v3/bookings
            if path == "/api/v3/bookings" and task.method == "POST":
                hold_resp = await client.post(
                    f"{self.base_url}/api/v3/holds",
                    json={"item_id": "INV-DEL-101", "quantity": 2},
                )
                if hold_resp.status_code == 200:
                    hold = hold_resp.json()
                    hold_id = hold["hold_id"]
                    quoted = float(hold["quoted_fare"])
                    self.gateway.validator.check_payload_budget("total_fare", 1)
                    tamper_payload = {
                        "hold_id": hold_id,
                        "quantity": -1,
                        "total_fare": 1.0,
                        "traveller_name": "Logic Probe",
                        "traveller_passport": "SYNTH-LOGIC-01",
                        "traveller_email": "logic@synthetic-traveller.test",
                    }
                    bk_resp = await client.post(f"{self.base_url}/api/v3/bookings", json=tamper_payload)
                    if bk_resp.status_code == 200:
                        bk = bk_resp.json()
                        if float(bk.get("total_fare", quoted)) < quoted or int(bk.get("quantity", 1)) <= 0:
                            candidates.append(
                                CandidateFinding(
                                    candidate_id=f"CAND-{uuid.uuid4().hex[:8].upper()}",
                                    vuln_class="Business logic",
                                    executor="business_logic",
                                    canonical_endpoint="/api/v3/bookings",
                                    method="POST",
                                    affected_parameter="total_fare,quantity",
                                    title="Fare Tampering & Negative Quantity Accepted on Booking",
                                    summary=(
                                        f"Client overrode quoted fare ({quoted}) with {bk.get('total_fare')} "
                                        f"and quantity {bk.get('quantity')}."
                                    ),
                                    baseline_step=HttpStepSpec(
                                        method="POST",
                                        path="/api/v3/bookings",
                                        actor="agency_a_admin",
                                        json_body={
                                            "hold_id": "{hold_id}",
                                            "traveller_name": "Baseline Probe",
                                            "traveller_passport": "SYNTH-BASE-01",
                                            "traveller_email": "base@synthetic-traveller.test",
                                        },
                                    ),
                                    exploit_step=HttpStepSpec(
                                        method="POST",
                                        path="/api/v3/bookings",
                                        actor="agency_a_admin",
                                        json_body={**tamper_payload, "hold_id": "{hold_id}"},
                                    ),
                                    oracle=AssertionOracle(
                                        oracle_type="fare_tamper",
                                        target_field="total_fare",
                                        expected_min_value=quoted,
                                    ),
                                    setup_context={"flow": "fresh_hold"},
                                )
                            )

            # 2. Skip-payment on POST /api/v3/bookings/{id}/confirm
            if path == "/api/v3/bookings/{id}/confirm" and task.method == "POST":
                hold_resp = await client.post(
                    f"{self.base_url}/api/v3/holds",
                    json={"item_id": "INV-DEL-101", "quantity": 1},
                )
                if hold_resp.status_code == 200:
                    hold_id = hold_resp.json()["hold_id"]
                    bk_resp = await client.post(
                        f"{self.base_url}/api/v3/bookings",
                        json={
                            "hold_id": hold_id,
                            "traveller_name": "Skip Pay Probe",
                            "traveller_passport": "SYNTH-SKIP-01",
                            "traveller_email": "skip@synthetic-traveller.test",
                        },
                    )
                    if bk_resp.status_code == 200:
                        bk_id = bk_resp.json()["booking_id"]
                        conf_resp = await client.post(f"{self.base_url}/api/v3/bookings/{bk_id}/confirm")
                        if conf_resp.status_code == 200 and conf_resp.json().get("status") == "CONFIRMED":
                            candidates.append(
                                CandidateFinding(
                                    candidate_id=f"CAND-{uuid.uuid4().hex[:8].upper()}",
                                    vuln_class="Business logic",
                                    executor="business_logic",
                                    canonical_endpoint=path,
                                    method="POST",
                                    affected_parameter="payment_status",
                                    title="Skipped Payment Step Allows Unpaid Booking Confirmation",
                                    summary="Unpaid booking transitioned to CONFIRMED and received a voucher.",
                                    exploit_step=HttpStepSpec(
                                        method="POST",
                                        path="/api/v3/bookings/{booking_id}/confirm",
                                        actor="agency_a_admin",
                                    ),
                                    oracle=AssertionOracle(
                                        oracle_type="skip_payment",
                                        target_field="status",
                                        forbidden_value="CONFIRMED",
                                    ),
                                    setup_context={"flow": "unpaid_booking"},
                                )
                            )

            # 3. Coupon reuse on POST /api/v3/coupons/apply
            if path == "/api/v3/coupons/apply" and task.method == "POST":
                hold_resp = await client.post(
                    f"{self.base_url}/api/v3/holds",
                    json={"item_id": "INV-DEL-101", "quantity": 1},
                )
                if hold_resp.status_code == 200:
                    hold_id = hold_resp.json()["hold_id"]
                    c1 = await client.post(
                        f"{self.base_url}/api/v3/coupons/apply",
                        json={"hold_id": hold_id, "code": "SAVE20"},
                    )
                    c2 = await client.post(
                        f"{self.base_url}/api/v3/coupons/apply",
                        json={"hold_id": hold_id, "code": "SAVE20"},
                    )
                    if c1.status_code == 200 and c2.status_code == 200:
                        candidates.append(
                            CandidateFinding(
                                candidate_id=f"CAND-{uuid.uuid4().hex[:8].upper()}",
                                vuln_class="Business logic",
                                executor="business_logic",
                                canonical_endpoint=path,
                                method="POST",
                                affected_parameter="code",
                                title="Repeated Coupon Application Stacks Discounts",
                                summary="Same discount coupon SAVE20 accepted multiple times on one hold.",
                                exploit_step=HttpStepSpec(
                                    method="POST",
                                    path="/api/v3/coupons/apply",
                                    actor="agency_a_admin",
                                    json_body={"hold_id": "{hold_id}", "code": "SAVE20"},
                                ),
                                oracle=AssertionOracle(
                                    oracle_type="coupon_reuse",
                                    target_field="discount_applied",
                                    expected_min_value=20.0,
                                ),
                                setup_context={"flow": "fresh_hold_coupon_once"},
                            )
                        )

            # 4. Double refund on POST /api/v3/bookings/{id}/refund (HIGH risk -> requires HITL approval if enforced)
            if path == "/api/v3/bookings/{id}/refund" and task.method == "POST":
                hold_resp = await client.post(
                    f"{self.base_url}/api/v3/holds",
                    json={"item_id": "INV-DEL-101", "quantity": 1},
                )
                if hold_resp.status_code == 200:
                    hold_id = hold_resp.json()["hold_id"]
                    fare = hold_resp.json()["quoted_fare"]
                    bk_resp = await client.post(
                        f"{self.base_url}/api/v3/bookings",
                        json={
                            "hold_id": hold_id,
                            "traveller_name": "Refund Probe",
                            "traveller_passport": "SYNTH-REF-01",
                            "traveller_email": "refund@synthetic-traveller.test",
                        },
                    )
                    if bk_resp.status_code == 200:
                        bk_id = bk_resp.json()["booking_id"]
                        await client.post(f"{self.base_url}/api/v3/bookings/{bk_id}/pay", json={"amount": fare})
                        await client.post(f"{self.base_url}/api/v3/bookings/{bk_id}/cancel")
                        r1 = await client.post(f"{self.base_url}/api/v3/bookings/{bk_id}/refund")
                        extra_headers: dict[str, str] = {"X-DAST-Risk-Level": "HIGH"}
                        if self.hitl_approval_id:
                            extra_headers["X-DAST-HITL-ID"] = self.hitl_approval_id
                        r2 = await client.post(
                            f"{self.base_url}/api/v3/bookings/{bk_id}/refund",
                            headers=extra_headers,
                        )
                        if r1.status_code == 200 and r2.status_code == 200:
                            r2_data = r2.json()
                            if float(r2_data.get("refunded_amount", 0.0)) > float(r2_data.get("paid_amount", 0.0)):
                                candidates.append(
                                    CandidateFinding(
                                        candidate_id=f"CAND-{uuid.uuid4().hex[:8].upper()}",
                                        vuln_class="Business logic",
                                        executor="business_logic",
                                        canonical_endpoint=path,
                                        method="POST",
                                        affected_parameter="refund",
                                        title="Double Refund Abuse Pays Out Twice on Single Booking",
                                        summary=(
                                            f"Refunded {r2_data.get('refunded_amount')} on "
                                            f"paid booking of {r2_data.get('paid_amount')}."
                                        ),
                                        exploit_step=HttpStepSpec(
                                            method="POST",
                                            path="/api/v3/bookings/{booking_id}/refund",
                                            actor="agency_a_admin",
                                            risk_level="HIGH",
                                        ),
                                        oracle=AssertionOracle(
                                            oracle_type="double_refund",
                                            target_field="refunded_amount",
                                        ),
                                        setup_context={"flow": "refunded_once_booking"},
                                    )
                                )

        return candidates
