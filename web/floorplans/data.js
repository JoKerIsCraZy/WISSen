'use strict';

/* Hotspot data for WISS floorplans (4. OG, 2. OG).
 * Coordinates are percentages relative to the source image.
 * Source: raumpläne/4. og.html (JSON backup), tuned via the standalone
 * editors at raumpläne/2og_editor.html and raumpläne/4og_editor.html.
 *
 * Room codes are stored without dots ("403" not "4.03") so the rendered
 * label matches what the user wants on screen ("208"). normalizeRoom()
 * collapses any input form ("ZH 2.08", "208", "ZH 208") to this canonical
 * dotless form for hotspot lookup. */

var FloorplanData = {
  og4: {
    aspectRatio: '1900/970',
    hotspots: [
      { room: '409', left: 49, top: 0.9, width: 11.2, height: 26.1 },
      { room: '410', left: 60.1, top: 1, width: 9.6, height: 13.3 },
      { room: '411', left: 69.7, top: 0.8, width: 11.7, height: 27.9 },
      { room: '408', left: 49, top: 26.9, width: 11, height: 19.5 },
      { room: '412', left: 69.2, top: 33.1, width: 12.1, height: 18.6 },
      { room: '413', left: 66.3, top: 51.6, width: 20.9, height: 21.5 },
      { room: '414', left: 66, top: 72.8, width: 21.2, height: 20.9 },
      { room: 'Terrasse', left: 12.3, top: 40.6, width: 21.9, height: 5.5 },
      { room: '404', left: 4, top: 46, width: 8.9, height: 32.1 },
      { room: '405', left: 12.9, top: 46.1, width: 9, height: 8.5 },
      { room: '406', left: 27.3, top: 46.2, width: 5.7, height: 19.4 },
      { room: 'Toilette-1', left: 32.9, top: 46.1, width: 5.6, height: 19.5 },
      { room: 'Treppenhaus', left: 38.4, top: 46.4, width: 20.8, height: 23.6 },
      { room: '403', left: 4, top: 78, width: 13, height: 15.4 },
      { room: '402', left: 17, top: 78, width: 14, height: 15.5 },
      { room: '401', left: 31, top: 78, width: 13, height: 15.5 },
      { room: 'Aufenthalt', left: 44, top: 78, width: 11.7, height: 15.5 },
      { room: '415', left: 55.5, top: 78, width: 10.5, height: 15.7 }
    ]
  },
  og2: {
    aspectRatio: '1760/960',
    hotspots: [
      { room: '208', left: 51.9, top: 12.1, width: 10.3, height: 21.3 },
      { room: '209', left: 62.2, top: 12.1, width: 6.8, height: 9.5 },
      { room: '210', left: 69, top: 12, width: 10.1, height: 18 },
      { room: '205', left: 10.8, top: 33.5, width: 9.4, height: 17.1 },
      { room: '206', left: 20.1, top: 33.3, width: 13.9, height: 11.1 },
      { room: '207', left: 33.9, top: 33.1, width: 11.9, height: 11.3 },
      { room: 'Kursleitung', left: 45.7, top: 33.3, width: 8.2, height: 11 },
      { room: '211', left: 67.4, top: 33.2, width: 11.6, height: 11.9 },
      { room: '204', left: 10.9, top: 50.3, width: 8.9, height: 16.1 },
      { room: '212', left: 67.5, top: 45.1, width: 15.8, height: 12.9 },
      { room: '203', left: 10.9, top: 66.4, width: 12.3, height: 14.4 },
      { room: '202', left: 23, top: 67.4, width: 11.6, height: 13.4 },
      { room: '201', left: 34.6, top: 67.4, width: 11.7, height: 13.4 },
      { room: 'Empfang', left: 46.1, top: 67.4, width: 11, height: 13.4 },
      { room: 'Schulleitung-HB', left: 57, top: 67.4, width: 12, height: 13.4 },
      { room: 'Schulleitung-GB', left: 68.9, top: 67.4, width: 9.7, height: 13.4 },
      { room: 'Treppenhaus', left: 42, top: 44.3, width: 19.5, height: 16.6 },
      { room: 'Toilette', left: 34.3, top: 44.4, width: 5.6, height: 12.9 },
      { room: 'Treppenhaus 2', left: 19.8, top: 50.8, width: 10, height: 10.2 },
      { room: 'Aufenthalt', left: 66.6, top: 58, width: 12, height: 9.5 }
    ]
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FloorplanData;
} else if (typeof window !== 'undefined') {
  window.FloorplanData = FloorplanData;
}
