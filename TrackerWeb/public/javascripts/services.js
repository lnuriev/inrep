(function() {

    'use strict';

    // file upload service
    trackerApp.service('fileUpload', ['$http', function($http) {
        this.uploadFileToUrl = function(file, uploadUrl, success, error) {
            var fd = new FormData();
            fd.append('file', file);
            $http.post(uploadUrl, fd, {
                transformRequest: angular.identity,
                headers: {'Content-Type': undefined}
            })
            .success(function(e) {
                // call success callback
                if (_.isFunction(success)) {
                    success(e);
                }
            })
            .error(function(e) {
                // call error callback
                if (_.isFunction(error)) {
                    error(e);
                }
            });
        };
    }]);

    // socket factory
    trackerApp.factory('trackerSocket', function(socketFactory) {
        return socketFactory();
    });

    // feed factory
    trackerApp.factory('feedService', ['$http', function($http) {
        return {
            parseFeed: function(url) {
                return $http.jsonp('//ajax.googleapis.com/ajax/services/feed/load?v=1.0&num=50&callback=JSON_CALLBACK&q=' + encodeURIComponent(url));
            }
        };
    }]);

}());
