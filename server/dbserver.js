var nano;
var events = require('events');
var dbServer = function (couchdb, arrayOrAllTables, since) {
	nano = require('nano')(couchdb);
	var skip = [
		"_users"
	];
	var _db = couchdb;
	var _tables = [];
	var _tableObj = {};
	var self = this;

	nano.db.list(function (err, body) {
		if (!err)
		if (arrayOrAllTables === true) { // Follow changes on ALL tables.
			for (var k in body) {
				if (skip.indexOf(body[k]) < 0)
				self.follow(body[k], since);
			}
		}
		else if (Array.isArray(arrayOrAllTables)) {
			for (var k in body) {
				for (var t in arrayOrAllTables) {
					process.nextTick(function() {
						if (body.indexOf(arrayOrAllTables[t]) < 0) {
							_db.create(arrayOrAllTables[t], function (err, doc) {
								if (!err)
								self.follow(arrayOrAllTables[t], since);
							});
						}
						else {
							self.follow(arrayOrAllTables[t], since);
						}
					});
				}
			}
		}
	});

	this.follow = function (table, since) {
		var table = new dbTable(table, since);
		_tables.push(table);
		return table;
	};

	this.tables = function (table) {
		if (!table) {
			return _tables;
		}
		else {
			for (var k in _tables) {
				if (_tables[k].name === table) {
					return _tables[k];
				}
			}
		}
	};

	this.nano = nano;
};

var dbUser = function () {
	var _credentials = [];
};

var dbTable = function (table, since) {
	if (!since) {
		since = "now";
	}
	var self = this;
	var callbacks = [];
	var _table = nano.use(table);
	var lastChange;
	var feed = _table.follow({since: since, include_docs:true});
	feed.on('change', function (change) {
		lastChange = change;
		for (var i = 0; i < callbacks.length; i++) {
			process.nextTick(function() {
				callbacks[i](change);
				self.emit('change', change);
			});
		}
	});

	feed.follow();

	this.callback = function (callback) {
		callbacks.push(callback);
	};

	this.getCallbacks = function() {
		return callbacks;
	}

	this.subscribeTo = function (callback) {
		callbacks.push(callback);
	};

	this.unsubscribeTo = function (callback) {
		var indexOfCallback = callbacks.indexOf(callback);
		if (indexOfCallback > -1) {
        	callbacks.splice(indexOfCallback,1);
		}
	};

	this.list = function (callback, listAll) {
		_table.list(function(err, body) {
			if (listAll === true) {
				body.rows.forEach(function(doc) {
			     	process.nextTick(function() {
			     		callback(doc);
			     	});
			    });
			}
			else {
				process.nextTick(function () {
					callback(body);
				});
			}
		})
	};

	this.nanoTable = _table;

	this.name = table;
};
dbTable.super_ = events.EventEmitter;
dbTable.prototype = Object.create(events.EventEmitter.prototype, {
    constructor: {
        value: dbTable,
        enumerable: false
    }
});
exports.dbserver = dbServer;