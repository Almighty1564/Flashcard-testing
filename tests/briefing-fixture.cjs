// Synthetic data for tests only. Never imported by the application.
module.exports = function fixture() {
  const start = Date.parse('2026-09-13T04:00:00Z') / 1000;
  const daily = {time:[], weather_code:[], temperature_2m_max:[], temperature_2m_min:[], precipitation_probability_max:[], sunrise:[], sunset:[], uv_index_max:[]};
  const hourly = {time:[], temperature_2m:[], apparent_temperature:[], precipitation_probability:[], weather_code:[], wind_gusts_10m:[], uv_index:[], is_day:[]};
  for (let i=0; i<7; i++) {
    daily.time.push(start+i*86400); daily.weather_code.push([1,3,61,2,0,95,1][i]);
    daily.temperature_2m_max.push(27+i); daily.temperature_2m_min.push(17+i);
    daily.precipitation_probability_max.push([10,20,80,30,5,90,10][i]);
    daily.sunrise.push(start+i*86400+6*3600+55*60);
    daily.sunset.push(start+i*86400+19*3600+23*60);
    daily.uv_index_max.push([7.8,5.1,3.4,8.2,9.1,4.8,11.2][i]);
  }
  for (let i=0; i<168; i++) {
    const hour=i%24;
    hourly.time.push(start+i*3600); hourly.temperature_2m.push(24);
    hourly.apparent_temperature.push(26); hourly.precipitation_probability.push(20);
    hourly.weather_code.push(1); hourly.wind_gusts_10m.push(20);
    hourly.uv_index.push(hour>=7 && hour<19 ? 6.4 : 0); hourly.is_day.push(hour>=7 && hour<19 ? 1 : 0);
  }
  return { timezone:'America/New_York', utc_offset_seconds:-14400,
    current:{time:start+14*3600+30*60,temperature_2m:26,apparent_temperature:28,relative_humidity_2m:55,weather_code:1,is_day:1,wind_speed_10m:12,wind_gusts_10m:20,precipitation:0}, daily, hourly };
};
if (require.main === module) process.stdout.write(JSON.stringify(module.exports()));
