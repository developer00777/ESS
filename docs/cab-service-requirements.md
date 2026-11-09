# Company Cab Service: Requirements Intake

**Status:** phase 1 (the planner) is built at Admin Controls → Cabs. The answers below are still needed to tune it and to start phase 2.
**Opened:** 6 Nov 2026 · **Rescoped:** 10 Nov 2026

Champions has 6–8 company cabs, and only female employees may use them.

**Phase 1, the planner (built):** HR's sheet goes in. Out come a map of who is where, a suggested roster per slot (which cab, who, drop order) and red flags (a woman dropped last alone, a full cab, someone without a seat). No booking, no live tracking and no driver app yet.

Later phases add:

1. employees booking their cabs from the portal,
2. a driver trip sheet with OTP boarding, live location and SOS, and
3. reports.

Questions marked **(planner)** feed phase 1 directly. Questions marked **(later)** can wait.

## Rules (set 28 Oct 2026)

The planner treats these as hard limits. Anything that breaks one becomes a red flag, never a quiet compromise.

1. **Women first on every drop.** Anyone who gives up a seat claims that day's Ola, Uber or Rapido at actuals.
2. **No woman is the last person dropped alone at night without a guard.** Every rider is a woman, so in practice every night trip needs a guard, and the guard takes a seat (a 4-seat cab carries 3 riders at night).
3. **Cab times follow shifts.** Nobody leaves early to fit a cab. An earlier rider may wait for a later run, up to a cap (D8).
4. **No single-passenger trips where a merge is possible.**
5. **One-offs fit around the roster:** a driver sent on an errand, a new joiner who needs a seat from day one, a late stay. When a run is full, a one-off gives up the seat before a regular rider.

## How to fill this in

- Write your answer under each **Answer:** line. A rough answer is fine. "Don't know" is also fine; it tells us what to chase.
- If a sheet or document holds the answer (cab list, roster, trip sheets), attach it in the same folder or link it, and note the file name.
- Commit your edits to this branch, or send them to the dev team.

---

## A. Office and legal

**A1. Office address(es). (planner)** Is there one office the cabs serve, or more? Give the full address and a Google Maps pin link. The planner needs the pin; it goes in the sheet's Settings tab.

> Answer:

**A2. State. (planner)** Which state is each office in? Women-safety rules for night transport differ by state; see Appendix A. The state sets the planner's night window (default 8:00 PM–6:00 AM).

> Answer:

**A3. Night shifts.** Do women work or travel between roughly 8pm and 6am? Do we already have their written consent on file? National law has required that consent since Nov 2025.

> Answer:

**A4. Security guards or escorts. (planner, most urgent)** Do any cabs carry a guard today? On which trips or hours? Are female guards available? How many guards can we have on a given night? Under rule 2 every night trip needs one, so the number of guards caps the number of night trips.

> Answer:

**A5. Current transport policy.** Is there a written transport or night-shift policy? Please attach it.

> Answer:

## B. Fleet and drivers

**B1. Cab list. (planner)** Fill one row per cab. Seats and guard availability go straight into the sheet's Cabs tab.

| # | Registration no. | Make / model | Seats (excluding driver) | Owned or vendor? | Fixed driver (name) | GPS / CCTV fitted? |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |
| 6 | | | | | | |
| 7 | | | | | | |
| 8 | | | | | | |

**B2. Driver duty hours.** What are each driver's hours? What are the maximum hours a day, and the required breaks? Do drivers change between day and night?

> Answer:

**B3. Driver phones. (later)** Does every driver have an Android smartphone with mobile data? Who pays for the data? Are they comfortable using apps?

> Answer:

**B4. Driver language. (later)** Which language should the driver app use (English, Hindi, Kannada, Telugu, Marathi, other)?

> Answer:

**B5. Driver verification.** Have all drivers had police verification and background checks? Who holds the records?

> Answer:

**B6. Costs.** Roughly what does each cab cost per km, or per month (fuel, driver, vendor rate)? We use this to show savings from better routing.

> Answer:

## C. Riders and shifts

**C1. Who may use the cabs.** Is it all female employees, or only some (night shift, certain teams, a distance limit)? Note: most ESS profiles have no gender recorded, so we plan to have HR mark who is eligible with a separate "cab eligible" flag. Is that OK?

> Answer:

**C2. Riders per day.** Roughly how many employees use the cabs on a typical day? How many at peak?

> Answer: 15 on a typical day (brief, 10 Nov 2026). Peak still to confirm.

**C3. Shift timings.** List every login and logout time in use, and roughly how many cab users there are at each. Drops known so far:

| Drop slot | Riders | Teams | What the planner does |
|---|---|---|---|
| 4:00 PM | 3 | Sales | Day run, no guard needed |
| 9:00 PM | 2 | Data | Night run with a guard |
| 11:00 PM | 1 | — | Kept as a single trip and flagged: sharing the 12:00 AM run would mean a 60-min wait (cap 30) |
| 12:00 AM | 6 | Four teams | Split by area across cabs, each with a guard |
| 3:30 AM | 2 | — | Merged with 4:00 AM: one cab leaves at 4:00 AM with all three |
| 4:00 AM | 1 | — | As above |

Login (pickup) times are still needed for a later phase.

**C4. Current process.** How are cabs arranged today (WhatsApp, Excel, a transport person)? Please share any existing trip sheets or rosters, even a month of them; we can use them to test the routing.

> Answer:

**C5. Home locations.** ESS stores each employee's address only as free text. Can employees drop a map pin for their home once, with HR or Transport checking it? Who is allowed to see employees' home locations?

> Answer (10 Nov 2026): HR's sheet carries a "lat, lng" or a full Maps link per rider. Short `maps.app.goo.gl` links can't be read and are flagged. Only holders of the new "Plan cabs" privilege can open the planner, and nothing uploaded is stored. The map can switch to area hexes only, for screen sharing.

**C6. Service area. (planner)** Is there a maximum distance from the office we serve, or areas we do not serve?

> Answer:

## D. Booking rules

D1–D5 and D7 belong to the later booking phase. D6 and D8 feed the planner now.

**D1. Booking cut-off.** How far in advance must a cab be booked? Common practice elsewhere is the night before for morning (login) trips and 2–4 hours ahead for evening (logout) trips.

> Answer:

**D2. Recurring bookings.** Should employees be able to set a standing weekly booking (e.g. Mon–Fri, 9:00 in and 18:00 out) and only change the exceptions?

> Answer:

**D3. Cancellation.** How late can a booking be cancelled without counting as a no-show?

> Answer:

**D4. No-show policy.** What happens when someone books but doesn't turn up? The industry example is a warning at 3 no-shows and booking rights paused at 5 within 30 days, with a manager able to restore them.

> Answer:

**D5. Last-minute (ad-hoc) requests.** Can someone ask for a cab with less than the cut-off notice (late stay, emergency)? Who approves it?

> Answer:

**D6. Maximum ride time. (planner)** What is the longest acceptable time any one rider spends in the cab? The planner uses 75 minutes until we hear otherwise.

> Answer:

**D7. Waiting time.** How long does a cab wait at a pickup before marking a no-show (e.g. 3–5 min)?

> Answer:

**D8. Waiting to share. (planner)** Rule 3 settles the direction: nobody leaves early. The open question is how long an earlier rider may wait so two slots share one cab (e.g. the 3:30 AM pair waiting for the 4:00 AM run). The planner uses 30 minutes until we hear otherwise.

> Answer:

## E. Safety

All of section E belongs to the later driver-app phase, except that rule 2 already applies in the planner.

**E1. Night drops.** Must the driver wait until the employee is inside her home? Should she confirm in the app that she's safe ("safe reach")?

> Answer:

**E2. SOS.** If an employee or driver presses SOS, who gets alerted (names and phone numbers, available 24x7)?

> Answer:

**E3. Phone privacy.** Should drivers and employees see each other's real phone numbers, or should calls be masked?

> Answer:

**E4. Alerts.** Which alerts do you want: route deviation, unscheduled stop, speeding, GPS off?

> Answer:

## F. Operations and access

**F1. Transport admin.** Who runs the cabs day to day (approves exceptions, edits routes, watches SOS)? We will add a "Transport admin" role in ESS for them.

> Answer:

**F2. Reports.** Which reports matter (seat fill %, empty km, on-time %, cost per trip, no-shows by person)? Who should receive them, and how often?

> Answer:

## G. Technical (dev team / IT)

**G1. Maps.** Do we use a paid maps API key (Ola Maps or Google Maps) with a monthly budget? Or should we self-host free OpenStreetMap routing (OSRM) on our own server, which has no live traffic?

> Answer (10 Nov 2026): not needed for phase 1. The planner estimates travel time from straight-line distance × 1.4 road factor at 20 km/h by day and 30 km/h at night, all adjustable. One function (`travelMinutes` in `src/lib/cabs/geo.ts`) owns this, so a maps API can replace it later. The map uses OpenStreetMap tiles; only tile coordinates leave the browser, never names or pins.

**G2. Hosting.** ESS runs on Railway. The repo also has Cloudflare Workers branches (`feat/cloudflare-migration`, `feat/cloudflare-workers-native`, `wip/workers-rewrite`).

> Answer (10 Nov 2026): no longer blocking. The planner is plain TypeScript inside ESS with no extra container (no VROOM, no OSRM), so it runs wherever ESS runs.

**G3. Driver app. (later)** For live GPS, choose one:
- **Option 1, fastest:** drivers install the free Traccar Client app for tracking, and use an ESS web page for everything else.
- **Option 2:** a small ESS Android app with background GPS. It would be sideloaded or installed through device management, not published on the Play Store.

> Answer:

**G4. Code delivery.** Should the cab module be built on a branch and submitted as a PR to `developer00777/ESS`?

> Answer:

---

## Appendix A: Women-safety rules by state (research, Nov 2026, needs checking)

Most of these come from secondary sources, so confirm with legal or HR for our state.

| State | Night window | Main conditions |
|---|---|---|
| National (OSH Code s.43, in force 21 Nov 2025) | before 6am / after 7pm | Woman's consent; each state adds its own conditions |
| Haryana / Gurugram (May 2025) | 8pm–6am | Guard in every vehicle (including a female guard), trained driver, CCTV, GPS |
| Delhi (Oct 2025) | night | Written consent, safe transport, CCTV kept 1 month, female security staff |
| Maharashtra | 9:30pm–7am | Consent, secure transport, guards, at least 3 women per shift |
| Telangana | 8:30pm–6am | Consent, guards, driver background screening |
| Tamil Nadu | 8pm–6am | Consent, transport, safety conditions (establishments with 10+ staff) |
| Karnataka | — | The 2007 conditions required a guard when a woman is first pickup or last drop. A 2026 amendment reportedly removes these conditions; this rests on one source and needs verifying |
| Uttar Pradesh | 7pm–6am (factories) | Transport with guards and CCTV |

Because every rider is a woman, the common rule "a woman is never first pickup or last drop" can never be met by drop order alone; only a guard satisfies it. The planner therefore treats every trip whose start or last drop falls in the night window as needing a guard. It puts the guard in a seat (a 4-seat sedan carries 3 riders), prefers cabs marked "Guard at night", and raises a red flag on any night trip without one.

## Appendix B: Inspiration and proposed approach (draft)

**What others do:**
- **MoveInSync:** roster booking, auto-routing, OTP/QR boarding, a three-step safe-reach check, tampering and deviation alerts. Its no-show engine (warn and pause booking rights, missed login cancels the logout trip, manager restores) is the model for D4.
- **Safetrax:** the routing engine itself refuses unsafe routes, such as a night trip without an escort.
- **Routematic and Uber Shuttle:** build fresh routes daily from bookings.
- **TripShot:** a booking counts only once the rider has boarded; drivers do a vehicle checklist in the app.

**Approach (phase 1 built, 10 Nov 2026):** with 15 riders across 6 slots the problem is small enough to solve exactly, so phase 1 needs no routing engine.

1. **Place.** Each home pin is indexed to an H3 cell (Uber's hexagonal grid, resolution 8, about 0.7 km²). Riders in the same or touching cells form an area group.
2. **Group slots (rules 3 and 4).** Slots are taken in time order. A slot that would run a single-passenger trip is merged into the next slot only when the earlier riders wait no longer than the D8 cap; nobody is moved earlier. Otherwise the single trip stays, with a flag explaining why.
3. **Assign (rule 1).** For each run, every way of splitting the riders across the free cabs is tried (exact search up to 10 riders, area-group sweep above that). Cost is ride minutes plus a charge per cab, a large charge per single-passenger trip and a larger one per unguarded night trip. Riders beyond the seats get a "no seat → ride-hail" flag; one-offs give up seats first.
4. **Sequence.** Every drop order is tried per cab, and the one with the least total ride time inside the ride cap is kept.
5. **Flag.** Night trip without a guard, full cab, no seat, single trip, ride over the cap, unreadable pin, pin outside the service radius.
6. **Cab timeline.** Each cab is busy from departure until it is back at the office, so it can chain runs through the night; errands block their window.

Code: `src/lib/cabs/` (planner, unit-tested), `src/lib/server/cab-sheet.ts` (sheet parsing), `src/routes/(app)/admin/cabs/` (page), `src/routes/api/admin/cabs/` (plan, export, template).

**Later phases** keep the ideas below:
- **Travel times:** a maps API or OSRM behind `travelMinutes`, cached per H3 cell pair and hour of the week to keep map costs low.
- **H3 also gives:** reports that show an area rather than a home address, demand heatmaps by area and time slot, and an "arrived" check.
- **Using what ESS already knows:**
  - approved leave cancels that day's cab automatically,
  - suggested standing bookings learnt from biometric punch times,
  - no-shows checked against attendance (a punch-in shows she came another way),
  - safe-reach and alerts sent with ESS's existing web-push notifications.
- **Drivers:** they already exist in ESS as staff without a login. We would add phone-OTP sign-in and a single trip-sheet screen: start and end trip, OTP boarding, safe drop, SOS.
- **Phases:**
  1. Planner: sheet in; map, roster and red flags out. **Built.**
  2. Booking and one-off requests in the portal, feeding the planner instead of the sheet.
  3. Driver trip sheet, live tracking, safe-reach and alerts.
  4. Reports.
