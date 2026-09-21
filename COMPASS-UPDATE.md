# Compass v4 · 21 September 2026

Replaces the previous satellite pointer with a native-style rotating compass. Existing home navigation, learning, authentication, satellite mathematics and database are unchanged.

## Interface

Choose a GEO satellite (or Compass only), enable GPS/compass with one switch, choose magnetic or true north. The dial contains two-degree tick marks, upright degree/cardinal labels, a red north marker, a fixed top heading line and a tilt-driven level crosshair. Large bearing and cardinal readout, degrees/minutes/seconds coordinates, optional locality, and GPS altitude in feet/meters appear underneath. Expand opens a focus view. In Compass-only mode, tapping the dial holds/releases the bearing and shows a red deviation band. Coordinates open Apple Maps only on a tap.

Satellite targets use a dot on the dial plus azimuth, dish elevation and turn direction below. Phone-placement confirmation is adjacent to the compass, including in focus view. Green fills the page with a vector satellite icon only after raw sensor readings pass the existing accuracy/freshness/mount gates and a stable dwell. Base mode explicitly says AZIMUTH IN ZONE, not RF signal lock. Both-axis mode is available in Settings.

## Rendering

The former 150 ms interval capped visual updates near 6.7 per second. The replacement uses requestAnimationFrame, a time-normalized 55 ms short-path heading filter and cached DOM elements. The 180 dial ticks are built once. Labels counter-rotate to remain upright. Status text is separate from the animated heading. No prediction or smoothing is used to decide alignment; no device capability or sensor frequency is manufactured. Hidden pages stop GPS, animation, wake lock and pending place lookup, and require a tap to resume.

## Privacy and data limitations

GPS and pointing calculations remain local. Place lookup is off by default and has a separate consent dialog. When allowed, current GPS coordinates rounded to three decimals go directly from the browser to BigDataCloud; that service observes the IP address and uses location/IP pairs for geolocation improvement. It is not used for manual positions or as an IP-only fallback, and is throttled/cached in tab memory. This page persists no location, account, or satellite data. Missing altitude stays unavailable. GPS altitude is WGS84 ellipsoid height, not a guarantee of native-app mean-sea-level or barometric altitude.

## Validation performed

- 66 Node regression tests passed, including 12 NOAA WMM2025 reference positions and new angle smoothing, wrapping, DMS, altitude, privacy and DOM-wiring checks.
- 47 local Chromium browser checks passed with synthetic GPS, permissions and compass events. Tested consent/no-consent, coordinates, units, bearing hold, focus view, north crossing, reference switching, valid green, raw-error exit, excessive/unknown accuracy, stale sensors, stop, late callbacks, permission denial and widths 320–1280 px. No runtime errors.
- With a synthetic 20 Hz heading stream, the headless browser produced 67 animation callbacks over about 1.1 seconds, 65 distinct dial positions and a 16.67 ms mean frame interval (about 60 fps).
- Physical iPhone hardware, native iOS sensor-fusion equivalence, real geocoder service responses and guaranteed 120 Hz were not tested or claimed. Browser scheduling and sensor delivery still determine the real device result.

## Sources

- Apple Compass: https://support.apple.com/guide/iphone/compass-iph1ac0b663/ios
- Frame scheduling: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
- GPS altitude: https://developer.mozilla.org/en-US/docs/Web/API/GeolocationCoordinates/altitude
- WMM2025: https://www.ncei.noaa.gov/products/world-magnetic-model
- Place lookup: https://www.bigdatacloud.com/free-api/free-reverse-geocode-to-city-api
- Place privacy: https://www.bigdatacloud.com/docs/article/why-is-reverse-geocoding-api-free
