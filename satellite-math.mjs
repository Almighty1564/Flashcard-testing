/* Satellite pointing mathematics and conservative sensor quality gates.
 * WMM2025 coefficients: NOAA / British Geological Survey (public model data).
 * https://doi.org/10.25921/aqfd-sd83
 * https://www.ncei.noaa.gov/products/world-magnetic-model
 * Device axes: https://www.w3.org/TR/orientation-event/#model
 */
export const wrap = a => ((a % 360) + 360) % 360;
export const angleError = (target, actual) => ((target - actual + 540) % 360 + 360) % 360 - 180;
const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const finite = Number.isFinite;
export function numberIn(value, min, max) {
  if (!['number','string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) return null;
  const n = Number(value);
  return finite(n) && n >= min && n <= max ? n : null;
}
export function geoLookAngles(latitude, longitude, satelliteLongitude, altitudeKm = 0) {
  if (numberIn(latitude, -90, 90) === null || numberIn(longitude, -180, 180) === null || numberIn(satelliteLongitude, -180, 180) === null || numberIn(altitudeKm, -1, 100) === null) throw new RangeError('Invalid position');
  const p = latitude * RAD, l = longitude * RAD, sl = satelliteLongitude * RAD;
  const a = 6378.137, e2 = 6.6943799901413165e-3, r = 42164.0;
  const n = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2);
  const x = (n + altitudeKm) * Math.cos(p) * Math.cos(l);
  const y = (n + altitudeKm) * Math.cos(p) * Math.sin(l);
  const z = (n * (1 - e2) + altitudeKm) * Math.sin(p);
  const dx = r * Math.cos(sl) - x, dy = r * Math.sin(sl) - y, dz = -z;
  const east = -Math.sin(l) * dx + Math.cos(l) * dy;
  const north = -Math.sin(p) * Math.cos(l) * dx - Math.sin(p) * Math.sin(l) * dy + Math.cos(p) * dz;
  const up = Math.cos(p) * Math.cos(l) * dx + Math.cos(p) * Math.sin(l) * dy + Math.sin(p) * dz;
  const horizontal = Math.hypot(east, north);
  return { azimuth: horizontal < 1e-6 || Math.abs(latitude) === 90 ? null : wrap(Math.atan2(east, north) * DEG), elevation: Math.atan2(up, horizontal) * DEG, rangeKm: Math.hypot(dx, dy, dz) };
}
export function decimalYear(date = new Date()) {
  const year = date.getUTCFullYear();
  const start = Date.UTC(year, 0, 1), end = Date.UTC(year + 1, 0, 1);
  return year + (date.getTime() - start) / (end - start);
}
// Triangular coefficient order: (0,0), (1,0), (1,1), ... (12,12).
const G = [0,-29351.8,-1410.8,-2556.6,2951.1,1649.3,1361,-2404.1,1243.8,453.6,895,799.5,55.7,-281.1,12.1,-233.2,368.9,187.2,-138.7,-142,20.9,64.4,63.8,76.9,-115.7,-40.9,14.9,-60.7,79.5,-77,-8.8,59.3,15.8,2.5,-11.1,14.2,23.2,10.8,-17.5,2,-21.7,16.9,15,-16.8,0.9,4.6,7.8,3,-0.2,-2.5,-13.1,2.4,8.6,-8.7,-12.9,-1.3,-6.4,0.2,2,-1,-0.6,-0.9,1.5,0.9,-2.7,-3.9,2.9,-1.5,-2.5,2.4,-0.6,-0.1,-0.6,-0.1,1.1,-1,-0.2,2.6,-2,-0.2,0.3,1.2,-1.3,0.6,0.6,0.5,-0.1,-0.4,-0.2,-1.3,-0.7];
const H = [0,0,4545.4,0,-3133.6,-815.1,0,-56.6,237.5,-549.5,0,278.6,-133.9,212,-375.6,0,45.4,220.2,-122.9,43,106.1,0,-18.4,16.8,48.8,-59.8,10.9,72.7,0,-48.9,-14.4,-1,23.4,-7.4,-25.1,-2.3,0,7.1,-12.6,11.4,-9.7,12.7,0.7,-5.2,3.9,0,-24.8,12.2,8.3,-3.3,-5.2,7.2,-0.6,0.8,10,0,3.3,0,2.4,5.3,-9.1,0.4,-4.2,-3.8,0.9,-9.1,0,0,2.9,-0.6,0.2,0.5,-0.3,-1.2,-1.7,-2.9,-1.8,-2.3,0,-1.3,0.7,1,-1.4,0,0.6,-0.1,0.8,0.1,-1,0.1,0.2];
const DG = [0,12,9.7,-11.6,-5.2,-8,-1.3,-4.2,0.4,-15.6,-1.6,-2.4,-6,5.6,-7,0.6,1.4,0,0.6,2.2,0.9,-0.2,-0.4,0.9,1.2,-0.9,0.3,0.9,0,-0.1,-0.1,0.5,-0.1,-0.8,-0.8,0.8,-0.1,0.2,0,0.5,-0.1,0.3,0.2,0,0.2,0,-0.1,0.1,0.3,-0.3,0,0.3,-0.1,0.1,-0.1,0.1,0,0.1,0.1,0,-0.3,0,-0.1,-0.1,0,0,0,0,0,0,0,-0.1,0,0,-0.1,-0.1,-0.1,-0.1,0,0,0,0,0,0,0.1,0,0,0,-0.1,0,-0.1];
const DH = [0,0,-21.5,0,-27.7,-12.1,0,4,-0.3,-4.1,0,-1.1,4.1,1.6,-4.4,0,-0.5,2.2,0.4,1.7,1.9,0,0.3,-1.6,-0.4,0.9,0.7,0.9,0,0.6,0.5,-0.8,0,-1,0.6,-0.2,0,-0.2,0.5,-0.4,0.4,-0.5,-0.6,0.3,0.2,0,-0.3,0.3,-0.3,0.3,0.2,-0.1,-0.2,0.4,0.1,0,0,0,-0.2,0.1,-0.1,0.1,0,-0.1,0.2,0,0,0,0.1,0,0.1,0,0,0.1,0,0,0,0,0,0,0,-0.1,0.1,0,0,0,0,0,0,0,-0.1];
/** Evaluate degree/order 12 Schmidt semi-normalized harmonics, with analytic derivatives. */
export function magneticField(latitude, longitude, altitudeKm = 0, year = decimalYear()) {
  if (numberIn(latitude, -90, 90) === null || numberIn(longitude, -180, 180) === null || numberIn(altitudeKm, -1, 850) === null || !finite(year) || year < 2025 || year >= 2030) throw new RangeError('WMM2025 requires valid coordinates and a date in 2025–2029');
  // Geographic poles have no unique local north; use a limiting latitude for the field.
  const phi = Math.max(-89.999999, Math.min(89.999999, latitude)) * RAD, lon = longitude * RAD;
  const a = 6378.137, e2 = 6.6943799901413165e-3;
  const n0 = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const rho = (n0 + altitudeKm) * Math.cos(phi), z = (n0 * (1 - e2) + altitudeKm) * Math.sin(phi);
  const r = Math.hypot(rho, z), geocentric = Math.atan2(z, rho), theta = Math.PI / 2 - geocentric;
  const s = Math.sin(theta), c = Math.cos(theta), delta = phi - geocentric, dt = year - 2025;
  const P = Array.from({ length: 13 }, () => Array(13).fill(0));
  const dP = Array.from({ length: 13 }, () => Array(13).fill(0));
  const factorial = [1]; for (let k = 1; k <= 24; k++) factorial[k] = factorial[k - 1] * k;
  P[0][0] = 1;
  for (let m = 0; m <= 12; m++) {
    if (m > 0) {
      P[m][m] = (2 * m - 1) * s * P[m - 1][m - 1];
      dP[m][m] = (2 * m - 1) * (c * P[m - 1][m - 1] + s * dP[m - 1][m - 1]);
    }
    for (let n = m + 1; n <= 12; n++) {
      const p2 = n - 2 >= m ? P[n - 2][m] : 0, d2 = n - 2 >= m ? dP[n - 2][m] : 0;
      P[n][m] = ((2 * n - 1) * c * P[n - 1][m] - (n + m - 1) * p2) / (n - m);
      dP[n][m] = ((2 * n - 1) * (-s * P[n - 1][m] + c * dP[n - 1][m]) - (n + m - 1) * d2) / (n - m);
    }
  }
  let br = 0, bt = 0, bp = 0;
  for (let n = 1; n <= 12; n++) {
    const radial = (6371.2 / r) ** (n + 2);
    for (let m = 0; m <= n; m++) {
      const i = n * (n + 1) / 2 + m;
      const norm = Math.sqrt((m === 0 ? 1 : 2) * factorial[n - m] / factorial[n + m]);
      const g = G[i] + dt * DG[i], h = H[i] + dt * DH[i];
      const cm = Math.cos(m * lon), sm = Math.sin(m * lon), f = g * cm + h * sm;
      br += (n + 1) * radial * f * P[n][m] * norm;
      bt -= radial * f * dP[n][m] * norm;
      bp += radial * m * (g * sm - h * cm) * P[n][m] * norm / s;
    }
  }
  const x = -bt * Math.cos(delta) - br * Math.sin(delta), y = bp;
  const down = bt * Math.sin(delta) - br * Math.cos(delta);
  const horizontal = Math.hypot(x, y);
  return { declination: Math.atan2(y, x) * DEG, horizontal, x, y, z: down, reliable: horizontal >= 6000 };
}
/** Physical phone top edge (+Y), independent of UI screen rotation. No GPS course or relative alpha fallback. */
export function phoneReading(event) {
  const beta = numberIn(event.beta, -180, 180), gamma = numberIn(event.gamma, -90, 90);
  const apple = numberIn(event.webkitCompassHeading, 0, 360);
  let heading = null, accuracy = null, source = 'Tilt only';
  if (apple !== null) {
    heading = wrap(apple);
    accuracy = finite(event.webkitCompassAccuracy) ? event.webkitCompassAccuracy : null;
    source = 'Apple magnetic compass';
  } else if (event.absolute === true && numberIn(event.alpha, 0, 360) !== null && beta !== null) {
    heading = wrap(-event.alpha + (Math.cos(beta * RAD) < 0 ? 180 : 0));
    source = 'Absolute magnetic orientation';
  }
  const tilt = beta === null ? null : Math.asin(Math.sin(beta * RAD)) * DEG;
  const flat = beta !== null && gamma !== null && Math.abs(beta) <= 20 && Math.abs(gamma) <= 20;
  const usableTilt = beta !== null && gamma !== null && Math.abs(beta) < 85 && Math.abs(gamma) <= 20;
  return { heading, accuracy, tilt, flat, usableTilt, source };
}
export function circularMean(values) {
  if (!values.length || !values.every(finite)) return null;
  const x = values.reduce((sum, v) => sum + Math.cos(v * RAD), 0);
  const y = values.reduce((sum, v) => sum + Math.sin(v * RAD), 0);
  return Math.hypot(x, y) < 1e-9 ? null : wrap(Math.atan2(y, x) * DEG);
}
/** Conservative gates. Unknown heading accuracy never produces a green azimuth. */
export function alignment({ mode, target, reading, tolerance, fresh, positionOK, mountOK, fieldOK, stable, azOffset = 0, elOffset = 0 }) {
  const needAz = mode !== 'elevation', needEl = mode !== 'azimuth';
  const invalid = message => ({ state: 'idle', message, azError: null, elError: null });
  if (!target) return invalid('Choose a satellite and set your location');
  if (target.elevation <= 0) return { ...invalid('Satellite below the horizon'), state: 'blocked' };
  if (!finite(tolerance) || tolerance <= 0 || !finite(azOffset) || !finite(elOffset)) return invalid('Check the tolerance and mounting offsets');
  if (!fresh || !positionOK) return invalid('Waiting for fresh, accurate position and sensor readings');
  if (!mountOK) return invalid('Confirm phone placement below');
  if (needAz && (!fieldOK || !finite(target.azimuth))) return invalid('Magnetic heading is unreliable here');
  if (!reading || (needAz && !finite(reading.heading)) || (needEl && !finite(reading.tilt))) return invalid('Required sensor unavailable');
  if (mode === 'azimuth' && !reading.flat) return invalid('Lay the phone flat, screen up');
  if (needEl && !reading.usableTilt) return invalid('Keep phone roll within 20° and top-edge tilt below 85°');
  const azError = needAz ? angleError(target.azimuth, wrap(reading.heading + azOffset)) : null;
  const elError = needEl ? target.elevation - (reading.tilt + elOffset) : null;
  const result = { state: 'outside', message: 'Adjust the antenna', azError, elError };
  if (needAz && (!finite(reading.accuracy) || reading.accuracy < 0 || reading.accuracy > tolerance)) return { ...result, state: 'uncertain', message: finite(reading.accuracy) && reading.accuracy >= 0 ? 'Compass uncertainty exceeds the selected zone' : 'Compass accuracy unknown: guidance only' };
  if ((needAz && Math.abs(azError) > tolerance) || (needEl && Math.abs(elError) > tolerance)) return result;
  if (!stable) return { ...result, state: 'near', message: 'In the zone. Hold still…' };
  return { ...result, state: 'aligned', message: mode === 'azimuth' ? 'AZIMUTH IN ZONE' : mode === 'elevation' ? 'ELEVATION IN ZONE' : 'POINTING IN ZONE' };
}
