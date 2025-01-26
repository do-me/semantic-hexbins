var map;
var layerControl;
var heat;
var self_drawn;
var L;
var locs;
var stats;
var chi_vals;
var center = [50.70477152128107, 7.08660899929857];
var currentCSV;
var currentTopic;
var currentMode;
var hexLayer;
var currentRadiusMode;
var breakMode; //["equal_breaks", "quantile", "jenks_natural_breaks"];
var allBreakpointsJson
var CSV;
var currentQueryEmbedding;
var pipe;
var queryEmbedding;
var minScore = 0.7;
var minScoreQuantity = 3;
var modelExecTime;

// colorbrewer2 palettes, blues and greens, single hue 
// https://colorbrewer2.org/#type=sequential&scheme=Blues&n=7 | https://colorbrewer2.org/#type=sequential&scheme=Greens&n=7

const colorbrewerBlues = ['#eff3ff', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#084594']
const colorbrewerGreens = ['#edf8e9', '#c7e9c0', '#a1d99b', '#74c476', '#41ab5d', '#238b45', '#005a32']
const colorbrewerRedsWhiteGreens = ['#de2d26', '#fc9272', '#fee0d2', '#ffffff', '#e5f5e0', '#a1d99b', '#31a354']
const colorbrewerRedTransparentGreens = ['#fcae91', '#ffffff00', '#a1d99b', '#74c476', '#41ab5d', '#238b45', '#005a32']//,'#edf8e9','#bae4b3','#74c476','#31a354','#006d2c']
const colorbrewerRedTransparentBlues = ['#fcae91', '#ffffff00', '#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c']
const colorbrewerRedsTransparentBlues = ['#de2d26', '#fc9272', '#fee0d2', '#ffffff00', '#deebf7', '#9ecae1', '#3182bd']

const osmUrl = 'http://{s}.tile.osm.org/{z}/{x}/{y}.png';
const osmAttrib = '&copy; <a href="http://openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const osm = L.tileLayer(osmUrl, {
    maxZoom: 18,
    attribution: osmAttrib
});

$(document).ready(function () {
    function calculateCosineSimilarity(queryEmbedding, embedding) {
        let dotProduct = 0;
        let queryMagnitude = 0;
        let embeddingMagnitude = 0;
        let queryEmbeddingLength = queryEmbedding.length
        for (let i = 0; i < queryEmbeddingLength; i++) {
            dotProduct += queryEmbedding[i] * embedding[i];
            queryMagnitude += queryEmbedding[i] ** 2;
            embeddingMagnitude += embedding[i] ** 2;
        }
        return dotProduct / (Math.sqrt(queryMagnitude) * Math.sqrt(embeddingMagnitude));
    }

    let filename = "data/" + document.getElementById("dataFile").value;
    let mean_location_variant = filename.includes("mean_location")

    function initialize_map(focus_coordinates = center, zoom_level = 13) {
        // initialize the map on the "map" div with a given center and zoom
        map = L.map('map', {
            fullscreenControl: true,
        }).setView(focus_coordinates, zoom_level)

        osm.addTo(map);

        var bm_web_gry = L.maplibreGL({
            style: 'https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_gry.json',
        });

        var bm_web_col = L.maplibreGL({
            style: 'https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_col.json',
        });

        layerControl = L.control.layers({
            "OpenStreetMap": osm, // Add OSM as a base layer option
            "Basemap Gray": bm_web_gry,
            "Basemap Color": bm_web_col
        }).addTo(map);


        L.control.scale().addTo(map);
        L.Control.geocoder().addTo(map);
        L.control.polylineMeasure().addTo(map);
        //L.control.bigImage().addTo(map);
        $('.leaflet-pm-icon-marker').parent().hide();
        $('.leaflet-pm-icon-circle-marker').parent().hide();
        $('.leaflet-pm-icon-polyline').parent().hide();
    }

    window.remove_layer = function (layr) {
        map.removeLayer(layr);
        layerControl.removeLayer(layr)
    }

    window.add_layer = function (layr, layr_name) {
        map.addLayer(layr);
        layerControl.addOverlay(layr, layr_name);
    }

    initialize_map();

    window.remove_all_hex_layer = function () {
        map.eachLayer(function (layer) {
            if (("duration" in layer.options)) {
                map.removeLayer(layer);
                layerControl.removeLayer(layer);
            }
        });
    }

    // exclude Bonn location only
    const excludeIds = ["107481562"];
    // exclude Bonn location and city district locations
    // const excludeIds = ['107481562', '1007444547', '242136127', '228014686', '50635685', '100605904743228', '1006643179', '225430184', '304664400', '933806480'];

    async function loadRemoteGzippedJSON(url) {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        const data = new Uint8Array(buffer);
        const inflated = pako.inflate(data, { to: 'string' });
        const json = JSON.parse(inflated);

        // Filter locations based on the provided ids
        const filteredLocations = json.filter(entry => {
            const locationId = entry["node.location_id"];
            return !excludeIds.includes(locationId);
        });

        currentCSV = filteredLocations
        return json;
    }

    function create_embedding_score_hexlayer(colorScaleExtentLower, colorScaleExtentUpper) {

        remove_all_hex_layer()

        var options = {
            //radius : 12,
            opacity: 0.75,
            duration: 200,
            colorScaleExtent: [0.5, 1]
            //colorScaleExtent: [ 0,6 ]
        };

        hexLayer = L.hexbinLayer(options).addTo(map)
        //hexLayer.colorScale().range(['white', 'blue']);

        hexLayer
            .lat(function (d) { return d["lat"]; })
            .lng(function (d) { return d["lon"]; }).hoverHandler(L.HexbinHoverHandler.compound({
                handlers: [
                    L.HexbinHoverHandler.resizeFill(),
                    L.HexbinHoverHandler.tooltip({ tooltipContent: tooltip_function })
                ]
            }
            ));

        hexLayer.dispatch()
            .on('click', function (d, i) {
                //console.log({ type: 'click', event: d, index: i, context: this });
                hexagon_click(d);
            });

        updateRadius()

        updateColorValueFunction()

        //hexLayer.radiusValue(function(d) {
        //    var posts_match = d.reduce(function (acc, obj) { return acc + obj["o"]["posts_sum"]; }, 0);
        //    return posts_match;
        //   });

        //updateColorValueFunction();
        //updateRadius();
        add_layer(hexLayer, "Hexbins");

        ////#################################################################################################################
        hexLayer.colorScaleExtent([colorScaleExtentLower, colorScaleExtentUpper])

        // set scale extent

        colorScaleExtentLower = colorScaleExtentLower.toFixed(3);
        colorScaleExtentUpper = colorScaleExtentUpper.toFixed(3);

        // min 
        $("#minScale").val(colorScaleExtentLower);
        $("#minScaleRange").val(colorScaleExtentLower);

        //max 
        $("#maxScale").val(colorScaleExtentUpper);
        $("#maxScaleRange").val(colorScaleExtentUpper);

        hexLayer.data(currentCSV);


    }


    async function computeQueryEmbedding() {
        let inputQuery = $("#queryText").val()
        let modelExecTimeStartTime = performance.now();
        // https://huggingface.co/intfloat/multilingual-e5-small#faq needs "query: " for better performance
        queryEmbedding = await pipe("query: " + inputQuery, { pooling: 'mean', normalize: false });
        modelExecTime = performance.now() - modelExecTimeStartTime;

        queryEmbedding = Array.from(queryEmbedding["data"]);

        currentQueryEmbedding = queryEmbedding;

        currentCSV = currentCSV.reduce((accumulator, currentValue) => {
            currentValue.score = calculateCosineSimilarity(currentQueryEmbedding, currentValue.embeddings);
            accumulator.push(currentValue);
            return accumulator;
        }, []);

        // Find the maximum and median scores for reasonable initial color extent

        const maxScore = Math.max(...currentCSV.map(item => item.score))

        const scores = currentCSV.map(item => item.score).filter(score => score !== 0).sort((a, b) => a - b);

        let medianScore = scores.length % 2 === 0
            ? ((scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2)
            : scores[Math.floor(scores.length / 2)];

        // Normalize the scores (would be another option but lad to intransparency)
        // currentCSV.forEach(item => {item.score = (item.score - minScoreNonZero) / (maxScore - minScoreNonZero);});

        // add hexlayer here 
        create_embedding_score_hexlayer(medianScore, maxScore);

    }

    async function updateColorValueFunction() {


        //var minScore = 0.4;
        //var minScoreQuantity = 5;

        hexLayer.colorValue((data) => {
            // Filter the data to get values above the threshold
            const aboveThreshold = data.filter(obj => obj["o"]["score"] >= minScore);
            //console.log(aboveThreshold)
            // If the count of values above the threshold is greater than or equal to minCount, return maxScore; else, return 0.
            //console.log(aboveThreshold)
            //console.log(aboveThreshold, aboveThreshold.length, aboveThreshold["o"]["count"], minScoreQuantity)

            // summed posts, if else needed for different mean_location posts sum as posts are aggregated before
            let aboveThresholdSumCounts = 0
            if (mean_location_variant) {
                aboveThresholdSumCounts = aboveThreshold.reduce((sum, obj) => sum + obj["o"]["count"], 0);
            }
            else {
                aboveThresholdSumCounts = aboveThreshold.length //reduce((sum, obj) => sum + obj["o"]["count"], 0);
            }

            //console.log(aboveThresholdSumCounts, minScoreQuantity)
            if (aboveThresholdSumCounts >= minScoreQuantity) {
                // Find the maximum score
                const scores = aboveThreshold.map(obj => obj["o"]["score"]);

                // these functions are somehow explainable and referenced in the paper
                const minScore = Math.min(...scores);
                const maxScore = Math.max(...scores);
                const meanScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
                const medianScore = scores.sort((a, b) => a - b)[Math.floor(scores.length / 2)];

                // experimental, searching for "homogenous areas"
                // Range
                const rangeScore = Math.max(...scores) - Math.min(...scores);
                const madScore = scores.reduce((sum, score) => sum + Math.abs(score - meanScore), 0) / scores.length; // Mean Absolute Deviation (MAD)
                const varianceScore = scores.reduce((sum, score) => sum + (score - meanScore) ** 2, 0) / scores.length;// Standard Deviation
                const stdDevScore = Math.sqrt(varianceScore);
                const cvScore = (stdDevScore / meanScore)// Coefficient of Variation (CV)
                //console.log(maxScore)
                const selectedValue = document.getElementById("min_max_mean_median").value;

                // Return the respective score based on the selected value
                const log_vals = false;

                switch (selectedValue) {
                    case "min":
                        if (log_vals) console.log(`Selected value: ${selectedValue}, Score: ${minScore}`);
                        return minScore;
                    case "max":
                        if (log_vals) console.log(`Selected value: ${selectedValue}, Score: ${maxScore}`);
                        return maxScore;
                    case "mean":
                        if (log_vals) console.log(`Selected value: ${selectedValue}, Score: ${meanScore}`);
                        return meanScore;
                    case "median":
                        if (log_vals) console.log(`Selected value: ${selectedValue}, Score: ${medianScore}`);
                        return medianScore;
                    case "range":
                        if (log_vals) console.log(`Selected value: ${selectedValue}, Score: ${rangeScore}`);
                        return rangeScore;
                    case "mad":
                        if (log_vals) console.log(`Selected value: ${selectedValue}, Score: ${madScore}`);
                        return madScore;
                    case "variance":
                        if (log_vals) console.log(`Selected value: ${selectedValue}, Score: ${varianceScore}`);
                        return varianceScore;
                    case "stdDev":
                        if (log_vals) console.log(`Selected value: ${selectedValue}, Score: ${stdDevScore}`);
                        return stdDevScore;
                    case "cv":
                        if (log_vals) console.log(`Selected value: ${selectedValue}, Score: ${cvScore}`);
                        return cvScore;
                    default:
                        throw new Error(`Unknown selected value: ${selectedValue}`);
                }
            } else {
                return null; // 0 -> white, null -> transparent
            }
        });

        hexLayer.redraw()
    }

    function tooltip_function(d) {
        // bin stats

        const aboveThreshold = d.filter(obj => obj["o"]["score"] >= minScore);


        let aboveThresholdSumCounts = 0
        if (mean_location_variant) {
            aboveThresholdSumCounts = aboveThreshold.reduce((sum, obj) => sum + obj["o"]["count"], 0);
        }
        else {
            aboveThresholdSumCounts = aboveThreshold.length //reduce((sum, obj) => sum + obj["o"]["count"], 0);
        }


        let SumCounts = 0
        if (mean_location_variant) {
            SumCounts = d.reduce((sum, obj) => sum + obj["o"]["count"], 0);
        }
        else {
            SumCounts = d.length //reduce((sum, obj) => sum + obj["o"]["count"], 0);
        }

        const maxScore = aboveThreshold.reduce((max, obj) => Math.max(max, obj["o"]["score"]), 0);
        /////////////////////////////////////////////////////

        // plain html version
        var tooltip_text =
            `<table>
        <tr>
            <th colspan="2">Bin Statistics</th>
        </tr>
        <tr>
            <td>Posts:</td>
            <td>${String(SumCounts)}</td>
        </tr>
        <tr>
            <td>Posts Above Threshold:</td>
            <td>${String(aboveThresholdSumCounts)}</td>
        </tr>
        <tr>
            <td>Highest Score (Color):</td>
            <td>${maxScore.toFixed(2)}</td>
        </tr>
        </table>
        `
        // simple version
        //var tooltip_text_plain =
        //    `Bin Statistics<br>
        //    Posts: ${String(SumCounts)}<br>
        //    Posts Above Threshold: ${String(aboveThresholdSumCounts)}<br>
        //    Highest Score (Color): ${String(maxScore.toFixed(2))}<br>`
        return tooltip_text
    }

    function hexagon_click(d) {
        var locations = d.reduce(function (acc, obj) { acc.push(obj["o"]["node.location_id"]); return acc; }, []);
        locations = [...new Set(locations)]

        let locationsHTML = ""; // initialize result variable as empty string

        for (let i = 0; i < locations.length; i++) {
            const element = locations[i];
            const href = `https://www.instagram.com/explore/locations/${element}`; // generate href attribute
            const link = `<a href="${href}" target="_blank">${element}</a>`; // wrap element in a tag
            locationsHTML += link + "<br>"; // concatenate link and <br> tag to result
        }

        $("#locations").html(locationsHTML)

    }

    function updateRadius() {

        if (currentRadiusMode == "postsMatchRadius") {
            hexLayer.radiusValue(function (d) {
                const aboveThreshold = d.filter(obj => obj["o"]["score"] >= minScore);

                let aboveThresholdSumCounts = 0
                if (mean_location_variant) {
                    aboveThresholdSumCounts = aboveThreshold.reduce((sum, obj) => sum + obj["o"]["count"], 0);
                }
                else {
                    aboveThresholdSumCounts = aboveThreshold.length;
                }
                return aboveThresholdSumCounts;
            });
        }

        else if (currentRadiusMode == "totalPosts") {
            hexLayer.radiusValue(function (d) {
                let SumCounts = 0
                if (mean_location_variant) {
                    SumCounts = d.reduce((sum, obj) => sum + obj["o"]["count"], 0);
                }
                else {
                    SumCounts = d.length;
                }
                return SumCounts;
            });
        }
        else {
            hexLayer.radiusValue(function (d) { return 12; }); // normal radius max value, all bins equal and adjacent
        }
        hexLayer.redraw();
    }

    window.remove_layer = function (layr) {
        map.removeLayer(layr);
        layerControl.removeLayer(layr)
    }

    window.add_layer = function (layr, layr_name) {
        map.addLayer(layr);
        layerControl.addOverlay(layr, layr_name);
    }

    function update_color_scale_extent(lower, upper) {
        hexLayer.colorScaleExtent([lower, upper])
        hexLayer.redraw()
    }

    async function initialize_data(query = false) {

        $("#spinner").attr('hidden', false);
        document.getElementById("queryData").disabled = true;

        await loadRemoteGzippedJSON(filename);
        if (query) {
            computeQueryEmbedding()
        }
        $("#spinner").attr('hidden', '');
        document.getElementById("queryData").disabled = false;
    }

    let pixiOverlay;

    async function createPixiOverlay() {
        markerTexture = await PIXI.Assets.load('static/img/marker-icon.png');

        const pixiContainer = new PIXI.Container();

        pixiOverlay = L.pixiOverlay(function (utils) {
            const zoom = utils.getMap().getZoom();
            const container = utils.getContainer();
            const renderer = utils.getRenderer();
            const project = utils.latLngToLayerPoint;
            const scale = utils.getScale();

            container.removeChildren();

            currentCSV.forEach(item => {
                const marker = new PIXI.Sprite(markerTexture);
                const markerCoords = project([item.lat, item.lon]);

                marker.x = markerCoords.x;
                marker.y = markerCoords.y;
                marker.anchor.set(0.5, 1); // set the anchor to the bottom center
                marker.scale.set(0.5 / scale) // scaling texture

                // Make the marker interactive
                marker.interactive = true;
                marker.buttonMode = true;

                marker.on('click', (event) => {
                    // You can customize the tooltip content based on the item data
                    const tooltipContent = `Location ID: ${item["node.location_id"]}<br>Lat: ${item.lat}<br>Lon: ${item.lon}`;

                    //Create a popup
                    L.popup({ maxWidth: 200, closeButton: false }).setLatLng([item.lat, item.lon])
                        .setContent(tooltipContent)
                        .openOn(map);
                });


                container.addChild(marker);
            });

            renderer.render(container);
        }, pixiContainer, { autoPreventDefault: false });

        add_layer(pixiOverlay, "Markers");
    }

    function withResourceMonitoring(originalFunction) {
        return async function(...args) {
            const startMark = 'functionStart';
            const endMark = 'functionEnd';
            const measureName = 'functionDuration';
    
            performance.mark(startMark);
            let memoryStart = performance.memory ? performance.memory.usedJSHeapSize : null;
    
            let result;
            try {
                result = await originalFunction(...args);
            } catch (error) {
                console.error(`Error during function execution:`, error);
                throw error; // Re-throw to allow error to propagate as expected if needed
            }
    
    
            performance.mark(endMark);
            performance.measure(measureName, startMark, endMark);
    
            const duration = performance.getEntriesByName(measureName)[0].duration;
            let memoryEnd = performance.memory ? performance.memory.usedJSHeapSize : null;
    
            // Ensure both memoryStart and memoryEnd are valid numbers before calculating memoryDelta
            let memoryDelta;
            if (typeof memoryStart === 'number' && typeof memoryEnd === 'number') {
                memoryDelta = memoryEnd - memoryStart;
            } else {
                memoryDelta = null; // Or any suitable value to indicate an invalid delta.
            }
          
            const formattedDuration = duration.toFixed(2);
            document.getElementById('executionTime').innerHTML = `Full layer update took ${formattedDuration} ms, including ${modelExecTime.toFixed(2)} ms for inferencing`;
            console.log(`Function '${originalFunction.name || 'anonymous'}' Execution Time: ${duration} milliseconds`);
          
          if (performance.memory) {
               const formattedMemoryStart = (typeof memoryStart === 'number') ? formatBytes(memoryStart) : 'N/A';
               const formattedMemoryEnd = (typeof memoryEnd === 'number') ? formatBytes(memoryEnd) : 'N/A';
               const formattedMemoryDelta = (typeof memoryDelta === 'number') ? formatBytes(memoryDelta) : 'N/A';
    
                console.log("Memory Usage Start:", formattedMemoryStart);
                console.log("Memory Usage End:", formattedMemoryEnd);
                console.log("Memory Delta:", formattedMemoryDelta);
            } else {
                console.log("performance.memory API is not supported in this browser");
            }
    
    
            performance.clearMarks(startMark);
            performance.clearMarks(endMark);
            performance.clearMeasures(measureName);
    
            return result;
        };
    }
    
    
    function formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    initialize_data()

    // Range slider listener

    //////////////////////////////////////////////////////////
    $("#maxScaleRange").on("input", function () {
        $("#maxScale").val($("#maxScaleRange").val());
        SminScore = parseFloat($("#minScale").val());
        SmaxScore = parseFloat($("#maxScale").val());
        update_color_scale_extent(SminScore, SmaxScore)
    });

    $("#maxScale").on("change", function () {
        SminScore = parseFloat($("#minScale").val());
        SmaxScore = parseFloat($("#maxScale").val());
        $("#maxScaleRange").val(SmaxScore);
        update_color_scale_extent(SminScore, SmaxScore)
    });

    //////////////////////////////////////////////////////////

    $("#minScaleRange").on("input", function () {
        $("#minScale").val($("#minScaleRange").val());
        SminScore = parseFloat($("#minScale").val());
        SmaxScore = parseFloat($("#maxScale").val());
        update_color_scale_extent(SminScore, SmaxScore)
    });

    $("#minScale").on("change", function () {
        SminScore = parseFloat($("#minScale").val());
        $("#minScaleRange").val(SminScore);
        SmaxScore = parseFloat($("#maxScale").val());
        update_color_scale_extent(SminScore, SmaxScore)
    });

    //////////////////////////////////////////////////////////////
    $("#minScoreRange").on("input", function () {
        $("#minScore").val($("#minScoreRange").val());
        minScore = parseFloat($("#minScore").val());
        updateColorValueFunction();
    });

    $("#minScore").on("change", function () {
        minScore = parseFloat($("#minScore").val());
        $("#minScoreRange").val(minScore);
        updateColorValueFunction();
    });

    //////////////////////////////////////////////////////////////
    $("#minScoreQuantityRange").on("input", function () {
        $("#minScoreQuantity").val($("#minScoreQuantityRange").val());
        minScoreQuantity = parseFloat($("#minScoreQuantity").val());
        updateColorValueFunction();
    });

    $("#minScoreQuantity").on("change", function () {
        minScoreQuantity = parseFloat($("#minScoreQuantity").val());
        $("#minScoreQuantityRange").val(minScoreQuantity);
        updateColorValueFunction();
    });
    //////////////////////////////////////////////////////////////

    $("#breakMode").on("change", function () {

        breakMode = $("#breakMode").val()
        updateColorValueFunction();
    });

    $('input[name="colorScaleRadio"]').on('change', function () {
        currentModeNormalOrBestLoc = $('input[name="colorScaleRadio"]:checked').val()
        updateColorValueFunction()
    });

    $('input[name="radiusRadio"]').on('change', function () {
        currentRadiusMode = $('input[name="radiusRadio"]:checked').val()
        updateRadius();

    });

    $('#queryData').click(function (event) {
        //computeQueryEmbedding();
        const monitoredComputeQueryEmbedding = withResourceMonitoring(computeQueryEmbedding);
        monitoredComputeQueryEmbedding();
    });

    $('#addMarkers').click(function (event) {
        createPixiOverlay();
        $('#addMarkers').hide();
    });

    $(function () {
        $('[data-toggle="tooltip"]').tooltip()
    });

    $("#dataFile").on("change", function () {
        filename = "data/" + $(this).val();
        mean_location_variant = filename.includes("mean_location");
        initialize_data(query = true)
    });

    $('#queryText').keydown(function (event) {
        if (event.keyCode == 13) {
            event.preventDefault();
            computeQueryEmbedding();
        }
    });

    $("#min_max_mean_median").on("change", function () {
        updateColorValueFunction();
    });

})