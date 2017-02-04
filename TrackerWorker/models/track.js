'use strict';

/*
 * =======================================
 * Storage Emulator: http://msdn.microsoft.com/en-us/library/azure/hh403989.aspx
 * =======================================
 * Storage Emulator Credentials:
 * Account name: devstoreaccount1
 * Account key: Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==
 * =======================================
 * Addressing local Azure Storage resources in the storage emulator
 * http://<local-machine-address>:<port>/<account-name>/<resource-path>
 * Blob Service: http://127.0.0.1:10000/<account-name>/<resource-path>
 * Queue Service: http://127.0.0.1:10001/<account-name>/<resource-path>
 * Table Service: http://127.0.0.1:10002/<account-name>/<resource-path>
 * http://127.0.0.1:10001/devstoreaccount1/incomingtracks
 * =======================================
 */

var azureStorage = require('azure-storage');
var entGen = azureStorage.TableUtilities.entityGenerator;
var nconf = require('nconf');
var uuid = require('node-uuid');
var async = require('async');
var gpxParse = require('gpx-parse');
var _ = require('underscore');
var logger = require('../includes/logger');

function Track() {

    /*
     * ==========================
     * SETUP
     * ==========================
     */
    nconf.env().file({ file: 'config.json' });
    this._incomingTracksQueue = nconf.get('QUEUE_INCOMING');
    this._processedTracksQueue = nconf.get('QUEUE_PROCESSED');
    this._aggregatedTracksQueue = nconf.get('QUEUE_AGGREGATED');
    this._incomingTracksContainer = nconf.get('BLOB_INCOMING');
    this._aggregatedTracksTable = nconf.get('TABLE_AGGREGATED');
    this._aggregatedTracksPartition = nconf.get('TABLE_TRACKS_PARTITION');
    this._aggregatedTotalsPartition = nconf.get('TABLE_TOTALS_PARTITION');
    this._aggregatedTotalsRowkey = nconf.get('TABLE_TOTALS_ROWKEY');
    var checkInterval = nconf.get('QUEUE_CHECK_INTERVAL');

    /*
     * ==========================
     * QUEUES AND CONTAINERS
     * ==========================
     */

    // services
    var retryOperations = new azureStorage.ExponentialRetryPolicyFilter();
    this.queueService = azureStorage.createQueueService().withFilter(retryOperations);
    this.blobService = azureStorage.createBlobService().withFilter(retryOperations);
    this.tableService = azureStorage.createTableService().withFilter(retryOperations);

    // create tracks queues if not exist
    this.queueService.createQueueIfNotExists(this._incomingTracksQueue, function(error, result, response) {
        if (!error) {
            logger.info('Queue %s created', this._incomingTracksQueue);

            // setup queue checks
            this._setupQueueChecks(this._incomingTracksQueue, this.queueService, checkInterval, this._handleIncomingTracksMessage.bind(this));
        } else {
            logger.error('Error creating %s queue: ', this._incomingTracksQueue, error);
        }
    }.bind(this));

    this.queueService.createQueueIfNotExists(this._processedTracksQueue, function(error, result, response) {
        if (!error) {
            logger.info('Queue %s created', this._processedTracksQueue);
        } else {
            logger.error('Error creating %s queue: ', this._processedTracksQueue, error);
        }
    }.bind(this));

    this.queueService.createQueueIfNotExists(this._aggregatedTracksQueue, function(error, result, response) {
        if (!error) {
            logger.info('Queue %s created', this._aggregatedTracksQueue);
        } else {
            logger.error('Error creating %s queue: ', this._aggregatedTracksQueue, error);
        }
    }.bind(this));

    // create tracks container if not exists
    this.blobService.createContainerIfNotExists(this._incomingTracksContainer, function(error, result, response) {
        if (!error) {
            logger.info('Container %s created', this._incomingTracksContainer);
        } else {
            logger.error('Error creating %s container: ', this._incomingTracksContainer, error);
        }
    }.bind(this));

    // create aggregated data table
    this.tableService.createTableIfNotExists(this._aggregatedTracksTable, function(error, result, response) {
        if (!error) {
            logger.info('Table %s created', this._aggregatedTracksTable);

            // setup totals entity
            this._setupTotalsEntity();
        } else {
            logger.error('Error creating %s table: ', this._aggregatedTracksTable, error);
        }
    }.bind(this));

}

/*
 * ==========================
 * PRIVATE API
 * ==========================
 */

/**
 * Check any queue for messages and attempt to pop a message
 * from the queue, calling a callback with either an error, or
 * containing the message.
 * NOTE: this can be turned into a generic library function.
 * @param {String} queueName - the name of the queue.
 * @param {QueueService} queueService - the queue service to use for actions.
 * @param {Number} interval - time interval at which to check for updates.
 * @param {Function} callback - callback to invoke when a message is popped.
 * @return {Number} - index of the check interval.
 */
Track.prototype._setupQueueChecks = function(queueName, queueService, interval, callback) {

    // dequeue message if any
    function dequeueMessage(cb) {

        queueService.getMessages(queueName, function(error, result, response) {
            if (!error) {
                var message = result[0];
                if (message) {
                    cb(null, message);   // message dequeued -> pass message for delete
                } else {
                    cb(null, null);      // queue empty
                }
            } else {
                cb(error, null);         // error condition
            }
        });
    }

    // delete message if any
    function deleteMessage(message, cb) {

        if (message) {
            queueService.deleteMessage(queueName, message.messageid, message.popreceipt, function(error, response) {
                if (!error) {
                    cb(null, message);   // message deleted -> pass message for processing
                } else {
                    cb(error, message);  // error condition
                }
            });
        } else {
            cb(null, null);              // queue empty
        }
    }

    // main check loop
    var intervalId = setInterval(function() {

        // compose using async.waterfall
        // (dependency calling for stability)
        async.waterfall([dequeueMessage, deleteMessage], function(error, message) {
            if (!error) {
                if (message) {
                    // process message
                    logger.info('Queue message received on %s', queueName);
                    callback(null, message);
                } else {
                    logger.debug('Queue %s is empty', queueName);
                }
            } else {
                logger.error('Error processing queue message on %s: ', queueName, error);
                callback(error, null);
            }
        });

    }, interval);

    return intervalId;
};

/**
 * Callback for handling any messages on the incoming tracks queue
 * @param {String} error - any error that might have occurred.
 * @param {Object} message - copy of the processed queue message.
 */
Track.prototype._handleIncomingTracksMessage = function(error, message) {

    var self = this;
    if (!error) {

        // get the blob id from the message
        var blobId = message.messagetext;

        // compose using async.waterfall
        // (dependency calling for stability)
        async.waterfall([

            // blob retreiving
            function(cb) {
                logger.info('Retreiving blob information...');
                self.blobService.getBlobToText(self._incomingTracksContainer, blobId, function(error, result, response) {
                    if (!error) {
                        cb(null, result); // blob retrieved
                    } else {
                        cb(error); // error condition
                    }
                });
            },

            // xml parsing
            function(xml, cb) {
                logger.info('Parsing blob text...');
                gpxParse.parseGpx(xml, function(error, data) {
                    if (!error) {
                        cb(null, data); // file parsed
                    } else {
                        cb('parse error'); // error condition
                    }
                });
            },

            // aggregate data
            function(gpx, cb) {
                logger.info('Aggregating data...');
                try {
                    var result = self._aggregateData(gpx);
                    cb(null, result); // file calculated
                } catch (exception) {
                    cb('aggregation error'); // error condition
                }
            },

            // create entyty for the processed track
            function(data, cb) {
                logger.info('Creating table entity for track...');

                var entity = {
                    PartitionKey: entGen.String(self._aggregatedTracksPartition),
                    RowKey: entGen.String(blobId),
                    blob: entGen.String(blobId),
                    distance: entGen.Double(data.distance),
                    maxElevation: entGen.Double(data.maxElevation),
                    minElevation: entGen.Double(data.minElevation),
                    centers: entGen.String(JSON.stringify(data.centers))
                };

                self.tableService.insertEntity(self._aggregatedTracksTable, entity, function(error, result, response) {
                    if (!error) {
                        cb(null, data); // entity created
                    } else {
                        cb(error); // error condition
                    }
                });
            },

            // retreive totals entity
            function(data, cb) {
                logger.info('Retreiving totals entity...');

                self.tableService.retrieveEntity(self._aggregatedTracksTable, self._aggregatedTotalsPartition, self._aggregatedTotalsRowkey, function(error, result, response) {
                    if (!error) {
                        var newData = {
                            distance: parseFloat(result.distance._) + data.distance,
                            maxElevation: Math.max(parseFloat(result.maxElevation._), data.maxElevation),
                            minElevation: Math.min(parseFloat(result.minElevation._), data.minElevation)
                        };
                        cb(null, newData); // entity retreived
                    } else {
                        cb(error); // error condition
                    }
                });
            },

            // update totals entity
            function(data, cb) {
                logger.info('Updating totals entity...');

                var entity = {
                    PartitionKey: entGen.String(self._aggregatedTotalsPartition),
                    RowKey: entGen.String(self._aggregatedTotalsRowkey),
                    blob: entGen.String(''),
                    distance: entGen.Double(data.distance),
                    maxElevation: entGen.Double(data.maxElevation),
                    minElevation: entGen.Double(data.minElevation)
                };

                self.tableService.updateEntity(self._aggregatedTracksTable, entity, function(error, result, response) {
                    if (!error) {
                        logger.info('Totals entity updated:\n\tDistance: %s\n\tMax Elevation: %s\n\tMin Elevation: %s', data.distance, data.maxElevation, data.minElevation);
                        cb(null, data); // entity updated
                    } else {
                        cb(error); // error condition
                    }
                });
            },

            // create queue entry on the aggregated tracks queue
            function(data, cb) {
                logger.info('Creating queue message on %s queue...', self._aggregatedTracksQueue);
                self.queueService.createMessage(self._aggregatedTracksQueue, JSON.stringify(data), function(error, result, response) {
                    if (!error) {
                        cb(null); // message created
                    } else {
                        cb(error); // error condition
                    }
                });
            },

            // create queue entry on the processed tracks queue
            function(cb) {
                logger.info('Creating queue message on %s queue...', self._processedTracksQueue);
                self.queueService.createMessage(self._processedTracksQueue, blobId, function(error, result, response) {
                    if (!error) {
                        cb(null); // message created
                    } else {
                        cb(error); // error condition
                    }
                });
            }

        // main callback
        ], function(error) {
            if (error) {
                logger.error('Error occurred for track %s: ', blobId, error);
            } else {
                logger.info('Track processed successfully: %s', blobId);
            }
        });

    } else {
        logger.error('Error ocurred: ', error);
    }
};

/**
 * Setup the totals entity in the aggregated data table.
 */
Track.prototype._setupTotalsEntity = function() {

    var self = this;

    // create totals entity if it doesn't exist
    self.tableService.retrieveEntity(self._aggregatedTracksTable, self._aggregatedTotalsPartition, self._aggregatedTotalsRowkey, function(error, result, response) {

        // if totals is successfully retreived
        if (!error) {
            logger.info('Totals entity retreived:\n\tDistance: %s\n\tMax Elevation: %s\n\tMin Elevation: %s', result.distance._, result.maxElevation._, result.minElevation._);
        // if error occurs
        } else {

            // entity does not exist -> create it
            if (404 === error.statusCode) {
                logger.info('Creating new totals entity...');

                var totalsEntity = {
                    PartitionKey: entGen.String(self._aggregatedTotalsPartition),
                    RowKey: entGen.String(self._aggregatedTotalsRowkey),
                    blob: entGen.String(''),
                    distance: entGen.Double(0),
                    maxElevation: entGen.Double(0),
                    minElevation: entGen.Double(0)
                };

                self.tableService.insertEntity(self._aggregatedTracksTable, totalsEntity, function(error, result, response) {
                    if (!error) {
                        logger.info('Totals entity created in %s', self._aggregatedTracksTable);
                    } else {
                        logger.error('Error creating totals entity: ', error);
                    }
                });

            // other error
            } else {
                logger.error('Error retreiving totals entity: ', error);
            }
        }
    });

};

/**
 * Aggregate data for a track
 * @param {String} gpx - gpx object containing all the data.
 * @return {Object} - info about the aggregated data.
 */
Track.prototype._aggregateData = function(gpx) {

    var self = this;

    // prepare object
    var data = {
        distance: 0,
        maxElevation: 0,
        minElevation: 0,
        centers: []
    };

    _.each(gpx.tracks, function(track) {

        // get total distance
        data.distance += track.length();

        // iterate all segments
        _.each(track.segments, function(segment) {

            // iterate all points and search for the highest/lowest elevation
            _.each(segment, function(point) {
                var ele = 0;
                if (_.isArray(point.elevation) && point.elevation.length) {
                    ele = parseFloat(point.elevation[0]);
                } else if (_.isNumber(point.elevation)) {
                    ele = parseFloat(point.elevation);
                }
                data.maxElevation = Math.max(data.maxElevation, ele);
                data.minElevation = Math.min(data.minElevation, ele);
            });

            // get center
            var centers = self._calculateCenters(segment);
            if (centers)
            {
                data.centers.push(centers);
            }
        });
    });

    return data;
};

/**
 * Get a center latitude,longitude from an array of like geopoints
 *
 * @param {Array} data - 2 dimensional array of latitudes and longitudes
 * For Example:
 * data = [
 *   { lat: 45.849382, lon: 76.322333 },
 *   { lat: 45.843543, lon: 75.324143 }
 * ];.
 * @return {Array}
 */
Track.prototype._calculateCenters = function(data) {

    if (!_.isArray(data)) {
        return null;
    }

    var X = 0.0;
    var Y = 0.0;
    var Z = 0.0;

    _.each(data, function(point) {
        var lat = point.lat * Math.PI / 180;
        var lon = point.lon * Math.PI / 180;

        var a = Math.cos(lat) * Math.cos(lon);
        var b = Math.cos(lat) * Math.sin(lon);
        var c = Math.sin(lat);

        X += a;
        Y += b;
        Z += c;
    });

    X = X / data.length;
    Y = Y / data.length;
    Z = Z / data.length;

    var lon = Math.atan2(Y, X);
    var hyp = Math.sqrt(X * X + Y * Y);
    var lat = Math.atan2(Z, hyp);

    return {
        lat: lat * 180 / Math.PI,
        lon: lon * 180 / Math.PI
    };
};

/*
 * ==========================
 * PUBLIC API
 * ==========================
 */

/**
 * Returns information for a given queue
 * @param {String} name - queue name.
 * @param {Function} cb - callback when all the operations are completed.
 */
Track.prototype.getQueueInfo = function(name, cb) {

    var self = this;

    // exexute parallel actions against the queueService
    async.parallel({

        // do peek
        peek: function(callback) {
            self.queueService.peekMessages(name, function(error, result, response) {
                if (error) {
                    callback(error, null);
                } else {
                    callback(null, result);
                }
            });
        },

        // do meta
        meta: function(callback) {
            self.queueService.getQueueMetadata(name, function(error, result, response) {
                if (error) {
                    callback(error, null);
                } else {
                    callback(null, result);
                }
            });
        }

    // report back the operation result
    }, function(errors, results) {
        if (errors) {
            cb(errors, results);
        } else {
            cb(null, results);
        }
    });

};

/**
 * Returns information for a given blob object
 * @param {String} id - blob id.
 * @param {Function} cb - callback when all the operations are completed.
 */
Track.prototype.getBlobInfo = function(id, cb) {

    var self = this;

    // exexute parallel actions against the queueService
    async.parallel({

        // do peek
        blob: function(callback) {
            self.blobService.getBlobToText(self._incomingTracksContainer, id, function(error, result, response) {
                if (!error) {
                    // xml parsing
                    gpxParse.parseGpx(result, function(error, data) {
                        if (!error) {
                            cb(null, data); // file parsed
                        } else {
                            cb('parse error', null); // error condition
                        }
                    });
                } else {
                    cb(error, null); // error condition
                }
            });
        }

    // report back the operation result
    }, function(errors, results) {
        if (errors) {
            cb(errors, results);
        } else {
            cb(null, results);
        }
    });

};

/**
 * Attempt to calculate the aggregated data for a track in a blob
 * @param {String} id - blob id.
 * @param {Function} cb - callback when all the operations are completed.
 */
Track.prototype.calculateAggregatedData = function(id, cb) {

    var self = this;

    // exexute parallel actions against the queueService
    async.waterfall([

        // blob retreiving
        function(cb) {
            self.blobService.getBlobToText(self._incomingTracksContainer, id, function(error, result, response) {
                if (!error) {
                    cb(null, result); // blob retrieved
                } else {
                    cb('retreiving error', null); // error condition
                }
            });
        },

        // xml parsing
        function(xml, cb) {
            logger.info('Parsing blob text...');
            gpxParse.parseGpx(xml, function(error, data) {
                if (!error) {
                    cb(null, data); // file parsed
                } else {
                    cb('parse error', null); // error condition
                }
            });
        },

        // calculation
        function(gpx, cb) {
            try {
                var result = self._aggregateData(gpx);
                cb(null, result); // file calculated
            } catch (exception) {
                cb('aggregation error', null); // error condition
            }
        }

    // report back the operation result
    ], function(error, result) {
        if (error) {
            cb(error, result);
        } else {
            cb(null, result);
        }
    });

};

/**
 * Get a list of all blobs (their IDs)
 * @param {Function} cb - callback when all the operations are completed.
 */
Track.prototype.getAllBlobs = function(cb) {

    var self = this;

    // exexute parallel actions against the queueService
    async.parallel({

        // do peek
        blobs: function(callback) {
            self.blobService.listBlobsSegmented(self._incomingTracksContainer, null, function(error, result, response) {
                if (!error) {
                    cb(null, result); // list obtained
                } else {
                    cb(error, null); // error condition
                }
            });
        }

    // report back the operation result
    }, function(errors, results) {
        if (errors) {
            cb(errors, results);
        } else {
            cb(null, results);
        }
    });

};

/**
 * Export the module
 */
module.exports = Track;
