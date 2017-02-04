(function() {

    'use strict';

    // tracker controllers module
    var trackerControllers = angular.module('trackerControllers', []);

    // main controller
    trackerControllers.controller('mainController', ['$scope', '$http', '$log', 'fileUpload', 'trackerSocket', function($scope, $http, $log, fileUpload, trackerSocket) {

        /*
         * ============================
         * SCOPE VAIRABLES
         * ============================
         */
        $scope.currentFiles = [];
        $scope.currentTrackFile = {state: 'idle'};
        $scope.totals = {
            distance: 0,
            maxElevation: 0,
            minElevation: 0
        };

        /*
         * ============================
         * PUBLIC API
         * ============================
         */

        /**
         * Upload the file using the fileUpload service
         * http://uncorkedstudios.com/blog/multipartformdata-file-upload-with-angularjs
         */
        $scope.uploadTrackAction = function() {
            var file = $scope.trackFile;

            // validate file and use the fileUpload service to send it
            if (file) {

                // change state
                $log.log('Sending track file to server...');
                $scope.currentTrackFile.state = 'processing';

                var uploadUrl = '/api/UploadTrack';
                fileUpload.uploadFileToUrl(file, uploadUrl, function(e) {

                    // success -> update local reference and get back to idle state
                    $log.log('File added', e);

                    // update the current files
                    $scope.currentFiles.push(e);

                    // autohide the modal
                    setTimeout(function() {
                        $scope.$apply(function() {
                            $scope.currentTrackFile.state = 'idle';
                            $('#uploadTrackModal').modal('hide');
                        });
                    }, 2000);

                }, function(error) {

                    // some error occured -> log it and reset the current track file
                    $scope.currentTrackFile.state = 'error';

                    // autohide the modal
                    setTimeout(function() {
                        $scope.$apply(function() {
                            $scope.currentTrackFile.state = 'idle';
                            $('#uploadTrackModal').modal('hide');
                        });
                    }, 2000);
                });
            }
        };

        /*
         * ============================
         * INIT
         * ============================
         */

        // track processed
        trackerSocket.on('track processed', function(e) {
            // remove the processed track from the list
            for (var i = 0, l = $scope.currentFiles.length; i < l; i++) {
                if ($scope.currentFiles[i] === e) {
                    $log.log('Track processed: ', e);
                    $scope.currentFiles.splice(i, 1);
                    break;
                }
            }
        });

        // track aggregated
        trackerSocket.on('track aggregated', function(e) {
            $scope.totals.distance = Math.round(e.distance * 1.609344 * 100) / 100; // convert from mi to km and round
            $scope.totals.maxElevation = Math.round(e.maxElevation * 100) / 100;
            $scope.totals.minElevation = Math.round(e.minElevation * 100) / 100;
        });

        // get totals
        $http.get('/api/GetTotals').success(function(e) {
            $scope.totals.distance = Math.round(e.distance * 1.609344 * 100) / 100; // convert from mi to km and round
            $scope.totals.maxElevation = Math.round(e.maxElevation * 100) / 100;
            $scope.totals.minElevation = Math.round(e.minElevation * 100) / 100;
        });

    }]);


    // home controller
    trackerControllers.controller('trackerHome', ['$scope', '$http', '$log', 'trackerSocket', function($scope, $http, $log, trackerSocket) {

        /*
         * ============================
         * PRIVATE API
         * ============================
         */
        function getHeatmap() {
            $http.get('/api/GetHeatmap').success(function(data) {
                TrackerMap.setHeatmap(data);
            });
        };

        /*
         * ============================
         * PUBLIC API
         * ============================
         */

        $scope.resetMap = function() {
            TrackerMap.resetMap();
        };

        $scope.getElevation = function(max) {
            var method = 'GetMinElevation';
            if (max) {
                method = 'GetMaxElevation';
            }
            $http.get('/api/' + method).success(function(data) {
                TrackerMap.setMarker(data.lat, data.lon);
            }).error(function() {
                var html = '<div class="alert alert-warning alert-dismissible fade in" role="alert">';
                    html += '<span class="glyphicon glyphicon-exclamation-sign" aria-hidden="true"></span> ';
                    html += 'Oh-oh! An error occurred :(';
                    html += '<button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button>';
                    html += '</div>';
                $('#myMap').after(html);
            });
        };

        /*
         * ============================
         * INIT
         * ============================
         */
        TrackerMap.initializeMap(); // init the map
        getHeatmap();

    }]);


    // news controller
    trackerControllers.controller('trackerNews', ['$scope', '$http', '$log', 'feedService', function($scope, $http, $log, feedService) {

        /*
         * ============================
         * SCOPE VAIRABLES
         * ============================
         */
        $scope.feedItems = [];

        /*
         * ============================
         * INIT
         * ============================
         */

        feedService.parseFeed('http://git.vorotnikov.net/infm155/rss').then(function(res) {
            var entries = res.data.responseData.feed.entries;
            _.each(entries, function(entry) {
                var date = new Date(Date.parse(entry.publishedDate));
                var options = { year: 'numeric', month: 'long', day: 'numeric' };
                entry.date = date.toLocaleDateString('bg-BG', options);
            });
            $scope.feedItems = entries;
            $log.log(entries);
        });

    }]);

}());
