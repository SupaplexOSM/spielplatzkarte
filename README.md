# Berliner Spielplatzkarte
Die Berliner Spielplatzkarte ist eine interaktive Webmap zur Erkundung von Spielplätzen in Berlin auf Basis von OpenStreetMap-Daten. Sie ermöglicht derzeit:
- die Darstellung der Standorte aller Berliner Spielplätze,
- Darstellung von Spielgeräten bei Klick auf einen Spielplatz,
- Berechnung der Schattigkeit auf einem Spielplatz zu verschiedenen Jahres- und Tageszeiten,
- Filterung von Spielplätzen und Suche nach Spielgeräten,
- Anzeige von OSM-Datenproblemen.

# Technischer Hintergrund
* Die Spielplatzkarte basiert auf [OpenLayers](https://openlayers.org/). Hinweise zur Installation von OpenLayers mit Node.js sind im [OpenLayers-Quickstart](https://openlayers.org/doc/quickstart.html) zu finden.
* Das Projekt nutzt [jQuery](https://jquery.com/) und [Bootstrap](https://getbootstrap.com/).
* Derzeit benötigt die Spielplatzkarte für die Darstellung der Daten einen [GeoServer](https://geoserver.org/), der die Daten aus einer PostgreSQL-Datenbank ausliefert.

![grafik](https://github.com/SupaplexOSM/spielplatzkarte/assets/66696066/60fd5098-f795-42ad-bc82-7e8d7d4a5bd2)
![grafik](https://github.com/SupaplexOSM/spielplatzkarte/assets/66696066/da207a7f-398a-4feb-977c-6206ac91281d)
![grafik](https://github.com/SupaplexOSM/spielplatzkarte/assets/66696066/8129ec64-84f8-45c0-b98a-d27eaf9b7e99)
