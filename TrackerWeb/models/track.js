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
var nconf = require('nconf');
var uuid = require('node-uuid');
var async = require('async');
var fs = require('fs');
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
        } else {
            logger.error('Error creating %s queue: ', this._incomingTracksQueue, error);
        }
    }.bind(this));

    this.queueService.createQueueIfNotExists(this._processedTracksQueue, function(error, result, response) {
        if (!error) {
            logger.info('Queue %s created', this._processedTracksQueue);

            // setup queue checks
            this._setupQueueChecks(this._processedTracksQueue, this.queueService, checkInterval, this._handleProcessedTracksMessage.bind(this));
        } else {
            logger.error('Error creating %s queue: ', this._processedTracksQueue, error);
        }
    }.bind(this));

    this.queueService.createQueueIfNotExists(this._aggregatedTracksQueue, function(error, result, response) {
        if (!error) {
            logger.info('Queue %s created', this._aggregatedTracksQueue);

            // setup queue checks
            this._setupQueueChecks(this._aggregatedTracksQueue, this.queueService, checkInterval, this._handleAggregatedTracksMessage.bind(this));
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
 * Callback for handling any messages on the processed tracks queue.
 * @param {String} error - any error that might have occurred.
 * @param {Object} message - copy of the processed queue message.
 */
Track.prototype._handleProcessedTracksMessage = function(error, message) {
    if (!error) {
        logger.info('Track processed: %s', message.messagetext);

        // notify clients
        process.emit('socket', {event: 'track processed', data: message.messagetext});
    } else {
        logger.error('Error ocurred: ', error);
    }
};

/**
 * Callback for handling any messages on the aggregated tracks queue.
 * @param {String} error - any error that might have occurred.
 * @param {Object} message - copy of the processed queue message.
 */
Track.prototype._handleAggregatedTracksMessage = function(error, message) {
    if (!error) {
        logger.info('Track aggregated: %s', message.messagetext);

        // notify clients
        process.emit('socket', {event: 'track aggregated', data: JSON.parse(message.messagetext)});
    } else {
        logger.error('Error ocurred: ', error);
    }
};

/*
 * ==========================
 * PUBLIC API
 * ==========================
 */

/**
 * Process incoming track file.
 * Generate UUID for the file and then upload it to a blob.
 * Create queue entry to notify worker and return the UUID.
 * @param {String} filePath - the temporary file location.
 * @param {Function} cb - callback.
 */
Track.prototype.processIncomingTrack = function(filePath, cb) {

    var self = this;

    function attemptParse(cb) {
        logger.info('Attempt file parsing...');
        gpxParse.parseGpxFromFile(filePath, function(error, data) {
            if (!error) {
                cb(null); // file parsed successfully
            } else {
                fs.unlinkSync(filePath); // delte file
                cb('parse error'); // error condition
            }
        });
    }

    function addToBlob(cb) {

        // create blob entry
        var blobId = 'blob-' + uuid.v4();
        self.blobService.createBlockBlobFromLocalFile(self._incomingTracksContainer, blobId, filePath, function(error, result, response) {

            // delte file
            fs.unlinkSync(filePath);
            logger.info('File deleted %s', filePath);

            if (error) {
                logger.error('Error creating %s blob in container %s', blobId, self._incomingTracksContainer);
                cb(error, blobId);

            } else {
                logger.info('Blob %s created in container %s', blobId, self._incomingTracksContainer);
                cb(null, blobId);
            }
        });
    }

    function addToQueue(blobId, cb) {

        // create queue entry with the UUID and the blob info
        self.queueService.createMessage(self._incomingTracksQueue, blobId, function(error, result, response) {
            if (error) {
                logger.error('Error creating %s message on queue %s', blobId, self._incomingTracksQueue);
                cb(error, blobId);

            } else {
                logger.info('Queue message %s created on queue %s', blobId, self._incomingTracksQueue);
                cb(null, blobId);
            }
        });
    }

    // compose using async.seq
    // the created blob id is returned to the caller in the callback
    async.waterfall([attemptParse, addToBlob, addToQueue], function(error, result) {
        if (error) {
            logger.error('Error processing file: %s', filePath, error);
            cb(error, result);
        } else {
            logger.info('File accepted for processing %s', filePath);
            cb(null, result);
        }
    });
};

/**
 * Get totals
 * @param {Function} cb - callback when all the operations are completed.
 */
Track.prototype.getTotals = function(cb) {

    this.tableService.retrieveEntity(this._aggregatedTracksTable, this._aggregatedTotalsPartition, this._aggregatedTotalsRowkey, function(error, result, response) {
        if (!error) {
            var data = {
                distance: parseFloat(result.distance._),
                maxElevation: parseFloat(result.maxElevation._),
                minElevation: parseFloat(result.minElevation._)
            };
            cb(null, data); // entity retreived
        } else {
            cb(error); // error condition
        }
    });
};

/**
 * Get the point with highest/lowest elevation
 * @param {Boolean} max - True for max, False for min.
 * @param {Function} cb - callback when all the operations are completed.
 */
Track.prototype.getElevation = function(max, cb) {

    var self = this;

    async.waterfall([

        // retreive totals entity
        function(cb) {
            logger.info('Retreiving totals entity...');

            self.tableService.retrieveEntity(self._aggregatedTracksTable, self._aggregatedTotalsPartition, self._aggregatedTotalsRowkey, function(error, result, response) {
                if (!error) {
                    var search = 0;
                    if (max) {
                        search = parseFloat(result.maxElevation._);
                    } else { 
                        search = parseFloat(result.minElevation._);
                    }
                    cb(null, search); // entity retreived
                } else {
                    cb(error, null); // error condition
                }
            });
        },

        // retreive exact entry
        function(search, cb) {
            logger.info('Retreiving exact entity...');

            // create query
            var query = null;
            if (max) {
                query = new azureStorage.TableQuery().top(1).where('maxElevation eq ? and PartitionKey eq ?', search, self._aggregatedTracksPartition);
            } else {
                query = new azureStorage.TableQuery().top(1).where('minElevation eq ? and PartitionKey eq ?', search, self._aggregatedTracksPartition);
            }

            self.tableService.queryEntities(self._aggregatedTracksTable, query, null, function(error, result, response) {
                if (!error) {
                    if (result.entries.length) {
                        cb(null, result.entries[0], search); // entity retreived
                    } else {
                        cb('no entry', result); // no entry found
                    }
                } else {
                    cb(error, null); // error condition
                }
            });
        },
        
        // blob retreiving
        function(entry, search, cb) {
            logger.info('Retreiving blob information...');

            self.blobService.getBlobToText(self._incomingTracksContainer, entry.blob._, function(error, result, response) {
                if (!error) {
                    cb(null, result, search); // blob retrieved
                } else {
                    cb(error, null); // error condition
                }
            });
        },

        // xml parsing
        function(xml, search, cb) {
            logger.info('Parsing blob text...');

            gpxParse.parseGpx(xml, function(error, data) {
                if (!error) {
                    cb(null, data, search); // file parsed
                } else {
                    cb('parse error', null); // error condition
                }
            });
        },

        // search for the point
        function(gpx, search, cb) {
            logger.info('Searching data for %s...', search);

            // prepare object
            var data = null;
            _.each(gpx.tracks, function(track) {

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
                        if (ele == search) {
                            data = point;
                        }
                    });
                });
            });

            cb(null, data);
        }

    // main callback
    ], function(error, result) {
        if (error) {
            cb(error, null);
        } else {
            cb(null, result);
        }
    });
};

/**
 * Get the the centers of all tracks to generate heatmap
 * @param {Function} cb - callback when all the operations are completed.
 */
Track.prototype.getCenters = function(cb) {

    var self = this;

    async.waterfall([

        // retreive entries
        function(cb) {
            logger.info('Getting centers...');

            // create query
            var query = new azureStorage.TableQuery().where('PartitionKey eq ?', self._aggregatedTracksPartition);

            self.tableService.queryEntities(self._aggregatedTracksTable, query, null, function(error, result, response) {
                if (!error) {
                    if (result.entries.length) {
                        cb(null, result.entries); // entries retreived
                    } else {
                        cb('no entry', result); // no entry found
                    }
                } else {
                    cb(error, null); // error condition
                }
            });
        },

        // create center points
        function(entries, cb) {
            logger.info('Fetching center points...');

            var result = [];

            _.each(entries, function(entry) {
                var centers = JSON.parse(entry.centers._);
                result = result.concat(centers);
            });

            cb(null, result); // centers fetched
        }

    // main callback
    ], function(error, result) {
        if (error) {
            cb(error, null);
        } else {
            cb(null, result);
        }
    });
};


/**
 * Export the module
 */
module.exports = Track;
