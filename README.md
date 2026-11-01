# Response Grid: disaster response demo

Open `index.html` (or double-click `start.bat`). **Use an internet connection** to get the real map; with no internet it automatically falls back to the offline schematic Tamil Nadu map. No account, API key or install is needed.

## What's new

- **Real map** (Leaflet + OpenStreetMap): zoom and pan anywhere. Problems are **red pins** (critical ones pulse), supply hubs are black squares and rescue members are small circles. Dashed lines show hub/member to incident.
- **Report a problem at any location**: click the map, search a place (OpenStreetMap Nominatim), use GPS ("My location") or pick a city. Not limited to the 4 sample cities.
- **Instant alerts**: every new report raises a red banner (View on map / Assign members), a sound, the 🔔 bell counter and an optional desktop notification ("Enable desktop alerts" in the bell panel).
- **Assign rescue members**: click a red pin (or "Review" on the Incident board), choose a member (sorted by distance, with ETA) and press Assign. The pin shows a green badge with the member count; "Resolved" frees the members.
- **Live feed over time (no more fixed 4 areas)**: the map starts empty. Problems then arrive on a **simulated clock** across ~45 places in Tamil Nadu (district headquarters, hill towns, coastal and industrial towns): one now, another 1 hour later, another 2 hours later, and sometimes 2-3 at the same moment. Pick the speed above the map (real time, 1 min = 1 hour, or 10 sec = 1 hour) and pause/resume whenever you like. At most 14 incidents stay open at once; resolve some and new ones keep coming.
- **Members arrive on time**: after you assign someone, the ETA counts down on the same clock and the incident moves to "Team assessing" when they arrive.
- **⚡ Simulate incoming alert** on the Overview page creates a random alert so you can demo the flow without typing a report.

Notes: map tiles, place search and place-name lookup need internet. GPS needs browser permission (and may be blocked when the page is opened as a plain `file://`; if so, click the map). Nominatim is a free public service, so keep use light.

## How the agents work

`agents.js` is a small, dependency-free engine (also loadable in Node for testing). A coordinator runs five agents in order and shows what each contributed:

1. **Data analysis**: priority score 0-100 = severity (40) + people affected (25) + vulnerability of the hazard type (20) + age (10) + unassigned bonus (5).
2. **Location & route**: nearest-hub distance and ETA (real city coordinates, straight-line with a road factor); flags flood/quake zones for road and bridge checks.
3. **Rescue coordination**: assigns the nearest free teams to the highest-priority incidents first (1 team per 150 people affected, max 4).
4. **Supply matching**: priority-weighted fair share ("water-filling") per category. Incidents whose need is covered are capped and their surplus is redistributed. A 10% reserve per category is never allocated. Unmet need is reported as a shortfall.
5. **Communication**: drafts a public advisory per incident (a human must approve before release).

Proposals are recomputed from the current state on every change. Approving one deducts stock, dispatches teams and updates the map, board and activity feed. Incidents, alerts, members, stock, teams, notes and chat persist in browser storage; Settings has a reset button.

City names are real; all incidents, capacities, teams, and recommendations are fictional examples. This is a learning demo, not an emergency service or live operational tool.

## Reference

The multi-agent ideas were adapted from the linked project README: analysis, location, rescue, supplies, and communication agents, plus disaster-type quick guides. The implementation here is a self-contained browser demo.
