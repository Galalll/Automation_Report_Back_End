// puppeteerCaptureLeaflet.mjs
import puppeteer from 'puppeteer';

/**
 * Renders a GeoJSON polygon in Leaflet and returns a PNG buffer.
 */
export async function captureMapWithLeaflet({
  geojson,
  center,
  zoom,
  width = 1024,
  height = 768,
  tileUrlTemplate = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
}) {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width, height },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });
  const page = await browser.newPage();
  
  const tileUrl = tileUrlTemplate ||
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  const html = `<!DOCTYPE html>
<html><head>
  <meta charset="utf-8">
  <title>Leaflet Capture</title>
  <link rel="stylesheet"
    href="https://unpkg.com/leaflet/dist/leaflet.css"/>
  <style>html,body,#map{margin:0;padding:0;width:100%;height:100%;}</style>
</head><body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
  <script>
    const map = L.map('map').setView([${center[1]}, ${center[0]}], ${zoom});
    const tileLayer = L.tileLayer('${tileUrl}',{
      subdomains:['a','b','c'], attribution:''
    }).addTo(map);

    L.geoJSON(${JSON.stringify(geojson)}, {
      style: { color:'#f00', weight:3, fillOpacity:0.1 }
    }).addTo(map);

    // flag when ready
    tileLayer.on('load', () =>
      document.body.setAttribute('data-ready','true')
    );
  </script>
</body></html>`;

  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.waitForFunction(
    "document.body.getAttribute('data-ready') === 'true'",
    { timeout: 20000 }
  );

  // instead of writing to disk, return the PNG buffer
  const imgBuffer = await page.screenshot({ type: 'png' });
  await browser.close();
  return imgBuffer;
}
