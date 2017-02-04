var express = require('express');
var logger = require('../includes/logger');

var index = function(app) {

    // create router
    var router = express.Router();

    /* GET home page. */
    router.get('/', function(req, res) {
        res.render('index', {
            title: 'Trackr Worker'
        });
    });

    return router;
};

module.exports = index;
