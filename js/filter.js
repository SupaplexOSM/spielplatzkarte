//----------------------------------------//
// Spielplatzfilter und Spielgerätefinder //
//----------------------------------------//

import $ from 'jquery';
import { dataPlaygrounds, dataIssues, dataFilteredEquipment } from './map.js';
import { objDevices } from './objPlaygroundEquipment.js';
import { showNotification } from './map.js';
import { getSliderMonth, getValidMonth, getSliderHour } from './shadow.js';

var cqlFilterObject = {
    playgrounds: {},
    completeness: {},
    filteredEquipment: {}
};

// Allgemeine Filterfunktionen für CQL-Filter (Spielplatzblasen und Spielgerätefinder)
export function addFilter(layer, filterClass, filterExpression) {
    cqlFilterObject[layer][filterClass] = filterExpression;
    return updateFilter(layer);
}

export function setFilter(layer, filterClass, filterExpression) {
    cqlFilterObject[layer] = { filterClass: filterExpression };
    return updateFilter(layer);
}

export function removeFilter(layer, filterClass) {
    delete cqlFilterObject[layer][filterClass];
    return updateFilter(layer);
}

export function getFilter(layer) {
    var cqlExpression = "";
    for (var filter in cqlFilterObject[layer]) {
        if (cqlExpression.length > 0) {
            cqlExpression += " AND "
        }
        cqlExpression += `(${cqlFilterObject[layer][filter]})`;
    }
    return cqlExpression;
}

function updateFilter(layer) {
    var cqlExpression = getFilter(layer);
    var lyr = dataPlaygrounds;
    if (layer == "filteredEquipment") {
        lyr = dataFilteredEquipment;
    }
    if (layer == "completeness") {
        lyr = dataIssues;
    }
    return lyr.getSource().updateParams({'CQL_FILTER': cqlExpression});
}

// Spielplatzfilter
$('#filterPrivate').on('change', function()     { (!$(this).is(':checked')) ? removeFilter("playgrounds", "access")       : addFilter("playgrounds", "access", "access = 'yes' OR access IS NULL"); });
$('#filterArea').on('change', function()        { (!$(this).is(':checked')) ? removeFilter("playgrounds", "area")         : addFilter("playgrounds", "area", "area_class > 0"); });
$('#filterWater').on('change', function()       { (!$(this).is(':checked')) ? removeFilter("playgrounds", "water")        : addFilter("playgrounds", "water", "is_water = true"); });
$('#filterShadow').on('change', function()      { (!$(this).is(':checked')) ? removeFilter("playgrounds", "shadow")       : addFilter("playgrounds", "shadow", `shadow_0${getValidMonth(getSliderMonth())}_${getFixedSliderHour(getSliderHour())} >= 50`); });
$('#filterBaby').on('change', function()        { (!$(this).is(':checked')) ? removeFilter("playgrounds", "baby")         : addFilter("playgrounds", "baby", "for_baby = true"); });
$('#filterToddler').on('change', function()     { (!$(this).is(':checked')) ? removeFilter("playgrounds", "toddler")      : addFilter("playgrounds", "toddler", "for_toddler = true"); });
$('#filterWheelchair').on('change', function()  { (!$(this).is(':checked')) ? removeFilter("playgrounds", "wheelchair")   : addFilter("playgrounds", "wheelchair", "for_wheelchair = true"); });
$('#filterBench').on('change', function()       { (!$(this).is(':checked')) ? removeFilter("playgrounds", "bench")        : addFilter("playgrounds", "bench", "bench_count > 0"); });
$('#filterPicnic').on('change', function()      { (!$(this).is(':checked')) ? removeFilter("playgrounds", "picnic")       : addFilter("playgrounds", "picnic", "picnic_count > 0"); });
$('#filterShelter').on('change', function()     { (!$(this).is(':checked')) ? removeFilter("playgrounds", "shelter")      : addFilter("playgrounds", "shelter", "shelter_count > 0"); });
$('#filterTableTennis').on('change', function() { (!$(this).is(':checked')) ? removeFilter("playgrounds", "table_tennis") : addFilter("playgrounds", "table_tennis", "table_tennis_count > 0"); });
$('#filterSoccer').on('change', function()      { (!$(this).is(':checked')) ? removeFilter("playgrounds", "soccer")       : addFilter("playgrounds", "soccer", "has_soccer = true"); });
$('#filterBasketball').on('change', function()  { (!$(this).is(':checked')) ? removeFilter("playgrounds", "basketball")   : addFilter("playgrounds", "basketball", "has_basketball = true"); });

function getFixedSliderHour(hour) {
    return (hour < 10) ? `0${hour}` : hour;
}

// Spielgerätefinder
// TODO Auswahldialog mit Mehrfachauswahl, Titel und Bildchen für jedes Spielgerät

// Spielgeräteauswahl füllen
var selectDevices = $("#select-device")[0];
for (const [entry, attributes] of Object.entries(objDevices)) {
    if (attributes["filterable"]) {
        var option = document.createElement("option");
        option.text = attributes["name_de"];
        option.value = entry;
        selectDevices.add(option);
        if (!selectDevices.value) {
            selectDevices.value = option.text;
        }
    }
}

// Spielgerätefinder (de)aktivieren (Layer ein- oder ausblenden)
var cqlFilterPlaygroundDevice = {};
$('#show-filtered-equipment').on('change', function() {
    if ($(this).is(':checked')) {
        updateEquipmentFilterOptions();
        updateFilter("filteredEquipment");
        dataFilteredEquipment.setVisible(true);
    } else {
        dataFilteredEquipment.setVisible(false);
    }
});

// Spielgerätefilter an Auswahl anpassen
$("#select-device").on("change", function() {
    $('#show-filtered-equipment').prop('checked', true).trigger('change'); // Wenn ein Spielgerät ausgewählt wird, davon ausgehen, dass man es auch anzeigen möchte (Toggle-Button aktivieren)
    var device = this.value;
    if (Object.keys(objDevices).includes(device)) {
        var filter_attr = [];
        if (objDevices[device]["filter_attr"]) {
            filter_attr = objDevices[device]["filter_attr"];
        }
        $('#filter-length').hide();
        $('#filter-height').hide();
        for (const attr of filter_attr) {
            var element = `#filter-${attr}`;
            $(element).show();
        }
    } else {
        $('#filter-length').hide();
        $('#filter-height').hide();
    }
    updateEquipmentFilterOptions();
});

$("#filter-length-checkbox").on("change", function() {
    if ($(this).is(':checked')) {
        $('#filter-length-operator').prop('disabled', false);
        $('#filter-length-value').prop('disabled', false);
    } else {
        $('#filter-length-operator').prop('disabled', true);
        $('#filter-length-value').prop('disabled', true);
    }
    updateEquipmentFilterOptions();
});
$("#filter-length-operator").on("change", function() { updateEquipmentFilterOptions(); });
$("#filter-length-value").on("change", function() { updateEquipmentFilterOptions(); });
$("#filter-height-checkbox").on("change", function() {
    if ($(this).is(':checked')) {
        $('#filter-height-operator').prop('disabled', false);
        $('#filter-height-value').prop('disabled', false);
    } else {
        $('#filter-height-operator').prop('disabled', true);
        $('#filter-height-value').prop('disabled', true);
    }
    updateEquipmentFilterOptions();
});
$("#filter-height-operator").on("change", function() { updateEquipmentFilterOptions(); });
$("#filter-height-value").on("change", function() { updateEquipmentFilterOptions(); });

function updateEquipmentFilterOptions() {
    var device = $("#select-device").val();
    var filter_str = `playground = '${device}'`
    var length_checked = $('#filter-length-checkbox').is(':checked');
    var length_visible = $('#filter-length-checkbox').is(':visible');
    var height_checked = $('#filter-height-checkbox').is(':checked');
    var height_visible = $('#filter-height-checkbox').is(':visible');
    if (length_checked && length_visible) {
        var operator = $("#filter-length-operator").val();
        var value = $("#filter-length-value").val();
        if (!isNaN(parseFloat(value))) {
            filter_str += ` AND length ${operator} ${value}`;
        } else {
            showNotification("Eingegebene Länge ist ungültig!");
        }
    }
    if (height_checked && height_visible) {
        var operator = $("#filter-height-operator").val();
        var value = $("#filter-height-value").val();
        if (!isNaN(parseFloat(value))) {
            filter_str += ` AND height ${operator} ${value}`;
        } else {
            showNotification("Eingegebene Höhe ist ungültig!");
        }
    }
    setFilter("filteredEquipment", device, filter_str);
}

// Datenprobleme anzeigen
$('#show-map-issues').on('change', function() {
    if ($(this).is(':checked')) {
        dataIssues.setVisible(true);
    } else {
        dataIssues.setVisible(false);
    }
});

// Datenprobleme-Filter
// zu Beginn sind die Schatten-Issues ausgeblendet
$('#filter-map-issues-1').on('change', function() { ($(this).is(':checked')) ? removeFilter("completeness", "01") : addFilter("completeness", "01", "not bug_level = '1'"); });
$('#filter-map-issues-2').on('change', function() { ($(this).is(':checked')) ? removeFilter("completeness", "02") : addFilter("completeness", "02", "not bug_level = '2'"); });
$('#filter-map-issues-3').on('change', function() { ($(this).is(':checked')) ? removeFilter("completeness", "03") : addFilter("completeness", "03", "not bug_level = '3'"); });
$('#filter-map-issues-4').on('change', function() { ($(this).is(':checked')) ? removeFilter("completeness", "04") : addFilter("completeness", "04", "not bug_level = '4'"); });
$('#filter-map-issues-5').on('change', function() { ($(this).is(':checked')) ? removeFilter("completeness", "05") : addFilter("completeness", "05", "not bug_level = '5'"); });