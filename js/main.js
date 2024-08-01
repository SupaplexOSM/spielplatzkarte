import $ from 'jquery';

import 'bootstrap/dist/css/bootstrap.min.css';
import '../css/bootstrap_custom.css';

import { transformExtent } from 'ol/proj';

import map from './map.js';
import { getMapScale, mapExtent } from './map.js';

import { setCurrentDate } from './shadow.js';
import { showLocation, hideLocation } from './locate.js';
import { searchLocation } from './search.js';

// Schieberegler der Schattenberechnung auf aktuelles Datum setzen
setCurrentDate();

// TODO Bekannte Bugs:
// - Sind nach Selektion eines Spielplatzes Spielplatzausstattungslayer geladen und bewegt man die Karte oder zoomt man heraus (auf einen Wert < Zoomstufe ~20,5), werden die Features mehrfach eingeladen
// - Überschneiden sich die bboxes zweier Spielplätze, werden im Spielgeräte-Layer auch Spielgeräte des benachbarten Spielplatzes angezeigt, solange sie in der bbox des selektierten Spielplatzes liegen (Beispiel: https://www.openstreetmap.org/way/61882759)