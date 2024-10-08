#!/bin/bash

# Variablen
DB_NAME="spielplatzkarte"
DB_USER="postgres"
DB_HOST="localhost"

# Paramater-Aufrufe
OSM_DOWNLOAD="true" # wenn "false", werden keine aktuellen Daten heruntergeladen (Parameter "-d" bei Scriptaufruf)
OSM_IMPORT="true" # wenn "false", wird kein Datenbankimport durchgeführt ("-i")
PROCESSING_PLAYGROUND="true" # wenn "false", wird keine Spielplatz-Processing durchgeführt ("-p")
PROCESSING_SHADOW="true" # wenn "false", wird kein Schatten-Processing durchgeführt ("-s")
PROCESSING_COMPLETENESS="true" # wenn "false", wird keine Vollständigkeits-Processing durchgeführt ("-c")

OSM_URL="https://download.geofabrik.de/europe/germany/berlin-latest.osm.pbf"
OSM_FILE="../data/berlin-latest.osm.pbf"
DATE_FILE="../data/data_date.js"

IMPORT_LUA="lua/osm_import.lua"

echo "$(date +'%Y-%m-%d %H:%M:%S')  [INFO] Script gestartet..."

# Parameter prüfen, die bei Scriptaufruf übergeben werden:
# -d führt einen OSM-Datendownload durch (aktuelle Daten sollten dann auch mit "-i" importiert werden)
while getopts "dipsc" opt; do
  case $opt in
    d)
      OSM_DOWNLOAD="false"
      ;;
    i)
      OSM_IMPORT="false"
      ;;
    p)
      PROCESSING_PLAYGROUND="false"
      ;;
    s)
      PROCESSING_SHADOW="false"
      ;;
    c)
      PROCESSING_COMPLETENESS="false"
      ;;
    \?)
      echo "Ungültiger Parameter: -$OPTARG" >&2
      ;;
  esac
done

# Passwortgeschützter Zugang zur Datenbank via .pgpass-File: https://www.postgresql.org/docs/current/libpq-pgpass.html
export PGPASSFILE=$HOME/.pgpass

# Datendownload
if [ "$OSM_DOWNLOAD" = "true" ]; then
  echo "$(date +'%Y-%m-%d %H:%M:%S')  [INFO] Lade OSM-Daten herunter..."
  wget -O $OSM_FILE $OSM_URL
fi

if [ -f "$OSM_FILE" ]; then
  # Datenstand ermitteln und als Variable in einer Datei speichern
  DATE=$(stat -c %y $OSM_FILE)
  DAY=$(echo $DATE | cut -d ' ' -f 1)
  TIME=$(echo $DATE | cut -d ' ' -f 2 | cut -d ':' -f 1,2)
  echo "$(date +'%Y-%m-%d %H:%M:%S')  [INFO] Datenstand: $DAY $TIME"
  echo "const dataDate = '${DAY}, ${TIME} Uhr'; export default dataDate;" > $DATE_FILE

  # Importieren der OSM-Daten
  if [ "$OSM_IMPORT" = "true" ]; then
    echo "$(date +'%Y-%m-%d %H:%M:%S')  [INFO] Importiere OSM-Daten..."
    osm2pgsql -c -H localhost -U postgres -d $DB_NAME -O flex -S $IMPORT_LUA $OSM_FILE
  fi

  # SQL-Prozessierung
  # Spielplätze
  if [ "$PROCESSING_PLAYGROUND" = "true" ]; then
    # SQL-Prozessierung für Spielplätze aufrufen
    echo "$(date +'%Y-%m-%d %H:%M:%S')  [INFO] Prozessiere OSM-Spielplatzdaten..."
    psql -U $DB_USER -h $DB_HOST -d $DB_NAME < "sql/playground_processing.sql"
  fi

  # Schatten
  if [ "$PROCESSING_SHADOW" = "true" ]; then
    # Attribute für Schattenberechnung vorbereiten
    echo "$(date +'%Y-%m-%d %H:%M:%S')  [INFO] Bereite Schattenberechnung vor..."
    psql -U $DB_USER -h $DB_HOST -d $DB_NAME < "sql/shadow_preparation.sql"

    # Schattenberechnung durchführen
    echo "$(date +'%Y-%m-%d %H:%M:%S')  [INFO] Berechne Schatten..."
    psql -U $DB_USER -h $DB_HOST -d $DB_NAME < "sql/shadow_processing.sql"
  fi

  # Spielplätze
  if [ "$PROCESSING_COMPLETENESS" = "true" ]; then
    # Datenvollständigkeits-Prozessierung aufrufen
    echo "$(date +'%Y-%m-%d %H:%M:%S')  [INFO] Ermittle Datenvollständigkeit und Datenfehler..."
    psql -U $DB_USER -h $DB_HOST -d $DB_NAME < "sql/completeness_processing.sql"
  fi

else
    echo "$(date +'%Y-%m-%d %H:%M:%S')  [FEHLER] OSM-Datei $DATEI existiert nicht. Daten-Import und -Prozessierung nicht möglich."
fi

echo "$(date +'%Y-%m-%d %H:%M:%S')  [INFO] Script abgeschlossen."
