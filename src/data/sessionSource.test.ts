/**
 * The same-origin session transport, against canned wire responses.
 *
 * THE FIXTURES BELOW ARE COPIED FROM A LIVE SERVER, not written from the route
 * handlers. An earlier version inferred them and got three of four envelopes
 * wrong — `connections` is not under `data`, the schema is under `model`, and
 * `csrfToken` is under `data` — and every test still passed, because the port
 * and the fixture shared one wrong assumption. Change a fixture only against a
 * real response.
 *
 * Trimmed to the timezone contract: the transport is synced byte-identically
 * across the fleet and the full wire suite lives with the reference copy, so
 * what is asserted HERE is the part an operator can misconfigure — where the
 * tenant's zone comes from, and what happens when the connection has none.
 */
import { describe, expect, it, vi } from "vitest";

import { sessionPort, type SessionPortError } from "./sessionSource.ts";
import { TABLE_OF_REF } from "./tableOfRef.ts";

function harness(opts: { conns?: unknown[]; routes?: Record<string, unknown> } = {}) {
  const routes = opts.routes ?? {};
  const fetchImpl = vi.fn(async (input: unknown) => {
    const url = String(input);
    const path = url.split("?")[0] ?? url;
    let payload: unknown;
    if (path === "/api/v1/bootstrap") payload = { data: { csrfToken: "csrf-abc" } };
    else if (path === "/api/v1/connections")
      payload = { connections: opts.conns ?? [{ id: "conn-1", name: "Till DB", timezone: "Europe/Lisbon", currency: "EUR" }] };
    else if (path in routes) payload = routes[path];
    else return new Response(JSON.stringify({ error: { code: "NOT_FOUND" } }), { status: 404 });

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch };
}

/* `payments` is mapped in TABLE_OF_REF but ABSENT from SCHEMA_OK on purpose: the
   two failures assertRefs must distinguish are "this ref has no table mapping"
   and "the mapped table is not in the database", and only a mapped-but-missing
   table exercises the second. */
const SCHEMA_OK = {
  "/api/v1/connections/conn-1/schema": {
    model: {
      tables: [
        { name: "menu_items", columns: [{ name: "id" }, { name: "name" }] },
        { name: "tickets", columns: [{ name: "id" }, { name: "number" }] },
      ],
    },
  },
};

describe("discovery", () => {
  it("takes the tenant timezone from the CONNECTION, never the reader's clock", async () => {
    const { fetchImpl } = harness();
    const port = sessionPort({ tableOfRef: TABLE_OF_REF, fetchImpl });
    expect((await port.config()).timezone).toBe("Europe/Lisbon");
  });

  it("falls back to ADMINIUM's zone, flagged as host, when the connection has none", async () => {
    /*
     * The zone a surface renders in when nobody configured one. It used to be
     * UTC, decided in the browser — so a Berlin deployment drew its own
     * business's evenings an hour early and captioned them "UTC". The server
     * knows where it is; it now says so, and this takes that answer.
     *
     * `host`, not `fallback`: a real zone that nobody CONFIRMED is a different
     * state from having no zone at all, and it is the same claim Adminium makes
     * for a connection it seeded itself.
     */
    const { fetchImpl } = harness({ conns: [{ id: "conn-1", serverTimezone: "Europe/Berlin" }] });
    const port = sessionPort({ tableOfRef: TABLE_OF_REF, fetchImpl });
    const config = await port.config();
    expect(config.timezone).toBe("Europe/Berlin");
    expect(config.timezoneSource).toBe("host");
  });

  it("falls back to UTC when the server is too old to send its own zone", async () => {
    /*
     * This asserted a `NO_TIMEZONE` refusal until a real operator hit it: an
     * unset zone made the whole surface unreachable. Rendering an hour off is
     * recoverable; rendering nothing is not.
     *
     * The two things that must both hold are asserted together, because either
     * alone is a bug: the app RENDERS, and it does not pretend the zone is real.
     */
    const { fetchImpl } = harness({ conns: [{ id: "conn-1" }] });
    const port = sessionPort({ tableOfRef: TABLE_OF_REF, fetchImpl });
    const config = await port.config();
    expect(config.timezone).toBe("UTC");
    expect(config.timezoneSource).toBe("fallback");
  });

  it("never falls back to the READER's zone", async () => {
    // The original concern, kept: a browser zone is the viewer's, not the
    // business's, and is indistinguishable from real data when wrong.
    const { fetchImpl } = harness({ conns: [{ id: "conn-1" }] });
    const port = sessionPort({ tableOfRef: TABLE_OF_REF, fetchImpl });
    const reader = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const config = await port.config();
    if (reader !== "UTC") expect(config.timezone).not.toBe(reader);
  });

  it("does not flag a zone the operator actually set", async () => {
    const { fetchImpl } = harness({
      conns: [{ id: "conn-1", timezone: "Europe/Lisbon", timezoneSource: "operator" }],
    });
    const port = sessionPort({ tableOfRef: TABLE_OF_REF, fetchImpl });
    expect((await port.config()).timezoneSource).toBe("operator");
  });

  it("reports a zone Adminium seeded from its own server as unconfirmed", async () => {
    /*
     * The more dangerous of the two unconfirmed states, and the reason this
     * exists at all: UTC announces itself, while a plausible wrong city does
     * not. Adminium labels its own seed (meta wave 0018) and this is where that
     * label becomes something a person can see.
     */
    const { fetchImpl } = harness({
      conns: [{ id: "conn-1", timezone: "Europe/Berlin", timezoneSource: "host" }],
    });
    const port = sessionPort({ tableOfRef: TABLE_OF_REF, fetchImpl });
    const config = await port.config();
    // The zone is USED — this is a notice, not a refusal or a substitution.
    expect(config.timezone).toBe("Europe/Berlin");
    expect(config.timezoneSource).toBe("host");
  });

  it("claims nothing when Adminium sends no provenance", async () => {
    /*
     * An older Adminium, or a row written before the provenance column. Absent
     * must read as "no claim": reporting it as a guess would tell an operator
     * their own confirmed zone was invented.
     */
    const { fetchImpl } = harness({ conns: [{ id: "conn-1", timezone: "Europe/Lisbon" }] });
    const port = sessionPort({ tableOfRef: TABLE_OF_REF, fetchImpl });
    const config = await port.config();
    expect(config.timezone).toBe("Europe/Lisbon");
    expect(config.timezoneSource).toBeNull();
  });

  it("pausing the spare connection resolves the ambiguity", async () => {
    /*
     * The operator-facing point of the whole filter. Pausing a connection is
     * the obvious way to say "not that one", and it used to do nothing at all:
     * the count included paused rows, so the refusal fired anyway and the app
     * stayed unreachable no matter what was clicked in Studio.
     */
    const { fetchImpl } = harness({
      conns: [
        { id: "a", timezone: "Europe/Lisbon", timezoneSource: "operator" },
        { id: "b", disabled: true },
      ],
    });
    const port = sessionPort({ tableOfRef: TABLE_OF_REF, fetchImpl });
    const config = await port.config();
    // Not merely "no error" — it must read the SERVING one.
    expect(config.timezone).toBe("Europe/Lisbon");
  });

  it("still refuses when two connections are actually serving", async () => {
    const { fetchImpl } = harness({ conns: [{ id: "a" }, { id: "b", disabled: false }] });
    const port = sessionPort({ tableOfRef: TABLE_OF_REF, fetchImpl });
    await expect(port.config()).rejects.toMatchObject({ code: "AMBIGUOUS_CONNECTION" });
  });

  it("treats a connection with no `disabled` field as serving", async () => {
    // An older Adminium sends no such field. Absent must not read as paused,
    // or every app would refuse against a server that predates the column.
    const { fetchImpl } = harness({ conns: [{ id: "a" }, { id: "b" }] });
    const port = sessionPort({ tableOfRef: TABLE_OF_REF, fetchImpl });
    await expect(port.config()).rejects.toMatchObject({ code: "AMBIGUOUS_CONNECTION" });
  });

  it("says the connection is PAUSED rather than missing when it is", async () => {
    /*
     * These two are one click apart and their fixes are opposite. "No
     * connection is configured" sends an operator to the connect wizard while
     * a paused one sits right there, which is how an instance ends up with two
     * connections to the same database.
     */
    const { fetchImpl } = harness({ conns: [{ id: "a", name: "Till DB", disabled: true }] });
    const port = sessionPort({ tableOfRef: TABLE_OF_REF, fetchImpl });
    await expect(port.config()).rejects.toMatchObject({ code: "CONNECTION_PAUSED" });
    await expect(port.config()).rejects.toThrow(/Till DB/);
  });

  it("refuses early when the PINNED connection is paused", async () => {
    // The server would refuse the data reads anyway, but only after this app
    // had reported a working connection — the failure would arrive as a broken
    // screen rather than as the one sentence that explains it.
    const { fetchImpl } = harness({ conns: [{ id: "conn-9", disabled: true }] });
    const port = sessionPort({ tableOfRef: TABLE_OF_REF, connectionId: "conn-9", fetchImpl });
    await expect(port.config()).rejects.toMatchObject({ code: "CONNECTION_PAUSED" });
  });
});

describe("assertRefs", () => {
  /* The wire suite lives with the reference copy, per the note at the top — but
     these two are about something an operator can DO in Studio and then have to
     diagnose from this app's error text, so they belong with the rest of the
     misconfiguration cases. */

  it("points at a PAUSED connection when the schema does not match", async () => {
    /*
     * The live case this exists for: an operator with two connections pauses
     * one to disambiguate, picks the app's OWN database by mistake, and gets a
     * wall of missing-table names describing the other one. The tables really
     * are absent — the report is true and useless. The cause is one click away
     * in Studio and only this app knows enough to point at it.
     */
    const { fetchImpl } = harness({
      routes: SCHEMA_OK,
      conns: [
        { id: "conn-1", timezone: "Europe/Lisbon", timezoneSource: "operator" },
        { id: "conn-2", name: "c_point_of_sale", disabled: true },
      ],
    });
    const port = sessionPort({ tableOfRef: TABLE_OF_REF, fetchImpl });
    const err = await port
      .assertRefs({ payments: ["ticket_id"] })
      .catch((e: unknown) => e as SessionPortError);

    const message = (err as SessionPortError).message;
    // The symptom is still reported in full — the hint is added, not swapped in.
    expect(message).toContain('table "payments" is absent');
    expect(message).toContain("c_point_of_sale is paused in Adminium");
    expect(message).toContain("resume it in Connections");
  });

  it("adds no paused hint when nothing is paused", async () => {
    // The hint must earn its place: on a one-connection instance it would be
    // noise appended to every schema error an operator ever sees.
    const { fetchImpl } = harness({ routes: SCHEMA_OK });
    const port = sessionPort({ tableOfRef: TABLE_OF_REF, fetchImpl });
    const err = await port
      .assertRefs({ payments: ["ticket_id"] })
      .catch((e: unknown) => e as SessionPortError);

    expect((err as SessionPortError).message).not.toContain("paused in Adminium");
  });
});
