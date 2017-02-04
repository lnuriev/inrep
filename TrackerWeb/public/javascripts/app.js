(function() {

    'use strict';

    // define tracker app module and expose it globally
    window['trackerApp'] = angular.module('trackerApp', ['ngRoute', 'trackerControllers', 'btford.socket-io']);

    // define routes
    window['trackerApp'].config(['$routeProvider', function($routeProvider) {
        $routeProvider.
            when('/home', {
                templateUrl: 'home',
                controller: 'trackerHome'
            }).
            when('/news', {
                templateUrl: 'news',
                controller: 'trackerNews'
            }).
            when('/about', {
                templateUrl: 'about'
            }).
            when('/terms', {
                templateUrl: 'terms'
            }).
            otherwise({
                redirectTo: '/home'
            });
    }]);

}());

/* Document Loads */
$(document).ready(function() {

    // Change language
    $('#langList').find('li').click(function() {

         var flagNew = $(this).attr('class');
         var flagPrev = $('#langList').find('li:first').attr('class');

         $(this).attr('class', flagPrev);
         $('#langList').find('li:first').attr('class', flagNew);

    });

});
