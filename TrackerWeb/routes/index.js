var express = require('express');
var logger = require('../includes/logger');

var index = function(app) {

    // create router
    var router = express.Router();

    /* GET index. */
    router.get('/', function(req, res) {
        res.render('layout', {
            title: 'Trackr',
            scripts: ['/javascripts/map.js']
        });
    });

    /* GET home page. */
    router.get('/home', function(req, res) {
        res.render('home');
    });

    /* GET about page. */
    router.get('/about', function(req, res) {
        res.render('about');
    });

    /* GET news page. */
    router.get('/news', function(req, res) {
        res.render('news');
    });

    /* GET terms page. */
    router.get('/terms', function(req, res) {
        res.render('terms');
    });

    return router;
};

/**
 * Export the module
 */
module.exports = index;
