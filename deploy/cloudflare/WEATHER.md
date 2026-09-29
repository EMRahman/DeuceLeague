# Court forecasts

The players' home page can show a 14-day outlook for each of the club's
courts: temperature, rain chance and wind, a column a day, with good days for
tennis in green. It comes from [Open-Meteo](https://open-meteo.com/). The
Worker sends it only coordinates and units, and caches the public forecast
for an hour.

Forecasts are club settings kept in D1, not deployment configuration. A new
club has no court locations, so its home page shows no weather until the coach
adds one. The sample league adds two in London, Wimbledon Park (sample) and
Regent's Park (sample), for the coach to replace with the club's own.

## Changing the courts

Use the administrator key saved at setup, or a key holding `admin`, with your
website address in place of the example:

```sh
SITE=https://your-club.your-subdomain.workers.dev

# The courts and units now
curl -s "$SITE/v1/weather" -H "Authorization: Bearer $ADMIN_KEY"

# Add a court
curl -s -X POST "$SITE/v1/court-locations" \
  -H "Authorization: Bearer $ADMIN_KEY" -H "Content-Type: application/json" \
  --data '{"name":"Main Courts","latitude":51.4343,"longitude":-0.2141}'

# Rename or move one, by the id from the list
curl -s -X PATCH "$SITE/v1/court-locations/COURT_ID" \
  -H "Authorization: Bearer $ADMIN_KEY" -H "Content-Type: application/json" \
  --data '{"name":"Club courts"}'

# Remove one
curl -s -X DELETE "$SITE/v1/court-locations/COURT_ID" -H "Authorization: Bearer $ADMIN_KEY"

# Units: uk (the default, Celsius and mph), metric, or us
curl -s -X PATCH "$SITE/v1/weather" \
  -H "Authorization: Bearer $ADMIN_KEY" -H "Content-Type: application/json" \
  --data '{"units":"uk"}'
```

Or ask your coding agent, for example: "Replace the sample courts on my
DeuceLeague site with our club's courts at these addresses."

A club can have up to eight courts. Removing every court hides forecasts again.
Each change is recorded in the event log.

## When forecasts do not show

| What you see | What to check |
| --- | --- |
| No weather on the home page | Check `GET /v1/weather` lists at least one court. |
| Weather appears late or not at all | Open-Meteo may be slow or unavailable. Forecasts are optional: the page shows without them, and the next visit tries again. |

## Older deployments

`WEATHER_VENUES` and `WEATHER_UNITS` Worker variables are no longer read.
Re-enter their values through the API as above.
