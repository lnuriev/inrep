(function() {

    // Expose TrackerMap object
    // (encapsulated map actions)

    var map = null;
    var originalPosition = new google.maps.LatLng(42.677791, 23.252772);

    window['TrackerMap'] = {

        initializeMap: function() {
            var mapOptions = {
                center: originalPosition,
                zoom: 15,
                maxZoom: 17,
                minZoom: 1,
                mapTypeId: google.maps.MapTypeId.TERRAIN
            };

            // init the map
            map = new google.maps.Map(document.getElementById('myMap'), mapOptions);

            // Try HTML5 geolocation
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(function(position) {
                    var pos = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);
                    originalPosition = pos;
                    map.setCenter(pos);
                }, function() {
                    // Geolocation failed
                    map.setCenter(originalPosition);
                });
            } else {
                // Browser doesn't support Geolocation
                map.setCenter(originalPosition);
            }
        },

        setMarker: function(lat, lon) {
            var location = new google.maps.LatLng(lat, lon);
            var image = {
                url: '/images/tr-marker.png',
                size: new google.maps.Size(40, 40),
                origin: new google.maps.Point(0, 0),
                anchor: new google.maps.Point(20, 50)
            };
            var marker = new google.maps.Marker({
                position: location,
                map: map,
                icon: image
            });
            map.panTo(location);
        },

        resetMap: function(lat, lon) {
            map.panTo(originalPosition);
        },

        setHeatmap: function(points) {
            var data = [];
            for (var i = 0, l = points.length; i < l; i++) {
                data.push(new google.maps.LatLng(points[i].lat, points[i].lon));
            }
            var pointsArray = new google.maps.MVCArray(data);
            var heatmap = new google.maps.visualization.HeatmapLayer({
                data: pointsArray,
                map: map,
                radius: 20
            });
        }
    };
})();
